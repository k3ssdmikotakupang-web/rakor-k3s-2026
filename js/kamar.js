// js/kamar.js
// Sistem Manajemen Kamar Hotel Rakor K3S 2026:
// 1. Peserta: Melihat kamarnya sendiri & rekan sekamarnya (Lengkap: Foto Profil yang bisa di-zoom, Nama Kepsek, Asal Sekolah, Sub Rayon, No HP/WA)
// 2. Ketua Panitia: Menginput, MENGEDIT (nomor, kapasitas, peruntukan + auto-migrasi penghuni), & menghapus nomor kamar.
// 3. Panitia Inti (PJ, Ketua, Sekretaris, Bendahara): Melihat data rekapitulasi jumlah kamar hotel.
// 4. Ketua Sub Rayon (+ Ketua & Sekretaris): Menentukan penghuni kamar peserta (validasi anti-melebihi kapasitas).
// 5. Ketua Panitia & Sekretaris: Download Dokumen Rekapan Kamar (PDF & Excel/CSV).
import { sb, toast } from './supabase.js';

const SUBRAYON_LIST = ["Maulafa", "Alak", "Kota Raja", "Oebobo", "Kelapa Lima", "Kota Lama"];
let masterRoomsList = [];
let panitiaRoomMap = {};
let cachedPanitiaList = [];
let activeRoomTab = "pembagian";
let selectedFilterRayon = "ALL";
let selectedFilterKamarStatus = "IKUT_ALL";
let selectedFilterDivisiPanitia = "ALL";
let logoK3sCache = null;

function normalizeRoomNo(val = "") {
  return String(val || "").trim().toUpperCase();
}

function isSchoolParticipating(s) {
  return Boolean(s && s.status_ikut === "Ikut");
}

function getPersonPhotoUrl(record, fallbackName = "Peserta") {
  if (record) {
    const candidates = [
      record.foto_url,
      record.foto_profil,
      record.foto_kepsek,
      record.foto,
      record.avatar_url,
      record.photo_url,
      record.url_foto
    ];
    for (const url of candidates) {
      if (url && typeof url === "string" && url.trim() !== "") {
        return url.trim();
      }
    }
  }
  const cleanName = encodeURIComponent(String(fallbackName || "K3S").trim());
  return `https://ui-avatars.com/api/?name=${cleanName}&background=1e1b4b&color=fcd34d&bold=true&size=300`;
}

function openRoommatePhotoZoomModal(photoUrl, nameText, schoolText, subrayonText, phoneText, roomNo) {
  let zoomModal = document.getElementById("roommatePhotoZoomOverlay");
  if (!zoomModal) {
    zoomModal = document.createElement("div");
    zoomModal.id = "roommatePhotoZoomOverlay";
    document.body.appendChild(zoomModal);
  }

  const waClean = String(phoneText || "").replace(/\D/g, "").replace(/^0/, "62");
  const phoneClean = String(phoneText || "").replace(/\D/g, "");
  const fallbackAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(nameText || "Kepsek")}&background=1e1b4b&color=fcd34d&bold=true&size=400`;

  zoomModal.className = "fixed inset-0 z-[70] bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center p-5 animate-view";
  zoomModal.innerHTML = `
    <div class="w-full max-w-xs bg-gradient-to-b from-slate-900 via-violet-950 to-slate-900 text-white rounded-3xl p-5 text-center space-y-4 shadow-2xl border-2 border-amber-400/70 relative">
      <button type="button" id="btnCloseRoommateZoomTop" class="absolute top-3.5 right-3.5 w-8 h-8 rounded-full bg-white/10 hover:bg-rose-500/30 text-white font-extrabold flex items-center justify-center text-sm transition">
        &times;
      </button>

      <div class="inline-flex items-center gap-1.5 text-[9px] font-extrabold uppercase tracking-wider bg-amber-400 text-slate-950 px-3 py-1 rounded-full shadow">
        <i class="fa-solid fa-bed"></i>
        <span>Rekan Sekamar • Kamar ${roomNo || '-'}</span>
      </div>

      <div class="w-52 h-52 mx-auto rounded-3xl overflow-hidden border-4 border-amber-400 shadow-2xl bg-slate-800 flex items-center justify-center">
        <img src="${photoUrl}" alt="${nameText}" class="w-full h-full object-cover" onerror="this.onerror=null;this.src='${fallbackAvatar}';" />
      </div>

      <div class="space-y-1 px-1">
        <h3 class="text-sm font-extrabold text-white leading-snug">${nameText || 'Kepala Sekolah'}</h3>
        <p class="text-xs font-bold text-amber-300">${schoolText || '-'}</p>
        <p class="text-[11px] font-semibold text-violet-200">${subrayonText || ''}</p>
      </div>

      ${phoneClean ? `
        <div class="grid grid-cols-2 gap-2 pt-1">
          <a href="tel:${phoneClean}" class="py-2.5 px-3 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 shadow transition">
            <i class="fa-solid fa-phone"></i>
            <span>Telepon</span>
          </a>
          <a href="https://wa.me/${waClean}" target="_blank" rel="noopener noreferrer" class="py-2.5 px-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 shadow transition">
            <i class="fa-brands fa-whatsapp text-sm"></i>
            <span>WhatsApp</span>
          </a>
        </div>
      ` : ''}

      <button type="button" id="btnCloseRoommateZoomBottom" class="w-full py-2.5 rounded-2xl bg-white/10 hover:bg-white/20 text-slate-200 font-extrabold text-xs transition">
        Tutup Foto
      </button>
    </div>
  `;

  zoomModal.onclick = (e) => {
    if (
      e.target === zoomModal ||
      e.target.closest("#btnCloseRoommateZoomTop") ||
      e.target.closest("#btnCloseRoommateZoomBottom")
    ) {
      zoomModal.classList.add("hidden");
    }
  };
}

export function isKetuaPanitia(activeUser) {
  return Boolean(
    activeUser &&
    activeUser.role === "panitia" &&
    activeUser.profile?.divisi === "Ketua Panitia"
  );
}

export function isKetuaOrSekretaris(activeUser) {
  return Boolean(
    activeUser &&
    activeUser.role === "panitia" &&
    activeUser.profile &&
    ["Ketua Panitia", "Sekretaris"].includes(activeUser.profile.divisi)
  );
}

export function isPanitiaInti(activeUser) {
  return Boolean(
    activeUser &&
    activeUser.role === "panitia" &&
    activeUser.profile &&
    ["Penanggung Jawab", "Ketua Panitia", "Sekretaris", "Bendahara"].includes(activeUser.profile.divisi)
  );
}

export function canAssignOccupants(activeUser) {
  if (!activeUser || activeUser.role !== "panitia" || !activeUser.profile) return false;
  const p = activeUser.profile;
  if (["Ketua Panitia", "Sekretaris"].includes(p.divisi)) return true;
  if (p.tugas_subrayon && String(p.tugas_subrayon).trim() !== "") return true;
  return false;
}

async function preloadLogo() {
  if (logoK3sCache) return logoK3sCache;
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      logoK3sCache = img;
      resolve(img);
    };
    img.onerror = () => resolve(null);
    img.src = window.__RESOLVED_K3S_LOGO || "./logo-k3s.png";
  });
}

function ensureJsPdfLoaded() {
  return new Promise((resolve, reject) => {
    if (window.jspdf) return resolve();
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Gagal memuat jsPDF"));
    document.head.appendChild(s);
  });
}

async function loadMasterRoomsAndPanitiaConfig(sekolahList) {
  masterRoomsList = [];
  panitiaRoomMap = {};
  try {
    const [layRes, panRes] = await Promise.all([
      sb.from("info_layanan").select("*").in("kode_menu", ["master_kamar_hotel", "penempatan_kamar_panitia"]),
      sb.from("panitia_rakor").select("*").order("no", { ascending: true })
    ]);
    if (panRes.data) {
      cachedPanitiaList = panRes.data;
    }
    const masterRec = (layRes.data || []).find(r => r.kode_menu === "master_kamar_hotel");
    if (masterRec && masterRec.deskripsi) {
      try {
        const parsed = JSON.parse(masterRec.deskripsi);
        if (Array.isArray(parsed)) {
          const seen = new Set();
          parsed.forEach(item => {
            const no = normalizeRoomNo(item.nomor);
            const cap = Math.max(1, parseInt(item.kapasitas, 10) || 2);
            const kat = item.kategori === "PANITIA" ? "PANITIA" : "PESERTA";
            if (no && no !== "BELUM DITENTUKAN" && !seen.has(no)) {
              seen.add(no);
              masterRoomsList.push({ nomor: no, kapasitas: cap, kategori: kat });
            }
          });
        }
      } catch (e) {}
    }
    const panRoomRec = (layRes.data || []).find(r => r.kode_menu === "penempatan_kamar_panitia");
    if (panRoomRec && panRoomRec.deskripsi) {
      try {
        const parsedMap = JSON.parse(panRoomRec.deskripsi);
        if (parsedMap && typeof parsedMap === "object") {
          panitiaRoomMap = parsedMap;
        }
      } catch (e) {}
    }
  } catch (e) {}

  const existingSet = new Set(masterRoomsList.map(r => normalizeRoomNo(r.nomor)));
  const countPesertaRoom = {};
  (sekolahList || []).filter(isSchoolParticipating).forEach(s => {
    const rNo = normalizeRoomNo(s.nomor_kamar);
    if (rNo && rNo !== "BELUM DITENTUKAN") {
      countPesertaRoom[rNo] = (countPesertaRoom[rNo] || 0) + 1;
    }
  });

  Object.keys(countPesertaRoom).forEach(rNo => {
    if (!existingSet.has(rNo)) {
      existingSet.add(rNo);
      masterRoomsList.push({
        nomor: rNo,
        kapasitas: Math.max(2, countPesertaRoom[rNo]),
        kategori: "PESERTA"
      });
    }
  });

  const countPanitiaRoom = {};
  Object.values(panitiaRoomMap).forEach(val => {
    const rNo = normalizeRoomNo(val);
    if (rNo && rNo !== "BELUM DITENTUKAN") {
      countPanitiaRoom[rNo] = (countPanitiaRoom[rNo] || 0) + 1;
    }
  });

  Object.keys(countPanitiaRoom).forEach(rNo => {
    if (!existingSet.has(rNo)) {
      existingSet.add(rNo);
      masterRoomsList.push({
        nomor: rNo,
        kapasitas: Math.max(2, countPanitiaRoom[rNo]),
        kategori: "PANITIA"
      });
    }
  });

  masterRoomsList.sort((a, b) =>
    String(a.nomor).localeCompare(String(b.nomor), undefined, { numeric: true })
  );
}

async function saveMasterRoomsConfig(newRoomsArray) {
  const uniqueRooms = [];
  const seen = new Set();
  (newRoomsArray || []).forEach(r => {
    const no = normalizeRoomNo(r.nomor);
    const cap = Math.max(1, parseInt(r.kapasitas, 10) || 2);
    const kat = r.kategori === "PANITIA" ? "PANITIA" : "PESERTA";
    if (no && no !== "BELUM DITENTUKAN" && !seen.has(no)) {
      seen.add(no);
      uniqueRooms.push({ nomor: no, kapasitas: cap, kategori: kat });
    }
  });
  uniqueRooms.sort((a, b) =>
    String(a.nomor).localeCompare(String(b.nomor), undefined, { numeric: true })
  );
  masterRoomsList = uniqueRooms;
  await sb.from("info_layanan").upsert([{
    kode_menu: "master_kamar_hotel",
    judul: "Master Data Ruang Kamar Hotel Rakor 2026",
    deskripsi: JSON.stringify(masterRoomsList),
    url_link: String(masterRoomsList.length),
    status_tersedia: "AKTIF"
  }]);
}

async function savePanitiaRoomAssignmentMap() {
  await sb.from("info_layanan").upsert([{
    kode_menu: "penempatan_kamar_panitia",
    judul: "Data Penempatan Kamar Khusus Panitia Rakor 2026",
    deskripsi: JSON.stringify(panitiaRoomMap),
    url_link: String(Object.keys(panitiaRoomMap).length),
    status_tersedia: "AKTIF"
  }]);
}

function getPesertaRoomOccupants(sekolahList, nomorKamar) {
  const target = normalizeRoomNo(nomorKamar);
  if (!target || target === "BELUM DITENTUKAN") return [];
  return (sekolahList || []).filter(
    s => isSchoolParticipating(s) && normalizeRoomNo(s.nomor_kamar) === target
  );
}

function getPanitiaRoomOccupants(nomorKamar) {
  const target = normalizeRoomNo(nomorKamar);
  if (!target || target === "BELUM DITENTUKAN") return [];
  return (cachedPanitiaList || []).filter(p => normalizeRoomNo(panitiaRoomMap[p.id_panitia]) === target);
}

function getPanitiaAssignedRoom(idPanitia) {
  const raw = panitiaRoomMap[idPanitia];
  const norm = normalizeRoomNo(raw);
  return norm && norm !== "BELUM DITENTUKAN" ? norm : "";
}

export async function openRoomManagerModal(activeUser, sekolahList, reloadCallback) {
  const modal = document.getElementById("serviceModal");
  const titleEl = document.getElementById("serviceModalTitle");
  const bodyEl = document.getElementById("serviceModalBody");
  if (!modal || !titleEl || !bodyEl) return;
  modal.classList.remove("hidden");
  titleEl.innerHTML = `<i class="fa-solid fa-bed text-violet-700 mr-1.5"></i> Informasi & Pembagian Kamar Hotel`;
  bodyEl.innerHTML = `
    <div class="p-6 text-center text-xs font-bold text-slate-500">
      <i class="fa-solid fa-spinner animate-spin mr-1.5 text-violet-600"></i> Memuat data kamar peserta aktif & panitia...
    </div>
  `;
  await loadMasterRoomsAndPanitiaConfig(sekolahList);
  if (!activeUser || activeUser.role === "peserta") {
    renderPesertaOnlyOwnRoomAndRoommates(activeUser, sekolahList, bodyEl);
    return;
  }
  if (activeUser.profile?.tugas_subrayon && selectedFilterRayon === "ALL") {
    selectedFilterRayon = activeUser.profile.tugas_subrayon;
  }
  renderPanitiaRoomModalView(activeUser, sekolahList, bodyEl, reloadCallback);
}

// =========================================================================
// 1. TAMPILAN KHUSUS PESERTA (FOTO PROFIL TEMAN SEKAMAR + ZOOM TANPA LABEL)
// =========================================================================
function renderPesertaOnlyOwnRoomAndRoommates(activeUser, sekolahList, bodyEl) {
  const mySchool = sekolahList.find(x => x.id_sekolah === activeUser?.profile?.id_sekolah) || activeUser?.profile || {};
  const isIkut = isSchoolParticipating(mySchool);
  const myRoomNo = (isIkut && mySchool.nomor_kamar && normalizeRoomNo(mySchool.nomor_kamar) !== "BELUM DITENTUKAN")
    ? normalizeRoomNo(mySchool.nomor_kamar)
    : "";
  const roommates = myRoomNo
    ? sekolahList.filter(x => isSchoolParticipating(x) && normalizeRoomNo(x.nomor_kamar) === myRoomNo && x.id_sekolah !== mySchool.id_sekolah)
    : [];
  const roomMeta = myRoomNo ? masterRoomsList.find(r => normalizeRoomNo(r.nomor) === myRoomNo) : null;
  const roomCap = roomMeta ? roomMeta.kapasitas : (roommates.length + 1);

  bodyEl.innerHTML = `
    <div class="p-5 rounded-3xl bg-gradient-to-br from-slate-900 via-violet-950 to-slate-900 text-white text-center space-y-4 shadow-xl">
      <div class="w-14 h-14 rounded-2xl bg-amber-400 text-slate-950 flex items-center justify-center text-2xl font-extrabold mx-auto shadow-lg">
        <i class="fa-solid fa-key"></i>
      </div>
      <div>
        <span class="text-[9px] font-extrabold uppercase tracking-wider bg-white/15 text-amber-300 px-2.5 py-0.5 rounded-md">
          Informasi Kamar Peserta • Sub Rayon ${mySchool.subrayon || '-'}
        </span>
        <h4 class="text-sm font-extrabold mt-1.5">${mySchool.nama_sekolah || 'Sekolah Peserta'}</h4>
        <p class="text-[11px] text-violet-200">Kepala Sekolah: <b>${mySchool.nama_kepsek || 'Belum Diisi'}</b></p>
      </div>
      ${!isIkut ? `
        <div class="p-4 rounded-2xl bg-rose-500/20 border border-rose-400/40 text-center space-y-1">
          <div class="text-xs font-extrabold text-amber-300 uppercase">Status Keikutsertaan: ${mySchool.status_ikut || 'Belum Konfirmasi'}</div>
          <p class="text-[11px] text-rose-100 leading-relaxed">
            Penempatan kamar hotel hanya diberikan kepada sekolah yang telah terdata <b>"Ikut"</b> kegiatan Rakor. Silakan hubungi Ketua Sub Rayon.
          </p>
        </div>
      ` : `
        <div class="p-4 rounded-2xl bg-white/10 border border-white/15">
          <div class="text-[10px] uppercase tracking-wider text-violet-200 font-bold">Nomor Kamar Hotel Anda</div>
          <div class="text-2xl font-extrabold ${myRoomNo ? 'text-amber-300' : 'text-slate-300'} mt-1">
            ${myRoomNo ? `Kamar ${myRoomNo}` : 'Belum Ditentukan'}
          </div>
          ${myRoomNo ? `
            <div class="text-[10px] text-emerald-300 font-semibold mt-0.5">
              Kapasitas Kamar: ${roomCap} Orang (Terisi ${roommates.length + 1} Peserta)
            </div>
          ` : `
            <div class="text-[10px] text-amber-200/90 mt-1">
              Penempatan kamar Anda sedang diatur oleh Ketua Sub Rayon ${mySchool.subrayon || ''}.
            </div>
          `}
        </div>

        <div class="p-3.5 rounded-2xl bg-white/10 border border-white/15 text-left space-y-2.5">
          <div class="text-[10px] font-extrabold uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
            <i class="fa-solid fa-user-group"></i>
            <span>Teman Sekamar Anda (${roommates.length} Orang):</span>
          </div>

          ${!myRoomNo ? `
            <div class="text-[11px] text-slate-300 italic">
              Teman sekamar akan tampil otomatis setelah nomor kamar Anda ditetapkan.
            </div>
          ` : roommates.length === 0 ? `
            <div class="text-[11px] text-emerald-200 font-semibold">
              Saat ini belum ada teman sekamar lain yang ditempatkan di Kamar ${myRoomNo}.
            </div>
          ` : `
            <div class="space-y-2.5">
              ${roommates.map((rm, rIdx) => {
                const displayName = rm.nama_kepsek && String(rm.nama_kepsek).trim() !== ""
                  ? rm.nama_kepsek
                  : `Kepala ${rm.nama_sekolah || 'Sekolah'}`;
                const photoUrl = getPersonPhotoUrl(rm, displayName);
                const fallbackAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=1e1b4b&color=fcd34d&bold=true&size=200`;
                const waClean = String(rm.no_hp || "").replace(/\D/g, "").replace(/^0/, "62");
                const phoneClean = String(rm.no_hp || "").replace(/\D/g, "");

                return `
                  <div class="p-3 rounded-2xl bg-slate-950/75 border border-white/15 flex items-center justify-between gap-3">
                    <div class="flex items-center gap-3 min-w-0 flex-1">
                      <div
                        data-rm-idx="${rIdx}"
                        class="btn-zoom-roommate-photo relative w-14 h-14 rounded-2xl overflow-hidden border-2 border-amber-400 shrink-0 cursor-pointer group shadow-md transition-transform duration-200 hover:scale-110 active:scale-95 bg-slate-800"
                      >
                        <img
                          src="${photoUrl}"
                          alt="${displayName}"
                          class="w-full h-full object-cover"
                          onerror="this.onerror=null;this.src='${fallbackAvatar}';"
                        />
                      </div>

                      <div class="min-w-0 flex-1">
                        <div class="text-xs font-extrabold text-white leading-snug truncate">${displayName}</div>
                        <div class="text-[10px] font-semibold text-violet-200 truncate mt-0.5">${rm.nama_sekolah || '-'}</div>
                        <div class="text-[9px] font-bold text-amber-300 mt-0.5">
                          Sub Rayon ${rm.subrayon || '-'} • WA: ${rm.no_hp || 'Belum diisi'}
                        </div>
                      </div>
                    </div>

                    <div class="flex items-center gap-1.5 shrink-0">
                      ${rm.no_hp ? `
                        <a href="tel:${phoneClean}" title="Telepon Langsung" class="w-9 h-9 rounded-xl bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center text-xs transition shadow">
                          <i class="fa-solid fa-phone"></i>
                        </a>
                        <a href="https://wa.me/${waClean}" target="_blank" rel="noopener noreferrer" title="Chat WhatsApp" class="w-9 h-9 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center text-sm transition shadow">
                          <i class="fa-brands fa-whatsapp"></i>
                        </a>
                      ` : ''}
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          `}
        </div>
      `}
    </div>
  `;

  bodyEl.querySelectorAll(".btn-zoom-roommate-photo").forEach(el => {
    el.addEventListener("click", () => {
      const idx = parseInt(el.dataset.rmIdx, 10);
      const rm = roommates[idx];
      if (!rm) return;
      const displayName = rm.nama_kepsek && String(rm.nama_kepsek).trim() !== ""
        ? rm.nama_kepsek
        : `Kepala ${rm.nama_sekolah || 'Sekolah'}`;
      const photoUrl = getPersonPhotoUrl(rm, displayName);
      openRoommatePhotoZoomModal(
        photoUrl,
        displayName,
        rm.nama_sekolah,
        `Sub Rayon ${rm.subrayon || '-'}`,
        rm.no_hp,
        myRoomNo
      );
    });
  });
}

// =========================================================================
// 2. TAMPILAN PANITIA
// =========================================================================
function renderPanitiaRoomModalView(activeUser, sekolahList, bodyEl, reloadCallback) {
  const showMasterRoomStats = isPanitiaInti(activeUser);
  const canInputMasterRooms = isKetuaPanitia(activeUser);
  const canDownloadAndManagePanitia = isKetuaOrSekretaris(activeUser);
  const canSetPesertaOccupants = canAssignOccupants(activeUser);

  const participatingSchools = (sekolahList || []).filter(isSchoolParticipating);
  const nonParticipatingCount = (sekolahList || []).length - participatingSchools.length;
  const pesertaRooms = masterRoomsList.filter(r => r.kategori !== "PANITIA");
  const panitiaRooms = masterRoomsList.filter(r => r.kategori === "PANITIA");

  const totalMasterRooms = masterRoomsList.length;
  const totalPesertaBeds = pesertaRooms.reduce((acc, r) => acc + (Number(r.kapasitas) || 2), 0);
  const totalPanitiaBeds = panitiaRooms.reduce((acc, r) => acc + (Number(r.kapasitas) || 2), 0);

  const usedPesertaRooms = pesertaRooms.filter(r => getPesertaRoomOccupants(sekolahList, r.nomor).length > 0).length;
  const usedPanitiaRooms = panitiaRooms.filter(r => getPanitiaRoomOccupants(r.nomor).length > 0).length;

  const assignedPesertaCount = participatingSchools.filter(
    s => s.nomor_kamar && normalizeRoomNo(s.nomor_kamar) !== "BELUM DITENTUKAN"
  ).length;
  const unassignedIkutCount = participatingSchools.length - assignedPesertaCount;
  const assignedPanitiaCount = cachedPanitiaList.filter(
    p => Boolean(getPanitiaAssignedRoom(p.id_panitia))
  ).length;

  let panitiaIntiSummaryCard = "";
  if (showMasterRoomStats) {
    panitiaIntiSummaryCard = `
      <div class="p-4 rounded-3xl bg-gradient-to-br from-slate-900 via-violet-950 to-slate-900 text-white space-y-3 shadow-xl">
        <div class="flex items-center justify-between">
          <span class="text-[9px] font-extrabold uppercase tracking-wider bg-amber-400 text-slate-950 px-2.5 py-0.5 rounded-md">
            Data Jumlah Kamar Hotel (Khusus Panitia Inti)
          </span>
          <span class="text-[10px] font-bold text-emerald-300">
            Total: ${totalMasterRooms} Kamar (${totalPesertaBeds + totalPanitiaBeds} Bed)
          </span>
        </div>
        <div class="grid grid-cols-2 gap-2 text-left">
          <div class="bg-white/10 rounded-2xl p-2.5 border border-white/15 space-y-1">
            <div class="flex items-center justify-between">
              <span class="text-[9px] font-extrabold uppercase text-amber-300">Kamar Peserta (Ikut)</span>
              <span class="text-xs font-extrabold text-white">${pesertaRooms.length} Ruang</span>
            </div>
            <div class="text-[10px] text-violet-200">
              Terisi: <b class="text-emerald-300">${usedPesertaRooms} Kamar</b> (${assignedPesertaCount}/${participatingSchools.length} Kepsek)
            </div>
            <div class="text-[9px] text-rose-300 font-bold">
              Belum Dapat Kamar: ${unassignedIkutCount} Kepsek Ikut
            </div>
          </div>
          <div class="bg-indigo-500/20 rounded-2xl p-2.5 border border-indigo-400/30 space-y-1">
            <div class="flex items-center justify-between">
              <span class="text-[9px] font-extrabold uppercase text-sky-300">Kamar Khusus Panitia</span>
              <span class="text-xs font-extrabold text-white">${panitiaRooms.length} Ruang</span>
            </div>
            <div class="text-[10px] text-indigo-100">
              Terisi: <b class="text-emerald-300">${usedPanitiaRooms} Kamar</b> (${assignedPanitiaCount}/${cachedPanitiaList.length} Orang)
            </div>
            <div class="text-[9px] text-indigo-200 font-semibold">
              Kapasitas Bed Panitia: ${totalPanitiaBeds} Kursi
            </div>
          </div>
        </div>
        <div class="text-[9px] text-slate-300 flex items-center justify-between pt-1 border-t border-white/10">
          <span>Peserta Terdata Ikut: <b class="text-emerald-300">${participatingSchools.length} Sekolah</b></span>
          <span>Tidak Ikut (Dikecualikan): <b class="text-rose-300">${nonParticipatingCount} Sekolah</b></span>
        </div>
      </div>
    `;
  }

  let downloadBarHtml = "";
  if (canDownloadAndManagePanitia) {
    downloadBarHtml = `
      <div class="p-3 rounded-2xl bg-emerald-950 text-white border border-emerald-500/40 flex items-center justify-between gap-2 shadow-md">
        <div class="min-w-0">
          <div class="text-[9px] font-extrabold uppercase text-amber-300">
            <i class="fa-solid fa-file-arrow-down mr-1"></i>Otoritas Ketua Panitia & Sekretaris
          </div>
          <div class="text-[11px] font-extrabold text-white truncate">Download Rekapan Kamar (Peserta Ikut & Panitia)</div>
        </div>
        <div class="flex items-center gap-1.5 shrink-0">
          <button type="button" id="btnExportRoomCsv" class="px-2.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white text-[10px] font-extrabold flex items-center gap-1 transition">
            <i class="fa-solid fa-file-excel"></i>
            <span>Excel (.CSV)</span>
          </button>
          <button type="button" id="btnExportRoomPdf" class="px-2.5 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-[10px] font-extrabold flex items-center gap-1 transition">
            <i class="fa-solid fa-file-pdf"></i>
            <span>Rekap PDF</span>
          </button>
        </div>
      </div>
    `;
  }

  bodyEl.innerHTML = `
    ${panitiaIntiSummaryCard}
    ${downloadBarHtml}
    <div class="grid ${canInputMasterRooms ? 'grid-cols-3' : 'grid-cols-2'} gap-1.5 bg-slate-100 p-1 rounded-2xl">
      <button type="button" id="tabBtnKamarDivide" class="py-2 px-1 rounded-xl text-[10px] font-extrabold transition ${
        activeRoomTab === 'pembagian' ? 'bg-violet-900 text-amber-300 shadow' : 'text-slate-600'
      }">
        <i class="fa-solid fa-school mr-1"></i>Kamar Peserta (${participatingSchools.length})
      </button>
      <button type="button" id="tabBtnKamarPanitia" class="py-2 px-1 rounded-xl text-[10px] font-extrabold transition ${
        activeRoomTab === 'kamar_panitia' ? 'bg-violet-900 text-amber-300 shadow' : 'text-slate-600'
      }">
        <i class="fa-solid fa-user-shield mr-1"></i>Kamar Panitia
      </button>
      ${canInputMasterRooms ? `
        <button type="button" id="tabBtnKamarMaster" class="py-2 px-1 rounded-xl text-[10px] font-extrabold transition ${
          activeRoomTab === 'master_kamar' ? 'bg-violet-900 text-amber-300 shadow' : 'text-slate-600'
        }">
          <i class="fa-solid fa-hotel mr-1"></i>Input & Edit Kamar
        </button>
      ` : ''}
    </div>
    <div id="roomManagerSubViewBox" class="space-y-3 pt-1"></div>
  `;

  document.getElementById("tabBtnKamarDivide")?.addEventListener("click", () => {
    activeRoomTab = "pembagian";
    renderPanitiaRoomModalView(activeUser, sekolahList, bodyEl, reloadCallback);
  });
  document.getElementById("tabBtnKamarPanitia")?.addEventListener("click", () => {
    activeRoomTab = "kamar_panitia";
    renderPanitiaRoomModalView(activeUser, sekolahList, bodyEl, reloadCallback);
  });
  document.getElementById("tabBtnKamarMaster")?.addEventListener("click", () => {
    activeRoomTab = "master_kamar";
    renderPanitiaRoomModalView(activeUser, sekolahList, bodyEl, reloadCallback);
  });

  document.getElementById("btnExportRoomCsv")?.addEventListener("click", () => {
    exportRoomRecapToSpreadsheet(activeUser, sekolahList);
  });
  document.getElementById("btnExportRoomPdf")?.addEventListener("click", () => {
    generatePdfRoomRecapDocument(activeUser, sekolahList);
  });

  const subBox = document.getElementById("roomManagerSubViewBox");
  if (!subBox) return;

  if (activeRoomTab === "master_kamar" && canInputMasterRooms) {
    renderKetuaInputMasterRoomsTab(activeUser, sekolahList, subBox, bodyEl, reloadCallback);
  } else if (activeRoomTab === "kamar_panitia") {
    renderKamarKhususPanitiaTab(activeUser, canDownloadAndManagePanitia, sekolahList, subBox, bodyEl, reloadCallback);
  } else {
    renderPembagianPenghuniPerRayonTab(activeUser, canSetPesertaOccupants, sekolahList, subBox, bodyEl, reloadCallback);
  }
}

// =========================================================================
// TAB INPUT, EDIT & HAPUS NOMOR KAMAR (KHUSUS KETUA PANITIA)
// =========================================================================
function renderKetuaInputMasterRoomsTab(activeUser, sekolahList, container, bodyEl, reloadCallback) {
  container.innerHTML = `
    <div class="p-4 rounded-2xl bg-violet-50 border-2 border-violet-300 space-y-3 shadow-2xs">
      <div class="flex items-center justify-between border-b border-violet-200 pb-2">
        <span class="font-extrabold text-xs text-violet-950">
          <i class="fa-solid fa-plus-circle text-violet-700 mr-1"></i> Input Nomor Kamar, Kapasitas & Peruntukan
        </span>
        <span class="text-[9px] font-extrabold uppercase bg-violet-900 text-amber-300 px-2 py-0.5 rounded">
          Otoritas Ketua Panitia
        </span>
      </div>
      <p class="text-[10px] text-slate-600 leading-relaxed">
        Pilih peruntukan kamar (<b>Kamar Peserta</b> atau <b>Kamar Khusus Panitia</b>), lalu masukkan <b>Nomor Kamar</b> (bisa rentang seperti <code class="bg-violet-100 text-violet-900 px-1 py-0.5 rounded font-mono">101-120</code>).
      </p>
      <div>
        <label class="block text-[10px] font-bold text-slate-700 mb-1">1. Peruntukan Kamar:</label>
        <select id="inpNewRoomCategory" class="w-full rounded-xl border border-violet-300 bg-white px-3 py-2 text-xs font-bold text-slate-800">
          <option value="PESERTA">🏫 Kamar Peserta (Kepala Sekolah SD/MI yang Ikut)</option>
          <option value="PANITIA">🛡 Kamar Khusus Panitia Rakor</option>
        </select>
      </div>
      <div class="grid grid-cols-3 gap-2">
        <div class="col-span-2">
          <label class="block text-[10px] font-bold text-slate-700 mb-0.5">2. Nomor Kamar:</label>
          <input id="inpNewRoomNumber" type="text" placeholder="Contoh: 101 atau 101-120" class="w-full rounded-xl border border-violet-300 bg-white px-3 py-2 text-xs font-bold text-slate-900">
        </div>
        <div>
          <label class="block text-[10px] font-bold text-slate-700 mb-0.5">3. Kapasitas:</label>
          <input id="inpNewRoomCap" type="number" inputmode="numeric" min="1" max="10" value="2" class="w-full rounded-xl border border-violet-300 bg-white px-3 py-2 text-xs font-bold text-slate-900 text-center">
        </div>
      </div>
      <button type="button" id="btnAddMasterRoomNow" class="w-full py-2.5 rounded-xl bg-violet-900 hover:bg-violet-800 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 transition">
        <i class="fa-solid fa-floppy-disk"></i>
        <span>Tambahkan Kamar (Validasi Anti-Ganda)</span>
      </button>
    </div>

    <div class="space-y-2">
      <div class="flex items-center justify-between text-[10px] font-extrabold text-slate-700 uppercase px-1">
        <span>Daftar Kamar Terdaftar (${masterRoomsList.length} Ruangan)</span>
        <span class="text-[9px] font-semibold text-blue-700 normal-case"><i class="fa-solid fa-pen mr-0.5"></i>Klik ikon pensil untuk edit nomor</span>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-0.5">
        ${masterRoomsList.length === 0 ? `
          <div class="col-span-2 p-5 text-center text-xs text-slate-400 bg-slate-50 rounded-2xl border">
            Belum ada nomor kamar yang diinput oleh Ketua Panitia.
          </div>
        ` : masterRoomsList.map(rm => {
          const isPanRoom = rm.kategori === "PANITIA";
          const occ = isPanRoom
            ? getPanitiaRoomOccupants(rm.nomor)
            : getPesertaRoomOccupants(sekolahList, rm.nomor);
          const cap = Number(rm.kapasitas) || 2;
          const isFull = occ.length >= cap;
          const occNames = occ.map(o => isPanRoom ? o.nama_panitia : o.nama_sekolah).join(", ");
          return `
            <div class="p-2.5 rounded-2xl bg-white border ${
              isPanRoom ? 'border-indigo-300 bg-indigo-50/20' : isFull ? 'border-emerald-300 bg-emerald-50/20' : 'border-slate-200'
            } flex items-center justify-between gap-2 shadow-2xs">
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-1 flex-wrap">
                  <span class="font-extrabold text-xs text-slate-900">Kamar ${rm.nomor}</span>
                  <span class="text-[8px] font-extrabold px-1.5 py-0.5 rounded ${
                    isPanRoom ? 'bg-indigo-900 text-amber-300' : 'bg-blue-100 text-blue-900'
                  }">${isPanRoom ? 'PANITIA' : 'PESERTA'}</span>
                  <span class="text-[8px] font-extrabold px-1.5 py-0.5 rounded ${
                    isFull ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                  }">${occ.length}/${cap}</span>
                </div>
                <div class="text-[9px] text-slate-500 truncate mt-0.5">
                  ${occ.length > 0 ? occNames : 'Masih Kosong'}
                </div>
              </div>
              <div class="flex items-center gap-1 shrink-0">
                <button type="button" data-rnum="${rm.nomor}" title="Edit Nomor / Kapasitas Kamar" class="btn-edit-master-room w-7 h-7 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 flex items-center justify-center text-xs transition">
                  <i class="fa-solid fa-pen"></i>
                </button>
                <button type="button" data-rnum="${rm.nomor}" title="Hapus Kamar" class="btn-del-master-room w-7 h-7 rounded-xl bg-slate-100 hover:bg-rose-100 text-slate-500 hover:text-rose-600 flex items-center justify-center text-xs transition">
                  <i class="fa-solid fa-trash"></i>
                </button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>

    <!-- Modal Pop-up Edit Kamar (Ketua Panitia) -->
    <div id="editMasterRoomModalOverlay" class="hidden fixed inset-0 z-[75] bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
      <div class="w-full max-w-sm bg-white rounded-3xl p-5 space-y-3.5 shadow-2xl border-2 border-blue-400">
        <div class="flex items-center justify-between border-b border-slate-100 pb-2">
          <h4 class="text-xs font-extrabold uppercase text-blue-950 flex items-center gap-1.5">
            <i class="fa-solid fa-pen-to-square text-blue-700"></i>
            <span id="editRoomModalTitle">Edit Nomor Kamar</span>
          </h4>
          <button type="button" id="btnCloseEditRoomModal" class="w-7 h-7 rounded-full bg-slate-100 hover:bg-rose-100 text-slate-600 font-bold text-sm flex items-center justify-center">&times;</button>
        </div>

        <input type="hidden" id="editRoomOriginalNumber" value="" />

        <div id="editRoomOccupantsWarning" class="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-[10px] text-amber-900 leading-snug"></div>

        <div>
          <label class="block text-[10px] font-extrabold text-slate-700 mb-1">Nomor Kamar Baru:</label>
          <input id="inpEditRoomNumber" type="text" placeholder="Contoh: 205" class="w-full rounded-xl border-2 border-blue-300 bg-white px-3 py-2 text-xs font-extrabold text-slate-900 uppercase" />
        </div>

        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="block text-[10px] font-extrabold text-slate-700 mb-1">Peruntukan Kamar:</label>
            <select id="selEditRoomCategory" class="w-full rounded-xl border border-slate-300 bg-slate-50 px-2.5 py-2 text-xs font-bold text-slate-800">
              <option value="PESERTA">🏫 Peserta</option>
              <option value="PANITIA">🛡 Panitia</option>
            </select>
          </div>
          <div>
            <label class="block text-[10px] font-extrabold text-slate-700 mb-1">Kapasitas Bed:</label>
            <input id="inpEditRoomCap" type="number" inputmode="numeric" min="1" max="10" value="2" class="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-extrabold text-slate-900 text-center" />
          </div>
        </div>

        <div class="grid grid-cols-2 gap-2 pt-1">
          <button type="button" id="btnCancelEditRoom" class="py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-xs transition">
            Batal
          </button>
          <button type="button" id="btnSaveEditRoom" class="py-2.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-extrabold text-xs shadow flex items-center justify-center gap-1 transition">
            <i class="fa-solid fa-check"></i>
            <span>Simpan Perubahan</span>
          </button>
        </div>
      </div>
    </div>
  `;

  // 1. Tambah Kamar Baru
  document.getElementById("btnAddMasterRoomNow")?.addEventListener("click", async () => {
    const rawInput = document.getElementById("inpNewRoomNumber")?.value.trim() || "";
    const cap = Math.max(1, parseInt(document.getElementById("inpNewRoomCap")?.value || "2", 10) || 2);
    const kategori = document.getElementById("inpNewRoomCategory")?.value === "PANITIA" ? "PANITIA" : "PESERTA";
    if (!rawInput) return toast("Masukkan Nomor Kamar terlebih dahulu!");

    const existingNumbers = new Set(masterRoomsList.map(r => normalizeRoomNo(r.nomor)));
    const addedRooms = [];
    const duplicateRooms = [];

    if (rawInput.includes("-")) {
      const [startStr, endStr] = rawInput.split("-").map(x => x.trim());
      const startNum = parseInt(startStr, 10);
      const endNum = parseInt(endStr, 10);
      if (isNaN(startNum) || isNaN(endNum) || endNum < startNum || (endNum - startNum) > 150) {
        return toast("Format rentang nomor kamar tidak valid (Contoh: 101-120)!");
      }
      for (let n = startNum; n <= endNum; n++) {
        const roomNo = normalizeRoomNo(String(n));
        if (existingNumbers.has(roomNo)) {
          duplicateRooms.push(roomNo);
        } else {
          existingNumbers.add(roomNo);
          masterRoomsList.push({ nomor: roomNo, kapasitas: cap, kategori });
          addedRooms.push(roomNo);
        }
      }
    } else {
      const singleNo = normalizeRoomNo(rawInput);
      if (existingNumbers.has(singleNo)) {
        return toast(`Ditolak: Nomor Kamar "${singleNo}" sudah terdaftar! Nomor kamar tidak boleh ganda.`);
      }
      masterRoomsList.push({ nomor: singleNo, kapasitas: cap, kategori });
      addedRooms.push(singleNo);
    }

    if (addedRooms.length === 0 && duplicateRooms.length > 0) {
      return toast(`Semua nomor kamar tersebut (${duplicateRooms.join(", ")}) sudah terdaftar!`);
    }

    await saveMasterRoomsConfig(masterRoomsList);
    toast(`Berhasil menambahkan ${addedRooms.length} Kamar ${kategori === 'PANITIA' ? 'Khusus Panitia' : 'Peserta'}!`);
    renderPanitiaRoomModalView(activeUser, sekolahList, bodyEl, reloadCallback);
  });

  // 2. Buka Modal Edit Kamar
  const editOverlay = document.getElementById("editMasterRoomModalOverlay");
  const closeEditModal = () => editOverlay?.classList.add("hidden");

  document.getElementById("btnCloseEditRoomModal")?.addEventListener("click", closeEditModal);
  document.getElementById("btnCancelEditRoom")?.addEventListener("click", closeEditModal);

  container.querySelectorAll(".btn-edit-master-room").forEach(btn => {
    btn.addEventListener("click", () => {
      const oldNo = normalizeRoomNo(btn.dataset.rnum);
      const rmObj = masterRoomsList.find(r => normalizeRoomNo(r.nomor) === oldNo);
      if (!rmObj || !editOverlay) return;

      const isPan = rmObj.kategori === "PANITIA";
      const occPes = getPesertaRoomOccupants(sekolahList, oldNo);
      const occPan = getPanitiaRoomOccupants(oldNo);
      const totalOcc = occPes.length + occPan.length;

      document.getElementById("editRoomModalTitle").textContent = `Edit Kamar ${oldNo}`;
      document.getElementById("editRoomOriginalNumber").value = oldNo;
      document.getElementById("inpEditRoomNumber").value = oldNo;
      document.getElementById("selEditRoomCategory").value = isPan ? "PANITIA" : "PESERTA";
      document.getElementById("inpEditRoomCap").value = rmObj.kapasitas || 2;

      const warnBox = document.getElementById("editRoomOccupantsWarning");
      if (warnBox) {
        if (totalOcc > 0) {
          const names = isPan
            ? occPan.map(p => p.nama_panitia).join(", ")
            : occPes.map(s => s.nama_sekolah).join(", ");
          warnBox.innerHTML = `<i class="fa-solid fa-circle-info mr-1 text-amber-700"></i>Kamar ini sedang dihuni oleh <b>${totalOcc} orang</b> (${names}). Jika nomor kamar diubah, penghuninya akan <b>otomatis dipindahkan</b> ke nomor kamar baru.`;
        } else {
          warnBox.innerHTML = `<i class="fa-solid fa-check-circle mr-1 text-emerald-700"></i>Kamar ini masih kosong. Anda bebas mengubah nomor, kapasitas, maupun peruntukannya.`;
        }
      }

      editOverlay.classList.remove("hidden");
    });
  });

  // 3. Simpan Hasil Edit Kamar & Auto-Migrasi Penghuni
  document.getElementById("btnSaveEditRoom")?.addEventListener("click", async () => {
    const oldNo = normalizeRoomNo(document.getElementById("editRoomOriginalNumber")?.value);
    const newNo = normalizeRoomNo(document.getElementById("inpEditRoomNumber")?.value);
    const newKat = document.getElementById("selEditRoomCategory")?.value === "PANITIA" ? "PANITIA" : "PESERTA";
    const newCap = Math.max(1, parseInt(document.getElementById("inpEditRoomCap")?.value || "2", 10) || 2);

    if (!newNo || newNo === "BELUM DITENTUKAN") {
      return toast("Nomor kamar baru tidak boleh kosong!");
    }

    // Validasi anti-bentrok jika nomor kamar berubah
    if (newNo !== oldNo) {
      const conflict = masterRoomsList.find(r => normalizeRoomNo(r.nomor) === newNo);
      if (conflict) {
        return toast(`Ditolak: Nomor Kamar "${newNo}" sudah digunakan! Pilih nomor kamar lain.`);
      }
    }

    const occPes = getPesertaRoomOccupants(sekolahList, oldNo);
    const occPan = getPanitiaRoomOccupants(oldNo);
    const totalOcc = occPes.length + occPan.length;

    // Validasi kapasitas minimal tidak lebih kecil dari penghuni aktif
    if (newCap < totalOcc) {
      return toast(`Ditolak: Kapasitas (${newCap}) tidak boleh lebih kecil dari jumlah penghuni saat ini (${totalOcc} orang)!`);
    }

    // Validasi perubahan kategori jika sudah terisi penghuni
    if (occPes.length > 0 && newKat === "PANITIA") {
      return toast("Kamar sedang dihuni Peserta! Kosongkan peserta terlebih dahulu jika ingin mengubah ke Kamar Panitia.");
    }
    if (occPan.length > 0 && newKat === "PESERTA") {
      return toast("Kamar sedang dihuni Panitia! Kosongkan panitia terlebih dahulu jika ingin mengubah ke Kamar Peserta.");
    }

    const btnSave = document.getElementById("btnSaveEditRoom");
    if (btnSave) {
      btnSave.disabled = true;
      btnSave.innerHTML = `<i class="fa-solid fa-spinner animate-spin"></i> Menyimpan...`;
    }

    // Update Master Rooms List
    const targetRoom = masterRoomsList.find(r => normalizeRoomNo(r.nomor) === oldNo);
    if (targetRoom) {
      targetRoom.nomor = newNo;
      targetRoom.kategori = newKat;
      targetRoom.kapasitas = newCap;
    }
    await saveMasterRoomsConfig(masterRoomsList);

    // Jika nomor kamar berubah, pindahkan otomatis seluruh penghuni lama ke nomor kamar baru!
    if (newNo !== oldNo) {
      if (occPes.length > 0) {
        for (const s of occPes) {
          await sb.from("db_sekolah").update({ nomor_kamar: newNo }).eq("id_sekolah", s.id_sekolah);
          s.nomor_kamar = newNo;
        }
      }
      if (occPan.length > 0) {
        occPan.forEach(p => {
          panitiaRoomMap[p.id_panitia] = newNo;
        });
        await savePanitiaRoomAssignmentMap();
      }
    }

    closeEditModal();
    toast(
      newNo !== oldNo
        ? `Kamar ${oldNo} berhasil diubah menjadi Kamar ${newNo}${totalOcc > 0 ? ` (${totalOcc} penghuni ikut dipindahkan)` : ''}!`
        : `Data Kamar ${newNo} berhasil diperbarui!`
    );
    if (reloadCallback) await reloadCallback();
    renderPanitiaRoomModalView(activeUser, sekolahList, bodyEl, reloadCallback);
  });

  // 4. Hapus Kamar
  container.querySelectorAll(".btn-del-master-room").forEach(btn => {
    btn.addEventListener("click", async () => {
      const rnum = normalizeRoomNo(btn.dataset.rnum);
      const occPes = getPesertaRoomOccupants(sekolahList, rnum);
      const occPan = getPanitiaRoomOccupants(rnum);
      if (occPes.length > 0 || occPan.length > 0) {
        return toast(`Kamar ${rnum} sedang dihuni! Kosongkan penghuninya terlebih dahulu atau gunakan tombol Edit.`);
      }
      if (!confirm(`Hapus Kamar ${rnum} dari daftar kamar?`)) return;
      masterRoomsList = masterRoomsList.filter(r => normalizeRoomNo(r.nomor) !== rnum);
      await saveMasterRoomsConfig(masterRoomsList);
      toast(`Kamar ${rnum} berhasil dihapus.`);
      renderPanitiaRoomModalView(activeUser, sekolahList, bodyEl, reloadCallback);
    });
  });
}

function renderKamarKhususPanitiaTab(activeUser, canManagePanitiaRooms, sekolahList, container, bodyEl, reloadCallback) {
  const myPanitiaId = activeUser?.profile?.id_panitia;
  const myPanitiaRoom = myPanitiaId ? getPanitiaAssignedRoom(myPanitiaId) : "";
  const myPanitiaRoommates = myPanitiaRoom
    ? cachedPanitiaList.filter(p => getPanitiaAssignedRoom(p.id_panitia) === myPanitiaRoom && p.id_panitia !== myPanitiaId)
    : [];
  const panitiaRoomsOnly = masterRoomsList.filter(r => r.kategori === "PANITIA");
  const divisiSet = [...new Set(cachedPanitiaList.map(p => p.divisi).filter(Boolean))];

  container.innerHTML = `
    <div class="p-3.5 rounded-2xl bg-gradient-to-r from-indigo-950 via-slate-900 to-indigo-950 text-white border border-indigo-500/40 flex items-center justify-between gap-3 shadow-md">
      <div class="min-w-0">
        <span class="text-[9px] font-extrabold uppercase bg-amber-400 text-slate-950 px-2 py-0.5 rounded">
          Kamar Panitia Anda
        </span>
        <div class="text-xs font-extrabold text-white mt-1 truncate">${activeUser.profile?.nama_panitia || 'Panitia'}</div>
        <div class="text-[10px] text-indigo-200 truncate">
          ${myPanitiaRoommates.length > 0
            ? `Teman Sekamar: ${myPanitiaRoommates.map(m => m.nama_panitia).join(', ')}`
            : (myPanitiaRoom ? 'Belum ada rekan sekamar lainnya' : 'Diatur oleh Ketua Panitia & Sekretaris')}
        </div>
      </div>
      <div class="text-right shrink-0 bg-white/10 px-3 py-2 rounded-xl border border-white/15">
        <div class="text-[9px] text-indigo-200 uppercase font-bold">No. Kamar</div>
        <div class="text-sm font-extrabold text-amber-300">${myPanitiaRoom || 'Belum Ada'}</div>
      </div>
    </div>
    <div class="grid grid-cols-2 gap-2">
      <select id="panRoomFilterDivisi" class="rounded-xl border border-slate-300 bg-slate-50 px-2.5 py-2 text-xs font-semibold text-slate-800">
        <option value="ALL" ${selectedFilterDivisiPanitia === 'ALL' ? 'selected' : ''}>Semua Seksi / Divisi (${cachedPanitiaList.length})</option>
        ${divisiSet.map(d => `<option value="${d}" ${selectedFilterDivisiPanitia === d ? 'selected' : ''}>${d}</option>`).join('')}
      </select>
      <input id="panRoomSearchInput" type="text" placeholder="Cari nama panitia atau kamar..." class="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-900">
    </div>
    <div id="panitiaRoomRowsContainer" class="space-y-2 max-h-80 overflow-y-auto pr-0.5"></div>
  `;

  const renderPanitiaRows = () => {
    const box = document.getElementById("panitiaRoomRowsContainer");
    if (!box) return;
    const kw = (document.getElementById("panRoomSearchInput")?.value || "").toLowerCase().trim();
    let list = cachedPanitiaList;
    if (selectedFilterDivisiPanitia !== "ALL") {
      list = list.filter(p => p.divisi === selectedFilterDivisiPanitia);
    }
    if (kw) {
      list = list.filter(p =>
        (p.nama_panitia || "").toLowerCase().includes(kw) ||
        (p.divisi || "").toLowerCase().includes(kw) ||
        getPanitiaAssignedRoom(p.id_panitia).toLowerCase().includes(kw)
      );
    }
    box.innerHTML = "";
    list.forEach((p, idx) => {
      const currentRoom = getPanitiaAssignedRoom(p.id_panitia);
      const roommates = currentRoom
        ? cachedPanitiaList.filter(x => getPanitiaAssignedRoom(x.id_panitia) === currentRoom && x.id_panitia !== p.id_panitia)
        : [];
      const roomMeta = currentRoom ? masterRoomsList.find(r => normalizeRoomNo(r.nomor) === currentRoom) : null;
      const roomCap = roomMeta ? Number(roomMeta.kapasitas) || 2 : 2;
      const waClean = String(p.no_hp || "").replace(/\D/g, "").replace(/^0/, "62");
      const phoneClean = String(p.no_hp || "").replace(/\D/g, "");
      const photoUrl = getPersonPhotoUrl(p, p.nama_panitia);
      const fallbackAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(p.nama_panitia || "Panitia")}&background=1e1b4b&color=fcd34d&bold=true&size=200`;

      let optionsHtml = `<option value="" ${!currentRoom ? 'selected' : ''}>-- Belum Ditentukan --</option>`;
      const candidateRooms = panitiaRoomsOnly.length > 0 ? panitiaRoomsOnly : masterRoomsList;
      candidateRooms.forEach(rm => {
        const rNo = normalizeRoomNo(rm.nomor);
        const cap = Number(rm.kapasitas) || 2;
        const occ = getPanitiaRoomOccupants(rNo);
        const isCurrentHere = currentRoom === rNo;
        const isFull = occ.length >= cap && !isCurrentHere;
        optionsHtml += `
          <option value="${rNo}" ${isCurrentHere ? 'selected' : ''} ${isFull ? 'disabled' : ''}>
            Kamar ${rNo} ${isFull ? `[PENUH ${occ.length}/${cap}]` : `(${occ.length}/${cap} Panitia)`}
          </option>
        `;
      });

      const card = document.createElement("div");
      card.className = `p-3 rounded-2xl bg-white border ${currentRoom ? 'border-indigo-300 bg-indigo-50/20' : 'border-slate-200'} flex items-center justify-between gap-2.5 shadow-2xs`;
      card.innerHTML = `
        <div class="flex items-center gap-2.5 min-w-0 flex-1">
          <div class="btn-zoom-panitia-photo w-11 h-11 rounded-2xl overflow-hidden border-2 border-indigo-300 shrink-0 cursor-pointer hover:scale-110 transition-transform bg-slate-100">
            <img src="${photoUrl}" alt="${p.nama_panitia}" class="w-full h-full object-cover" onerror="this.onerror=null;this.src='${fallbackAvatar}';" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="text-[9px] font-extrabold text-slate-400">#${p.no || (idx + 1)}</span>
              <span class="text-[9px] font-extrabold bg-indigo-100 text-indigo-900 px-1.5 py-0.5 rounded">${p.divisi}</span>
              ${currentRoom ? `
                <span class="text-[9px] font-extrabold bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded">
                  Kamar ${currentRoom} (${roommates.length + 1}/${roomCap})
                </span>
              ` : ''}
            </div>
            <h4 class="font-extrabold text-xs text-slate-900 truncate mt-1">${p.nama_panitia}</h4>
            <div class="text-[10px] text-slate-500 mt-0.5">Telp/WA: ${p.no_hp || 'Tidak ada'}</div>
            ${roommates.length > 0 ? `
              <div class="text-[9px] font-bold text-indigo-800 mt-1">
                <i class="fa-solid fa-user-group mr-1"></i>Sekamar dgn: ${roommates.map(m => m.nama_panitia).join(', ')}
              </div>
            ` : ''}
          </div>
        </div>
        <div class="flex items-center gap-1.5 shrink-0">
          ${p.no_hp ? `
            <a href="tel:${phoneClean}" title="Telepon" class="w-8 h-8 rounded-xl bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center text-xs transition">
              <i class="fa-solid fa-phone"></i>
            </a>
            <a href="https://wa.me/${waClean}" target="_blank" rel="noopener noreferrer" title="WhatsApp" class="w-8 h-8 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center text-xs transition">
              <i class="fa-brands fa-whatsapp"></i>
            </a>
          ` : ''}
          ${canManagePanitiaRooms ? `
            <select class="sel-panitia-room rounded-xl border-2 ${currentRoom ? 'border-indigo-600 bg-indigo-50 text-indigo-950 font-bold' : 'border-slate-300 bg-slate-50 text-slate-700'} px-2 py-1 text-[11px]">
              ${optionsHtml}
            </select>
          ` : `
            <span class="text-[10px] font-extrabold px-2.5 py-1 rounded-xl ${
              currentRoom ? 'bg-indigo-100 text-indigo-900 border border-indigo-300' : 'bg-slate-100 text-slate-500'
            }">
              <i class="fa-solid fa-bed mr-1"></i>${currentRoom ? `Kamar ${currentRoom}` : 'Belum Ada'}
            </span>
          `}
        </div>
      `;

      card.querySelector(".btn-zoom-panitia-photo")?.addEventListener("click", () => {
        openRoommatePhotoZoomModal(photoUrl, p.nama_panitia, p.divisi, p.jabatan || "Panitia Rakor", p.no_hp, currentRoom);
      });

      if (canManagePanitiaRooms) {
        card.querySelector(".sel-panitia-room")?.addEventListener("change", async (e) => {
          const chosen = normalizeRoomNo(e.target.value);
          if (chosen) {
            const rmObj = masterRoomsList.find(r => normalizeRoomNo(r.nomor) === chosen);
            const maxCap = rmObj ? (Number(rmObj.kapasitas) || 2) : 2;
            const currentOcc = cachedPanitiaList.filter(
              x => getPanitiaAssignedRoom(x.id_panitia) === chosen && x.id_panitia !== p.id_panitia
            );
            if (currentOcc.length >= maxCap) {
              toast(`Ditolak: Kamar Panitia ${chosen} sudah penuh (${currentOcc.length}/${maxCap} orang)!`);
              e.target.value = currentRoom || "";
              return;
            }
            panitiaRoomMap[p.id_panitia] = chosen;
          } else {
            delete panitiaRoomMap[p.id_panitia];
          }
          await savePanitiaRoomAssignmentMap();
          toast(chosen ? `${p.nama_panitia} ditempatkan di Kamar ${chosen}` : `Kamar ${p.nama_panitia} dikosongkan.`);
          renderPanitiaRoomModalView(activeUser, sekolahList, bodyEl, reloadCallback);
        });
      }
      box.appendChild(card);
    });
  };

  renderPanitiaRows();
  document.getElementById("panRoomFilterDivisi")?.addEventListener("change", (e) => {
    selectedFilterDivisiPanitia = e.target.value;
    renderPanitiaRows();
  });
  document.getElementById("panRoomSearchInput")?.addEventListener("input", renderPanitiaRows);
}

function renderPembagianPenghuniPerRayonTab(activeUser, canSetOccupants, sekolahList, container, bodyEl, reloadCallback) {
  const participatingSchools = (sekolahList || []).filter(isSchoolParticipating);
  const nonParticipatingCount = (sekolahList || []).length - participatingSchools.length;
  const isRayonCoord = Boolean(activeUser?.profile?.tugas_subrayon);
  const pesertaRoomsOnly = masterRoomsList.filter(r => r.kategori !== "PANITIA");

  const rayonCardsHtml = SUBRAYON_LIST.map(sr => {
    const srList = participatingSchools.filter(s => s.subrayon === sr);
    const srHasRoom = srList.filter(s => s.nomor_kamar && normalizeRoomNo(s.nomor_kamar) !== "BELUM DITENTUKAN").length;
    const isSel = selectedFilterRayon === sr;
    return `
      <button type="button" data-sr="${sr}" class="kamar-sr-pill p-2 rounded-xl border text-center transition ${
        isSel ? 'bg-violet-900 text-white border-violet-900 shadow' : 'bg-slate-50 text-slate-800 border-slate-200 hover:bg-violet-50'
      }">
        <div class="text-[10px] font-extrabold truncate">Sub Rayon ${sr}</div>
        <div class="text-[9px] font-bold mt-0.5 ${isSel ? 'text-amber-300' : 'text-violet-700'}">
          ${srHasRoom}/${srList.length} Peserta Ikut
        </div>
      </button>
    `;
  }).join('');

  container.innerHTML = `
    ${canSetOccupants ? `
      <div class="p-3 rounded-2xl bg-violet-50 border border-violet-200 flex items-center gap-2.5">
        <div class="w-8 h-8 rounded-xl bg-violet-800 text-amber-300 flex items-center justify-center text-xs font-extrabold shrink-0">
          <i class="fa-solid fa-user-check"></i>
        </div>
        <div class="text-[10px] text-violet-950 leading-snug">
          <b>Validasi Peserta Aktif (${isRayonCoord ? 'Ketua Rayon ' + activeUser.profile.tugas_subrayon : activeUser.profile?.divisi}):</b> Atur nomor kamar dengan memilih dari daftar kamar tersedia (Anti Melebihi Kapasitas).
        </div>
      </div>
    ` : `
      <div class="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-[10px] text-slate-600 text-center font-semibold">
        Menampilkan Data Pembagian Kamar Peserta yang Terdata Ikut (${participatingSchools.length} Sekolah)
      </div>
    `}
    <div class="grid grid-cols-3 gap-1.5">
      ${rayonCardsHtml}
    </div>
    <div class="grid grid-cols-2 gap-2">
      <select id="kamarFilterRayonSelect" class="rounded-xl border border-slate-300 bg-slate-50 px-2.5 py-2 text-xs font-semibold text-slate-800">
        <option value="ALL" ${selectedFilterRayon === 'ALL' ? 'selected' : ''}>Semua Rayon (${participatingSchools.length} Ikut)</option>
        ${SUBRAYON_LIST.map(sr => {
          const c = participatingSchools.filter(x => x.subrayon === sr).length;
          return `<option value="${sr}" ${selectedFilterRayon === sr ? 'selected' : ''}>Rayon ${sr} (${c} Ikut)</option>`;
        }).join('')}
      </select>
      <select id="kamarFilterStatusSelect" class="rounded-xl border border-slate-300 bg-slate-50 px-2.5 py-2 text-xs font-semibold text-slate-800">
        <option value="IKUT_ALL" ${selectedFilterKamarStatus === 'IKUT_ALL' ? 'selected' : ''}>Semua Peserta Ikut (${participatingSchools.length})</option>
        <option value="SUDAH" ${selectedFilterKamarStatus === 'SUDAH' ? 'selected' : ''}>✓ Ikut & Sudah Ada Kamar</option>
        <option value="BELUM" ${selectedFilterKamarStatus === 'BELUM' ? 'selected' : ''}>⏳ Ikut & Belum Ada Kamar</option>
        <option value="TIDAK_IKUT" ${selectedFilterKamarStatus === 'TIDAK_IKUT' ? 'selected' : ''}>✕ Tidak Ikut (${nonParticipatingCount})</option>
      </select>
    </div>
    <input id="kamarSearchSchoolInput" type="text" placeholder="Cari nama sekolah, Kepala Sekolah, atau nomor kamar..." class="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-900">
    <div id="kamarAssignmentListContainer" class="space-y-2 max-h-80 overflow-y-auto pr-0.5"></div>
  `;

  container.querySelectorAll(".kamar-sr-pill").forEach(btn => {
    btn.addEventListener("click", () => {
      const clickedSr = btn.dataset.sr;
      selectedFilterRayon = selectedFilterRayon === clickedSr ? "ALL" : clickedSr;
      renderPanitiaRoomModalView(activeUser, sekolahList, bodyEl, reloadCallback);
    });
  });

  const renderOccupantRows = () => {
    const listBox = document.getElementById("kamarAssignmentListContainer");
    if (!listBox) return;
    const kw = (document.getElementById("kamarSearchSchoolInput")?.value || "").toLowerCase().trim();
    const nonParticipatingSchools = (sekolahList || []).filter(s => !isSchoolParticipating(s));
    let list = selectedFilterKamarStatus === "TIDAK_IKUT"
      ? nonParticipatingSchools
      : participatingSchools;

    if (selectedFilterRayon !== "ALL") {
      list = list.filter(s => s.subrayon === selectedFilterRayon);
    }
    if (selectedFilterKamarStatus === "SUDAH") {
      list = list.filter(s => s.nomor_kamar && normalizeRoomNo(s.nomor_kamar) !== "BELUM DITENTUKAN");
    } else if (selectedFilterKamarStatus === "BELUM") {
      list = list.filter(s => !s.nomor_kamar || normalizeRoomNo(s.nomor_kamar) === "BELUM DITENTUKAN");
    }
    if (kw) {
      list = list.filter(s =>
        (s.nama_sekolah || "").toLowerCase().includes(kw) ||
        (s.nama_kepsek || "").toLowerCase().includes(kw) ||
        (s.nomor_kamar || "").toLowerCase().includes(kw) ||
        (s.subrayon || "").toLowerCase().includes(kw)
      );
    }
    if (list.length === 0) {
      listBox.innerHTML = `<div class="p-5 text-center text-xs text-slate-400 bg-slate-50 rounded-2xl border">Tidak ada data sekolah yang sesuai filter.</div>`;
      return;
    }
    listBox.innerHTML = "";
    list.slice(0, 200).forEach((s, idx) => {
      const isIkut = isSchoolParticipating(s);
      const currentRoom = (isIkut && s.nomor_kamar && normalizeRoomNo(s.nomor_kamar) !== "BELUM DITENTUKAN")
        ? normalizeRoomNo(s.nomor_kamar)
        : "";
      const roommates = currentRoom
        ? participatingSchools.filter(x => normalizeRoomNo(x.nomor_kamar) === currentRoom && x.id_sekolah !== s.id_sekolah)
        : [];
      const roomConfig = currentRoom ? masterRoomsList.find(r => normalizeRoomNo(r.nomor) === currentRoom) : null;
      const roomCap = roomConfig ? Number(roomConfig.kapasitas) || 2 : 2;
      const currentTotalInRoom = currentRoom ? (roommates.length + 1) : 0;
      const waClean = String(s.no_hp || "").replace(/\D/g, "").replace(/^0/, "62");
      const phoneClean = String(s.no_hp || "").replace(/\D/g, "");
      const displayName = s.nama_kepsek || s.nama_sekolah;
      const photoUrl = getPersonPhotoUrl(s, displayName);
      const fallbackAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=1e1b4b&color=fcd34d&bold=true&size=200`;

      let roomOptionsHtml = `<option value="Belum Ditentukan" ${!currentRoom ? 'selected' : ''}>-- Belum Ditentukan --</option>`;
      pesertaRoomsOnly.forEach(rm => {
        const rNo = normalizeRoomNo(rm.nomor);
        const cap = Number(rm.kapasitas) || 2;
        const occList = getPesertaRoomOccupants(sekolahList, rNo);
        const isCurrentSchoolInThisRoom = currentRoom === rNo;
        const isRoomFull = occList.length >= cap && !isCurrentSchoolInThisRoom;
        const statusLabel = isRoomFull
          ? `[PENUH ${occList.length}/${cap}]`
          : `(${occList.length}/${cap} Terisi)`;
        roomOptionsHtml += `
          <option value="${rNo}" ${isCurrentSchoolInThisRoom ? 'selected' : ''} ${isRoomFull ? 'disabled' : ''}>
            Kamar ${rNo} ${statusLabel}
          </option>
        `;
      });

      const row = document.createElement("div");
      row.className = `p-3 rounded-2xl bg-white border ${!isIkut ? 'border-rose-200 bg-rose-50/30 opacity-80' : currentRoom ? 'border-violet-300 bg-violet-50/20' : 'border-slate-200'} shadow-2xs`;
      row.innerHTML = `
        <div class="flex items-start justify-between gap-2.5">
          <div class="flex items-start gap-2.5 min-w-0 flex-1">
            <div class="btn-zoom-school-photo w-11 h-11 rounded-2xl overflow-hidden border-2 border-violet-300 shrink-0 cursor-pointer hover:scale-110 transition-transform bg-slate-100 mt-0.5">
              <img src="${photoUrl}" alt="${displayName}" class="w-full h-full object-cover" onerror="this.onerror=null;this.src='${fallbackAvatar}';" />
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-1.5 flex-wrap">
                <span class="text-[9px] font-extrabold text-slate-400">#${idx + 1}</span>
                <span class="text-[9px] font-extrabold bg-indigo-100 text-indigo-900 px-1.5 py-0.5 rounded">Rayon ${s.subrayon || '-'}</span>
                <span class="text-[9px] font-extrabold px-1.5 py-0.5 rounded ${isIkut ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}">
                  ${isIkut ? '✓ IKUT' : `✕ ${s.status_ikut || 'Tidak Ikut'}`}
                </span>
                ${currentRoom ? `
                  <span class="text-[9px] font-extrabold bg-violet-100 text-violet-900 px-1.5 py-0.5 rounded">
                    Kamar ${currentRoom} (${currentTotalInRoom}/${roomCap} Org)
                  </span>
                ` : ''}
              </div>
              <h4 class="font-extrabold text-xs text-slate-900 truncate mt-1">${s.nama_sekolah}</h4>
              <p class="text-[10px] text-slate-600 truncate">Kepsek: <b>${s.nama_kepsek || 'Belum Diisi'}</b> • Telp/WA: ${s.no_hp || '-'}</p>
              ${roommates.length > 0 ? `
                <div class="text-[9px] font-bold text-violet-900 mt-1 bg-violet-100/80 px-2 py-0.5 rounded-md inline-block">
                  <i class="fa-solid fa-user-group mr-1 text-violet-700"></i>Teman Sekamar: ${roommates.map(o => `${o.nama_kepsek || o.nama_sekolah} (${o.subrayon})`).join(', ')}
                </div>
              ` : ''}
            </div>
          </div>
          <div class="flex items-center gap-1.5 shrink-0">
            ${s.no_hp ? `
              <a href="tel:${phoneClean}" title="Telepon" class="w-8 h-8 rounded-xl bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center text-xs transition">
                <i class="fa-solid fa-phone"></i>
              </a>
              <a href="https://wa.me/${waClean}" target="_blank" rel="noopener noreferrer" title="WhatsApp" class="w-8 h-8 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center text-xs transition">
                <i class="fa-brands fa-whatsapp"></i>
              </a>
            ` : ''}
            ${!isIkut ? `
              <span class="text-[9px] font-extrabold px-2 py-1.5 rounded-xl bg-rose-100 text-rose-800 border border-rose-200">
                Tidak Ikut
              </span>
            ` : canSetOccupants ? `
              <select class="sel-assign-room rounded-xl border-2 ${currentRoom ? 'border-violet-600 bg-violet-50 text-violet-950 font-bold' : 'border-slate-300 bg-slate-50 text-slate-700'} px-2 py-1 text-[11px]">
                ${roomOptionsHtml}
              </select>
            ` : `
              <span class="text-[10px] font-extrabold px-2.5 py-1 rounded-xl ${
                currentRoom ? 'bg-violet-100 text-violet-900 border border-violet-300' : 'bg-slate-100 text-slate-500'
              }">
                <i class="fa-solid fa-bed mr-1"></i>${currentRoom ? `Kamar ${currentRoom}` : 'Belum Ada'}
              </span>
            `}
          </div>
        </div>
      `;

      row.querySelector(".btn-zoom-school-photo")?.addEventListener("click", () => {
        openRoommatePhotoZoomModal(photoUrl, s.nama_kepsek || "Kepala Sekolah", s.nama_sekolah, `Sub Rayon ${s.subrayon || '-'}`, s.no_hp, currentRoom);
      });

      if (canSetOccupants && isIkut) {
        row.querySelector(".sel-assign-room")?.addEventListener("change", async (e) => {
          if (!isSchoolParticipating(s)) {
            toast(`Ditolak: ${s.nama_sekolah} tidak terdata Ikut kegiatan!`);
            e.target.value = "Belum Ditentukan";
            return;
          }
          const chosenRoom = e.target.value;
          if (chosenRoom !== "Belum Ditentukan") {
            const targetNorm = normalizeRoomNo(chosenRoom);
            const rmObj = masterRoomsList.find(r => normalizeRoomNo(r.nomor) === targetNorm);
            const maxCap = rmObj ? (Number(rmObj.kapasitas) || 2) : 2;
            const currentOccupants = participatingSchools.filter(
              x => normalizeRoomNo(x.nomor_kamar) === targetNorm && x.id_sekolah !== s.id_sekolah
            );
            if (currentOccupants.length >= maxCap) {
              toast(`Ditolak: Kamar ${targetNorm} sudah penuh (${currentOccupants.length}/${maxCap} orang)! Pilih kamar lain.`);
              e.target.value = currentRoom || "Belum Ditentukan";
              return;
            }
          }
          await sb.from("db_sekolah").update({ nomor_kamar: chosenRoom }).eq("id_sekolah", s.id_sekolah);
          s.nomor_kamar = chosenRoom;
          toast(
            chosenRoom === "Belum Ditentukan"
              ? `Penempatan kamar ${s.nama_sekolah} dikosongkan.`
              : `${s.nama_sekolah} ditempatkan di Kamar ${chosenRoom}!`
          );
          if (reloadCallback) await reloadCallback();
          renderPanitiaRoomModalView(activeUser, sekolahList, bodyEl, reloadCallback);
        });
      }
      listBox.appendChild(row);
    });
  };

  renderOccupantRows();
  document.getElementById("kamarFilterRayonSelect")?.addEventListener("change", (e) => {
    selectedFilterRayon = e.target.value;
    renderPanitiaRoomModalView(activeUser, sekolahList, bodyEl, reloadCallback);
  });
  document.getElementById("kamarFilterStatusSelect")?.addEventListener("change", (e) => {
    selectedFilterKamarStatus = e.target.value;
    renderOccupantRows();
  });
  document.getElementById("kamarSearchSchoolInput")?.addEventListener("input", renderOccupantRows);
}

export function exportRoomRecapToSpreadsheet(activeUser, sekolahList) {
  if (!isKetuaOrSekretaris(activeUser)) {
    return toast("Akses Ditolak: Hanya Ketua Panitia & Sekretaris yang dapat mengunduh Dokumen Rekapan Kamar!");
  }
  const escapeCsv = (val) => `"${String(val ?? "").replace(/"/g, '""')}"`;
  const headers = [
    "No",
    "Kategori Penghuni",
    "Nomor Kamar Hotel",
    "Kapasitas Kamar",
    "Sub Rayon / Divisi Panitia",
    "NPSN / ID",
    "Nama Satuan Pendidikan / Jabatan",
    "Nama Lengkap Penghuni (Kepsek / Panitia)",
    "No. HP / WhatsApp",
    "Rekan Sekamar"
  ];
  const rows = [];
  let counter = 1;
  const participatingOnly = (sekolahList || []).filter(isSchoolParticipating);
  const sortedPeserta = [...participatingOnly].sort((a, b) => {
    const rA = (a.nomor_kamar && a.nomor_kamar !== "Belum Ditentukan") ? a.nomor_kamar : "ZZZ";
    const rB = (b.nomor_kamar && b.nomor_kamar !== "Belum Ditentukan") ? b.nomor_kamar : "ZZZ";
    const cmp = String(rA).localeCompare(String(rB), undefined, { numeric: true });
    if (cmp !== 0) return cmp;
    return String(a.subrayon || "").localeCompare(String(b.subrayon || ""));
  });

  sortedPeserta.forEach(s => {
    const rNo = (s.nomor_kamar && normalizeRoomNo(s.nomor_kamar) !== "BELUM DITENTUKAN")
      ? normalizeRoomNo(s.nomor_kamar)
      : "Belum Ditentukan";
    const rmObj = masterRoomsList.find(r => normalizeRoomNo(r.nomor) === rNo);
    const cap = rmObj ? `${rmObj.kapasitas} Orang` : "-";
    const mates = rNo !== "Belum Ditentukan"
      ? participatingOnly
          .filter(x => normalizeRoomNo(x.nomor_kamar) === rNo && x.id_sekolah !== s.id_sekolah)
          .map(x => `${x.nama_kepsek || x.nama_sekolah} (${x.subrayon})`)
          .join("; ")
      : "-";
    rows.push([
      counter++,
      "PESERTA (IKUT)",
      rNo,
      cap,
      `Sub Rayon ${s.subrayon || '-'}`,
      s.npsn || "-",
      s.nama_sekolah || "-",
      s.nama_kepsek || "Belum Diisi",
      s.no_hp ? `'${s.no_hp}` : "-",
      mates || "-"
    ].map(escapeCsv).join(","));
  });

  const sortedPanitia = [...(cachedPanitiaList || [])].sort((a, b) => {
    const rA = getPanitiaAssignedRoom(a.id_panitia) || "ZZZ";
    const rB = getPanitiaAssignedRoom(b.id_panitia) || "ZZZ";
    return String(rA).localeCompare(String(rB), undefined, { numeric: true });
  });

  sortedPanitia.forEach(p => {
    const rNo = getPanitiaAssignedRoom(p.id_panitia) || "Belum Ditentukan";
    const rmObj = masterRoomsList.find(r => normalizeRoomNo(r.nomor) === rNo);
    const cap = rmObj ? `${rmObj.kapasitas} Orang` : "-";
    const mates = rNo !== "Belum Ditentukan"
      ? cachedPanitiaList
          .filter(x => getPanitiaAssignedRoom(x.id_panitia) === rNo && x.id_panitia !== p.id_panitia)
          .map(x => `${x.nama_panitia} (${x.divisi})`)
          .join("; ")
      : "-";
    rows.push([
      counter++,
      "PANITIA RAKOR",
      rNo,
      cap,
      p.divisi || "Panitia",
      p.id_panitia || "-",
      p.jabatan || "Anggota",
      p.nama_panitia || "-",
      p.no_hp ? `'${p.no_hp}` : "-",
      mates || "-"
    ].map(escapeCsv).join(","));
  });

  const lineBreak = String.fromCharCode(13, 10);
  const csvContent = [headers.map(escapeCsv).join(","), ...rows].join(lineBreak);
  const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
  const blob = new Blob([bom, csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Rekapan_Kamar_Hotel_Peserta_Aktif_dan_Panitia_Rakor2026.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast("File Spreadsheet Rekapan Kamar berhasil diunduh!");
}

export async function generatePdfRoomRecapDocument(activeUser, sekolahList) {
  if (!isKetuaOrSekretaris(activeUser)) {
    return toast("Akses Ditolak: Hanya Ketua Panitia & Sekretaris yang dapat mengunduh PDF Rekapan Kamar!");
  }
  toast("Menyiapkan PDF Resmi Rekapan Kamar Hotel...");
  await ensureJsPdfLoaded();
  const logoImg = await preloadLogo();

  const roomEntries = masterRoomsList.map((rm, idx) => {
    const isPan = rm.kategori === "PANITIA";
    const occ = isPan
      ? getPanitiaRoomOccupants(rm.nomor)
      : getPesertaRoomOccupants(sekolahList, rm.nomor);
    const penghuniText = occ.length === 0
      ? "Masih Kosong"
      : occ.map(o => isPan
          ? `${o.nama_panitia} (${o.divisi})`
          : `${o.nama_kepsek || 'Kepsek'} - ${o.nama_sekolah} (${o.subrayon})`
        ).join("  |  ");
    return {
      no: idx + 1,
      nomor: rm.nomor,
      kategori: isPan ? "KHUSUS PANITIA" : "PESERTA (IKUT)",
      kapasitas: `${occ.length} / ${rm.kapasitas || 2} Org`,
      penghuni: penghuniText
    };
  });

  if (roomEntries.length === 0) {
    return toast("Belum ada nomor kamar yang diinput pada sistem!");
  }

  const rowsPerPage = 24;
  const totalPages = Math.ceil(roomEntries.length / rowsPerPage) || 1;
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: "portrait", unit: "px", format: [794, 1123] });

  for (let page = 0; page < totalPages; page++) {
    if (page > 0) pdf.addPage([794, 1123], "portrait");
    const canvas = document.createElement("canvas");
    canvas.width = 794;
    canvas.height = 1123;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (logoImg) {
      ctx.drawImage(logoImg, 45, 24, 100, 100);
    }

    const centerX = canvas.width / 2 + 30;
    ctx.textAlign = "center";
    ctx.fillStyle = "#0f172a";
    ctx.font = "bold 15px 'Plus Jakarta Sans', Arial, sans-serif";
    ctx.fillText("PEMERINTAH KOTA KUPANG • DINAS PENDIDIKAN DAN KEBUDAYAAN KOTA KUPANG", centerX, 42);
    ctx.font = "800 17px 'Plus Jakarta Sans', Arial, sans-serif";
    ctx.fillText("KELOMPOK KERJA KEPALA SEKOLAH (K3S) SD/MI KOTA KUPANG", centerX, 66);
    ctx.fillStyle = "#1e3a8a";
    ctx.font = "800 17px 'Plus Jakarta Sans', Arial, sans-serif";
    ctx.fillText("PANITIA PELAKSANA RAKOR KEPALA SD/MI KOTA KUPANG 2026", centerX, 90);
    ctx.fillStyle = "#334155";
    ctx.font = "bold 11px 'Plus Jakarta Sans', Arial, sans-serif";
    ctx.fillText("SEKRETARIAT: SD NCIPS - JL. KENANGA, NO. 01 NAIKOLAN - KUPANG | 26 s.d. 28 November 2026", centerX, 110);

    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(40, 128);
    ctx.lineTo(754, 128);
    ctx.stroke();

    ctx.fillStyle = "#0f172a";
    ctx.font = "800 15px 'Plus Jakarta Sans', Arial, sans-serif";
    ctx.fillText(`DAFTAR REKAPAN KAMAR HOTEL PESERTA & PANITIA (HALAMAN ${page + 1}/${totalPages})`, canvas.width / 2, 150);

    const startX = 40;
    let y = 172;
    const colW = [38, 85, 110, 75, 406];
    const headers = ["No", "No. Kamar", "Peruntukan", "Terisi/Kap", "Nama Penghuni Kamar (Kepala Sekolah Aktif / Panitia)"];

    ctx.fillStyle = "#0f172a";
    ctx.fillRect(startX, y, 714, 28);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 10px 'Plus Jakarta Sans', Arial, sans-serif";
    ctx.textAlign = "left";
    let cx = startX;
    headers.forEach((h, i) => {
      ctx.fillText(h, cx + 6, y + 18);
      cx += colW[i];
    });
    y += 28;

    const slice = roomEntries.slice(page * rowsPerPage, (page + 1) * rowsPerPage);
    slice.forEach((item, idx) => {
      const rowH = 30;
      ctx.fillStyle = idx % 2 === 0 ? "#f8fafc" : "#ffffff";
      ctx.fillRect(startX, y, 714, rowH);
      ctx.strokeStyle = "#cbd5e1";
      ctx.lineWidth = 0.8;
      ctx.strokeRect(startX, y, 714, rowH);

      const cells = [
        String(item.no),
        `Kamar ${item.nomor}`,
        item.kategori,
        item.kapasitas,
        String(item.penghuni).slice(0, 78)
      ];

      let curX = startX;
      cells.forEach((txt, cIdx) => {
        ctx.fillStyle = cIdx === 2 && txt.includes("PANITIA") ? "#312e81" : "#0f172a";
        ctx.font = (cIdx === 1 || cIdx === 2) ? "bold 9.5px 'Plus Jakarta Sans', Arial, sans-serif" : "9.5px 'Plus Jakarta Sans', Arial, sans-serif";
        ctx.fillText(txt, curX + 6, y + 19);
        curX += colW[cIdx];
      });
      y += rowH;
    });

    if (page === totalPages - 1) {
      const signY = Math.min(y + 35, 985);
      ctx.fillStyle = "#0f172a";
      ctx.font = "bold 11px 'Plus Jakarta Sans', Arial, sans-serif";
      ctx.fillText("Mengetahui,", 70, signY);
      ctx.fillText("Ketua Panitia Pelaksana,", 70, signY + 16);
      ctx.fillText("Surahman Husain, S.Pd.", 70, signY + 75);
      ctx.fillText("Kupang, 26 November 2026", 500, signY);
      ctx.fillText("Sekretaris Panitia,", 500, signY + 16);
      ctx.fillText("Emanuel Nata Huler, S.Pd., Gr.", 500, signY + 16 + 59);
    }
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, 794, 1123);
  }
  pdf.save("Dokumen_Rekapan_Kamar_Hotel_Rakor_K3S_2026.pdf");
  toast("PDF Resmi Rekapan Kamar Hotel berhasil diunduh!");
}
