// js/spj_bosp.js
// Mencakup:
// 1. Perbaikan Mutlak Session Closure Bug saat berganti akun (Logout Peserta -> Login Panitia atau sebaliknya)
// 2. Koreksi Label "Laporan / LPJ"
// 3. Upload & Download Absensi Manual SPJ BOSP Per Sub Rayon
// 4. Pusat Dokumen Laporan/LPJ (Peserta hanya melihat dokumen hak dirinya/Sub Rayon-nya; Panitia sesuai 3 tingkat akses)
// 5. Perhitungan Kehadiran, Rakor Kit, Transpor & Daftar Hadir Kolektif murni dari Sekolah yang Berstatus "Ikut"
import { sb, toast } from './supabase.js';

const SUBRAYON_LIST = ["Maulafa", "Alak", "Kota Raja", "Oebobo", "Kelapa Lima", "Kota Lama"];

export const LPJ_DOC_CATEGORIES = [
  { code: 'absensi_manual', label: '1. Scan Dok Absensi Manual (Per Sub Rayon)', perRayon: true, allowForPeserta: true, defaultAccess: 'PESERTA', icon: 'fa-file-signature' },
  { code: 'transport_peserta', label: '2. Scan Dok Transport Peserta Manual (Per Sub Rayon)', perRayon: true, allowForPeserta: true, defaultAccess: 'PESERTA', icon: 'fa-money-bill-transfer' },
  { code: 'kit_peserta', label: '3. Scan Dok Bukti Terima Rakor Kit Manual (Per Sub Rayon)', perRayon: true, allowForPeserta: true, defaultAccess: 'PESERTA', icon: 'fa-briefcase' },
  { code: 'lpj_utama', label: '4. Dokumen Utama Laporan / LPJ Rakor 2026', perRayon: false, allowForPeserta: true, defaultAccess: 'PESERTA', icon: 'fa-book-bookmark' },
  { code: 'transport_panitia', label: '5. Scan Dok Pembayaran Transport Panitia', perRayon: false, allowForPeserta: false, defaultAccess: 'PANITIA', icon: 'fa-van-shuttle' },
  { code: 'lembur_panitia', label: '6. Scan Dok Lembur Panitia', perRayon: false, allowForPeserta: false, defaultAccess: 'PANITIA', icon: 'fa-user-clock' },
  { code: 'pajak', label: '7. Scan Dok Pembayaran Pajak', perRayon: false, allowForPeserta: false, defaultAccess: 'PANITIA_INTI', icon: 'fa-building-columns' },
  { code: 'bayar_pemateri', label: '8. Scan Dok Bukti Pembayaran Pemateri', perRayon: false, allowForPeserta: false, defaultAccess: 'PANITIA_INTI', icon: 'fa-chalkboard-user' },
  { code: 'bayar_moderator', label: '9. Scan Dok Bukti Pembayaran Moderator', perRayon: false, allowForPeserta: false, defaultAccess: 'PANITIA_INTI', icon: 'fa-microphone-lines' },
  { code: 'bayar_lainnya', label: '10. Scan Dok Bukti Pembayaran Lainnya', perRayon: false, allowForPeserta: false, defaultAccess: 'PANITIA_INTI', icon: 'fa-file-invoice-dollar' },
  { code: 'kwitansi_atk', label: '11. Scan Dok Kwitansi Pembelanjaan ATK', perRayon: false, allowForPeserta: false, defaultAccess: 'PANITIA_INTI', icon: 'fa-pen-ruler' },
  { code: 'kwitansi_konsumsi', label: '12. Scan Dok Kwitansi Konsumsi', perRayon: false, allowForPeserta: false, defaultAccess: 'PANITIA_INTI', icon: 'fa-utensils' }
];

let spjLockState = {
  spj_absen: false,
  spj_kwitansi: false
};

let currentActiveUserRef = null;
let currentSekolahListRef = [];
let currentPanitiaListRef = [];
let lastSessionSignature = "";

let allLayananRecords = [];
let logoK3sImageObj = null;
let selectedRekapDay = "H1";
let selectedRekapRayon = "ALL";
let selectedRekapStatus = "BELUM";
let selectedUploadRayon = "Maulafa";
let selectedLpjFilterAccess = "ALL";
let mejaPosObserver = null;

function srSlug(sr = "") {
  return String(sr).toLowerCase().trim().replace(/\s+/g, "_");
}

function isUserSekretaris(activeUser) {
  return Boolean(
    activeUser &&
    activeUser.role === 'panitia' &&
    activeUser.profile?.divisi === 'Sekretaris'
  );
}

export function canManageSecretariatDocs(activeUser) {
  return Boolean(
    activeUser &&
    activeUser.role === 'panitia' &&
    ['Sekretaris', 'Seksi Kesekretariatan'].includes(activeUser.profile?.divisi)
  );
}

function isUserBendahara(activeUser) {
  return Boolean(
    activeUser &&
    activeUser.role === 'panitia' &&
    activeUser.profile?.divisi === 'Bendahara'
  );
}

function isUserPanitiaInti(activeUser) {
  return Boolean(
    activeUser &&
    activeUser.role === 'panitia' &&
    ['Penanggung Jawab', 'Ketua Panitia', 'Sekretaris', 'Bendahara'].includes(activeUser.profile?.divisi)
  );
}

function canUserViewLpjDoc(activeUser, catObj, accessLevel = "PESERTA", targetSubrayon = null) {
  if (!activeUser) return false;

  if (activeUser.role === "peserta") {
    if (!catObj || !catObj.allowForPeserta) return false;
    const level = String(accessLevel || "PESERTA").toUpperCase();
    if (level !== "PESERTA") return false;

    if (catObj.perRayon || targetSubrayon) {
      const myRayon = String(activeUser.profile?.subrayon || "").trim().toLowerCase();
      const docRayon = String(targetSubrayon || "").trim().toLowerCase();
      return Boolean(myRayon && myRayon === docRayon);
    }
    return true;
  }

  if (canManageSecretariatDocs(activeUser) || isUserPanitiaInti(activeUser)) return true;

  const level = String(accessLevel || "PESERTA").toUpperCase();
  if (level === "PANITIA_INTI") {
    return isUserPanitiaInti(activeUser);
  }
  return true;
}

function getAccessBadgeLabel(level = "PESERTA", subrayon = null) {
  const u = String(level).toUpperCase();
  if (u === "PANITIA_INTI") {
    return { text: "Khusus Panitia Inti (PJ, Ketua, Sek, Ben)", cls: "bg-rose-100 text-rose-800 border-rose-300" };
  }
  if (u === "PANITIA") {
    return { text: "Internal Panitia", cls: "bg-indigo-100 text-indigo-800 border-indigo-300" };
  }
  if (subrayon) {
    return { text: `Hak Peserta Sub Rayon ${subrayon}`, cls: "bg-emerald-100 text-emerald-800 border-emerald-300" };
  }
  return { text: "Dokumen Hak Peserta & Panitia", cls: "bg-emerald-100 text-emerald-800 border-emerald-300" };
}

async function fetchSpjLockAndManualDocState() {
  try {
    const [posRes, layRes] = await Promise.all([
      sb.from("pengaturan_pos").select("*").in("id_pos", ["spj_absen", "spj_kwitansi"]),
      sb.from("info_layanan").select("*")
    ]);

    if (posRes.data) {
      posRes.data.forEach(r => {
        spjLockState[r.id_pos] = Boolean(r.status_buka);
      });
    }
    if (layRes.data) {
      allLayananRecords = layRes.data;
    }
  } catch (e) {}
}

function getManualAbsenForSubrayon(subrayon) {
  const keySpecific = `lpj_absensi_manual_${srSlug(subrayon)}`;
  const keyLegacy = `absensi_manual_${srSlug(subrayon)}`;
  return (
    allLayananRecords.find(r => r.kode_menu === keySpecific && r.url_link) ||
    allLayananRecords.find(r => r.kode_menu === keyLegacy && r.url_link) ||
    null
  );
}

function getLpjDocRecord(catCode, subrayon = null) {
  const key = subrayon ? `lpj_${catCode}_${srSlug(subrayon)}` : `lpj_${catCode}`;
  if (catCode === "absensi_manual" && subrayon) {
    return getManualAbsenForSubrayon(subrayon) || allLayananRecords.find(r => r.kode_menu === key) || null;
  }
  return allLayananRecords.find(r => r.kode_menu === key) || null;
}

async function preloadK3sLogo() {
  if (logoK3sImageObj) return logoK3sImageObj;
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      logoK3sImageObj = img;
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

export async function renderSpjBospWidgets(activeUser, sekolahList, panitiaList) {
  currentActiveUserRef = activeUser;
  currentSekolahListRef = sekolahList || [];
  currentPanitiaListRef = panitiaList || [];

  const newSig = activeUser
    ? `${activeUser.role}:${activeUser.profile?.id_sekolah || activeUser.profile?.id_panitia || ''}`
    : "GUEST";

  if (newSig !== lastSessionSignature) {
    lastSessionSignature = newSig;
    selectedLpjFilterAccess = "ALL";
    selectedRekapRayon = "ALL";
    document.getElementById("serviceModal")?.classList.add("hidden");
  }

  await fetchSpjLockAndManualDocState();
  injectPanitiaSpjControlCard(activeUser, sekolahList, panitiaList);
  injectPesertaSpjDownloadCard(activeUser, sekolahList, panitiaList);
  upgradeMejaLayananCardWithAttendanceTracker(activeUser, sekolahList);
  bindLaporanLpjCardInterceptor();
}

function bindLaporanLpjCardInterceptor() {
  const hookButtons = () => {
    const btns = document.querySelectorAll(
      '[data-service="laporan"], [data-service="lpj"], [data-service="lph"], [data-service="laporan_rakor"]'
    );
    btns.forEach(btn => {
      btn.onclick = (e) => {
        e.preventDefault();
        e.stopImmediatePropagation();
        openLaporanLpjCenterModal(currentActiveUserRef, currentSekolahListRef, currentPanitiaListRef);
      };

      if (!btn.dataset.lpjDynamicHooked) {
        btn.dataset.lpjDynamicHooked = "1";
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopImmediatePropagation();
          openLaporanLpjCenterModal(currentActiveUserRef, currentSekolahListRef, currentPanitiaListRef);
        }, true);
      }
    });
  };

  hookButtons();
  setTimeout(hookButtons, 250);
  setTimeout(hookButtons, 700);
}

// =========================================================================
// 1. PANEL KONTROL AKTIVASI SPJ & UPLOAD ABSENSI MANUAL PER SUB RAYON
// =========================================================================
function injectPanitiaSpjControlCard(activeUser, sekolahList, panitiaList) {
  const existing = document.getElementById("panitiaSpjControlWidget");
  const isSek = isUserSekretaris(activeUser);
  const isBen = isUserBendahara(activeUser);
  const canUpManual = canManageSecretariatDocs(activeUser);

  if (!isSek && !isBen && !canUpManual) {
    if (existing) existing.remove();
    return;
  }

  const targetContainer = document.getElementById("panitiaSpecialCardsBox") ||
    document.querySelector(".service-menu-btn")?.parentElement;
  if (!targetContainer) return;

  if (!existing) {
    const box = document.createElement("div");
    box.id = "panitiaSpjControlWidget";
    box.className = "w-full";
    targetContainer.appendChild(box);
  }

  const target = document.getElementById("panitiaSpjControlWidget");
  if (!target) return;

  const isOpen = isSek ? spjLockState.spj_absen : spjLockState.spj_kwitansi;
  const uploadedRayonCount = SUBRAYON_LIST.filter(sr => Boolean(getManualAbsenForSubrayon(sr)?.url_link)).length;

  let toggleSectionHtml = "";
  if (isSek || isBen) {
    const roleTitle = isSek ? "Otoritas Sekretaris: Daftar Hadir SPJ" : "Otoritas Bendahara: E-Kwitansi BOSP";
    const descText = isSek
      ? "Aktifkan agar peserta dapat mengunduh PDF Daftar Hadir Individu, Kolektif & Scan Absensi Manual sesuai Sub Rayon-nya."
      : "Aktifkan agar sekolah yang sudah LUNAS dapat mengunduh PDF E-Kwitansi Kontribusi Rp 2.000.000.";

    toggleSectionHtml = `
      <div class="flex items-center justify-between gap-3">
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-1.5 flex-wrap">
            <span class="text-[9px] font-extrabold uppercase px-2 py-0.5 rounded bg-amber-400 text-slate-950">
              ${roleTitle}
            </span>
            <span class="text-[9px] font-extrabold px-2 py-0.5 rounded ${isOpen ? 'bg-emerald-500 text-slate-950' : 'bg-rose-600 text-white'}">
              ${isOpen ? 'TERBUKA DI PESERTA' : 'TERKUNCI'}
            </span>
          </div>
          <p class="text-[10px] text-slate-300 mt-1 leading-snug">${descText}</p>
        </div>
        <button type="button" id="btnToggleSpjAccessNow" class="px-3.5 py-2.5 rounded-xl font-extrabold text-[11px] shrink-0 shadow transition ${
          isOpen ? 'bg-rose-600 hover:bg-rose-700 text-white' : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
        }">
          <i class="fa-solid ${isOpen ? 'fa-lock' : 'fa-lock-open'} mr-1"></i>
          <span>${isOpen ? 'Kunci Akses' : 'Buka Akses'}</span>
        </button>
      </div>
    `;
  }

  let uploadManualHtml = "";
  if (canUpManual) {
    uploadManualHtml = `
      <div class="${toggleSectionHtml ? 'pt-2.5 mt-2.5 border-t border-white/15' : ''} flex items-center justify-between gap-2">
        <div class="min-w-0">
          <div class="text-[10px] font-extrabold text-amber-300 flex items-center gap-1.5">
            <i class="fa-solid fa-file-signature"></i>
            <span>Upload Absensi Manual Per Sub Rayon</span>
          </div>
          <div class="text-[9px] text-slate-300 truncate">
            Terunggah: <b class="text-emerald-400">${uploadedRayonCount} dari 6 Sub Rayon</b>
          </div>
        </div>
        <div class="flex items-center gap-1.5 shrink-0">
          <button type="button" id="btnOpenUploadManualAbsenModal" class="px-2.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-[10px] flex items-center gap-1 shadow">
            <i class="fa-solid fa-cloud-arrow-up"></i>
            <span>Absen Rayon</span>
          </button>
          <button type="button" id="btnOpenLpjManagerFromSpj" class="px-2.5 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold text-[10px] flex items-center gap-1 shadow">
            <i class="fa-solid fa-folder-open"></i>
            <span>11 Dok LPJ</span>
          </button>
        </div>
      </div>
    `;
  }

  target.innerHTML = `
    <div class="p-3.5 rounded-2xl ${isOpen ? 'bg-emerald-950 border-emerald-400/40' : 'bg-slate-900 border-amber-400/40'} text-white border shadow-md">
      ${toggleSectionHtml}
      ${uploadManualHtml}
    </div>
  `;

  document.getElementById("btnToggleSpjAccessNow")?.addEventListener("click", async () => {
    const key = isSek ? "spj_absen" : "spj_kwitansi";
    const nextVal = !spjLockState[key];
    spjLockState[key] = nextVal;

    await sb.from("pengaturan_pos").upsert([{
      id_pos: key,
      nama_pos: isSek ? "Otoritas Sekretaris: Daftar Hadir SPJ" : "Otoritas Bendahara: E-Kwitansi BOSP",
      status_buka: nextVal,
      diupdate_oleh: activeUser.profile?.nama_panitia || "Panitia",
      waktu_update: new Date().toLocaleString("id-ID")
    }]);

    toast(nextVal ? "Dokumen SPJ resmi DIBUKA untuk peserta!" : "Dokumen SPJ DIKUNCI kembali.");
    renderSpjBospWidgets(currentActiveUserRef, currentSekolahListRef, currentPanitiaListRef);
  });

  document.getElementById("btnOpenUploadManualAbsenModal")?.addEventListener("click", () => {
    openUploadManualAbsenModal(currentActiveUserRef, currentSekolahListRef, currentPanitiaListRef);
  });

  document.getElementById("btnOpenLpjManagerFromSpj")?.addEventListener("click", () => {
    openLaporanLpjCenterModal(currentActiveUserRef, currentSekolahListRef, currentPanitiaListRef);
  });
}

// =========================================================================
// MODAL UPLOAD ABSENSI MANUAL PER SUB RAYON (KHUSUS SEKRETARIS & KESEKRETARIATAN)
// =========================================================================
export function openUploadManualAbsenModal(activeUser, sekolahList, panitiaList) {
  const user = activeUser || currentActiveUserRef;
  if (!canManageSecretariatDocs(user)) {
    return toast("Akses Ditolak: Hanya Sekretaris & Seksi Kesekretariatan yang dapat mengunggah Absensi Manual!");
  }

  const modal = document.getElementById("serviceModal");
  const titleEl = document.getElementById("serviceModalTitle");
  const bodyEl = document.getElementById("serviceModalBody");
  if (!modal || !titleEl || !bodyEl) return;

  modal.classList.remove("hidden");
  titleEl.innerHTML = `<i class="fa-solid fa-file-signature text-blue-700 mr-1.5"></i> Upload Absensi Manual Per Sub Rayon`;

  renderUploadManualPerRayonBody(user, sekolahList || currentSekolahListRef, panitiaList || currentPanitiaListRef, bodyEl);
}

function renderUploadManualPerRayonBody(activeUser, sekolahList, panitiaList, bodyEl) {
  const currentRec = getManualAbsenForSubrayon(selectedUploadRayon);
  const hasFile = Boolean(currentRec && currentRec.url_link);

  bodyEl.innerHTML = `
    <div class="p-4 rounded-2xl bg-blue-50 border border-blue-200 space-y-2">
      <div class="flex items-center justify-between">
        <span class="text-[10px] font-extrabold uppercase bg-blue-900 text-amber-300 px-2.5 py-0.5 rounded-full">
          Otoritas Sekretaris & Kesekretariatan
        </span>
        <span class="text-[10px] font-extrabold text-blue-900">
          Distribusi Per Sub Rayon
        </span>
      </div>
      <p class="text-[11px] text-slate-700 leading-relaxed">
        Unggah file <b>Scan Daftar Hadir Manual (TTD Basah)</b> untuk masing-masing Sub Rayon. Setiap Kepala Sekolah <b>hanya dapat melihat dan mengunduh file Absensi Manual milik Sub Rayon-nya sendiri</b>.
      </p>
    </div>

    <div class="space-y-1.5">
      <div class="text-[10px] font-extrabold uppercase text-slate-600">
        Pilih Sub Rayon Tujuan Upload:
      </div>
      <div class="grid grid-cols-3 gap-1.5">
        ${SUBRAYON_LIST.map(sr => {
          const rec = getManualAbsenForSubrayon(sr);
          const uploaded = Boolean(rec && rec.url_link);
          const isSel = selectedUploadRayon === sr;
          return `
            <button type="button" data-sr="${sr}" class="sr-manual-up-pill p-2.5 rounded-xl border text-left transition ${
              isSel ? 'bg-blue-900 text-white border-blue-900 shadow ring-2 ring-blue-400/40' : 'bg-white text-slate-800 border-slate-200 hover:bg-slate-50'
            }">
              <div class="text-[11px] font-extrabold truncate">${sr}</div>
              <div class="text-[9px] font-bold mt-0.5 ${
                isSel ? (uploaded ? 'text-emerald-300' : 'text-amber-300') : (uploaded ? 'text-emerald-700' : 'text-rose-600')
              }">
                ${uploaded ? '✓ Sudah Upload' : '⏳ Belum Ada'}
              </div>
            </button>
          `;
        }).join('')}
      </div>
    </div>

    <div class="p-4 rounded-2xl bg-slate-50 border-2 border-blue-200 space-y-3">
      <div class="flex items-center justify-between border-b border-slate-200 pb-2">
        <div>
          <span class="text-[10px] font-bold uppercase text-blue-800">Sub Rayon Terpilih:</span>
          <h4 class="text-xs font-extrabold text-slate-900">Sub Rayon ${selectedUploadRayon}</h4>
        </div>
        <span class="text-[9px] font-extrabold px-2.5 py-1 rounded-full ${hasFile ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">
          ${hasFile ? '✓ File Aktif' : 'Belum Diunggah'}
        </span>
      </div>

      ${hasFile ? `
        <div class="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between gap-2">
          <div class="text-[10px] text-emerald-900 font-bold truncate">
            <i class="fa-solid fa-file-circle-check text-emerald-600 mr-1"></i>
            ${currentRec.deskripsi || `Scan Absensi Manual Sub Rayon ${selectedUploadRayon}`}
          </div>
          <a href="${currentRec.url_link}" target="_blank" rel="noopener noreferrer" class="px-2.5 py-1 rounded-lg bg-emerald-700 text-white font-extrabold text-[10px] shrink-0">
            Lihat File
          </a>
        </div>
      ` : ''}

      <div>
        <label class="block text-[10px] font-bold text-slate-700 mb-1">1. Pilih File Scan Absensi Manual Sub Rayon ${selectedUploadRayon} (.PDF / Foto):</label>
        <input id="inpManualAbsenFile" type="file" accept=".pdf,image/*,.zip" class="w-full rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:bg-blue-900 file:text-white file:text-[11px] file:font-bold" />
      </div>

      <div>
        <label class="block text-[10px] font-bold text-slate-700 mb-1">Atau Tempel Link Google Drive Sub Rayon ${selectedUploadRayon} (Opsional):</label>
        <input id="inpManualAbsenUrl" type="url" value="${currentRec?.url_link || ''}" placeholder="https://drive.google.com/..." class="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold" />
      </div>

      <div>
        <label class="block text-[10px] font-bold text-slate-700 mb-1">Catatan / Keterangan Dokumen:</label>
        <input id="inpManualAbsenDesc" type="text" value="${currentRec?.deskripsi || `Scan Daftar Hadir Manual Sub Rayon ${selectedUploadRayon} (26–28 Nov 2026)`}" class="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold" />
      </div>

      <div class="flex gap-2 pt-1">
        <button type="button" id="btnSaveManualAbsenNow" class="flex-1 py-3 rounded-xl bg-blue-900 hover:bg-blue-800 text-white font-extrabold text-xs shadow flex items-center justify-center gap-2">
          <i class="fa-solid fa-cloud-arrow-up"></i>
          <span>Simpan Absensi Sub Rayon ${selectedUploadRayon}</span>
        </button>
        ${hasFile ? `
          <button type="button" id="btnRemoveManualAbsenFile" class="px-3.5 py-3 rounded-xl bg-rose-100 hover:bg-rose-200 text-rose-700 font-extrabold text-xs">
            Hapus
          </button>
        ` : ''}
      </div>
    </div>
  `;

  bodyEl.querySelectorAll(".sr-manual-up-pill").forEach(btn => {
    btn.addEventListener("click", () => {
      selectedUploadRayon = btn.dataset.sr;
      renderUploadManualPerRayonBody(activeUser, sekolahList, panitiaList, bodyEl);
    });
  });

  document.getElementById("btnSaveManualAbsenNow")?.addEventListener("click", async () => {
    const file = document.getElementById("inpManualAbsenFile")?.files?.[0];
    let finalUrl = document.getElementById("inpManualAbsenUrl")?.value.trim() || "";
    const deskripsi = document.getElementById("inpManualAbsenDesc")?.value.trim() || "";

    const btn = document.getElementById("btnSaveManualAbsenNow");
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner animate-spin"></i> Mengunggah...`;

    if (file) {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'pdf';
      const fileName = `absensi_manual_${srSlug(selectedUploadRayon)}_${Date.now()}.${ext}`;

      const { error: upErr } = await sb.storage
        .from("dokumen_rakor")
        .upload(fileName, file, { cacheControl: "3600", upsert: true });

      if (upErr) {
        btn.disabled = false;
        btn.innerHTML = `<i class="fa-solid fa-cloud-arrow-up"></i> Simpan Absensi Sub Rayon ${selectedUploadRayon}`;
        return toast("Gagal mengunggah file ke server.");
      }

      const { data: pubData } = sb.storage.from("dokumen_rakor").getPublicUrl(fileName);
      finalUrl = pubData?.publicUrl || "";
    }

    if (!finalUrl) {
      btn.disabled = false;
      btn.innerHTML = `<i class="fa-solid fa-cloud-arrow-up"></i> Simpan Absensi Sub Rayon ${selectedUploadRayon}`;
      return toast("Pilih file dokumen atau masukkan link terlebih dahulu!");
    }

    const kodeMenu = `lpj_absensi_manual_${srSlug(selectedUploadRayon)}`;
    const payload = {
      kode_menu: kodeMenu,
      judul: `Scan Dok Absensi Manual — Sub Rayon ${selectedUploadRayon}`,
      deskripsi,
      url_link: finalUrl,
      status_tersedia: 'PESERTA'
    };

    await sb.from("info_layanan").upsert([payload]);
    await fetchSpjLockAndManualDocState();
    toast(`Absensi Manual Sub Rayon ${selectedUploadRayon} berhasil dipublikasikan!`);
    renderUploadManualPerRayonBody(activeUser, sekolahList, panitiaList, bodyEl);
    injectPanitiaSpjControlCard(activeUser, sekolahList, panitiaList);
  });

  document.getElementById("btnRemoveManualAbsenFile")?.addEventListener("click", async () => {
    if (!confirm(`Hapus file Absensi Manual Sub Rayon ${selectedUploadRayon}?`)) return;
    const kodeMenu = `lpj_absensi_manual_${srSlug(selectedUploadRayon)}`;
    await sb.from("info_layanan").upsert([{
      kode_menu: kodeMenu,
      judul: `Scan Dok Absensi Manual — Sub Rayon ${selectedUploadRayon}`,
      deskripsi: "",
      url_link: "",
      status_tersedia: "PESERTA"
    }]);
    await fetchSpjLockAndManualDocState();
    toast(`File Absensi Manual Sub Rayon ${selectedUploadRayon} dihapus.`);
    renderUploadManualPerRayonBody(activeUser, sekolahList, panitiaList, bodyEl);
    injectPanitiaSpjControlCard(activeUser, sekolahList, panitiaList);
  });
}

// =========================================================================
// 2. KARTU UNDUH PAKET DOKUMEN SPJ BOSP DI TAB ABSENSI PESERTA
// =========================================================================
function injectPesertaSpjDownloadCard(activeUser, sekolahList, panitiaList) {
  if (!activeUser || activeUser.role !== 'peserta') return;
  const absensiContainer = document.getElementById("absensiDaysContainer");
  if (!absensiContainer) return;

  let spjBox = document.getElementById("pesertaSpjBospCard");
  if (!spjBox) {
    spjBox = document.createElement("div");
    spjBox.id = "pesertaSpjBospCard";
    absensiContainer.appendChild(spjBox);
  }

  const s = sekolahList.find(x => x.id_sekolah === activeUser.profile.id_sekolah) || activeUser.profile;
  const isLunas = s.status_bayar === "Lunas";
  const canDownloadAbsen = Boolean(spjLockState.spj_absen);
  const canDownloadKwitansi = Boolean(spjLockState.spj_kwitansi && isLunas);

  const myRayonManualRec = getManualAbsenForSubrayon(s.subrayon);
  const hasMyRayonManualUrl = Boolean(myRayonManualRec && myRayonManualRec.url_link && myRayonManualRec.url_link.trim() !== "");

  spjBox.className = "p-4 rounded-2xl bg-gradient-to-br from-blue-50 via-indigo-50/60 to-white border-2 border-blue-200 space-y-3 shadow-2xs mt-3";
  spjBox.innerHTML = `
    <div class="flex items-start justify-between gap-2 border-b border-blue-200/70 pb-2.5">
      <div>
        <span class="text-[9px] font-extrabold uppercase tracking-wider bg-blue-900 text-amber-300 px-2 py-0.5 rounded-md">
          Dokumen Pertanggungjawaban BOSP • Sub Rayon ${s.subrayon}
        </span>
        <h4 class="font-extrabold text-xs text-slate-900 mt-1">Unduh Bukti Kehadiran & E-Kwitansi Resmi (PDF)</h4>
        <p class="text-[10px] text-slate-500">Dilengkapi Kop Resmi Panitia K3S Kota Kupang & QR Validasi</p>
      </div>
      <i class="fa-solid fa-file-shield text-blue-800 text-lg"></i>
    </div>

    <div class="p-3 rounded-xl bg-white border border-slate-200 space-y-2">
      <div class="flex items-center justify-between">
        <span class="text-[11px] font-extrabold text-slate-800">
          <i class="fa-solid fa-users-rectangle text-blue-700 mr-1"></i> 1. Daftar Hadir Resmi (26–28 Nov 2026)
        </span>
        <span class="text-[9px] font-extrabold px-2 py-0.5 rounded ${canDownloadAbsen ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">
          ${canDownloadAbsen ? 'Siap Diunduh' : 'Menunggu Sekretaris'}
        </span>
      </div>

      ${canDownloadAbsen ? `
        <div class="grid grid-cols-2 gap-2 pt-1">
          <button type="button" id="btnDownloadSpjIndividu" class="py-2.5 px-2 rounded-xl bg-blue-900 hover:bg-blue-800 text-white font-extrabold text-[10px] shadow flex items-center justify-center gap-1.5">
            <i class="fa-solid fa-file-pdf text-amber-300"></i>
            <span>Daftar Hadir Individu</span>
          </button>
          <button type="button" id="btnDownloadSpjKolektif" class="py-2.5 px-2 rounded-xl bg-indigo-700 hover:bg-indigo-800 text-white font-extrabold text-[10px] shadow flex items-center justify-center gap-1.5">
            <i class="fa-solid fa-table-list text-amber-300"></i>
            <span>Kolektif Rayon ${s.subrayon}</span>
          </button>
        </div>

        <button type="button" id="btnDownloadAbsensiManual" class="w-full py-2.5 px-3 rounded-xl ${
          hasMyRayonManualUrl
            ? 'bg-amber-400 hover:bg-amber-300 text-slate-950'
            : 'bg-slate-100 text-slate-500 border border-slate-200'
        } font-extrabold text-[11px] shadow-2xs flex items-center justify-center gap-2 transition mt-1.5">
          <i class="fa-solid fa-file-signature ${hasMyRayonManualUrl ? 'text-blue-950' : 'text-slate-400'}"></i>
          <span>${
            hasMyRayonManualUrl
              ? `Download Absensi Manual Sub Rayon ${s.subrayon}`
              : `Absensi Manual Sub Rayon ${s.subrayon} (Menunggu Upload)`
          }</span>
        </button>
      ` : `
        <p class="text-[10px] text-slate-500 bg-slate-50 p-2 rounded-lg border border-slate-200/80 text-center font-semibold">
          <i class="fa-solid fa-lock mr-1 text-amber-600"></i> Unduhan Daftar Hadir Individu, Kolektif & Absensi Manual Sub Rayon <b>${s.subrayon}</b> akan terbuka setelah diaktifkan oleh <b>Sekretaris Panitia</b>.
        </p>
      `}
    </div>

    <div class="p-3 rounded-xl bg-white border border-slate-200 space-y-2">
      <div class="flex items-center justify-between">
        <span class="text-[11px] font-extrabold text-slate-800">
          <i class="fa-solid fa-receipt text-emerald-600 mr-1"></i> 2. E-Kwitansi Kontribusi (Rp 2.000.000)
        </span>
        <span class="text-[9px] font-extrabold px-2 py-0.5 rounded ${canDownloadKwitansi ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">
          ${canDownloadKwitansi ? 'Siap Diunduh' : (!spjLockState.spj_kwitansi ? 'Menunggu Bendahara' : 'Status: ' + (s.status_bayar || 'Belum Bayar'))}
        </span>
      </div>

      ${canDownloadKwitansi ? `
        <button type="button" id="btnDownloadSpjKwitansi" class="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow flex items-center justify-center gap-2">
          <i class="fa-solid fa-file-invoice-dollar text-amber-200"></i>
          <span>Unduh E-Kwitansi Resmi BOSP (PDF)</span>
        </button>
      ` : `
        <p class="text-[10px] text-slate-500 bg-slate-50 p-2 rounded-lg border border-slate-200/80 text-center font-semibold">
          <i class="fa-solid fa-lock mr-1 text-amber-600"></i>
          ${!spjLockState.spj_kwitansi
            ? 'Unduhan E-Kwitansi akan terbuka setelah diaktifkan oleh <b>Bendahara Panitia</b>.'
            : 'E-Kwitansi otomatis terbuka setelah status kontribusi sekolah Anda tercatat <b>LUNAS</b>.'}
        </p>
      `}
    </div>
  `;

  document.getElementById("btnDownloadSpjIndividu")?.addEventListener("click", () => {
    generatePdfDaftarHadirIndividu(s);
  });

  document.getElementById("btnDownloadSpjKolektif")?.addEventListener("click", () => {
    const srSchools = sekolahList.filter(x => x.subrayon === s.subrayon && x.status_ikut === "Ikut");
    const ketua = panitiaList.find(p => p.tugas_subrayon === s.subrayon);
    generatePdfDaftarHadirKolektif(s.subrayon, srSchools, ketua);
  });

  document.getElementById("btnDownloadAbsensiManual")?.addEventListener("click", () => {
    if (!hasMyRayonManualUrl) {
      return toast(`File Scan Absensi Manual khusus Sub Rayon ${s.subrayon} belum diunggah oleh Sekretaris.`);
    }
    window.open(myRayonManualRec.url_link, "_blank", "noopener,noreferrer");
  });

  document.getElementById("btnDownloadSpjKwitansi")?.addEventListener("click", () => {
    generatePdfEKwitansiBosp(s);
  });
}

// =========================================================================
// 3. PUSAT DOKUMEN LAPORAN / LPJ & BUKTI FISIK
// =========================================================================
export async function openLaporanLpjCenterModal(activeUser, sekolahList, panitiaList) {
  const user = currentActiveUserRef || activeUser;
  const sList = (currentSekolahListRef && currentSekolahListRef.length > 0) ? currentSekolahListRef : (sekolahList || []);
  const pList = (currentPanitiaListRef && currentPanitiaListRef.length > 0) ? currentPanitiaListRef : (panitiaList || []);

  const modal = document.getElementById("serviceModal");
  const titleEl = document.getElementById("serviceModalTitle");
  const bodyEl = document.getElementById("serviceModalBody");
  if (!modal || !titleEl || !bodyEl || !user) return;

  modal.classList.remove("hidden");
  const isPeserta = user.role === "peserta";
  titleEl.innerHTML = isPeserta
    ? `<i class="fa-solid fa-file-shield text-rose-700 mr-1.5"></i> Laporan / LPJ & Bukti Hak Peserta`
    : `<i class="fa-solid fa-file-contract text-rose-700 mr-1.5"></i> Laporan / LPJ & Bukti Fisik Rakor`;

  bodyEl.innerHTML = `
    <div class="p-6 text-center text-xs font-bold text-slate-500">
      <i class="fa-solid fa-spinner animate-spin mr-1.5 text-rose-600"></i> Memuat dokumen Laporan / LPJ sesuai otorisasi akun Anda...
    </div>
  `;

  await fetchSpjLockAndManualDocState();
  renderLaporanLpjCenterBody(user, sList, pList, bodyEl);
}

function renderLaporanLpjCenterBody(activeUser, sekolahList, panitiaList, bodyEl) {
  const isSecretariat = canManageSecretariatDocs(activeUser);
  const isPeserta = activeUser?.role === "peserta";
  const mySchool = isPeserta
    ? (sekolahList.find(x => x.id_sekolah === activeUser.profile?.id_sekolah) || activeUser.profile || {})
    : null;
  const userRayon = isPeserta ? (mySchool?.subrayon || "") : null;

  const visibleDocItems = [];

  LPJ_DOC_CATEGORIES.forEach(cat => {
    if (isPeserta && !cat.allowForPeserta) return;

    if (cat.perRayon) {
      const rayonsToCheck = isPeserta ? (userRayon ? [userRayon] : []) : SUBRAYON_LIST;

      rayonsToCheck.forEach(sr => {
        const rec = getLpjDocRecord(cat.code, sr);
        const accessLevel = rec?.status_tersedia || cat.defaultAccess;
        const hasUrl = Boolean(rec && rec.url_link && rec.url_link.trim() !== "");

        if (isSecretariat || canUserViewLpjDoc(activeUser, cat, accessLevel, sr)) {
          visibleDocItems.push({
            cat,
            subrayon: sr,
            kode_menu: `lpj_${cat.code}_${srSlug(sr)}`,
            title: `${cat.label.replace(/^\d+\.\s*/, '').replace(' (Per Sub Rayon)', '')} — Sub Rayon ${sr}`,
            desc: rec?.deskripsi || `Dokumen resmi bukti ${cat.label.replace(/^\d+\.\s*/, '').replace(' (Per Sub Rayon)', '')} khusus wilayah Sub Rayon ${sr}.`,
            url: rec?.url_link || "",
            hasUrl,
            accessLevel
          });
        }
      });
    } else {
      const rec = getLpjDocRecord(cat.code, null);
      const accessLevel = rec?.status_tersedia || cat.defaultAccess;
      const hasUrl = Boolean(rec && rec.url_link && rec.url_link.trim() !== "");

      if (isSecretariat || canUserViewLpjDoc(activeUser, cat, accessLevel, null)) {
        visibleDocItems.push({
          cat,
          subrayon: null,
          kode_menu: `lpj_${cat.code}`,
          title: cat.label.replace(/^\d+\.\s*/, ''),
          desc: rec?.deskripsi || `Arsip dokumen resmi ${cat.label.replace(/^\d+\.\s*/, '')} Rakor K3S 2026.`,
          url: rec?.url_link || "",
          hasUrl,
          accessLevel
        });
      }
    }
  });

  const totalUploaded = visibleDocItems.filter(d => d.hasUrl).length;

  let pesertaPersonalDocsCard = "";
  if (isPeserta && mySchool) {
    const canAbsenPdf = Boolean(spjLockState.spj_absen);
    const canKwitansiPdf = Boolean(spjLockState.spj_kwitansi && mySchool.status_bayar === "Lunas");

    pesertaPersonalDocsCard = `
      <div class="p-4 rounded-3xl bg-blue-50/90 border-2 border-blue-200 space-y-2.5 shadow-2xs">
        <div class="flex items-center justify-between border-b border-blue-200/80 pb-2">
          <div>
            <span class="text-[9px] font-extrabold uppercase bg-blue-900 text-amber-300 px-2 py-0.5 rounded">
              Dokumen Pribadi Sekolah Anda
            </span>
            <h5 class="font-extrabold text-xs text-slate-900 mt-1">${mySchool.nama_sekolah} (Sub Rayon ${userRayon})</h5>
          </div>
          <i class="fa-solid fa-user-lock text-blue-800 text-base" title="Terkunci Khusus Sekolah Anda"></i>
        </div>

        <div class="grid grid-cols-2 gap-2">
          <button type="button" id="lpjBtnMyIndividuPdf" class="p-2.5 rounded-xl border text-left transition ${
            canAbsenPdf ? 'bg-white hover:bg-blue-50 border-blue-300 text-blue-950 shadow-2xs' : 'bg-slate-100 border-slate-200 text-slate-400'
          }">
            <div class="flex items-center justify-between">
              <i class="fa-solid fa-file-pdf ${canAbsenPdf ? 'text-rose-600' : 'text-slate-400'} text-sm"></i>
              <span class="text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded ${canAbsenPdf ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-500'}">
                ${canAbsenPdf ? 'Siap Unduh' : 'Terkunci'}
              </span>
            </div>
            <div class="text-[11px] font-extrabold mt-1.5">Daftar Hadir Individu</div>
            <div class="text-[9px] opacity-75 truncate">${mySchool.nama_kepsek || mySchool.nama_sekolah}</div>
          </button>

          <button type="button" id="lpjBtnMyKolektifPdf" class="p-2.5 rounded-xl border text-left transition ${
            canAbsenPdf ? 'bg-white hover:bg-indigo-50 border-indigo-300 text-indigo-950 shadow-2xs' : 'bg-slate-100 border-slate-200 text-slate-400'
          }">
            <div class="flex items-center justify-between">
              <i class="fa-solid fa-users-rectangle ${canAbsenPdf ? 'text-indigo-700' : 'text-slate-400'} text-sm"></i>
              <span class="text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded ${canAbsenPdf ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-500'}">
                ${canAbsenPdf ? 'Siap Unduh' : 'Terkunci'}
              </span>
            </div>
            <div class="text-[11px] font-extrabold mt-1.5">Kolektif Rayon ${userRayon}</div>
            <div class="text-[9px] opacity-75 truncate">Khusus Peserta Ikut</div>
          </button>
        </div>

        <button type="button" id="lpjBtnMyKwitansiPdf" class="w-full py-2.5 px-3 rounded-xl border font-extrabold text-[11px] flex items-center justify-between transition ${
          canKwitansiPdf ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700 shadow' : 'bg-slate-100 border-slate-200 text-slate-400'
        }">
          <span><i class="fa-solid fa-file-invoice-dollar mr-1.5"></i>E-Kwitansi BOSP ${mySchool.nama_sekolah}</span>
          <span class="text-[9px] px-2 py-0.5 rounded ${canKwitansiPdf ? 'bg-amber-300 text-slate-950' : 'bg-slate-200 text-slate-500'}">
            ${canKwitansiPdf ? 'Download PDF' : (mySchool.status_bayar || 'Menunggu Otorisasi')}
          </span>
        </button>
      </div>
    `;
  }

  bodyEl.innerHTML = `
    <div class="p-4 rounded-3xl bg-gradient-to-br from-slate-900 via-rose-950 to-slate-900 text-white space-y-2.5 shadow-lg border border-rose-500/30">
      <div class="flex items-center justify-between">
        <span class="text-[9px] font-extrabold uppercase tracking-wider bg-amber-400 text-slate-950 px-2.5 py-0.5 rounded-full">
          ${isSecretariat
            ? `Mode Pengelola Penuh (${activeUser.profile?.nama_panitia || 'Sekretaris'})`
            : isPeserta
            ? `Khusus Hak Peserta • Sub Rayon ${userRayon}`
            : `Akses Panitia: ${activeUser?.profile?.divisi || 'Panitia'}`}
        </span>
        <span class="text-[10px] font-extrabold text-emerald-300">${totalUploaded}/${visibleDocItems.length} Dokumen Tersedia</span>
      </div>

      <div>
        <h4 class="text-sm font-extrabold text-white">
          ${isPeserta
            ? `Dokumen Laporan / LPJ & Bukti Hak Peserta — Sub Rayon ${userRayon}`
            : 'Arsip Laporan / LPJ & Scan Bukti Pertanggungjawaban'}
        </h4>
        <p class="text-[10px] text-rose-200 mt-0.5 leading-relaxed">
          ${isPeserta
            ? `Menampilkan dokumen pertanggungjawaban yang terkait langsung dengan sekolah Anda dan wilayah <b>Sub Rayon ${userRayon}</b> (Dokumen peserta/sub rayon lain tidak ditampilkan).`
            : isSecretariat
            ? 'Unggah ke-12 kategori dokumen scan LPJ dan atur hak akses (Peserta / Panitia / Panitia Inti) pada setiap dokumen.'
            : 'Menampilkan daftar dokumen pertanggungjawaban LPJ yang diizinkan untuk jabatan kepanitiaan Anda.'}
        </p>
      </div>

      ${isSecretariat ? `
        <div class="pt-1 border-t border-white/10 flex items-center justify-between gap-2">
          <span class="text-[10px] font-bold text-amber-300">
            <i class="fa-solid fa-plus-circle mr-1"></i> Kelola / Upload Dokumen LPJ:
          </span>
          <button type="button" id="btnToggleLpjUploadPanel" class="px-3 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold text-[11px] shadow">
            + Upload / Atur Hak Akses Dokumen
          </button>
        </div>
      ` : ''}
    </div>

    ${pesertaPersonalDocsCard}

    <div id="secretariatLpjUploadBox" class="hidden p-4 rounded-2xl bg-blue-50 border-2 border-blue-300 space-y-3 shadow-sm">
      <div class="flex items-center justify-between border-b border-blue-200 pb-2">
        <span class="font-extrabold text-xs text-blue-950">
          <i class="fa-solid fa-cloud-arrow-up text-blue-700 mr-1"></i> Upload Scan Dokumen LPJ & Atur Hak Akses
        </span>
        <span class="text-[9px] font-extrabold uppercase bg-blue-900 text-amber-300 px-2 py-0.5 rounded">Otoritas Sekretaris</span>
      </div>

      <div>
        <label class="block text-[10px] font-bold text-slate-700 mb-1">1. Pilih Jenis Dokumen Laporan / LPJ:</label>
        <select id="lpjInpCatCode" class="w-full rounded-xl border border-blue-300 bg-white px-3 py-2 text-xs font-extrabold text-slate-900">
          ${LPJ_DOC_CATEGORIES.map(c => `<option value="${c.code}" data-perrayon="${c.perRayon ? '1' : '0'}" data-defaccess="${c.defaultAccess}">${c.label}</option>`).join('')}
        </select>
      </div>

      <div id="lpjInpRayonWrapper">
        <label class="block text-[10px] font-bold text-blue-950 mb-1">2. Pilih Wilayah Sub Rayon (Peserta Hanya Bisa Melihat Sub Rayon-nya Sendiri):</label>
        <select id="lpjInpSubrayon" class="w-full rounded-xl border-2 border-blue-400 bg-white px-3 py-2 text-xs font-extrabold text-blue-950">
          ${SUBRAYON_LIST.map(sr => `<option value="${sr}">Sub Rayon ${sr}</option>`).join('')}
        </select>
      </div>

      <div>
        <label class="block text-[10px] font-bold text-slate-700 mb-1">3. Tentukan Kategori Hak Akses (Siapa yang Bisa Melihat & Download):</label>
        <select id="lpjInpAccessLevel" class="w-full rounded-xl border border-blue-300 bg-white px-3 py-2 text-xs font-extrabold text-emerald-900">
          <option value="PESERTA">🟢 Peserta (Terkunci Hanya Sub Rayon Terkait) & Panitia</option>
          <option value="PANITIA">🔵 Hanya Panitia (Seluruh Anggota & Koordinator Panitia)</option>
          <option value="PANITIA_INTI">🔴 Khusus Panitia Inti (Penanggung Jawab, Ketua, Sekretaris, Bendahara)</option>
        </select>
      </div>

      <div>
        <label class="block text-[10px] font-bold text-slate-700 mb-1">4. Pilih File Scan Dokumen (.PDF / Foto / .ZIP):</label>
        <input id="lpjInpFile" type="file" accept=".pdf,image/*,.zip,.xlsx,.docx" class="w-full rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:bg-blue-900 file:text-white file:text-[10px] file:font-extrabold" />
      </div>

      <div>
        <label class="block text-[10px] font-bold text-slate-700 mb-1">Atau Tempel Link File / Google Drive (Opsional):</label>
        <input id="lpjInpUrl" type="url" placeholder="https://drive.google.com/..." class="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold" />
      </div>

      <div>
        <label class="block text-[10px] font-bold text-slate-700 mb-1">Keterangan / Catatan Dokumen:</label>
        <input id="lpjInpDesc" type="text" placeholder="Contoh: Scan bukti sah berstempel basah..." class="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold" />
      </div>

      <div class="flex gap-2 pt-1">
        <button type="button" id="btnSaveLpjDocNow" class="flex-1 py-2.5 rounded-xl bg-blue-900 hover:bg-blue-800 text-white font-extrabold text-xs shadow flex items-center justify-center gap-1.5">
          <i class="fa-solid fa-floppy-disk"></i>
          <span>Simpan Dokumen & Hak Akses</span>
        </button>
        <button type="button" id="btnCloseLpjUploadPanel" class="px-4 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-600 font-bold text-xs">
          Tutup
        </button>
      </div>
    </div>

    ${!isPeserta ? `
      <div class="grid grid-cols-2 gap-2">
        <select id="lpjFilterAccessSelect" class="rounded-xl border border-slate-300 bg-slate-50 px-2.5 py-2 text-xs font-extrabold text-slate-800">
          <option value="ALL" ${selectedLpjFilterAccess === 'ALL' ? 'selected' : ''}>Semua Dokumen (${visibleDocItems.length})</option>
          <option value="AVAILABLE" ${selectedLpjFilterAccess === 'AVAILABLE' ? 'selected' : ''}>✓ Sudah Diunggah (${totalUploaded})</option>
          <option value="PESERTA" ${selectedLpjFilterAccess === 'PESERTA' ? 'selected' : ''}>Hak Akses: Peserta</option>
          <option value="PANITIA" ${selectedLpjFilterAccess === 'PANITIA' ? 'selected' : ''}>Hak Akses: Panitia</option>
          ${isUserPanitiaInti(activeUser) || isSecretariat ? `<option value="PANITIA_INTI" ${selectedLpjFilterAccess === 'PANITIA_INTI' ? 'selected' : ''}>Hak Akses: Panitia Inti</option>` : ''}
        </select>
        <input id="lpjSearchInput" type="text" placeholder="Cari nama dokumen / rayon..." class="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-semibold" />
      </div>
    ` : `
      <div class="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 px-1">
        Daftar Dokumen Scan Bukti Fisik Sub Rayon ${userRayon} (${visibleDocItems.length} Dokumen):
      </div>
    `}

    <div id="lpjDocsListContainer" class="space-y-2 max-h-96 overflow-y-auto pr-0.5"></div>
  `;

  if (isPeserta && mySchool) {
    document.getElementById("lpjBtnMyIndividuPdf")?.addEventListener("click", () => {
      if (!spjLockState.spj_absen) return toast("Unduhan Daftar Hadir sedang menunggu aktivasi Sekretaris Panitia.");
      generatePdfDaftarHadirIndividu(mySchool);
    });
    document.getElementById("lpjBtnMyKolektifPdf")?.addEventListener("click", () => {
      if (!spjLockState.spj_absen) return toast("Unduhan Daftar Hadir Kolektif sedang menunggu aktivasi Sekretaris Panitia.");
      // Kedua baris srSchools kini sudah memfilter khusus x.status_ikut === "Ikut"!
      const srSchools = sekolahList.filter(x => x.subrayon === mySchool.subrayon && x.status_ikut === "Ikut");
      const ketua = (panitiaList || []).find(p => p.tugas_subrayon === mySchool.subrayon);
      generatePdfDaftarHadirKolektif(mySchool.subrayon, srSchools, ketua);
    });
    document.getElementById("lpjBtnMyKwitansiPdf")?.addEventListener("click", () => {
      if (!spjLockState.spj_kwitansi) return toast("Unduhan E-Kwitansi sedang menunggu aktivasi Bendahara Panitia.");
      if (mySchool.status_bayar !== "Lunas") return toast("E-Kwitansi hanya dapat diunduh setelah status kontribusi sekolah Anda tercatat LUNAS.");
      generatePdfEKwitansiBosp(mySchool);
    });
  }

  const catSel = document.getElementById("lpjInpCatCode");
  const rayonWrap = document.getElementById("lpjInpRayonWrapper");
  const rayonSel = document.getElementById("lpjInpSubrayon");
  const accSel = document.getElementById("lpjInpAccessLevel");
  const urlInp = document.getElementById("lpjInpUrl");
  const descInp = document.getElementById("lpjInpDesc");

  const syncFormWithExistingRecord = () => {
    if (!catSel) return;
    const code = catSel.value;
    const catObj = LPJ_DOC_CATEGORIES.find(c => c.code === code);
    if (!catObj) return;

    if (catObj.perRayon) {
      rayonWrap?.classList.remove("hidden");
    } else {
      rayonWrap?.classList.add("hidden");
    }

    const sr = catObj.perRayon ? (rayonSel?.value || "Maulafa") : null;
    const existing = getLpjDocRecord(code, sr);
    if (accSel) accSel.value = existing?.status_tersedia || catObj.defaultAccess;
    if (urlInp) urlInp.value = existing?.url_link || "";
    if (descInp) descInp.value = existing?.deskripsi || "";
  };

  catSel?.addEventListener("change", syncFormWithExistingRecord);
  rayonSel?.addEventListener("change", syncFormWithExistingRecord);
  syncFormWithExistingRecord();

  document.getElementById("btnToggleLpjUploadPanel")?.addEventListener("click", () => {
    document.getElementById("secretariatLpjUploadBox")?.classList.toggle("hidden");
  });

  document.getElementById("btnCloseLpjUploadPanel")?.addEventListener("click", () => {
    document.getElementById("secretariatLpjUploadBox")?.classList.add("hidden");
  });

  document.getElementById("btnSaveLpjDocNow")?.addEventListener("click", async () => {
    if (!isSecretariat) return;
    const code = catSel.value;
    const catObj = LPJ_DOC_CATEGORIES.find(c => c.code === code);
    const sr = catObj?.perRayon ? rayonSel.value : null;
    const accessLevel = accSel.value;
    const file = document.getElementById("lpjInpFile")?.files?.[0];
    let finalUrl = urlInp.value.trim();
    const deskripsi = descInp.value.trim() || (sr ? `${catObj.label} — Sub Rayon ${sr}` : catObj.label);

    const btn = document.getElementById("btnSaveLpjDocNow");
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner animate-spin"></i> Menyimpan...`;

    if (file) {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'pdf';
      const fileName = `lpj_${code}${sr ? '_' + srSlug(sr) : ''}_${Date.now()}.${ext}`;
      const { error: upErr } = await sb.storage
        .from("dokumen_rakor")
        .upload(fileName, file, { cacheControl: "3600", upsert: true });

      if (upErr) {
        btn.disabled = false;
        btn.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> Simpan Dokumen & Hak Akses`;
        return toast("Gagal mengunggah file dokumen.");
      }

      const { data: pub } = sb.storage.from("dokumen_rakor").getPublicUrl(fileName);
      finalUrl = pub?.publicUrl || "";
    }

    const kodeMenu = sr ? `lpj_${code}_${srSlug(sr)}` : `lpj_${code}`;
    const judul = sr
      ? `${catObj.label.replace(/^\d+\.\s*/, '').replace(' (Per Sub Rayon)', '')} — Sub Rayon ${sr}`
      : catObj.label.replace(/^\d+\.\s*/, '');

    await sb.from("info_layanan").upsert([{
      kode_menu: kodeMenu,
      judul,
      deskripsi,
      url_link: finalUrl,
      status_tersedia: accessLevel
    }]);

    await fetchSpjLockAndManualDocState();
    toast("Dokumen LPJ & pengaturan hak akses berhasil disimpan!");
    renderLaporanLpjCenterBody(activeUser, sekolahList, panitiaList, bodyEl);
    injectPanitiaSpjControlCard(activeUser, sekolahList, panitiaList);
    injectPesertaSpjDownloadCard(activeUser, sekolahList, panitiaList);
  });

  const renderDocRows = () => {
    const listBox = document.getElementById("lpjDocsListContainer");
    if (!listBox) return;

    const kw = (document.getElementById("lpjSearchInput")?.value || "").toLowerCase().trim();
    let filtered = visibleDocItems;

    if (!isPeserta) {
      if (selectedLpjFilterAccess === "AVAILABLE") {
        filtered = filtered.filter(d => d.hasUrl);
      } else if (["PESERTA", "PANITIA", "PANITIA_INTI"].includes(selectedLpjFilterAccess)) {
        filtered = filtered.filter(d => d.accessLevel === selectedLpjFilterAccess);
      }
      if (kw) {
        filtered = filtered.filter(d =>
          d.title.toLowerCase().includes(kw) ||
          d.desc.toLowerCase().includes(kw) ||
          (d.subrayon || "").toLowerCase().includes(kw)
        );
      }
    }

    if (filtered.length === 0) {
      listBox.innerHTML = `<div class="p-6 text-center text-xs text-slate-400 bg-slate-50 rounded-2xl border">Belum ada dokumen yang tersedia untuk filter ini.</div>`;
      return;
    }

    listBox.innerHTML = "";
    filtered.forEach(item => {
      const badge = getAccessBadgeLabel(item.accessLevel, item.subrayon);
      const card = document.createElement("div");
      card.className = `p-3.5 rounded-2xl bg-white border ${item.hasUrl ? 'border-emerald-300' : 'border-slate-200'} shadow-2xs space-y-2`;
      card.innerHTML = `
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="text-[9px] font-extrabold px-2 py-0.5 rounded border ${badge.cls}">
                <i class="fa-solid fa-shield-halved mr-0.5"></i>${badge.text}
              </span>
              ${item.subrayon ? `<span class="text-[9px] font-extrabold bg-blue-100 text-blue-900 px-2 py-0.5 rounded">Sub Rayon ${item.subrayon}</span>` : ''}
            </div>
            <h4 class="font-extrabold text-xs text-slate-900 mt-1.5">${item.title}</h4>
            <p class="text-[10px] text-slate-500 mt-0.5">${item.desc}</p>
          </div>
          <span class="text-[9px] font-extrabold px-2 py-1 rounded-lg shrink-0 ${item.hasUrl ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}">
            ${item.hasUrl ? '✓ Tersedia' : 'Belum Upload'}
          </span>
        </div>

        <div class="flex items-center justify-between gap-2 pt-1.5 border-t border-slate-100">
          ${item.hasUrl ? `
            <a href="${item.url}" target="_blank" rel="noopener noreferrer" download class="flex-1 py-2 px-3 rounded-xl bg-blue-900 hover:bg-blue-800 text-amber-300 font-extrabold text-[11px] flex items-center justify-center gap-1.5 shadow-2xs">
              <i class="fa-solid fa-download"></i>
              <span>Lihat / Download Dokumen</span>
            </a>
          ` : `
            <div class="flex-1 py-2 px-3 rounded-xl bg-slate-50 text-slate-400 font-bold text-[10px] text-center border border-slate-200/70">
              Menunggu unggahan dari Sekretaris Panitia
            </div>
          `}

          ${isSecretariat ? `
            <button type="button" class="btn-edit-lpj-row px-3 py-2 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-950 font-extrabold text-[10px] shrink-0 flex items-center gap-1">
              <i class="fa-solid fa-pen-to-square"></i>
              <span>${item.hasUrl ? 'Edit / Akses' : 'Upload'}</span>
            </button>
            ${item.hasUrl ? `
              <button type="button" class="btn-del-lpj-row px-2.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-extrabold text-[10px] shrink-0" title="Hapus File">
                <i class="fa-solid fa-trash"></i>
              </button>
            ` : ''}
          ` : ''}
        </div>
      `;

      if (isSecretariat) {
        card.querySelector(".btn-edit-lpj-row")?.addEventListener("click", () => {
          const panel = document.getElementById("secretariatLpjUploadBox");
          panel?.classList.remove("hidden");
          if (catSel) catSel.value = item.cat.code;
          if (item.subrayon && rayonSel) rayonSel.value = item.subrayon;
          syncFormWithExistingRecord();
          panel?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        });

        card.querySelector(".btn-del-lpj-row")?.addEventListener("click", async () => {
          if (!confirm(`Hapus file "${item.title}"?`)) return;
          await sb.from("info_layanan").upsert([{
            kode_menu: item.kode_menu,
            judul: item.title,
            deskripsi: item.desc,
            url_link: "",
            status_tersedia: item.accessLevel
          }]);
          await fetchSpjLockAndManualDocState();
          toast("File dokumen LPJ dihapus.");
          renderLaporanLpjCenterBody(activeUser, sekolahList, panitiaList, bodyEl);
        });
      }

      listBox.appendChild(card);
    });
  };

  renderDocRows();

  document.getElementById("lpjFilterAccessSelect")?.addEventListener("change", (e) => {
    selectedLpjFilterAccess = e.target.value;
    renderDocRows();
  });

  document.getElementById("lpjSearchInput")?.addEventListener("input", renderDocRows);
}

// =========================================================================
// 4. UPGRADE CARD "MEJA LAYANAN & OTORISASI POS" DI AKUN PANITIA
// =========================================================================
function findMejaLayananCardElement() {
  const candidateIds = [
    "berandaPosLayananBox",
    "posScannerHomeWidget",
    "mejaLayananCard",
    "panitiaPosControlCard",
    "posLayananContainer"
  ];
  for (const id of candidateIds) {
    const el = document.getElementById(id);
    if (el) return el;
  }

  const tabBeranda = document.getElementById("tabContentBeranda") || document.body;
  const headings = tabBeranda.querySelectorAll("h2, h3, h4, span, div");
  for (const h of headings) {
    if (h.children.length <= 2 && h.textContent) {
      const txt = h.textContent.toLowerCase();
      if (
        (txt.includes("meja layanan") && txt.includes("otorisasi")) ||
        txt.includes("meja layanan & otorisasi pos")
      ) {
        const card = h.closest(".from-slate-900, .bg-white, .rounded-3xl, .rounded-2xl");
        if (card) return card;
      }
    }
  }
  return null;
}

function upgradeMejaLayananCardWithAttendanceTracker(activeUser, sekolahList) {
  if (!activeUser || activeUser.role !== "panitia") return;

  const applyUpgradeToDom = () => {
    const box = findMejaLayananCardElement();
    if (!box) return;

    const ikutList = (sekolahList || []).filter(s => s.status_ikut === "Ikut");
    const totalIkut = ikutList.length;
    const h1Count = ikutList.filter(s => s.hadir_h1).length;
    const h2Count = ikutList.filter(s => s.hadir_h2).length;
    const h3Count = ikutList.filter(s => s.hadir_h3).length;
    const kitCount = ikutList.filter(s => s.ambil_kit).length;
    const transCount = ikutList.filter(s => s.terima_transport).length;

    const canUploadManual = canManageSecretariatDocs(activeUser);
    const uploadedRayonCount = SUBRAYON_LIST.filter(sr => Boolean(getManualAbsenForSubrayon(sr)?.url_link)).length;

    const currentSig = `${activeUser.profile?.id_panitia || ''}|${totalIkut}|${h1Count}|${h2Count}|${h3Count}|${kitCount}|${transCount}|${canUploadManual}|${uploadedRayonCount}`;
    const existingUpgraded = box.querySelector("#upgradedMejaLayananStatsGrid");
    if (existingUpgraded && existingUpgraded.dataset.sig === currentSig) {
      return;
    }

    let targetSlot = existingUpgraded;
    if (!targetSlot) {
      const allThreeGrids = box.querySelectorAll(".grid.grid-cols-3");
      for (const g of allThreeGrids) {
        const txt = (g.textContent || "").toLowerCase();
        if (txt.includes("hadir") || txt.includes("rakor kit") || txt.includes("transport") || txt.includes("transpor")) {
          targetSlot = g;
          break;
        }
      }
    }

    if (!targetSlot) {
      targetSlot = document.createElement("div");
      const firstBtnOrGrid = box.querySelector("button, .grid");
      if (firstBtnOrGrid && firstBtnOrGrid.parentElement === box) {
        box.insertBefore(targetSlot, firstBtnOrGrid);
      } else {
        box.appendChild(targetSlot);
      }
    }

    targetSlot.id = "upgradedMejaLayananStatsGrid";
    targetSlot.dataset.sig = currentSig;
    targetSlot.className = "space-y-2 my-2";
    targetSlot.innerHTML = `
      <div class="grid grid-cols-3 gap-2 text-center">
        <div data-trackday="H1" class="btn-quick-track-day bg-white/10 hover:bg-white/15 rounded-2xl p-2 border border-white/10 cursor-pointer transition">
          <div class="text-sm font-extrabold text-amber-300">${h1Count}<span class="text-[10px] font-normal text-slate-300">/${totalIkut}</span></div>
          <div class="text-[9px] font-bold text-blue-200 uppercase">Hadir H1 (26/11)</div>
          <div class="text-[8px] font-bold text-rose-300 mt-0.5">Belum: ${Math.max(0, totalIkut - h1Count)}</div>
        </div>
        <div data-trackday="H2" class="btn-quick-track-day bg-white/10 hover:bg-white/15 rounded-2xl p-2 border border-white/10 cursor-pointer transition">
          <div class="text-sm font-extrabold text-amber-300">${h2Count}<span class="text-[10px] font-normal text-slate-300">/${totalIkut}</span></div>
          <div class="text-[9px] font-bold text-blue-200 uppercase">Hadir H2 (27/11)</div>
          <div class="text-[8px] font-bold text-rose-300 mt-0.5">Belum: ${Math.max(0, totalIkut - h2Count)}</div>
        </div>
        <div data-trackday="H3" class="btn-quick-track-day bg-white/10 hover:bg-white/15 rounded-2xl p-2 border border-white/10 cursor-pointer transition">
          <div class="text-sm font-extrabold text-amber-300">${h3Count}<span class="text-[10px] font-normal text-slate-300">/${totalIkut}</span></div>
          <div class="text-[9px] font-bold text-blue-200 uppercase">Hadir H3 (28/11)</div>
          <div class="text-[8px] font-bold text-rose-300 mt-0.5">Belum: ${Math.max(0, totalIkut - h3Count)}</div>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-2 text-center">
        <div data-trackday="KIT" class="btn-quick-track-day bg-white/10 hover:bg-white/15 rounded-2xl p-2 border border-white/10 flex items-center justify-between px-3 cursor-pointer transition">
          <div class="text-left">
            <div class="text-[9px] font-bold text-emerald-200 uppercase">Rakor Kit (Ikut)</div>
            <div class="text-[8px] font-bold text-rose-300">Belum: ${Math.max(0, totalIkut - kitCount)}</div>
          </div>
          <div class="text-sm font-extrabold text-emerald-300">${kitCount}<span class="text-[10px] font-normal text-slate-300">/${totalIkut}</span></div>
        </div>
        <div data-trackday="TRANS" class="btn-quick-track-day bg-white/10 hover:bg-white/15 rounded-2xl p-2 border border-white/10 flex items-center justify-between px-3 cursor-pointer transition">
          <div class="text-left">
            <div class="text-[9px] font-bold text-sky-200 uppercase">Transpor (Ikut)</div>
            <div class="text-[8px] font-bold text-rose-300">Belum: ${Math.max(0, totalIkut - transCount)}</div>
          </div>
          <div class="text-sm font-extrabold text-sky-300">${transCount}<span class="text-[10px] font-normal text-slate-300">/${totalIkut}</span></div>
        </div>
      </div>

      <div class="pt-1 space-y-1.5">
        <button type="button" id="btnOpenAttendanceTrackerModal" class="w-full py-2.5 px-3 rounded-2xl bg-white/15 hover:bg-white/25 border border-amber-400/40 text-white font-extrabold text-xs shadow flex items-center justify-between active:scale-[0.99] transition">
          <div class="flex items-center gap-2">
            <i class="fa-solid fa-user-clock text-amber-300"></i>
            <span>Rekap Kehadiran & Lacak Peserta Ikut (${totalIkut} Sekolah)</span>
          </div>
          <span class="text-[9px] bg-amber-400 text-slate-950 px-2 py-0.5 rounded-full font-extrabold">Lacak</span>
        </button>

        ${canUploadManual ? `
          <div class="grid grid-cols-2 gap-1.5">
            <button type="button" id="btnQuickUploadManualFromMeja" class="py-2 px-2.5 rounded-xl bg-amber-400/20 hover:bg-amber-400/30 border border-amber-400/40 text-amber-200 font-extrabold text-[10px] flex items-center justify-between transition">
              <span class="truncate"><i class="fa-solid fa-file-signature text-amber-300 mr-1"></i>Absen Manual Rayon</span>
              <span class="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-amber-400 text-slate-950 shrink-0">${uploadedRayonCount}/6</span>
            </button>
            <button type="button" id="btnQuickOpenLpjFromMeja" class="py-2 px-2.5 rounded-xl bg-emerald-400/20 hover:bg-emerald-400/30 border border-emerald-400/40 text-emerald-200 font-extrabold text-[10px] flex items-center justify-between transition">
              <span class="truncate"><i class="fa-solid fa-folder-open text-emerald-300 mr-1"></i>Upload 11 Dok LPJ</span>
              <i class="fa-solid fa-chevron-right text-[9px]"></i>
            </button>
          </div>
        ` : ''}
      </div>
    `;

    targetSlot.querySelectorAll(".btn-quick-track-day").forEach(card => {
      card.addEventListener("click", () => {
        selectedRekapDay = card.dataset.trackday || "H1";
        selectedRekapStatus = "BELUM";
        openAttendanceTrackerModal(currentActiveUserRef, currentSekolahListRef);
      });
    });

    targetSlot.querySelector("#btnOpenAttendanceTrackerModal")?.addEventListener("click", () => {
      openAttendanceTrackerModal(currentActiveUserRef, currentSekolahListRef);
    });

    targetSlot.querySelector("#btnQuickUploadManualFromMeja")?.addEventListener("click", () => {
      openUploadManualAbsenModal(currentActiveUserRef, currentSekolahListRef, []);
    });

    targetSlot.querySelector("#btnQuickOpenLpjFromMeja")?.addEventListener("click", () => {
      openLaporanLpjCenterModal(currentActiveUserRef, currentSekolahListRef, []);
    });
  };

  applyUpgradeToDom();
  setTimeout(applyUpgradeToDom, 200);
  setTimeout(applyUpgradeToDom, 650);

  const tabBeranda = document.getElementById("tabContentBeranda");
  if (tabBeranda && !mejaPosObserver) {
    mejaPosObserver = new MutationObserver(() => {
      const box = findMejaLayananCardElement();
      if (box && (!box.querySelector("#upgradedMejaLayananStatsGrid") || !box.querySelector("#btnOpenAttendanceTrackerModal"))) {
        applyUpgradeToDom();
      }
    });
    mejaPosObserver.observe(tabBeranda, { childList: true, subtree: true });
  }
}

// =========================================================================
// MODAL PELACAK KEHADIRAN PESERTA (KHUSUS SEKOLAH YANG TERDATA "IKUT")
// =========================================================================
export function openAttendanceTrackerModal(activeUser, sekolahList) {
  const user = currentActiveUserRef || activeUser;
  const sList = (currentSekolahListRef && currentSekolahListRef.length > 0) ? currentSekolahListRef : (sekolahList || []);
  if (!user || user.role !== "panitia") return;

  const modal = document.getElementById("serviceModal");
  const titleEl = document.getElementById("serviceModalTitle");
  const bodyEl = document.getElementById("serviceModalBody");
  if (!modal || !titleEl || !bodyEl) return;

  modal.classList.remove("hidden");
  titleEl.innerHTML = `<i class="fa-solid fa-user-clock text-blue-700 mr-1.5"></i> Pelacak Kehadiran & Layanan Peserta (Ikut)`;

  if (user.profile?.tugas_subrayon && selectedRekapRayon === "ALL") {
    selectedRekapRayon = user.profile.tugas_subrayon;
  }

  renderAttendanceTrackerBody(user, sList, bodyEl);
}

function getFieldByTrackKey(s, key) {
  if (key === "H1") return Boolean(s.hadir_h1);
  if (key === "H2") return Boolean(s.hadir_h2);
  if (key === "H3") return Boolean(s.hadir_h3);
  if (key === "KIT") return Boolean(s.ambil_kit);
  if (key === "TRANS") return Boolean(s.terima_transport);
  return false;
}

function getLabelByTrackKey(key) {
  if (key === "H1") return "Absensi Hari Ke-1 (Kamis, 26 Nov 2026)";
  if (key === "H2") return "Absensi Hari Ke-2 (Jumat, 27 Nov 2026)";
  if (key === "H3") return "Absensi Hari Ke-3 (Sabtu, 28 Nov 2026)";
  if (key === "KIT") return "Pengambilan Rakor Kit (Peserta Ikut)";
  if (key === "TRANS") return "Penerimaan Uang Transpor (Peserta Ikut)";
  return "Absensi Peserta Aktif";
}

function renderAttendanceTrackerBody(activeUser, sekolahList, bodyEl) {
  const ikutSchools = (sekolahList || []).filter(s => s.status_ikut === "Ikut");
  const totalIkut = ikutSchools.length;
  const sudahCount = ikutSchools.filter(s => getFieldByTrackKey(s, selectedRekapDay)).length;
  const belumCount = Math.max(0, totalIkut - sudahCount);
  const pct = totalIkut > 0 ? Math.round((sudahCount / totalIkut) * 100) : 0;

  bodyEl.innerHTML = `
    <div class="grid grid-cols-5 gap-1 bg-slate-100 p-1 rounded-2xl text-center">
      ${[
        { k: "H1", lbl: "Hadir H1" },
        { k: "H2", lbl: "Hadir H2" },
        { k: "H3", lbl: "Hadir H3" },
        { k: "KIT", lbl: "Rakor Kit" },
        { k: "TRANS", lbl: "Transpor" }
      ].map(tab => `
        <button type="button" data-tk="${tab.k}" class="track-tab-btn py-2 rounded-xl text-[10px] font-extrabold transition ${
          selectedRekapDay === tab.k ? 'bg-blue-900 text-amber-300 shadow' : 'text-slate-600 hover:bg-white'
        }">${tab.lbl}</button>
      `).join('')}
    </div>

    <div class="p-4 rounded-3xl bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 text-white space-y-2.5 shadow">
      <div class="flex items-center justify-between">
        <span class="text-[9px] font-extrabold uppercase bg-amber-400 text-slate-950 px-2.5 py-0.5 rounded-full">
          ${getLabelByTrackKey(selectedRekapDay)}
        </span>
        <span class="text-xs font-extrabold text-emerald-300">${pct}% dari Peserta Ikut</span>
      </div>

      <div class="w-full bg-white/15 h-2 rounded-full overflow-hidden">
        <div class="bg-gradient-to-r from-emerald-400 to-teal-300 h-full rounded-full" style="width:${pct}%"></div>
      </div>

      <div class="grid grid-cols-3 gap-2 pt-1 text-center">
        <button type="button" data-st="BELUM" class="track-status-btn p-2 rounded-2xl border transition ${
          selectedRekapStatus === 'BELUM' ? 'bg-rose-600 border-amber-300 text-white ring-2 ring-amber-300/40' : 'bg-rose-500/20 border-rose-400/30 text-rose-200'
        }">
          <div class="text-sm font-extrabold">${belumCount}</div>
          <div class="text-[9px] font-bold uppercase">Belum (Ikut)</div>
        </button>
        <button type="button" data-st="SUDAH" class="track-status-btn p-2 rounded-2xl border transition ${
          selectedRekapStatus === 'SUDAH' ? 'bg-emerald-600 border-amber-300 text-white ring-2 ring-amber-300/40' : 'bg-emerald-500/20 border-emerald-400/30 text-emerald-200'
        }">
          <div class="text-sm font-extrabold">${sudahCount}</div>
          <div class="text-[9px] font-bold uppercase">Sudah Selesai</div>
        </button>
        <button type="button" data-st="ALL" class="track-status-btn p-2 rounded-2xl border transition ${
          selectedRekapStatus === 'ALL' ? 'bg-blue-600 border-amber-300 text-white ring-2 ring-amber-300/40' : 'bg-white/10 border-white/15 text-slate-200'
        }">
          <div class="text-sm font-extrabold">${totalIkut}</div>
          <div class="text-[9px] font-bold uppercase">Total Ikut</div>
        </button>
      </div>
    </div>

    <div class="grid grid-cols-3 gap-1.5">
      ${SUBRAYON_LIST.map(sr => {
        const srList = ikutSchools.filter(s => s.subrayon === sr);
        const srSudah = srList.filter(s => getFieldByTrackKey(s, selectedRekapDay)).length;
        const srBelum = Math.max(0, srList.length - srSudah);
        const activeSr = selectedRekapRayon === sr;
        return `
          <div data-sr="${sr}" class="track-sr-pill p-2 rounded-xl border cursor-pointer text-center transition ${
            activeSr ? 'bg-blue-50 border-blue-600 ring-2 ring-blue-500/20' : 'bg-slate-50 border-slate-200 hover:bg-white'
          }">
            <div class="text-[10px] font-extrabold text-slate-900 truncate">${sr} (${srList.length})</div>
            <div class="text-[9px] font-bold mt-0.5">
              <span class="text-emerald-700">${srSudah}✓</span> • <span class="text-rose-600 font-extrabold">${srBelum}✕</span>
            </div>
          </div>
        `;
      }).join('')}
    </div>

    <div class="grid grid-cols-2 gap-2">
      <select id="trackFilterRayonSelect" class="rounded-xl border border-slate-300 bg-slate-50 px-2.5 py-2 text-xs font-extrabold text-blue-950">
        <option value="ALL" ${selectedRekapRayon === 'ALL' ? 'selected' : ''}>Semua Sub Rayon (${totalIkut} Ikut)</option>
        ${SUBRAYON_LIST.map(sr => {
          const c = ikutSchools.filter(x => x.subrayon === sr).length;
          return `<option value="${sr}" ${selectedRekapRayon === sr ? 'selected' : ''}>Rayon ${sr} (${c} Ikut)</option>`;
        }).join('')}
      </select>
      <input id="trackSearchSchoolInput" type="text" placeholder="Cari sekolah / Kepsek..." class="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-semibold" />
    </div>

    <div id="trackParticipantListContainer" class="space-y-2 max-h-72 overflow-y-auto pr-0.5"></div>
  `;

  bodyEl.querySelectorAll(".track-tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      selectedRekapDay = btn.dataset.tk;
      renderAttendanceTrackerBody(activeUser, sekolahList, bodyEl);
    });
  });

  bodyEl.querySelectorAll(".track-status-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      selectedRekapStatus = btn.dataset.st;
      renderAttendanceTrackerBody(activeUser, sekolahList, bodyEl);
    });
  });

  bodyEl.querySelectorAll(".track-sr-pill").forEach(pill => {
    pill.addEventListener("click", () => {
      const sr = pill.dataset.sr;
      selectedRekapRayon = selectedRekapRayon === sr ? "ALL" : sr;
      renderAttendanceTrackerBody(activeUser, sekolahList, bodyEl);
    });
  });

  document.getElementById("trackFilterRayonSelect")?.addEventListener("change", (e) => {
    selectedRekapRayon = e.target.value;
    renderAttendanceTrackerBody(activeUser, sekolahList, bodyEl);
  });

  document.getElementById("trackSearchSchoolInput")?.addEventListener("input", () => {
    renderTrackedParticipantRows(ikutSchools);
  });

  renderTrackedParticipantRows(ikutSchools);
}

function renderTrackedParticipantRows(ikutSchools) {
  const box = document.getElementById("trackParticipantListContainer");
  if (!box) return;

  const kw = (document.getElementById("trackSearchSchoolInput")?.value || "").toLowerCase().trim();

  let list = ikutSchools;
  if (selectedRekapRayon !== "ALL") {
    list = list.filter(s => s.subrayon === selectedRekapRayon);
  }
  if (selectedRekapStatus === "BELUM") {
    list = list.filter(s => !getFieldByTrackKey(s, selectedRekapDay));
  } else if (selectedRekapStatus === "SUDAH") {
    list = list.filter(s => getFieldByTrackKey(s, selectedRekapDay));
  }
  if (kw) {
    list = list.filter(s =>
      (s.nama_sekolah || "").toLowerCase().includes(kw) ||
      (s.nama_kepsek || "").toLowerCase().includes(kw) ||
      String(s.npsn || "").includes(kw)
    );
  }

  if (list.length === 0) {
    box.innerHTML = `<div class="p-5 text-center text-xs text-slate-400 bg-slate-50 rounded-2xl border">Tidak ada peserta aktif (Ikut) pada filter ini.</div>`;
    return;
  }

  box.innerHTML = list.slice(0, 200).map((s, idx) => {
    const isDone = getFieldByTrackKey(s, selectedRekapDay);
    const waClean = String(s.no_hp || "").replace(/\D/g, "").replace(/^0/, "62");
    const hasIzin = Boolean(s.status_izin && s.status_izin.trim() !== "" && s.status_izin !== "Hadir Penuh (Tanpa Izin)");

    return `
      <div class="p-3 rounded-2xl bg-white border ${isDone ? 'border-emerald-300' : 'border-rose-200 bg-rose-50/20'} flex items-start justify-between gap-2 shadow-2xs">
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-1.5 flex-wrap">
            <span class="text-[9px] font-extrabold text-slate-400">#${idx + 1}</span>
            <span class="text-[9px] font-extrabold px-2 py-0.5 rounded ${isDone ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}">
              ${isDone ? '✓ SUDAH TERCATAT' : '✕ BELUM TERCATAT'}
            </span>
            <span class="text-[9px] font-bold bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">Rayon ${s.subrayon}</span>
            ${hasIzin ? `<span class="text-[9px] font-extrabold bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded">Izin: ${s.status_izin}</span>` : ''}
          </div>
          <h4 class="font-extrabold text-xs text-slate-900 truncate mt-1">${s.nama_sekolah}</h4>
          <p class="text-[10px] text-slate-600 mt-0.5">
            Kepsek: <b>${s.nama_kepsek || 'Belum Diisi'}</b> • Kamar: <b>${s.nomor_kamar || '-'}</b>
          </p>
        </div>

        <div class="flex flex-col items-end gap-1 shrink-0">
          ${s.no_hp ? `
            <a href="https://wa.me/${waClean}" target="_blank" rel="noopener noreferrer" class="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[10px] flex items-center gap-1 shadow-2xs">
              <i class="fa-brands fa-whatsapp"></i> Hubungi
            </a>
          ` : `<span class="text-[9px] text-slate-400">Tanpa No WA</span>`}
        </div>
      </div>
    `;
  }).join('');
}

// =========================================================================
// GENERATOR KOP SURAT RESMI K3S KOTA KUPANG
// =========================================================================
async function drawOfficialLetterhead(ctx, width) {
  const logoImg = await preloadK3sLogo();

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, 185);

  if (logoImg) {
    ctx.drawImage(logoImg, 45, 28, 115, 115);
  }

  const centerX = width / 2 + 35;
  ctx.textAlign = "center";
  ctx.fillStyle = "#0f172a";

  ctx.font = "bold 17px 'Plus Jakarta Sans', Arial, sans-serif";
  ctx.fillText("PEMERINTAH KOTA KUPANG", centerX, 42);

  ctx.font = "bold 17px 'Plus Jakarta Sans', Arial, sans-serif";
  ctx.fillText("DINAS PENDIDIKAN DAN KEBUDAYAAN KOTA KUPANG", centerX, 66);

  ctx.font = "800 18px 'Plus Jakarta Sans', Arial, sans-serif";
  ctx.fillText("KELOMPOK KERJA KEPALA SEKOLAH SD/MI KOTA KUPANG", centerX, 90);

  ctx.fillStyle = "#1e3a8a";
  ctx.font = "800 19px 'Plus Jakarta Sans', Arial, sans-serif";
  ctx.fillText("PANITIA PELAKSANA RAKOR KEPALA SD/MI KOTA KUPANG 2026", centerX, 115);

  ctx.fillStyle = "#334155";
  ctx.font = "bold 12px 'Plus Jakarta Sans', Arial, sans-serif";
  ctx.fillText("SEKRETARIAT: SD NCIPS - JL. KENANGA, NO. 01 NAIKOLAN - KUPANG", centerX, 138);

  ctx.fillStyle = "#dc2626";
  ctx.font = "italic 12px 'Plus Jakarta Sans', Arial, sans-serif";
  ctx.fillText("Email: k3s.sdmikotakupang@gmail.com", centerX, 156);

  ctx.strokeStyle = "#0f172a";
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(40, 170);
  ctx.lineTo(width - 40, 170);
  ctx.stroke();

  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(40, 175);
  ctx.lineTo(width - 40, 175);
  ctx.stroke();
}

function drawQrOnCanvas(ctx, textUrl, x, y, size) {
  return new Promise((resolve) => {
    try {
      const tempDiv = document.createElement("div");
      new window.QRCode(tempDiv, { text: textUrl, width: size, height: size, colorDark: "#0f172a", colorLight: "#ffffff" });
      setTimeout(() => {
        const qrCanvas = tempDiv.querySelector("canvas");
        const qrImg = tempDiv.querySelector("img");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(x - 4, y - 4, size + 8, size + 8);
        ctx.strokeStyle = "#94a3b8";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x - 4, y - 4, size + 8, size + 8);
        if (qrCanvas) ctx.drawImage(qrCanvas, x, y, size, size);
        else if (qrImg && qrImg.complete) ctx.drawImage(qrImg, x, y, size, size);
        resolve();
      }, 60);
    } catch (e) {
      resolve();
    }
  });
}

async function generatePdfDaftarHadirIndividu(school) {
  toast("Menyiapkan PDF Daftar Hadir Individu...");
  await ensureJsPdfLoaded();

  const canvas = document.createElement("canvas");
  canvas.width = 794;
  canvas.height = 1123;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  await drawOfficialLetterhead(ctx, canvas.width);

  ctx.textAlign = "center";
  ctx.fillStyle = "#0f172a";
  ctx.font = "800 18px 'Plus Jakarta Sans', Arial, sans-serif";
  ctx.fillText("SURAT KETERANGAN & REKAPITULASI DAFTAR HADIR PESERTA", canvas.width / 2, 215);
  ctx.font = "bold 13px 'Plus Jakarta Sans', Arial, sans-serif";
  ctx.fillStyle = "#475569";
  ctx.fillText("Nomor: 421.2 / DH-SPJ / K3S-KK / XI / 2026", canvas.width / 2, 236);

  ctx.textAlign = "left";
  ctx.fillStyle = "#0f172a";
  ctx.font = "14px 'Plus Jakarta Sans', Arial, sans-serif";
  ctx.fillText("Panitia Pelaksana Rapat Koordinasi Kepala SD/MI Kota Kupang Tahun 2026 menerangkan bahwa:", 50, 275);

  const infoRows = [
    ["Nama Kepala Sekolah", `: ${school.nama_kepsek || 'Kepala ' + school.nama_sekolah}`],
    ["NIP", `: ${school.nip_kepsek || '-'}`],
    ["Satuan Pendidikan", `: ${school.nama_sekolah} (NPSN: ${school.npsn})`],
    ["Sub Rayon / Kecamatan", `: Sub Rayon ${school.subrayon} — Kelurahan ${school.kelurahan || '-'}`],
    ["Status Registrasi & Kamar", `: ${school.status_ikut || 'Ikut'} (Kamar: ${school.nomor_kamar || '-'})`]
  ];

  let yPos = 308;
  infoRows.forEach(r => {
    ctx.font = "bold 13px 'Plus Jakarta Sans', Arial, sans-serif";
    ctx.fillStyle = "#334155";
    ctx.fillText(r[0], 65, yPos);
    ctx.font = "bold 13px 'Plus Jakarta Sans', Arial, sans-serif";
    ctx.fillStyle = "#0f172a";
    ctx.fillText(r[1], 255, yPos);
    yPos += 26;
  });

  ctx.font = "14px 'Plus Jakarta Sans', Arial, sans-serif";
  ctx.fillText("Telah mengikuti kegiatan Rapat Koordinasi Kepala SD/MI Se-Kota Kupang Tahun 2026 pada tanggal", 50, yPos + 15);
  ctx.fillText("26 s.d. 28 November 2026 dengan rincian rekapitulasi presensi digital (QR Scan) sebagai berikut:", 50, yPos + 35);

  const tableTop = yPos + 58;
  const headers = ["Hari / Tanggal Pelaksanaan", "Agenda Utama Kegiatan", "Status Presensi QR", "Validasi"];
  const colW = [195, 255, 145, 99];
  let startX = 50;

  ctx.fillStyle = "#1e3a8a";
  ctx.fillRect(startX, tableTop, 694, 38);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 12px 'Plus Jakarta Sans', Arial, sans-serif";

  let curX = startX;
  headers.forEach((h, i) => {
    ctx.fillText(h, curX + 10, tableTop + 24);
    curX += colW[i];
  });

  const dayRows = [
    ["Hari Ke-1 (Kamis, 26 Nov 2026)", "Registrasi, Pembukaan & Kebijakan Dinas P&K", school.hadir_h1 ? "HADIR TERVERIFIKASI" : "BELUM TERCATAT", school.hadir_h1 ? "SAH (QR)" : "-"],
    ["Hari Ke-2 (Jumat, 27 Nov 2026)", "Sidang Komisi & Penyusunan Program K3S", school.hadir_h2 ? "HADIR TERVERIFIKASI" : "BELUM TERCATAT", school.hadir_h2 ? "SAH (QR)" : "-"],
    ["Hari Ke-3 (Sabtu, 28 Nov 2026)", "Perumusan Hasil Rakor & Penutupan Resmi", school.hadir_h3 ? "HADIR TERVERIFIKASI" : "BELUM TERCATAT", school.hadir_h3 ? "SAH (QR)" : "-"]
  ];

  let rowY = tableTop + 38;
  dayRows.forEach((r, idx) => {
    ctx.fillStyle = idx % 2 === 0 ? "#f8fafc" : "#ffffff";
    ctx.fillRect(startX, rowY, 694, 42);
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 1;
    ctx.strokeRect(startX, rowY, 694, 42);

    let cx = startX;
    r.forEach((cell, cIdx) => {
      ctx.fillStyle = cIdx === 2 && cell.includes("HADIR") ? "#047857" : "#0f172a";
      ctx.font = cIdx >= 2 ? "bold 12px 'Plus Jakarta Sans', Arial, sans-serif" : "12px 'Plus Jakarta Sans', Arial, sans-serif";
      ctx.fillText(cell, cx + 10, rowY + 26);
      cx += colW[cIdx];
    });
    rowY += 42;
  });

  ctx.fillStyle = "#0f172a";
  ctx.font = "13px 'Plus Jakarta Sans', Arial, sans-serif";
  ctx.fillText("Demikian dokumen rekapitulasi daftar hadir ini diterbitkan secara resmi melalui Sistem Informasi", 50, rowY + 35);
  ctx.fillText("Manajemen Rakor (SIM-RAKOR) K3S Kota Kupang sebagai lampiran SPJ Dana BOSP Sekolah.", 50, rowY + 55);

  const signY = rowY + 115;
  ctx.font = "bold 13px 'Plus Jakarta Sans', Arial, sans-serif";
  ctx.fillText("Mengetahui,", 80, signY);
  ctx.fillText("Ketua Panitia Pelaksana", 80, signY + 20);
  ctx.fillText("Surahman Husain, S.Pd.", 80, signY + 100);

  ctx.fillText("Kupang, 28 November 2026", 480, signY);
  ctx.fillText("Sekretaris Panitia,", 480, signY + 20);
  ctx.fillText("Emanuel Nata Huler, S.Pd., Gr.", 480, signY + 100);

  const verifyUrl = `${window.location.origin}${window.location.pathname}?verify_cert=SEK-${school.npsn}`;
  await drawQrOnCanvas(ctx, verifyUrl, 335, signY + 5, 95);
  ctx.textAlign = "center";
  ctx.font = "bold 10px monospace";
  ctx.fillStyle = "#475569";
  ctx.fillText(`VALID-SPJ: ${school.npsn}`, 382, signY + 115);

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: "portrait", unit: "px", format: [794, 1123] });
  pdf.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, 794, 1123);
  pdf.save(`Daftar_Hadir_SPJ_BOSP_${school.nama_sekolah.replace(/\s+/g, '_')}.pdf`);
  toast("PDF Daftar Hadir Individu berhasil diunduh!");
}

async function generatePdfDaftarHadirKolektif(subrayon, srSchools, ketuaRayon) {
  toast(`Menyiapkan PDF Daftar Hadir Kolektif Sub Rayon ${subrayon}...`);
  await ensureJsPdfLoaded();

  const canvas = document.createElement("canvas");
  canvas.width = 794;
  canvas.height = 1123;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  await drawOfficialLetterhead(ctx, canvas.width);

  ctx.textAlign = "center";
  ctx.fillStyle = "#0f172a";
  ctx.font = "800 16px 'Plus Jakarta Sans', Arial, sans-serif";
  ctx.fillText(`DAFTAR HADIR KOLEKTIF PESERTA — SUB RAYON ${subrayon.toUpperCase()}`, canvas.width / 2, 205);
  ctx.font = "bold 12px 'Plus Jakarta Sans', Arial, sans-serif";
  ctx.fillStyle = "#334155";
  ctx.fillText(`Tanggal Pelaksanaan: 26 s.d. 28 November 2026 • Koordinator: ${ketuaRayon ? ketuaRayon.nama_panitia : '-'}`, canvas.width / 2, 224);

  const startX = 40;
  let y = 242;
  const colW = [34, 220, 185, 65, 65, 65, 80];
  const headers = ["No", "Nama Sekolah (SD/MI)", "Nama Kepala Sekolah", "H1 (26/11)", "H2 (27/11)", "H3 (28/11)", "Ket. / Sah"];

  ctx.fillStyle = "#0f172a";
  ctx.fillRect(startX, y, 714, 28);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 10px 'Plus Jakarta Sans', Arial, sans-serif";
  ctx.textAlign = "left";

  let cx = startX;
  headers.forEach((h, i) => {
    ctx.fillText(h, cx + 5, y + 18);
    cx += colW[i];
  });
  y += 28;

  srSchools.forEach((s, idx) => {
    const rowH = 20;
    ctx.fillStyle = idx % 2 === 0 ? "#f8fafc" : "#ffffff";
    ctx.fillRect(startX, y, 714, rowH);
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 0.8;
    ctx.strokeRect(startX, y, 714, rowH);

    const cells = [
      String(idx + 1),
      String(s.nama_sekolah || "").slice(0, 34),
      String(s.nama_kepsek || "Kepala Sekolah").slice(0, 28),
      s.hadir_h1 ? "HADIR" : "-",
      s.hadir_h2 ? "HADIR" : "-",
      s.hadir_h3 ? "HADIR" : "-",
      (s.hadir_h1 || s.hadir_h2 || s.hadir_h3) ? "QR-SAH" : (s.status_ikut || "-")
    ];

    let curX = startX;
    cells.forEach((txt, cIdx) => {
      ctx.fillStyle = (cIdx >= 3 && txt === "HADIR") ? "#047857" : "#0f172a";
      ctx.font = cIdx >= 3 ? "bold 9.5px 'Plus Jakarta Sans', Arial, sans-serif" : "9.5px 'Plus Jakarta Sans', Arial, sans-serif";
      ctx.fillText(txt, curX + 5, y + 14);
      curX += colW[cIdx];
    });
    y += rowH;
  });

  const signY = Math.min(y + 25, 995);
  ctx.textAlign = "left";
  ctx.fillStyle = "#0f172a";
  ctx.font = "bold 11px 'Plus Jakarta Sans', Arial, sans-serif";
  ctx.fillText("Ketua Panitia Pelaksana,", 60, signY);
  ctx.fillText("Surahman Husain, S.Pd.", 60, signY + 65);

  ctx.fillText("Kupang, 28 November 2026", 510, signY - 14);
  ctx.fillText("Sekretaris Panitia,", 510, signY);
  ctx.fillText("Emanuel Nata Huler, S.Pd., Gr.", 510, signY + 65);

  const verifyUrl = `${window.location.origin}${window.location.pathname}`;
  await drawQrOnCanvas(ctx, verifyUrl, 355, signY - 8, 72);

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: "portrait", unit: "px", format: [794, 1123] });
  pdf.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, 794, 1123);
  pdf.save(`Daftar_Hadir_Kolektif_SubRayon_${subrayon}_Rakor2026.pdf`);
  toast(`PDF Daftar Hadir Kolektif Sub Rayon ${subrayon} diunduh!`);
}

async function generatePdfEKwitansiBosp(school) {
  toast("Menyiapkan PDF E-Kwitansi Resmi BOSP...");
  await ensureJsPdfLoaded();

  const canvas = document.createElement("canvas");
  canvas.width = 794;
  canvas.height = 620;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  await drawOfficialLetterhead(ctx, canvas.width);

  const numOrder = String(school.id_sekolah || "001").replace(/\D/g, "").slice(-3) || "001";
  const kwitansiNo = `No. Kwitansi: ${numOrder} / KWT-BOSP / K3S-KK / XI / 2026`;

  ctx.textAlign = "center";
  ctx.fillStyle = "#0f172a";
  ctx.font = "800 20px 'Plus Jakarta Sans', Arial, sans-serif";
  ctx.fillText("KWITANSI BUKTI PEMBAYARAN KONTRIBUSI RAKOR", canvas.width / 2, 212);
  ctx.font = "bold 13px 'Plus Jakarta Sans', Arial, sans-serif";
  ctx.fillStyle = "#047857";
  ctx.fillText(kwitansiNo, canvas.width / 2, 232);

  ctx.strokeStyle = "#1e3a8a";
  ctx.lineWidth = 2;
  ctx.strokeRect(45, 248, 704, 195);

  const rows = [
    ["Sudah Terima Dari", `: Bendahara BOSP ${school.nama_sekolah} (NPSN: ${school.npsn})`],
    ["Nama Peserta", `: ${school.nama_kepsek || 'Kepala ' + school.nama_sekolah} (Sub Rayon ${school.subrayon})`],
    ["Uang Sejumlah", `: Dua Juta Rupiah`],
    ["Untuk Pembayaran", `: Kontribusi Peserta Kegiatan Rapat Koordinasi (Rakor) Kepala SD/MI`],
    ["", `  Se-Kota Kupang Tahun 2026 pada tanggal 26 s.d. 28 November 2026.`],
    ["Status Pembayaran", `: LUNAS TERVERIFIKASI (${school.waktu_bayar || '2026'})`]
  ];

  ctx.textAlign = "left";
  let y = 278;
  rows.forEach((r, idx) => {
    ctx.font = "bold 13px 'Plus Jakarta Sans', Arial, sans-serif";
    ctx.fillStyle = "#475569";
    ctx.fillText(r[0], 65, y);

    ctx.font = idx === 2 ? "italic bold 14px 'Plus Jakarta Sans', Arial, sans-serif" : "bold 13px 'Plus Jakarta Sans', Arial, sans-serif";
    ctx.fillStyle = idx === 5 ? "#047857" : "#0f172a";
    ctx.fillText(r[1], 230, y);
    y += 26;
  });

  ctx.fillStyle = "#fef3c7";
  ctx.fillRect(45, 465, 250, 48);
  ctx.strokeStyle = "#d97706";
  ctx.lineWidth = 2;
  ctx.strokeRect(45, 465, 250, 48);

  ctx.fillStyle = "#0f172a";
  ctx.font = "800 20px 'Plus Jakarta Sans', Arial, sans-serif";
  ctx.fillText("Rp 2.000.000,-", 75, 496);

  ctx.font = "bold 12px 'Plus Jakarta Sans', Arial, sans-serif";
  ctx.fillStyle = "#0f172a";
  ctx.fillText("Mengetahui,", 330, 475);
  ctx.fillText("Ketua Panitia Pelaksana", 330, 492);
  ctx.fillText("Surahman Husain, S.Pd.", 330, 565);

  ctx.fillText("Kupang, 28 November 2026", 545, 475);
  ctx.fillText("Bendahara Panitia,", 545, 492);
  ctx.fillText("Adriana Illi Leto, S.Pd.", 545, 565);

  const verifyUrl = `${window.location.origin}${window.location.pathname}?verify_cert=SEK-${school.npsn}`;
  await drawQrOnCanvas(ctx, verifyUrl, 130, 522, 75);

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [794, 620] });
  pdf.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, 794, 620);
  pdf.save(`E-Kwitansi_BOSP_Rakor2026_${school.nama_sekolah.replace(/\s+/g, '_')}.pdf`);
  toast("PDF E-Kwitansi Resmi BOSP berhasil diunduh!");
}
