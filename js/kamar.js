// js/kamar.js
// Mencakup:
// 1. Otoritas Ketua Panitia: Menginput Jumlah Ruang Kamar & Menambah/Mengelola Master Kamar Hotel
// 2. Otoritas Panitia Inti (PJ, Ketua, Sekretaris, Bendahara): Melihat Informasi Jumlah Ruang Kamar yang Diinput Ketua Panitia
// 3. Otoritas Ketua Sub Rayon (+ Ketua Panitia & Sekretaris): Membagi Kamar Peserta Lintas Sub Rayon
import { sb, toast } from './supabase.js';

const SUBRAYON_LIST = ["Maulafa", "Alak", "Kota Raja", "Oebobo", "Kelapa Lima", "Kota Lama"];

let masterRoomsList = []; // Disimpan di info_layanan (kode_menu = 'master_kamar_hotel') atau tabel kamar
let totalTargetRuangKamar = 80;
let activeRoomTab = "pembagian"; // 'pembagian' | 'master_kamar'
let selectedFilterRayon = "ALL";
let selectedFilterKamarStatus = "ALL";

// 1. Cek Otoritas Ketua Panitia (Input Jumlah Kamar & Tambah Master Kamar)
export function isKetuaPanitia(activeUser) {
  return Boolean(
    activeUser &&
    activeUser.role === "panitia" &&
    activeUser.profile?.divisi === "Ketua Panitia"
  );
}

// 2. Cek Otoritas Panitia Inti: Penanggung Jawab, Ketua Panitia, Sekretaris, Bendahara
// (Berhak melihat Informasi Jumlah Ruang Kamar yang diinput oleh Ketua Panitia)
export function isPanitiaInti(activeUser) {
  return Boolean(
    activeUser &&
    activeUser.role === "panitia" &&
    activeUser.profile &&
    ["Penanggung Jawab", "Ketua Panitia", "Sekretaris", "Bendahara"].includes(activeUser.profile.divisi)
  );
}

// 3. Cek Otoritas Membagi Kamar Peserta (Lintas Sub Rayon):
// Ketua Panitia, Sekretaris, dan seluruh Ketua Sub Rayon (tugas_subrayon !== "")
export function canAssignRoomsCrossRayon(activeUser) {
  if (!activeUser || activeUser.role !== "panitia" || !activeUser.profile) return false;
  const p = activeUser.profile;
  if (["Ketua Panitia", "Sekretaris"].includes(p.divisi)) return true;
  if (p.tugas_subrayon && String(p.tugas_subrayon).trim() !== "") return true;
  return false;
}

async function loadMasterRoomsConfig(sekolahList) {
  try {
    const { data } = await sb
      .from("info_layanan")
      .select("*")
      .eq("kode_menu", "master_kamar_hotel")
      .maybeSingle();

    if (data) {
      const parsedTarget = parseInt(data.url_link, 10);
      if (!isNaN(parsedTarget) && parsedTarget > 0) {
        totalTargetRuangKamar = parsedTarget;
      }
      if (data.deskripsi) {
        try {
          const arr = JSON.parse(data.deskripsi);
          if (Array.isArray(arr)) masterRoomsList = arr;
        } catch (e) {}
      }
    }
  } catch (e) {}

  // Gabungkan juga nomor kamar yang sudah terpakai di db_sekolah agar daftar kamar selalu lengkap
  const existingRoomSet = new Set(masterRoomsList.map(r => String(r.nomor)));
  (sekolahList || []).forEach(s => {
    if (s.nomor_kamar && s.nomor_kamar !== "Belum Ditentukan") {
      const numStr = String(s.nomor_kamar).trim();
      if (!existingRoomSet.has(numStr)) {
        existingRoomSet.add(numStr);
        masterRoomsList.push({ nomor: numStr, kapasitas: 2, keterangan: "Kamar Peserta" });
      }
    }
  });

  masterRoomsList.sort((a, b) => String(a.nomor).localeCompare(String(b.nomor), undefined, { numeric: true }));
}

async function saveMasterRoomsConfig(newTotalRuang, newRoomsArray) {
  totalTargetRuangKamar = Number(newTotalRuang || 80);
  masterRoomsList = newRoomsArray || [];

  await sb.from("info_layanan").upsert([{
    kode_menu: "master_kamar_hotel",
    judul: "Master Data Ruang Kamar Hotel Rakor 2026",
    deskripsi: JSON.stringify(masterRoomsList),
    url_link: String(totalTargetRuangKamar),
    status_tersedia: "AKTIF"
  }]);
}

export async function openRoomManagerModal(activeUser, sekolahList, reloadCallback) {
  const modal = document.getElementById("serviceModal");
  const titleEl = document.getElementById("serviceModalTitle");
  const bodyEl = document.getElementById("serviceModalBody");
  if (!modal || !titleEl || !bodyEl) return;

  modal.classList.remove("hidden");
  titleEl.innerHTML = `<i class="fa-solid fa-bed text-violet-700 mr-1.5"></i> Manajemen & Informasi Kamar Hotel`;

  bodyEl.innerHTML = `
    <div class="p-6 text-center text-xs font-bold text-slate-500">
      <i class="fa-solid fa-spinner animate-spin mr-1.5 text-violet-600"></i> Memuat data kamar & penempatan peserta...
    </div>
  `;

  await loadMasterRoomsConfig(sekolahList);
  renderRoomModalContent(activeUser, sekolahList, bodyEl, reloadCallback);
}

function renderRoomModalContent(activeUser, sekolahList, bodyEl, reloadCallback) {
  const isPeserta = activeUser?.role === "peserta";
  const showRoomCountInfo = isPanitiaInti(activeUser);
  const canEditMasterKamar = isKetuaPanitia(activeUser);
  const canDivideRooms = canAssignRoomsCrossRayon(activeUser);

  const totalSekolah = sekolahList.length || 160;
  const sudahDapatKamar = sekolahList.filter(s => s.nomor_kamar && s.nomor_kamar !== "Belum Ditentukan").length;
  const belumDapatKamar = totalSekolah - sudahDapatKamar;

  // Hitung jumlah ruang kamar unik yang sudah terisi peserta
  const occupiedRoomNumbers = new Set(
    sekolahList
      .filter(s => s.nomor_kamar && s.nomor_kamar !== "Belum Ditentukan")
      .map(s => String(s.nomor_kamar).trim())
  );
  const jumlahKamarTerpakai = occupiedRoomNumbers.size;
  const sisaRuangKamar = Math.max(0, totalTargetRuangKamar - jumlahKamarTerpakai);

  // Info Kamar Pribadi jika yang membuka adalah Peserta (Kepala Sekolah)
  let pesertaPersonalBanner = "";
  if (isPeserta) {
    const mySchool = sekolahList.find(x => x.id_sekolah === activeUser.profile?.id_sekolah) || activeUser.profile || {};
    const myRoom = (mySchool.nomor_kamar && mySchool.nomor_kamar !== "Belum Ditentukan") ? mySchool.nomor_kamar : "Belum Ditentukan";
    const roommates = myRoom !== "Belum Ditentukan"
      ? sekolahList.filter(x => x.nomor_kamar === myRoom && x.id_sekolah !== mySchool.id_sekolah)
      : [];

    pesertaPersonalBanner = `
      <div class="p-4 rounded-3xl bg-gradient-to-br from-slate-900 via-violet-950 to-slate-900 text-white space-y-2.5 shadow-lg border border-violet-400/30">
        <div class="flex items-center justify-between">
          <span class="text-[9px] font-extrabold uppercase bg-amber-400 text-slate-950 px-2.5 py-0.5 rounded-full">
            Kamar Anda • Sub Rayon ${mySchool.subrayon || '-'}
          </span>
          <span class="text-xs font-extrabold text-amber-300">
            <i class="fa-solid fa-key mr-1"></i>${myRoom}
          </span>
        </div>
        <div>
          <h4 class="text-xs font-extrabold">${mySchool.nama_sekolah}</h4>
          <p class="text-[10px] text-violet-200">${mySchool.nama_kepsek || 'Kepala Sekolah'}</p>
        </div>
        ${roommates.length > 0 ? `
          <div class="p-2.5 rounded-xl bg-white/10 border border-white/15 text-[10px]">
            <span class="text-emerald-300 font-extrabold block mb-0.5"><i class="fa-solid fa-user-group mr-1"></i>Rekan Sekamar Anda:</span>
            ${roommates.map(r => `<div class="font-bold text-white">• ${r.nama_kepsek || 'Kepsek'} (${r.nama_sekolah} - Rayon ${r.subrayon})</div>`).join('')}
          </div>
        ` : ''}
      </div>
    `;
  }

  // KARTU INFORMASI JUMLAH RUANG KAMAR (KHUSUS PANITIA INTI: PJ, KETUA, SEKRETARIS, BENDAHARA)
  let panitiaIntiRoomQuotaCard = "";
  if (showRoomCountInfo) {
    panitiaIntiRoomQuotaCard = `
      <div class="p-4 rounded-3xl bg-gradient-to-br from-slate-900 via-violet-950 to-slate-900 text-white space-y-3 shadow-lg border border-violet-400/40">
        <div class="flex items-center justify-between">
          <span class="text-[9px] font-extrabold uppercase tracking-wider bg-amber-400 text-slate-950 px-2.5 py-0.5 rounded-full">
            Info Kuota Kamar (Khusus Panitia Inti)
          </span>
          <span class="text-[10px] font-bold text-violet-200">Input Ketua Panitia</span>
        </div>

        <div class="grid grid-cols-3 gap-2 text-center">
          <div class="bg-white/10 rounded-2xl p-2.5 border border-white/15">
            <div class="text-base font-extrabold text-amber-300">${totalTargetRuangKamar}</div>
            <div class="text-[9px] text-violet-200 font-bold uppercase">Total Ruang Kamar</div>
          </div>
          <div class="bg-emerald-500/20 rounded-2xl p-2.5 border border-emerald-400/30">
            <div class="text-base font-extrabold text-emerald-300">${jumlahKamarTerpakai}</div>
            <div class="text-[9px] text-emerald-100 font-bold uppercase">Kamar Terisi</div>
          </div>
          <div class="bg-sky-500/20 rounded-2xl p-2.5 border border-sky-400/30">
            <div class="text-base font-extrabold text-sky-300">${sisaRuangKamar}</div>
            <div class="text-[9px] text-sky-100 font-bold uppercase">Sisa Kamar</div>
          </div>
        </div>

        <div class="flex items-center justify-between text-[10px] text-violet-200 pt-1 border-t border-white/10">
          <span>Peserta Sudah Dapat Kamar: <b class="text-emerald-300">${sudahDapatKamar} Kepsek</b></span>
          <span>Belum Dapat: <b class="text-rose-300">${belumDapatKamar} Kepsek</b></span>
        </div>
      </div>
    `;
  }

  bodyEl.innerHTML = `
    ${pesertaPersonalBanner}
    ${panitiaIntiRoomQuotaCard}

    <!-- Tab Navigasi: Pembagian Kamar Peserta vs Kelola Master Kamar (Ketua Panitia) -->
    ${canEditMasterKamar ? `
      <div class="grid grid-cols-2 gap-1.5 bg-slate-100 p-1 rounded-2xl">
        <button type="button" id="tabBtnKamarDivide" class="py-2 rounded-xl text-xs font-extrabold transition ${
          activeRoomTab === 'pembagian' ? 'bg-violet-900 text-amber-300 shadow' : 'text-slate-600'
        }">
          <i class="fa-solid fa-users-gear mr-1"></i> Pembagian Kamar Peserta
        </button>
        <button type="button" id="tabBtnKamarMaster" class="py-2 rounded-xl text-xs font-extrabold transition ${
          activeRoomTab === 'master_kamar' ? 'bg-violet-900 text-amber-300 shadow' : 'text-slate-600'
        }">
          <i class="fa-solid fa-hotel mr-1"></i> Input Kamar (Ketua Panitia)
        </button>
      </div>
    ` : ''}

    <div id="roomManagerSubViewBox" class="space-y-3 pt-1"></div>
  `;

  document.getElementById("tabBtnKamarDivide")?.addEventListener("click", () => {
    activeRoomTab = "pembagian";
    renderRoomModalContent(activeUser, sekolahList, bodyEl, reloadCallback);
  });

  document.getElementById("tabBtnKamarMaster")?.addEventListener("click", () => {
    activeRoomTab = "master_kamar";
    renderRoomModalContent(activeUser, sekolahList, bodyEl, reloadCallback);
  });

  const subBox = document.getElementById("roomManagerSubViewBox");
  if (!subBox) return;

  if (activeRoomTab === "master_kamar" && canEditMasterKamar) {
    renderKetuaPanitiaMasterRoomInput(activeUser, sekolahList, subBox, bodyEl, reloadCallback);
  } else {
    renderCrossRayonRoomAssignmentView(activeUser, canDivideRooms, sekolahList, subBox, bodyEl, reloadCallback);
  }
}

// =========================================================================
// SUB-VIEW 1: PEMBAGIAN KAMAR LINTAS SUB RAYON (KETUA SUB RAYON, KETUA PANITIA & SEKRETARIS)
// =========================================================================
function renderCrossRayonRoomAssignmentView(activeUser, canDivideRooms, sekolahList, container, bodyEl, reloadCallback) {
  const totalSek = sekolahList.length || 160;
  const isRayonCoord = Boolean(activeUser?.profile?.tugas_subrayon);

  container.innerHTML = `
    ${canDivideRooms ? `
      <div class="p-3 rounded-2xl bg-violet-50 border border-violet-200 flex items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <div class="w-8 h-8 rounded-xl bg-violet-700 text-amber-300 flex items-center justify-center text-xs font-extrabold shrink-0">
            <i class="fa-solid fa-people-arrows"></i>
          </div>
          <div>
            <div class="text-[11px] font-extrabold text-violet-950">Mode Pembagian Kamar Lintas Sub Rayon Aktif</div>
            <div class="text-[10px] text-violet-700">
              ${isRayonCoord ? `Ketua Sub Rayon ${activeUser.profile.tugas_subrayon}` : activeUser.profile?.divisi} dapat mengatur & memasangkan kamar peserta lintas Sub Rayon.
            </div>
          </div>
        </div>
      </div>
    ` : ''}

    <!-- Filter Sub Rayon (Bisa Pilih Semua Rayon untuk Membagi Lintas Sub Rayon) -->
    <div class="grid grid-cols-2 gap-2">
      <select id="kamarFilterRayonSelect" class="rounded-xl border border-slate-300 bg-slate-50 px-2.5 py-2 text-xs font-extrabold text-violet-950">
        <option value="ALL" ${selectedFilterRayon === 'ALL' ? 'selected' : ''}>Semua Sub Rayon (${totalSek})</option>
        ${SUBRAYON_LIST.map(sr => `<option value="${sr}" ${selectedFilterRayon === sr ? 'selected' : ''}>Sub Rayon ${sr}</option>`).join('')}
      </select>

      <select id="kamarFilterStatusSelect" class="rounded-xl border border-slate-300 bg-slate-50 px-2.5 py-2 text-xs font-bold text-slate-800">
        <option value="ALL" ${selectedFilterKamarStatus === 'ALL' ? 'selected' : ''}>Semua Status Kamar</option>
        <option value="SUDAH" ${selectedFilterKamarStatus === 'SUDAH' ? 'selected' : ''}>✓ Sudah Dapat Kamar</option>
        <option value="BELUM" ${selectedFilterKamarStatus === 'BELUM' ? 'selected' : ''}>⏳ Belum Dapat Kamar</option>
      </select>
    </div>

    <input id="kamarSearchSchoolInput" type="text" placeholder="Cari nomor kamar, nama Kepsek, sekolah, atau rayon..." class="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-semibold" />

    <!-- Datalist pilihan nomor kamar dari Master Kamar Ketua Panitia -->
    <datalist id="masterRoomNumbersDatalist">
      ${masterRoomsList.map(r => `<option value="${r.nomor}">Kamar ${r.nomor} (Kap: ${r.kapasitas || 2} Org)</option>`).join('')}
    </datalist>

    <div id="kamarAssignmentListContainer" class="space-y-2 max-h-80 overflow-y-auto pr-0.5"></div>
  `;

  const renderSchoolRoomRows = () => {
    const listBox = document.getElementById("kamarAssignmentListContainer");
    if (!listBox) return;

    const kw = (document.getElementById("kamarSearchSchoolInput")?.value || "").toLowerCase().trim();
    let list = sekolahList;

    if (selectedFilterRayon !== "ALL") {
      list = list.filter(s => s.subrayon === selectedFilterRayon);
    }
    if (selectedFilterKamarStatus === "SUDAH") {
      list = list.filter(s => s.nomor_kamar && s.nomor_kamar !== "Belum Ditentukan");
    } else if (selectedFilterKamarStatus === "BELUM") {
      list = list.filter(s => !s.nomor_kamar || s.nomor_kamar === "Belum Ditentukan");
    }
    if (kw) {
      list = list.filter(s =>
        (s.nama_sekolah || "").toLowerCase().includes(kw) ||
        (s.nama_kepsek || "").toLowerCase().includes(kw) ||
        (s.nomor_kamar || "").toLowerCase().includes(kw) ||
        (s.subrayon || "").toLowerCase().includes(kw) ||
        String(s.npsn || "").includes(kw)
      );
    }

    if (list.length === 0) {
      listBox.innerHTML = `<div class="p-5 text-center text-xs text-slate-400 bg-slate-50 rounded-2xl border">Tidak ada sekolah pada filter ini.</div>`;
      return;
    }

    listBox.innerHTML = "";
    list.slice(0, 200).forEach((s, idx) => {
      const currentRoom = (s.nomor_kamar && s.nomor_kamar !== "Belum Ditentukan") ? s.nomor_kamar : "";
      const occupants = currentRoom
        ? sekolahList.filter(x => x.nomor_kamar === currentRoom && x.id_sekolah !== s.id_sekolah)
        : [];

      const row = document.createElement("div");
      row.className = `p-3 rounded-2xl bg-white border ${currentRoom ? 'border-violet-300 bg-violet-50/20' : 'border-slate-200'} space-y-2 shadow-2xs`;
      row.innerHTML = `
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="text-[9px] font-extrabold text-slate-400">#${idx + 1}</span>
              <span class="text-[9px] font-extrabold bg-indigo-100 text-indigo-900 px-1.5 py-0.5 rounded">Rayon ${s.subrayon}</span>
              <span class="text-[9px] font-bold ${s.status_ikut === 'Ikut' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'} px-1.5 py-0.5 rounded">${s.status_ikut || 'Belum'}</span>
            </div>
            <h4 class="font-extrabold text-xs text-slate-900 truncate mt-1">${s.nama_sekolah}</h4>
            <p class="text-[10px] text-slate-600 truncate">Kepsek: <b>${s.nama_kepsek || 'Belum Diisi'}</b></p>
            ${occupants.length > 0 ? `
              <div class="text-[9px] font-bold text-violet-800 mt-1 bg-violet-100/70 px-2 py-0.5 rounded-md inline-block">
                <i class="fa-solid fa-user-group mr-1"></i>Sekamar dgn: ${occupants.map(o => `${o.nama_sekolah} (${o.subrayon})`).join(', ')}
              </div>
            ` : ''}
          </div>

          ${canDivideRooms ? `
            <div class="flex items-center gap-1 shrink-0">
              <input
                type="text"
                list="masterRoomNumbersDatalist"
                value="${currentRoom}"
                placeholder="No. Kamar"
                class="inp-assign-room w-24 rounded-xl border border-violet-300 bg-white px-2.5 py-1.5 text-xs font-extrabold text-violet-950 text-center focus:border-violet-700"
              />
              <button type="button" title="Simpan Kamar" class="btn-save-assign-room px-2.5 py-1.5 rounded-xl bg-violet-700 hover:bg-violet-800 text-amber-300 font-extrabold text-xs shadow">
                <i class="fa-solid fa-check"></i>
              </button>
            </div>
          ` : `
            <span class="text-[10px] font-extrabold px-2.5 py-1 rounded-xl shrink-0 ${
              currentRoom ? 'bg-violet-100 text-violet-900 border border-violet-300' : 'bg-slate-100 text-slate-500'
            }">
              <i class="fa-solid fa-bed mr-1"></i>${currentRoom || 'Belum Ada'}
            </span>
          `}
        </div>
      `;

      if (canDivideRooms) {
        row.querySelector(".btn-save-assign-room")?.addEventListener("click", async () => {
          const val = row.querySelector(".inp-assign-room")?.value.trim() || "Belum Ditentukan";
          await sb.from("db_sekolah").update({ nomor_kamar: val }).eq("id_sekolah", s.id_sekolah);
          s.nomor_kamar = val;
          toast(`Kamar ${s.nama_sekolah} (${s.subrayon}) diatur ke: ${val}`);
          if (reloadCallback) await reloadCallback();
          renderRoomModalContent(activeUser, sekolahList, bodyEl, reloadCallback);
        });
      }

      listBox.appendChild(row);
    });
  };

  renderSchoolRoomRows();

  document.getElementById("kamarFilterRayonSelect")?.addEventListener("change", (e) => {
    selectedFilterRayon = e.target.value;
    renderSchoolRoomRows();
  });

  document.getElementById("kamarFilterStatusSelect")?.addEventListener("change", (e) => {
    selectedFilterKamarStatus = e.target.value;
    renderSchoolRoomRows();
  });

  document.getElementById("kamarSearchSchoolInput")?.addEventListener("input", renderSchoolRoomRows);
}

// =========================================================================
// SUB-VIEW 2: INPUT JUMLAH RUANG KAMAR & TAMBAH KAMAR BARU (KHUSUS KETUA PANITIA)
// =========================================================================
function renderKetuaPanitiaMasterRoomInput(activeUser, sekolahList, container, bodyEl, reloadCallback) {
  container.innerHTML = `
    <!-- 1. Pengaturan Total Jumlah Ruang Kamar Hotel -->
    <div class="p-4 rounded-2xl bg-amber-50 border-2 border-amber-300 space-y-2.5">
      <div class="flex items-center justify-between">
        <span class="font-extrabold text-xs text-amber-950">
          <i class="fa-solid fa-Calculator text-amber-700 mr-1"></i> 1. Input Total Jumlah Ruang Kamar Hotel
        </span>
        <span class="text-[9px] font-extrabold uppercase bg-amber-400 text-slate-950 px-2 py-0.5 rounded">Otoritas Ketua Panitia</span>
      </div>
      <p class="text-[10px] text-slate-600">
        Jumlah total ruang kamar ini hanya ditampilkan kepada jajaran <b>Panitia Inti (Penanggung Jawab, Ketua, Sekretaris, dan Bendahara)</b>.
      </p>
      <div class="flex gap-2">
        <input id="inpTotalQuotaRuangKamar" type="number" inputmode="numeric" value="${totalTargetRuangKamar}" placeholder="Contoh: 80" class="flex-1 rounded-xl border border-amber-400 bg-white px-3 py-2 text-xs font-extrabold text-slate-900" />
        <button type="button" id="btnSaveTotalQuotaRuangKamar" class="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-amber-300 font-extrabold text-xs shadow">
          Simpan Jumlah Kamar
        </button>
      </div>
    </div>

    <!-- 2. Tambah Nomor Kamar Baru (Satuan atau Generate Rentang Nomor) -->
    <div class="p-4 rounded-2xl bg-violet-50 border border-violet-200 space-y-2.5">
      <div class="font-extrabold text-xs text-violet-950">
        <i class="fa-solid fa-plus-circle text-violet-700 mr-1"></i> 2. Tambah Daftar Nomor Kamar Hotel
      </div>

      <div class="grid grid-cols-3 gap-2">
        <div class="col-span-2">
          <label class="block text-[10px] font-bold text-slate-700 mb-0.5">Nomor / Nama Kamar:</label>
          <input id="inpNewRoomNumber" type="text" placeholder="Contoh: 101 atau 201-220" class="w-full rounded-xl border bg-white px-3 py-1.5 text-xs font-bold" />
        </div>
        <div>
          <label class="block text-[10px] font-bold text-slate-700 mb-0.5">Kapasitas:</label>
          <input id="inpNewRoomCap" type="number" value="2" class="w-full rounded-xl border bg-white px-2.5 py-1.5 text-xs font-bold text-center" />
        </div>
      </div>

      <button type="button" id="btnAddMasterRoomNow" class="w-full py-2.5 rounded-xl bg-violet-800 hover:bg-violet-900 text-white font-extrabold text-xs shadow">
        <i class="fa-solid fa-plus mr-1"></i> Tambahkan ke Daftar Ruang Kamar
      </button>
    </div>

    <!-- Daftar Ruang Kamar yang Sudah Diinput -->
    <div class="space-y-1.5">
      <div class="flex items-center justify-between text-[10px] font-extrabold text-slate-600 uppercase">
        <span>Daftar Nomor Kamar Terdaftar (${masterRoomsList.length} Kamar)</span>
      </div>
      <div class="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto pr-0.5">
        ${masterRoomsList.length === 0 ? `
          <div class="col-span-2 p-4 text-center text-xs text-slate-400 bg-slate-50 rounded-xl border">Belum ada nomor kamar yang ditambahkan.</div>
        ` : masterRoomsList.map(rm => {
          const penghuni = sekolahList.filter(s => s.nomor_kamar === String(rm.nomor));
          return `
            <div class="p-2.5 rounded-xl bg-white border ${penghuni.length > 0 ? 'border-emerald-300' : 'border-slate-200'} flex items-center justify-between gap-2">
              <div class="min-w-0">
                <div class="font-extrabold text-xs text-slate-900">Kamar ${rm.nomor}</div>
                <div class="text-[9px] font-bold ${penghuni.length > 0 ? 'text-emerald-700' : 'text-slate-400'}">
                  Terisi: ${penghuni.length}/${rm.kapasitas || 2} Kepsek
                </div>
              </div>
              <button type="button" data-rnum="${rm.nomor}" class="btn-del-master-room w-7 h-7 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs flex items-center justify-center shrink-0">
                <i class="fa-solid fa-trash"></i>
              </button>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;

  document.getElementById("btnSaveTotalQuotaRuangKamar")?.addEventListener("click", async () => {
    const val = parseInt(document.getElementById("inpTotalQuotaRuangKamar")?.value || "80", 10);
    if (isNaN(val) || val <= 0) return toast("Masukkan jumlah ruang kamar yang valid!");
    await saveMasterRoomsConfig(val, masterRoomsList);
    toast(`Total ruang kamar hotel disimpan: ${val} Kamar!`);
    renderRoomModalContent(activeUser, sekolahList, bodyEl, reloadCallback);
  });

  document.getElementById("btnAddMasterRoomNow")?.addEventListener("click", async () => {
    const rawNum = document.getElementById("inpNewRoomNumber")?.value.trim() || "";
    const cap = parseInt(document.getElementById("inpNewRoomCap")?.value || "2", 10) || 2;
    if (!rawNum) return toast("Masukkan nomor kamar terlebih dahulu!");

    // Mendukung input rentang (contoh: 101-110) maupun nomor tunggal
    if (rawNum.includes("-")) {
      const [startStr, endStr] = rawNum.split("-").map(x => x.trim());
      const startNum = parseInt(startStr, 10);
      const endNum = parseInt(endStr, 10);
      if (!isNaN(startNum) && !isNaN(endNum) && endNum >= startNum && (endNum - startNum) <= 100) {
        for (let n = startNum; n <= endNum; n++) {
          const nStr = String(n);
          if (!masterRoomsList.some(r => String(r.nomor) === nStr)) {
            masterRoomsList.push({ nomor: nStr, kapasitas: cap });
          }
        }
      }
    } else {
      if (!masterRoomsList.some(r => String(r.nomor) === rawNum)) {
        masterRoomsList.push({ nomor: rawNum, kapasitas: cap });
      }
    }

    masterRoomsList.sort((a, b) => String(a.nomor).localeCompare(String(b.nomor), undefined, { numeric: true }));
    const nextQuota = Math.max(totalTargetRuangKamar, masterRoomsList.length);
    await saveMasterRoomsConfig(nextQuota, masterRoomsList);
    toast("Nomor kamar berhasil ditambahkan!");
    renderRoomModalContent(activeUser, sekolahList, bodyEl, reloadCallback);
  });

  container.querySelectorAll(".btn-del-master-room").forEach(btn => {
    btn.addEventListener("click", async () => {
      const rnum = btn.dataset.rnum;
      masterRoomsList = masterRoomsList.filter(r => String(r.nomor) !== String(rnum));
      await saveMasterRoomsConfig(totalTargetRuangKamar, masterRoomsList);
      toast(`Kamar ${rnum} dihapus dari daftar master.`);
      renderRoomModalContent(activeUser, sekolahList, bodyEl, reloadCallback);
    });
  });
}
