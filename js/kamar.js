// js/kamar.js
// Pedoman Sistem Manajemen Kamar Hotel Rakor K3S 2026:
// 1. Peserta: Hanya melihat kamarnya sendiri dan teman sekamarnya.
// 2. Ketua Panitia: Menginput nomor kamar & kapasitas (tanpa input total manual, anti-duplikat nomor kamar).
// 3. Panitia Inti (PJ, Ketua, Sekretaris, Bendahara): Satu-satunya yang dapat melihat data jumlah kamar hotel yang diinput Ketua Panitia.
// 4. Ketua Sub Rayon (+ Ketua & Sekretaris): Menentukan penghuni kamar (lintas sub rayon) dengan validasi sistem anti-melebihi kapasitas & anti-ganda.
// 5. Anggota Panitia Lainnya: Hanya melihat data pembagian kamar per sub rayon (tanpa melihat jumlah kamar hotel master).

import { sb, toast } from './supabase.js';

const SUBRAYON_LIST = ["Maulafa", "Alak", "Kota Raja", "Oebobo", "Kelapa Lima", "Kota Lama"];

let masterRoomsList = []; // Array of { nomor: "101", kapasitas: 2 }
let activeRoomTab = "pembagian"; // 'pembagian' | 'master_kamar'
let selectedFilterRayon = "ALL";
let selectedFilterKamarStatus = "ALL";

function normalizeRoomNo(val = "") {
  return String(val || "").trim().toUpperCase();
}

// 1. Otoritas Ketua Panitia: Input & Hapus Master Nomor Kamar + Kapasitas
export function isKetuaPanitia(activeUser) {
  return Boolean(
    activeUser &&
    activeUser.role === "panitia" &&
    activeUser.profile?.divisi === "Ketua Panitia"
  );
}

// 2. Otoritas Panitia Inti (PJ, Ketua Panitia, Sekretaris, Bendahara):
// Berhak melihat informasi jumlah ruang kamar hotel yang diinput Ketua Panitia
export function isPanitiaInti(activeUser) {
  return Boolean(
    activeUser &&
    activeUser.role === "panitia" &&
    activeUser.profile &&
    ["Penanggung Jawab", "Ketua Panitia", "Sekretaris", "Bendahara"].includes(activeUser.profile.divisi)
  );
}

// 3. Otoritas Menentukan Penghuni Kamar:
// Ketua Sub Rayon (tugas_subrayon !== ""), Ketua Panitia, dan Sekretaris
export function canAssignOccupants(activeUser) {
  if (!activeUser || activeUser.role !== "panitia" || !activeUser.profile) return false;
  const p = activeUser.profile;
  if (["Ketua Panitia", "Sekretaris"].includes(p.divisi)) return true;
  if (p.tugas_subrayon && String(p.tugas_subrayon).trim() !== "") return true;
  return false;
}

// Muat daftar Master Kamar yang diinput Ketua Panitia dari database
async function loadMasterRoomsConfig(sekolahList) {
  masterRoomsList = [];
  try {
    const { data } = await sb
      .from("info_layanan")
      .select("*")
      .eq("kode_menu", "master_kamar_hotel")
      .maybeSingle();

    if (data && data.deskripsi) {
      try {
        const parsed = JSON.parse(data.deskripsi);
        if (Array.isArray(parsed)) {
          const seen = new Set();
          parsed.forEach(item => {
            const no = normalizeRoomNo(item.nomor);
            const cap = Math.max(1, parseInt(item.kapasitas, 10) || 2);
            if (no && no !== "BELUM DITENTUKAN" && !seen.has(no)) {
              seen.add(no);
              masterRoomsList.push({ nomor: no, kapasitas: cap });
            }
          });
        }
      } catch (e) {}
    }
  } catch (e) {}

  // Pastikan jika ada kamar yang sudah ditempati peserta di db_sekolah namun belum masuk list, tetap tercatat
  const existingSet = new Set(masterRoomsList.map(r => normalizeRoomNo(r.nomor)));
  const countByRoom = {};
  (sekolahList || []).forEach(s => {
    const rNo = normalizeRoomNo(s.nomor_kamar);
    if (rNo && rNo !== "BELUM DITENTUKAN") {
      countByRoom[rNo] = (countByRoom[rNo] || 0) + 1;
    }
  });

  Object.keys(countByRoom).forEach(rNo => {
    if (!existingSet.has(rNo)) {
      existingSet.add(rNo);
      masterRoomsList.push({
        nomor: rNo,
        kapasitas: Math.max(2, countByRoom[rNo])
      });
    }
  });

  masterRoomsList.sort((a, b) =>
    String(a.nomor).localeCompare(String(b.nomor), undefined, { numeric: true })
  );
}

// Simpan daftar Master Kamar (Total kamar dihitung otomatis dari jumlah kamar yang diinput Ketua)
async function saveMasterRoomsConfig(newRoomsArray) {
  const uniqueRooms = [];
  const seen = new Set();

  (newRoomsArray || []).forEach(r => {
    const no = normalizeRoomNo(r.nomor);
    const cap = Math.max(1, parseInt(r.kapasitas, 10) || 2);
    if (no && no !== "BELUM DITENTUKAN" && !seen.has(no)) {
      seen.add(no);
      uniqueRooms.push({ nomor: no, kapasitas: cap });
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

// Hitung daftar penghuni pada suatu nomor kamar
function getRoomOccupants(sekolahList, nomorKamar) {
  const target = normalizeRoomNo(nomorKamar);
  if (!target || target === "BELUM DITENTUKAN") return [];
  return (sekolahList || []).filter(s => normalizeRoomNo(s.nomor_kamar) === target);
}

// =========================================================================
// FUNGSI UTAMA PEMBUKA MODAL INFO KAMAR
// =========================================================================
export async function openRoomManagerModal(activeUser, sekolahList, reloadCallback) {
  const modal = document.getElementById("serviceModal");
  const titleEl = document.getElementById("serviceModalTitle");
  const bodyEl = document.getElementById("serviceModalBody");
  if (!modal || !titleEl || !bodyEl) return;

  modal.classList.remove("hidden");
  titleEl.innerHTML = `<i class="fa-solid fa-bed text-violet-700 mr-1.5"></i> Informasi & Pembagian Kamar Hotel`;

  bodyEl.innerHTML = `
    <div class="p-6 text-center text-xs font-bold text-slate-500">
      <i class="fa-solid fa-spinner animate-spin mr-1.5 text-violet-600"></i> Memuat data kamar...
    </div>
  `;

  await loadMasterRoomsConfig(sekolahList);

  // PEDOMAN 1: Jika user adalah PESERTA -> HANYA bisa melihat kamarnya sendiri dan teman sekamarnya saja!
  if (!activeUser || activeUser.role === "peserta") {
    renderPesertaOnlyOwnRoomAndRoommates(activeUser, sekolahList, bodyEl);
    return;
  }

  // Set default filter rayon sesuai wilayah Ketua Sub Rayon saat pertama kali buka
  if (activeUser.profile?.tugas_subrayon && selectedFilterRayon === "ALL") {
    selectedFilterRayon = activeUser.profile.tugas_subrayon;
  }

  renderPanitiaRoomModalView(activeUser, sekolahList, bodyEl, reloadCallback);
}

// =========================================================================
// 1. TAMPILAN KHUSUS PESERTA: HANYA MELIHAT KAMARNYA & TEMAN SEKAMARNYA SAJA
// =========================================================================
function renderPesertaOnlyOwnRoomAndRoommates(activeUser, sekolahList, bodyEl) {
  const mySchool = sekolahList.find(x => x.id_sekolah === activeUser?.profile?.id_sekolah) || activeUser?.profile || {};
  const myRoomNo = (mySchool.nomor_kamar && normalizeRoomNo(mySchool.nomor_kamar) !== "BELUM DITENTUKAN")
    ? normalizeRoomNo(mySchool.nomor_kamar)
    : "";

  const roommates = myRoomNo
    ? sekolahList.filter(x => normalizeRoomNo(x.nomor_kamar) === myRoomNo && x.id_sekolah !== mySchool.id_sekolah)
    : [];

  const roomMeta = myRoomNo ? masterRoomsList.find(r => normalizeRoomNo(r.nomor) === myRoomNo) : null;
  const roomCap = roomMeta ? roomMeta.kapasitas : (roommates.length + 1);

  bodyEl.innerHTML = `
    <div class="p-5 rounded-3xl bg-gradient-to-br from-slate-900 via-violet-950 to-slate-900 text-white text-center space-y-3.5 shadow-lg border border-violet-400/30">
      <div class="w-14 h-14 rounded-2xl bg-amber-400 text-slate-950 flex items-center justify-center text-2xl font-extrabold mx-auto shadow">
        <i class="fa-solid fa-key"></i>
      </div>

      <div>
        <span class="text-[9px] font-extrabold uppercase tracking-wider bg-white/15 text-amber-300 px-2.5 py-0.5 rounded-full">
          Informasi Kamar Peserta • Sub Rayon ${mySchool.subrayon || '-'}
        </span>
        <h4 class="text-sm font-extrabold mt-1.5">${mySchool.nama_sekolah || 'Sekolah Peserta'}</h4>
        <p class="text-[11px] text-violet-200">${mySchool.nama_kepsek || 'Kepala Sekolah'}</p>
      </div>

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

      <!-- Informasi Teman Sekamar -->
      <div class="p-3.5 rounded-2xl bg-white/10 border border-white/15 text-left space-y-2">
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
          <div class="space-y-2">
            ${roommates.map(rm => {
              const waClean = String(rm.no_hp || "").replace(/\D/g, "").replace(/^0/, "62");
              return `
                <div class="p-2.5 rounded-xl bg-slate-950/60 border border-white/10 flex items-center justify-between gap-2">
                  <div class="min-w-0">
                    <div class="text-xs font-extrabold text-white truncate">${rm.nama_kepsek || 'Kepala Sekolah'}</div>
                    <div class="text-[10px] text-violet-200 truncate">${rm.nama_sekolah}</div>
                    <div class="text-[9px] font-bold text-amber-300 mt-0.5">Sub Rayon ${rm.subrayon}</div>
                  </div>
                  ${rm.no_hp ? `
                    <a href="https://wa.me/${waClean}" target="_blank" rel="noopener noreferrer" class="px-2.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-[10px] shrink-0 flex items-center gap-1 shadow">
                      <i class="fa-brands fa-whatsapp"></i> Chat
                    </a>
                  ` : ''}
                </div>
              `;
            }).join('')}
          </div>
        `}
      </div>
    </div>
  `;
}

// =========================================================================
// 2. TAMPILAN PANITIA (PANITIA INTI, KETUA SUB RAYON, & ANGGOTA PANITIA LAINNYA)
// =========================================================================
function renderPanitiaRoomModalView(activeUser, sekolahList, bodyEl, reloadCallback) {
  const showMasterRoomStats = isPanitiaInti(activeUser); // HANYA PJ, Ketua, Sekretaris, Bendahara
  const canInputMasterRooms = isKetuaPanitia(activeUser); // HANYA Ketua Panitia
  const canSetOccupants = canAssignOccupants(activeUser); // Ketua Sub Rayon, Ketua Panitia, Sekretaris

  // Hitung statistik kamar dari masterRoomsList yang diinput Ketua Panitia
  const totalMasterRooms = masterRoomsList.length;
  const totalCapacityBeds = masterRoomsList.reduce((acc, r) => acc + (Number(r.kapasitas) || 2), 0);
  const roomsUsedCount = masterRoomsList.filter(r => getRoomOccupants(sekolahList, r.nomor).length > 0).length;
  const roomsFullCount = masterRoomsList.filter(r => getRoomOccupants(sekolahList, r.nomor).length >= (r.kapasitas || 2)).length;
  const roomsEmptyCount = Math.max(0, totalMasterRooms - roomsUsedCount);

  const totalAssignedParticipants = sekolahList.filter(
    s => s.nomor_kamar && normalizeRoomNo(s.nomor_kamar) !== "BELUM DITENTUKAN"
  ).length;

  // PEDOMAN 2 & 4: Kartu Data Jumlah Kamar Hotel yang Diinput Ketua Panitia HANYA Tampil untuk Panitia Inti!
  let panitiaIntiSummaryCard = "";
  if (showMasterRoomStats) {
    panitiaIntiSummaryCard = `
      <div class="p-4 rounded-3xl bg-gradient-to-br from-slate-900 via-violet-950 to-slate-900 text-white space-y-3 shadow-lg border border-violet-400/40">
        <div class="flex items-center justify-between">
          <span class="text-[9px] font-extrabold uppercase tracking-wider bg-amber-400 text-slate-950 px-2.5 py-0.5 rounded-full">
            Data Kamar Hotel (Khusus Panitia Inti)
          </span>
          <span class="text-[10px] font-bold text-emerald-300">
            Total Kapasitas: ${totalCapacityBeds} Kursi/Bed
          </span>
        </div>

        <div class="grid grid-cols-3 gap-2 text-center">
          <div class="bg-white/10 rounded-2xl p-2.5 border border-white/15">
            <div class="text-base font-extrabold text-amber-300">${totalMasterRooms}</div>
            <div class="text-[9px] text-violet-200 font-bold uppercase">Jumlah Kamar</div>
          </div>
          <div class="bg-emerald-500/20 rounded-2xl p-2.5 border border-emerald-400/30">
            <div class="text-base font-extrabold text-emerald-300">${roomsUsedCount}</div>
            <div class="text-[9px] text-emerald-100 font-bold uppercase">Terisi (${roomsFullCount} Penuh)</div>
          </div>
          <div class="bg-sky-500/20 rounded-2xl p-2.5 border border-sky-400/30">
            <div class="text-base font-extrabold text-sky-300">${roomsEmptyCount}</div>
            <div class="text-[9px] text-sky-100 font-bold uppercase">Kamar Kosong</div>
          </div>
        </div>

        <div class="flex items-center justify-between text-[10px] text-violet-200 pt-1 border-t border-white/10">
          <span>Sudah Masuk Kamar: <b class="text-emerald-300">${totalAssignedParticipants} Kepsek</b></span>
          <span>Sisa Daya Tampung: <b class="text-amber-300">${Math.max(0, totalCapacityBeds - totalAssignedParticipants)} Orang</b></span>
        </div>
      </div>
    `;
  }

  bodyEl.innerHTML = `
    ${panitiaIntiSummaryCard}

    <!-- Tab Navigasi Khusus Ketua Panitia (Pembagian Penghuni vs Input Nomor Kamar & Kapasitas) -->
    ${canInputMasterRooms ? `
      <div class="grid grid-cols-2 gap-1.5 bg-slate-100 p-1 rounded-2xl">
        <button type="button" id="tabBtnKamarDivide" class="py-2 rounded-xl text-xs font-extrabold transition ${
          activeRoomTab === 'pembagian' ? 'bg-violet-900 text-amber-300 shadow' : 'text-slate-600'
        }">
          <i class="fa-solid fa-users-gear mr-1"></i> Pembagian Penghuni
        </button>
        <button type="button" id="tabBtnKamarMaster" class="py-2 rounded-xl text-xs font-extrabold transition ${
          activeRoomTab === 'master_kamar' ? 'bg-violet-900 text-amber-300 shadow' : 'text-slate-600'
        }">
          <i class="fa-solid fa-hotel mr-1"></i> Input Kamar (${totalMasterRooms})
        </button>
      </div>
    ` : ''}

    <div id="roomManagerSubViewBox" class="space-y-3 pt-1"></div>
  `;

  document.getElementById("tabBtnKamarDivide")?.addEventListener("click", () => {
    activeRoomTab = "pembagian";
    renderPanitiaRoomModalView(activeUser, sekolahList, bodyEl, reloadCallback);
  });

  document.getElementById("tabBtnKamarMaster")?.addEventListener("click", () => {
    activeRoomTab = "master_kamar";
    renderPanitiaRoomModalView(activeUser, sekolahList, bodyEl, reloadCallback);
  });

  const subBox = document.getElementById("roomManagerSubViewBox");
  if (!subBox) return;

  if (activeRoomTab === "master_kamar" && canInputMasterRooms) {
    renderKetuaInputMasterRoomsTab(activeUser, sekolahList, subBox, bodyEl, reloadCallback);
  } else {
    renderPembagianPenghuniPerRayonTab(activeUser, canSetOccupants, sekolahList, subBox, bodyEl, reloadCallback);
  }
}

// =========================================================================
// SUB-TAB A: INPUT NOMOR KAMAR & KAPASITAS (KHUSUS KETUA PANITIA - ANTI DUPLIKAT)
// =========================================================================
function renderKetuaInputMasterRoomsTab(activeUser, sekolahList, container, bodyEl, reloadCallback) {
  container.innerHTML = `
    <div class="p-4 rounded-2xl bg-violet-50 border-2 border-violet-300 space-y-3 shadow-2xs">
      <div class="flex items-center justify-between border-b border-violet-200 pb-2">
        <span class="font-extrabold text-xs text-violet-950">
          <i class="fa-solid fa-plus-circle text-violet-700 mr-1"></i> Input Nomor Kamar & Kapasitas Ruangan
        </span>
        <span class="text-[9px] font-extrabold uppercase bg-violet-900 text-amber-300 px-2 py-0.5 rounded">
          Otoritas Ketua Panitia
        </span>
      </div>

      <p class="text-[10px] text-slate-600 leading-relaxed">
        Masukkan <b>Nomor Kamar</b> (bisa satuan seperti <b>101</b> atau rentang sekaligus seperti <b>101-115</b>) beserta <b>Kapasitas Orang</b> per kamar. Sistem otomatis menolak nomor kamar ganda dan menghitung total kamar secara otomatis.
      </p>

      <div class="grid grid-cols-3 gap-2">
        <div class="col-span-2">
          <label class="block text-[10px] font-bold text-slate-700 mb-0.5">Nomor Kamar:</label>
          <input id="inpNewRoomNumber" type="text" placeholder="Contoh: 101 atau 101-120" class="w-full rounded-xl border border-violet-300 bg-white px-3 py-2 text-xs font-extrabold text-slate-900" />
        </div>
        <div>
          <label class="block text-[10px] font-bold text-slate-700 mb-0.5">Kapasitas (Org):</label>
          <input id="inpNewRoomCap" type="number" inputmode="numeric" min="1" max="10" value="2" class="w-full rounded-xl border border-violet-300 bg-white px-2.5 py-2 text-xs font-extrabold text-center text-violet-950" />
        </div>
      </div>

      <button type="button" id="btnAddMasterRoomNow" class="w-full py-2.5 rounded-xl bg-violet-900 hover:bg-violet-800 text-amber-300 font-extrabold text-xs shadow flex items-center justify-center gap-1.5">
        <i class="fa-solid fa-floppy-disk"></i>
        <span>Tambahkan Kamar (Validasi Anti-Ganda)</span>
      </button>
    </div>

    <!-- Daftar Kamar yang Sudah Diinput Ketua Panitia -->
    <div class="space-y-2">
      <div class="flex items-center justify-between text-[10px] font-extrabold text-slate-700 uppercase px-1">
        <span>Daftar Kamar Terdaftar (${masterRoomsList.length} Ruangan)</span>
        <span class="text-violet-700">Ketuk kapasitas untuk ubah</span>
      </div>

      <div class="grid grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-0.5">
        ${masterRoomsList.length === 0 ? `
          <div class="col-span-2 p-5 text-center text-xs text-slate-400 bg-slate-50 rounded-2xl border">
            Belum ada nomor kamar yang diinput oleh Ketua Panitia.
          </div>
        ` : masterRoomsList.map(rm => {
          const occ = getRoomOccupants(sekolahList, rm.nomor);
          const cap = Number(rm.kapasitas) || 2;
          const isFull = occ.length >= cap;
          return `
            <div class="p-2.5 rounded-2xl bg-white border ${
              isFull ? 'border-emerald-300 bg-emerald-50/20' : occ.length > 0 ? 'border-amber-300' : 'border-slate-200'
            } flex items-center justify-between gap-2 shadow-2xs">
              <div class="min-w-0">
                <div class="flex items-center gap-1">
                  <span class="font-extrabold text-xs text-slate-900">Kamar ${rm.nomor}</span>
                  <span class="text-[8px] font-extrabold px-1.5 py-0.5 rounded ${
                    isFull ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                  }">${occ.length}/${cap} Org</span>
                </div>
                <div class="text-[9px] text-slate-500 truncate mt-0.5">
                  ${occ.length > 0 ? occ.map(o => o.nama_sekolah).join(', ') : 'Masih Kosong'}
                </div>
              </div>
              <button type="button" data-rnum="${rm.nomor}" title="Hapus Kamar" class="btn-del-master-room w-7 h-7 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs flex items-center justify-center shrink-0">
                <i class="fa-solid fa-trash"></i>
              </button>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;

  document.getElementById("btnAddMasterRoomNow")?.addEventListener("click", async () => {
    const rawInput = document.getElementById("inpNewRoomNumber")?.value.trim() || "";
    const cap = Math.max(1, parseInt(document.getElementById("inpNewRoomCap")?.value || "2", 10) || 2);

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
          masterRoomsList.push({ nomor: roomNo, kapasitas: cap });
          addedRooms.push(roomNo);
        }
      }
    } else {
      const singleNo = normalizeRoomNo(rawInput);
      if (existingNumbers.has(singleNo)) {
        return toast(`Ditolak: Nomor Kamar "${singleNo}" sudah ada! Nomor kamar tidak boleh ganda.`);
      }
      masterRoomsList.push({ nomor: singleNo, kapasitas: cap });
      addedRooms.push(singleNo);
    }

    if (addedRooms.length === 0 && duplicateRooms.length > 0) {
      return toast(`Semua nomor kamar tersebut (${duplicateRooms.join(", ")}) sudah terdaftar!`);
    }

    await saveMasterRoomsConfig(masterRoomsList);

    if (duplicateRooms.length > 0) {
      toast(`${addedRooms.length} kamar baru ditambahkan (${duplicateRooms.length} nomor ganda dilewati).`);
    } else {
      toast(`Berhasil menambahkan ${addedRooms.length} ruangan kamar (Kapasitas ${cap} orang)!`);
    }

    renderPanitiaRoomModalView(activeUser, sekolahList, bodyEl, reloadCallback);
  });

  container.querySelectorAll(".btn-del-master-room").forEach(btn => {
    btn.addEventListener("click", async () => {
      const rnum = normalizeRoomNo(btn.dataset.rnum);
      const occupants = getRoomOccupants(sekolahList, rnum);
      if (occupants.length > 0) {
        return toast(`Kamar ${rnum} sedang dihuni oleh ${occupants.length} peserta! Kosongkan penghuninya terlebih dahulu.`);
      }
      if (!confirm(`Hapus Kamar ${rnum} dari daftar kamar?`)) return;
      masterRoomsList = masterRoomsList.filter(r => normalizeRoomNo(r.nomor) !== rnum);
      await saveMasterRoomsConfig(masterRoomsList);
      toast(`Kamar ${rnum} berhasil dihapus.`);
      renderPanitiaRoomModalView(activeUser, sekolahList, bodyEl, reloadCallback);
    });
  });
}

// =========================================================================
// SUB-TAB B: DATA PEMBAGIAN KAMAR PER SUB RAYON & PENENTUAN PENGHUNI KAMAR
// (DENGAN VALIDASI SISTEM ANTI-MELEBIHI KAPASITAS & ANTI-GANDA)
// =========================================================================
function renderPembagianPenghuniPerRayonTab(activeUser, canSetOccupants, sekolahList, container, bodyEl, reloadCallback) {
  const totalSek = sekolahList.length || 160;
  const isRayonCoord = Boolean(activeUser?.profile?.tugas_subrayon);

  // Rekap jumlah peserta yang sudah mendapat kamar per Sub Rayon (Aman dilihat oleh seluruh panitia)
  const rayonCardsHtml = SUBRAYON_LIST.map(sr => {
    const srList = sekolahList.filter(s => s.subrayon === sr);
    const srHasRoom = srList.filter(s => s.nomor_kamar && normalizeRoomNo(s.nomor_kamar) !== "BELUM DITENTUKAN").length;
    const isSel = selectedFilterRayon === sr;
    return `
      <button type="button" data-sr="${sr}" class="kamar-sr-pill p-2 rounded-xl border text-center transition ${
        isSel ? 'bg-violet-900 text-white border-violet-900 shadow' : 'bg-slate-50 text-slate-800 border-slate-200 hover:bg-white'
      }">
        <div class="text-[10px] font-extrabold truncate">${sr}</div>
        <div class="text-[9px] font-bold mt-0.5 ${isSel ? 'text-amber-300' : 'text-violet-700'}">
          ${srHasRoom}/${srList.length} Dapat Kamar
        </div>
      </button>
    `;
  }).join('');

  container.innerHTML = `
    ${canSetOccupants ? `
      <div class="p-3 rounded-2xl bg-violet-50 border border-violet-200 flex items-center gap-2.5">
        <div class="w-8 h-8 rounded-xl bg-violet-800 text-amber-300 flex items-center justify-center text-xs font-extrabold shrink-0">
          <i class="fa-solid fa-shield-check"></i>
        </div>
        <div class="text-[10px] text-violet-950 leading-snug">
          <b>Otoritas Penentuan Penghuni (${isRayonCoord ? 'Ketua Rayon ' + activeUser.profile.tugas_subrayon : activeUser.profile?.divisi}):</b> Pilih kamar pada daftar di bawah. Sistem otomatis menolak jika kamar sudah penuh sesuai kapasitasnya.
        </div>
      </div>
    ` : `
      <div class="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-[10px] text-slate-600 text-center font-semibold">
        Menampilkan Data Pembagian Kamar Peserta Per Sub Rayon
      </div>
    `}

    <!-- Pil Filter Cepat 6 Sub Rayon -->
    <div class="grid grid-cols-3 gap-1.5">
      ${rayonCardsHtml}
    </div>

    <div class="grid grid-cols-2 gap-2">
      <select id="kamarFilterRayonSelect" class="rounded-xl border border-slate-300 bg-slate-50 px-2.5 py-2 text-xs font-extrabold text-violet-950">
        <option value="ALL" ${selectedFilterRayon === 'ALL' ? 'selected' : ''}>Semua Sub Rayon (${totalSek})</option>
        ${SUBRAYON_LIST.map(sr => `<option value="${sr}" ${selectedFilterRayon === sr ? 'selected' : ''}>Sub Rayon ${sr}</option>`).join('')}
      </select>

      <select id="kamarFilterStatusSelect" class="rounded-xl border border-slate-300 bg-slate-50 px-2.5 py-2 text-xs font-bold text-slate-800">
        <option value="ALL" ${selectedFilterKamarStatus === 'ALL' ? 'selected' : ''}>Semua Peserta</option>
        <option value="SUDAH" ${selectedFilterKamarStatus === 'SUDAH' ? 'selected' : ''}>✓ Sudah Ada Kamar</option>
        <option value="BELUM" ${selectedFilterKamarStatus === 'BELUM' ? 'selected' : ''}>⏳ Belum Ada Kamar</option>
      </select>
    </div>

    <input id="kamarSearchSchoolInput" type="text" placeholder="Cari nama sekolah, Kepala Sekolah, atau nomor kamar..." class="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-semibold" />

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
    let list = sekolahList;

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
      listBox.innerHTML = `<div class="p-5 text-center text-xs text-slate-400 bg-slate-50 rounded-2xl border">Tidak ada peserta pada filter ini.</div>`;
      return;
    }

    listBox.innerHTML = "";
    list.slice(0, 200).forEach((s, idx) => {
      const currentRoom = (s.nomor_kamar && normalizeRoomNo(s.nomor_kamar) !== "BELUM DITENTUKAN")
        ? normalizeRoomNo(s.nomor_kamar)
        : "";

      const roommates = currentRoom
        ? sekolahList.filter(x => normalizeRoomNo(x.nomor_kamar) === currentRoom && x.id_sekolah !== s.id_sekolah)
        : [];

      const roomConfig = currentRoom ? masterRoomsList.find(r => normalizeRoomNo(r.nomor) === currentRoom) : null;
      const roomCap = roomConfig ? Number(roomConfig.kapasitas) || 2 : 2;
      const currentTotalInRoom = currentRoom ? (roommates.length + 1) : 0;

      // Bangun opsi Dropdown Kamar dengan proteksi kapasitas otomatis
      let roomOptionsHtml = `<option value="Belum Ditentukan" ${!currentRoom ? 'selected' : ''}>-- Belum Ditentukan --</option>`;
      masterRoomsList.forEach(rm => {
        const rNo = normalizeRoomNo(rm.nomor);
        const cap = Number(rm.kapasitas) || 2;
        const occList = getRoomOccupants(sekolahList, rNo);
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
      row.className = `p-3 rounded-2xl bg-white border ${currentRoom ? 'border-violet-300 bg-violet-50/20' : 'border-slate-200'} space-y-2 shadow-2xs`;
      row.innerHTML = `
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="text-[9px] font-extrabold text-slate-400">#${idx + 1}</span>
              <span class="text-[9px] font-extrabold bg-indigo-100 text-indigo-900 px-1.5 py-0.5 rounded">Rayon ${s.subrayon}</span>
              ${currentRoom ? `
                <span class="text-[9px] font-extrabold bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded">
                  Kamar ${currentRoom} (${currentTotalInRoom}/${roomCap} Org)
                </span>
              ` : ''}
            </div>
            <h4 class="font-extrabold text-xs text-slate-900 truncate mt-1">${s.nama_sekolah}</h4>
            <p class="text-[10px] text-slate-600 truncate">Kepsek: <b>${s.nama_kepsek || 'Belum Diisi'}</b></p>

            ${roommates.length > 0 ? `
              <div class="text-[9px] font-bold text-violet-900 mt-1 bg-violet-100/80 px-2 py-0.5 rounded-md inline-block">
                <i class="fa-solid fa-user-group mr-1 text-violet-700"></i>Teman Sekamar: ${roommates.map(o => `${o.nama_kepsek || o.nama_sekolah} (${o.subrayon})`).join(', ')}
              </div>
            ` : ''}
          </div>

          ${canSetOccupants ? `
            <div class="shrink-0">
              <select class="sel-assign-room rounded-xl border-2 ${currentRoom ? 'border-violet-600 bg-violet-50 text-violet-950' : 'border-slate-300 bg-slate-50 text-slate-800'} px-2 py-1.5 text-[11px] font-extrabold max-w-[145px]">
                ${roomOptionsHtml}
              </select>
            </div>
          ` : `
            <span class="text-[10px] font-extrabold px-2.5 py-1 rounded-xl shrink-0 ${
              currentRoom ? 'bg-violet-100 text-violet-900 border border-violet-300' : 'bg-slate-100 text-slate-500'
            }">
              <i class="fa-solid fa-bed mr-1"></i>${currentRoom ? `Kamar ${currentRoom}` : 'Belum Ada'}
            </span>
          `}
        </div>
      `;

      if (canSetOccupants) {
        row.querySelector(".sel-assign-room")?.addEventListener("change", async (e) => {
          const chosenRoom = e.target.value;

          if (chosenRoom !== "Belum Ditentukan") {
            const targetNorm = normalizeRoomNo(chosenRoom);
            const rmObj = masterRoomsList.find(r => normalizeRoomNo(r.nomor) === targetNorm);
            const maxCap = rmObj ? (Number(rmObj.kapasitas) || 2) : 2;
            const currentOccupants = sekolahList.filter(
              x => normalizeRoomNo(x.nomor_kamar) === targetNorm && x.id_sekolah !== s.id_sekolah
            );

            // VALIDASI SISTEM: Tolak jika jumlah penghuni akan melebihi kapasitas ruangan!
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
