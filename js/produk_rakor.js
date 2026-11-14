// js/produk_rakor.js
// Mencakup:
// 1. Penyeragaman Card Surat Undangan & Tentang Aplikasi menjadi Grid Kompak 1 Kolom
// 2. Menu "Produk Rakor 2027" (Draft Proker, Proker Disepakati, Kalender Bulanan, Kegiatan Dana BOSP, & PDF Rekomendasi)
import { sb, toast } from './supabase.js';
import { openTentangAplikasiModal } from './fitur_ekstra.js';

export const BIDANG_K3S_LIST = [
  "BIDANG SOSIAL KESEJAHTERAAN",
  "BIDANG KEROHANIAN",
  "BIDANG HUBUNGAN MASYARAKAT",
  "BIDANG SENI BUDAYA DAN OLAH RAGA",
  "BIDANG MUTU",
  "BIDANG USAHA DANA"
];

export const BULAN_LIST = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
  "Sepanjang Tahun (Rutin)"
];

export const SUMBER_DANA_LIST = [
  "Dana BOSP",
  "Sharing Dana BOSP & Kas K3S",
  "Kas K3S / Iuran Anggota",
  "Swadaya / Usaha K3S",
  "APBD / Dinas P&K",
  "Sponsor / Kemitraan"
];

let prokerList = [];
let activeProdukTab = "disepakati"; // 'draft' | 'disepakati' | 'jadwal' | 'bosp' | 'rekomendasi'
let filterBidang = "ALL";
let filterBulan = "ALL";
let editingProkerId = null;
let showInputForm = false;
let logoImgCache = null;

// Hak Akses Input, Edit, Hapus & Upload: HANYA Sekretaris dan Seksi Kesekretariatan
export function canManageProdukRakor(activeUser) {
  return Boolean(
    activeUser &&
    activeUser.role === "panitia" &&
    activeUser.profile &&
    ["Sekretaris", "Seksi Kesekretariatan"].includes(activeUser.profile.divisi)
  );
}

function formatRp(num) {
  return "Rp " + Number(num || 0).toLocaleString("id-ID");
}

function isBospFunded(sumberDana = "") {
  return String(sumberDana).toUpperCase().includes("BOSP");
}

async function preloadLogo() {
  if (logoImgCache) return logoImgCache;
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      logoImgCache = img;
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

// =========================================================================
// 1. PENYERAGAMAN CARD MENU LAYANAN (UNDANGAN, TENTANG APLIKASI, & PRODUK RAKOR)
// =========================================================================
export function renderProdukRakorAndUniformCards(activeUser, layananList, reloadCallback) {
  const undanganBtn = document.querySelector('.service-menu-btn[data-service="undangan"]');
  const gridContainer = undanganBtn ? undanganBtn.parentElement : document.querySelector(".service-menu-btn")?.parentElement;
  if (!gridContainer) return;

  // A. Ubah Card "Surat Undangan Rakor 2026" menjadi Card Kompak (Sejajar dengan Info Kamar, Buku Panduan, dll.)
  if (undanganBtn) {
    undanganBtn.className = "service-menu-btn p-3 rounded-2xl bg-blue-50 hover:bg-blue-100 border border-blue-200 flex flex-col items-center text-center gap-1.5 active:scale-95 transition";
    undanganBtn.innerHTML = `
      <div class="w-10 h-10 rounded-2xl bg-blue-900 text-amber-300 flex items-center justify-center text-base shadow-sm">
        <i class="fa-solid fa-envelope-open-text"></i>
      </div>
      <span class="text-[11px] font-extrabold text-slate-800 leading-tight">Surat Undangan</span>
      <span class="text-[9px] font-bold bg-blue-200/80 text-blue-950 px-2 py-0.5 rounded-full">Resmi PDF</span>
    `;
  }

  // B. Ubah Card "Tentang Aplikasi & Pasang di HP" menjadi Card Kompak 1 Kolom
  let tentangBtn = document.getElementById("btnServiceTentangAplikasi");
  if (!tentangBtn) {
    tentangBtn = document.createElement("button");
    tentangBtn.id = "btnServiceTentangAplikasi";
    tentangBtn.type = "button";
    gridContainer.appendChild(tentangBtn);
  }
  tentangBtn.className = "p-3 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-slate-200 flex flex-col items-center text-center gap-1.5 active:scale-95 transition";
  tentangBtn.innerHTML = `
    <div class="w-10 h-10 rounded-2xl bg-slate-900 text-amber-300 flex items-center justify-center text-base shadow-sm">
      <i class="fa-solid fa-mobile-screen-button"></i>
    </div>
    <span class="text-[11px] font-extrabold text-slate-800 leading-tight">Tentang Aplikasi</span>
    <span class="text-[9px] font-bold bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full">Install & Paten</span>
  `;
  tentangBtn.onclick = () => openTentangAplikasiModal();

  // C. Tambahkan Card Kompak Baru: "Produk Rakor 2027"
  let produkBtn = document.getElementById("btnServiceProdukRakor");
  if (!produkBtn) {
    produkBtn = document.createElement("button");
    produkBtn.id = "btnServiceProdukRakor";
    produkBtn.type = "button";
    gridContainer.appendChild(produkBtn);
  }
  produkBtn.className = "p-3 rounded-2xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 flex flex-col items-center text-center gap-1.5 active:scale-95 transition";
  produkBtn.innerHTML = `
    <div class="w-10 h-10 rounded-2xl bg-emerald-700 text-amber-300 flex items-center justify-center text-base shadow-sm">
      <i class="fa-solid fa-briefcase"></i>
    </div>
    <span class="text-[11px] font-extrabold text-slate-800 leading-tight">Produk Rakor</span>
    <span class="text-[9px] font-bold bg-emerald-200/80 text-emerald-950 px-2 py-0.5 rounded-full">Proker 2027</span>
  `;
  produkBtn.onclick = () => openProdukRakorModal(activeUser, layananList, reloadCallback);

  // Pastikan urutan tombol kompak berada rapi di bagian bawah grid setelah card berlebar penuh (col-span-3)
  const compactButtons = [
    undanganBtn,
    document.querySelector('.service-menu-btn[data-service="kamar"]'),
    document.querySelector('.service-menu-btn[data-service="panduan"]'),
    document.querySelector('.service-menu-btn[data-service="materi"]'),
    document.querySelector('.service-menu-btn[data-service="dokumentasi"]'),
    document.querySelector('.service-menu-btn[data-service="sertifikat"]'),
    produkBtn,
    tentangBtn
  ].filter(Boolean);

  compactButtons.forEach(btn => gridContainer.appendChild(btn));
}

// =========================================================================
// 2. MODAL UTAMA "PRODUK RAKOR & PROGRAM KERJA K3S 2027"
// =========================================================================
export async function openProdukRakorModal(activeUser, layananList, reloadCallback) {
  const modal = document.getElementById("serviceModal");
  const titleEl = document.getElementById("serviceModalTitle");
  const bodyEl = document.getElementById("serviceModalBody");
  if (!modal || !titleEl || !bodyEl) return;

  modal.classList.remove("hidden");
  titleEl.innerHTML = `<i class="fa-solid fa-briefcase text-emerald-700 mr-1.5"></i> Produk Rakor & Proker K3S 2027`;

  bodyEl.innerHTML = `
    <div class="p-6 text-center text-xs font-bold text-slate-500">
      <i class="fa-solid fa-spinner animate-spin mr-1.5 text-emerald-600"></i> Memuat data Program Kerja & Rekomendasi Rakor 2027...
    </div>
  `;

  await fetchProkerDatabase();
  renderProdukModalContent(activeUser, layananList, bodyEl, reloadCallback);
}

async function fetchProkerDatabase() {
  try {
    const { data, error } = await sb
      .from("produk_proker_2027")
      .select("*")
      .order("id_proker", { ascending: true });
    if (!error && data) {
      prokerList = data;
    }
  } catch (e) {
    console.warn("Tabel produk_proker_2027 belum dibuat:", e);
  }
}

function renderProdukModalContent(activeUser, layananList, bodyEl, reloadCallback) {
  const isEditor = canManageProdukRakor(activeUser);

  const countDraft = prokerList.filter(p => p.kategori_dokumen === "Draft").length;
  const listDisepakati = prokerList.filter(p => p.kategori_dokumen === "Disepakati");
  const countDisepakati = listDisepakati.length;
  const countBosp = listDisepakati.filter(p => isBospFunded(p.sumber_dana)).length;

  bodyEl.innerHTML = `
    <!-- Header Ringkasan Produk Rakor 2027 -->
    <div class="p-4 rounded-3xl bg-gradient-to-br from-slate-900 via-emerald-950 to-slate-900 text-white space-y-2.5 shadow-lg border border-emerald-500/30">
      <div class="flex items-center justify-between">
        <span class="text-[9px] font-extrabold uppercase tracking-wider bg-amber-400 text-slate-950 px-2.5 py-0.5 rounded-full">
          Hasil Rumusan Rakor 2026 &rarr; Tahun Kerja 2027
        </span>
        ${isEditor ? `<span class="text-[9px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 px-2 py-0.5 rounded">Mode Editor Kesekretariatan</span>` : ''}
      </div>
      <div>
        <h4 class="text-sm font-extrabold text-white">Program Kerja & Rekomendasi K3S SD/MI Kota Kupang 2027</h4>
        <p class="text-[10px] text-emerald-200 mt-0.5">
          Terbagi dalam 6 Bidang Utama, Kalender Bulanan, Rincian Komponen Dana BOSP, dan Dokumen Rekomendasi.
        </p>
      </div>

      <!-- Navigasi 5 Sub-Menu Produk Rakor -->
      <div class="grid grid-cols-3 gap-1.5 pt-1">
        <button type="button" data-ptab="draft" class="produk-tab-btn py-2 px-2 rounded-xl text-[10px] font-extrabold transition flex items-center justify-center gap-1 ${activeProdukTab === 'draft' ? 'bg-amber-400 text-slate-950 shadow' : 'bg-white/10 text-slate-200 hover:bg-white/15'}">
          <i class="fa-solid fa-file-pen"></i>
          <span>1. Draft (${countDraft})</span>
        </button>
        <button type="button" data-ptab="disepakati" class="produk-tab-btn py-2 px-2 rounded-xl text-[10px] font-extrabold transition flex items-center justify-center gap-1 ${activeProdukTab === 'disepakati' ? 'bg-amber-400 text-slate-950 shadow' : 'bg-white/10 text-slate-200 hover:bg-white/15'}">
          <i class="fa-solid fa-circle-check"></i>
          <span>2. Disahkan (${countDisepakati})</span>
        </button>
        <button type="button" data-ptab="rekomendasi" class="produk-tab-btn py-2 px-2 rounded-xl text-[10px] font-extrabold transition flex items-center justify-center gap-1 ${activeProdukTab === 'rekomendasi' ? 'bg-amber-400 text-slate-950 shadow' : 'bg-white/10 text-slate-200 hover:bg-white/15'}">
          <i class="fa-solid fa-file-pdf"></i>
          <span>3. Rekomendasi</span>
        </button>
      </div>
      <div class="grid grid-cols-2 gap-1.5">
        <button type="button" data-ptab="jadwal" class="produk-tab-btn py-2 px-2.5 rounded-xl text-[10px] font-extrabold transition flex items-center justify-center gap-1.5 ${activeProdukTab === 'jadwal' ? 'bg-emerald-400 text-slate-950 shadow' : 'bg-white/10 text-emerald-200 hover:bg-white/15'}">
          <i class="fa-solid fa-calendar-days"></i>
          <span>Kalender Kegiatan Per Bulan</span>
        </button>
        <button type="button" data-ptab="bosp" class="produk-tab-btn py-2 px-2.5 rounded-xl text-[10px] font-extrabold transition flex items-center justify-center gap-1.5 ${activeProdukTab === 'bosp' ? 'bg-emerald-400 text-slate-950 shadow' : 'bg-white/10 text-amber-200 hover:bg-white/15'}">
          <i class="fa-solid fa-sack-dollar"></i>
          <span>Kegiatan Dana BOSP (${countBosp})</span>
        </button>
      </div>
    </div>

    <!-- Kontainer Isi Tab Aktif -->
    <div id="produkSubTabContainer" class="space-y-3 pt-1"></div>
  `;

  bodyEl.querySelectorAll(".produk-tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      activeProdukTab = btn.dataset.ptab;
      editingProkerId = null;
      showInputForm = false;
      renderProdukModalContent(activeUser, layananList, bodyEl, reloadCallback);
    });
  });

  const subContainer = document.getElementById("produkSubTabContainer");
  if (!subContainer) return;

  if (activeProdukTab === "draft") {
    renderProkerListTab(activeUser, "Draft", subContainer, layananList, bodyEl, reloadCallback);
  } else if (activeProdukTab === "disepakati") {
    renderProkerListTab(activeUser, "Disepakati", subContainer, layananList, bodyEl, reloadCallback);
  } else if (activeProdukTab === "jadwal") {
    renderJadwalBulananTab(listDisepakati, subContainer);
  } else if (activeProdukTab === "bosp") {
    renderKegiatanBospTab(listDisepakati, subContainer);
  } else if (activeProdukTab === "rekomendasi") {
    renderRekomendasiPdfTab(activeUser, layananList, subContainer, bodyEl, reloadCallback);
  }
}

// =========================================================================
// TAB 1 & 2: DRAFT PROGRAM KERJA 2027 & PROGRAM KERJA DISEPAKATI 2027
// =========================================================================
function renderProkerListTab(activeUser, kategoriTarget, container, layananList, bodyEl, reloadCallback) {
  const isEditor = canManageProdukRakor(activeUser);
  const itemsInCategory = prokerList.filter(p => p.kategori_dokumen === kategoriTarget);
  const totalAnggaranKategori = itemsInCategory.reduce((acc, cur) => acc + Number(cur.besaran_dana || 0), 0);

  const editingItem = editingProkerId
    ? prokerList.find(p => p.id_proker === editingProkerId)
    : null;

  container.innerHTML = `
    <!-- Bar Info & Tombol Aksi (Tambah Proker / Unduh PDF) -->
    <div class="p-3.5 rounded-2xl ${kategoriTarget === 'Disepakati' ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'} border flex items-center justify-between gap-2">
      <div>
        <div class="text-[10px] font-extrabold uppercase ${kategoriTarget === 'Disepakati' ? 'text-emerald-800' : 'text-amber-800'}">
          ${kategoriTarget === 'Disepakati' ? '✓ Program Kerja K3S 2027 (Telah Disahkan)' : '⏳ Draft Rancangan Program Kerja 2027'}
        </div>
        <div class="text-xs font-extrabold text-slate-900 mt-0.5">
          Total ${itemsInCategory.length} Kegiatan • Estimasi Dana: ${formatRp(totalAnggaranKategori)}
        </div>
      </div>

      <div class="flex items-center gap-1.5 shrink-0">
        <button type="button" id="btnPrintProkerPdf" class="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-amber-300 font-extrabold text-[10px] shadow flex items-center gap-1">
          <i class="fa-solid fa-file-pdf"></i>
          <span>Unduh PDF</span>
        </button>
        ${isEditor ? `
          <button type="button" id="btnToggleAddProkerForm" class="px-3 py-2 rounded-xl bg-blue-900 hover:bg-blue-800 text-white font-extrabold text-[10px] shadow flex items-center gap-1">
            <i class="fa-solid ${showInputForm ? 'fa-xmark' : 'fa-plus'}"></i>
            <span>${showInputForm ? 'Tutup Form' : 'Input Proker'}</span>
          </button>
        ` : ''}
      </div>
    </div>

    <!-- FORM INPUT / EDIT 9 KOLOM PROGRAM KERJA (KHUSUS SEKRETARIS & KESEKRETARIATAN) -->
    ${isEditor && (showInputForm || editingItem) ? `
      <div class="p-4 rounded-2xl bg-blue-50/90 border-2 border-blue-300 space-y-2.5 shadow-sm">
        <div class="flex items-center justify-between border-b border-blue-200 pb-2">
          <span class="font-extrabold text-xs text-blue-950">
            <i class="fa-solid fa-pen-to-square text-blue-700 mr-1"></i>
            ${editingItem ? 'Edit Program Kegiatan 2027' : 'Tambah Program Kegiatan Baru (9 Komponen)'}
          </span>
          <span class="text-[9px] font-extrabold uppercase bg-blue-900 text-amber-300 px-2 py-0.5 rounded">
            Otoritas Kesekretariatan
          </span>
        </div>

        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="block text-[10px] font-bold text-slate-700 mb-0.5">Status Dokumen:</label>
            <select id="prkInpKategori" class="w-full rounded-xl border bg-white px-2.5 py-2 text-xs font-extrabold text-blue-950">
              <option value="Draft" ${(editingItem?.kategori_dokumen || kategoriTarget) === 'Draft' ? 'selected' : ''}>Draft Program Kerja 2027</option>
              <option value="Disepakati" ${(editingItem?.kategori_dokumen || kategoriTarget) === 'Disepakati' ? 'selected' : ''}>Program Kerja Disepakati 2027</option>
            </select>
          </div>
          <div>
            <label class="block text-[10px] font-bold text-slate-700 mb-0.5">Divisi / Bidang K3S:</label>
            <select id="prkInpBidang" class="w-full rounded-xl border bg-white px-2.5 py-2 text-xs font-extrabold text-slate-900">
              ${BIDANG_K3S_LIST.map(b => `<option value="${b}" ${editingItem?.bidang === b ? 'selected' : ''}>${b}</option>`).join('')}
            </select>
          </div>
        </div>

        <div>
          <label class="block text-[10px] font-bold text-slate-700 mb-0.5">1. Uraian Kegiatan:</label>
          <input id="prkInpUraian" type="text" value="${editingItem?.uraian_kegiatan || ''}" placeholder="Nama / Uraian lengkap program kegiatan..." class="w-full rounded-xl border bg-white px-3 py-2 text-xs font-bold" />
        </div>

        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="block text-[10px] font-bold text-slate-700 mb-0.5">2. Tujuan Kegiatan:</label>
            <input id="prkInpTujuan" type="text" value="${editingItem?.tujuan_kegiatan || ''}" placeholder="Tujuan pelaksanaan..." class="w-full rounded-xl border bg-white px-2.5 py-1.5 text-xs font-semibold" />
          </div>
          <div>
            <label class="block text-[10px] font-bold text-slate-700 mb-0.5">3. Sasaran:</label>
            <input id="prkInpSasaran" type="text" value="${editingItem?.sasaran || '160 SD/MI Kota Kupang'}" placeholder="Contoh: 160 Kepala SD/MI..." class="w-full rounded-xl border bg-white px-2.5 py-1.5 text-xs font-semibold" />
          </div>
        </div>

        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="block text-[10px] font-bold text-slate-700 mb-0.5">4. Sumber Dana:</label>
            <select id="prkInpSumberDana" class="w-full rounded-xl border bg-white px-2.5 py-1.5 text-xs font-extrabold text-emerald-900">
              ${SUMBER_DANA_LIST.map(sd => `<option value="${sd}" ${editingItem?.sumber_dana === sd ? 'selected' : ''}>${sd}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="block text-[10px] font-bold text-slate-700 mb-0.5">5. Besaran Dana (Rp):</label>
            <input id="prkInpBesaran" type="number" inputmode="numeric" value="${editingItem?.besaran_dana || 0}" placeholder="Contoh: 2000000" class="w-full rounded-xl border bg-white px-2.5 py-1.5 text-xs font-extrabold text-slate-900" />
          </div>
        </div>

        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="block text-[10px] font-bold text-slate-700 mb-0.5">6a. Bulan Utama (Untuk Kalender):</label>
            <select id="prkInpBulan" class="w-full rounded-xl border bg-white px-2.5 py-1.5 text-xs font-bold">
              ${BULAN_LIST.map(bln => `<option value="${bln}" ${editingItem?.bulan_pelaksanaan === bln ? 'selected' : ''}>${bln}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="block text-[10px] font-bold text-slate-700 mb-0.5">6b. Keterangan Waktu Pelaksanaan:</label>
            <input id="prkInpWaktu" type="text" value="${editingItem?.waktu_pelaksanaan || ''}" placeholder="Contoh: Minggu ke-2 Mei 2027" class="w-full rounded-xl border bg-white px-2.5 py-1.5 text-xs font-semibold" />
          </div>
        </div>

        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="block text-[10px] font-bold text-slate-700 mb-0.5">7. Penanggung Jawab:</label>
            <input id="prkInpPj" type="text" value="${editingItem?.penanggung_jawab || ''}" placeholder="Contoh: Koordinator Bidang Mutu" class="w-full rounded-xl border bg-white px-2.5 py-1.5 text-xs font-semibold" />
          </div>
          <div>
            <label class="block text-[10px] font-bold text-slate-700 mb-0.5">8. Hasil yang Diharapkan:</label>
            <input id="prkInpHasil" type="text" value="${editingItem?.hasil_diharapkan || ''}" placeholder="Output / capaian kegiatan..." class="w-full rounded-xl border bg-white px-2.5 py-1.5 text-xs font-semibold" />
          </div>
        </div>

        <div>
          <label class="block text-[10px] font-bold text-slate-700 mb-0.5">9. Keterangan Tambahan (Misal: Komponen ARKAS BOSP / Teknis):</label>
          <input id="prkInpKet" type="text" value="${editingItem?.keterangan || ''}" placeholder="Catatan pelaksanaan atau pos anggaran sekolah..." class="w-full rounded-xl border bg-white px-3 py-1.5 text-xs font-semibold" />
        </div>

        <div class="flex gap-2 pt-1">
          <button type="button" id="btnSaveProkerItem" class="flex-1 py-2.5 rounded-xl bg-blue-900 hover:bg-blue-800 text-white font-extrabold text-xs shadow flex items-center justify-center gap-1.5">
            <i class="fa-solid fa-floppy-disk"></i>
            <span>${editingItem ? 'Simpan Perubahan' : 'Tambahkan Program Kerja'}</span>
          </button>
          <button type="button" id="btnCancelProkerForm" class="px-4 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-600 font-bold text-xs">
            Batal
          </button>
        </div>
      </div>
    ` : ''}

    <!-- Filter Bidang -->
    <div class="grid grid-cols-2 gap-2">
      <select id="prkFilterBidang" class="rounded-xl border border-slate-300 bg-slate-50 px-2.5 py-2 text-xs font-extrabold text-blue-950">
        <option value="ALL" ${filterBidang === 'ALL' ? 'selected' : ''}>Semua 6 Bidang K3S</option>
        ${BIDANG_K3S_LIST.map(b => `<option value="${b}" ${filterBidang === b ? 'selected' : ''}>${b}</option>`).join('')}
      </select>
      <input id="prkSearchKeyword" type="text" placeholder="Cari kegiatan / sumber dana..." class="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-semibold" />
    </div>

    <!-- Daftar Kartu Program Kerja Per Bidang -->
    <div id="prkCardsListBox" class="space-y-2.5 max-h-96 overflow-y-auto pr-0.5"></div>
  `;

  document.getElementById("btnToggleAddProkerForm")?.addEventListener("click", () => {
    showInputForm = !showInputForm;
    editingProkerId = null;
    renderProkerListTab(activeUser, kategoriTarget, container, layananList, bodyEl, reloadCallback);
  });

  document.getElementById("btnCancelProkerForm")?.addEventListener("click", () => {
    showInputForm = false;
    editingProkerId = null;
    renderProkerListTab(activeUser, kategoriTarget, container, layananList, bodyEl, reloadCallback);
  });

  document.getElementById("btnPrintProkerPdf")?.addEventListener("click", () => {
    generatePdfMatriksProker(kategoriTarget, itemsInCategory);
  });

  document.getElementById("btnSaveProkerItem")?.addEventListener("click", async () => {
    if (!isEditor) return;
    const kategori_dokumen = document.getElementById("prkInpKategori").value;
    const bidang = document.getElementById("prkInpBidang").value;
    const uraian_kegiatan = document.getElementById("prkInpUraian").value.trim();
    const tujuan_kegiatan = document.getElementById("prkInpTujuan").value.trim();
    const sasaran = document.getElementById("prkInpSasaran").value.trim();
    const sumber_dana = document.getElementById("prkInpSumberDana").value;
    const besaran_dana = Number(document.getElementById("prkInpBesaran").value || 0);
    const bulan_pelaksanaan = document.getElementById("prkInpBulan").value;
    const waktu_pelaksanaan = document.getElementById("prkInpWaktu").value.trim() || `${bulan_pelaksanaan} 2027`;
    const penanggung_jawab = document.getElementById("prkInpPj").value.trim();
    const hasil_diharapkan = document.getElementById("prkInpHasil").value.trim();
    const keterangan = document.getElementById("prkInpKet").value.trim();

    if (!uraian_kegiatan) return toast("Uraian Kegiatan wajib diisi!");

    const payload = {
      id_proker: editingItem ? editingItem.id_proker : "PRK-2027-" + Math.floor(1000 + Math.random() * 9000),
      kategori_dokumen,
      bidang,
      uraian_kegiatan,
      tujuan_kegiatan,
      sasaran,
      sumber_dana,
      besaran_dana,
      bulan_pelaksanaan,
      waktu_pelaksanaan,
      penanggung_jawab,
      hasil_diharapkan,
      keterangan,
      diupdate_oleh: activeUser.profile?.nama_panitia || "Sekretariat",
      waktu_update: new Date().toLocaleString("id-ID")
    };

    const { error } = await sb.from("produk_proker_2027").upsert([payload]);
    if (error) {
      return toast("Pastikan SQL Langkah 1 (tabel produk_proker_2027) sudah dijalankan di Supabase!");
    }

    toast(editingItem ? "Program Kerja berhasil diperbarui!" : "Program Kerja baru berhasil disimpan!");
    editingProkerId = null;
    showInputForm = false;
    activeProdukTab = kategori_dokumen === "Disepakati" ? "disepakati" : "draft";
    await fetchProkerDatabase();
    renderProdukModalContent(activeUser, layananList, bodyEl, reloadCallback);
  });

  const renderFilteredCards = () => {
    const box = document.getElementById("prkCardsListBox");
    if (!box) return;
    const kw = (document.getElementById("prkSearchKeyword")?.value || "").toLowerCase().trim();

    let filtered = itemsInCategory;
    if (filterBidang !== "ALL") {
      filtered = filtered.filter(p => p.bidang === filterBidang);
    }
    if (kw) {
      filtered = filtered.filter(p =>
        (p.uraian_kegiatan || "").toLowerCase().includes(kw) ||
        (p.bidang || "").toLowerCase().includes(kw) ||
        (p.sumber_dana || "").toLowerCase().includes(kw) ||
        (p.penanggung_jawab || "").toLowerCase().includes(kw)
      );
    }

    if (filtered.length === 0) {
      box.innerHTML = `<div class="p-6 text-center text-xs text-slate-400 bg-slate-50 rounded-2xl border">Belum ada program kegiatan pada filter ini.</div>`;
      return;
    }

    box.innerHTML = "";
    filtered.forEach((p, idx) => {
      const bospTag = isBospFunded(p.sumber_dana);
      const card = document.createElement("div");
      card.className = "p-3.5 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-2.5";
      card.innerHTML = `
        <div class="flex items-start justify-between gap-2 border-b border-slate-100 pb-2">
          <div class="space-y-1">
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="text-[9px] font-extrabold uppercase px-2 py-0.5 rounded bg-blue-900 text-amber-300">${p.bidang}</span>
              <span class="text-[9px] font-extrabold px-2 py-0.5 rounded ${bospTag ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-slate-100 text-slate-700'}">
                <i class="fa-solid fa-coins mr-0.5"></i>${p.sumber_dana}
              </span>
              <span class="text-[9px] font-bold bg-indigo-50 text-indigo-800 px-2 py-0.5 rounded">
                <i class="fa-regular fa-calendar mr-0.5"></i>${p.waktu_pelaksanaan || p.bulan_pelaksanaan}
              </span>
            </div>
            <h4 class="font-extrabold text-xs text-slate-900 leading-snug">${idx + 1}. ${p.uraian_kegiatan}</h4>
          </div>
          <div class="text-right shrink-0">
            <div class="text-xs font-extrabold text-emerald-700">${formatRp(p.besaran_dana)}</div>
            <div class="text-[9px] text-slate-400">Besaran Dana</div>
          </div>
        </div>

        <!-- Rincian Lengkap 9 Komponen Program Kegiatan -->
        <div class="grid grid-cols-2 gap-2 text-[10px] bg-slate-50 p-2.5 rounded-xl border border-slate-200/70">
          <div>
            <span class="text-slate-400 font-bold block">Tujuan Kegiatan:</span>
            <span class="font-semibold text-slate-800">${p.tujuan_kegiatan || '-'}</span>
          </div>
          <div>
            <span class="text-slate-400 font-bold block">Sasaran:</span>
            <span class="font-semibold text-slate-800">${p.sasaran || '-'}</span>
          </div>
          <div>
            <span class="text-slate-400 font-bold block">Penanggung Jawab:</span>
            <span class="font-bold text-blue-900">${p.penanggung_jawab || '-'}</span>
          </div>
          <div>
            <span class="text-slate-400 font-bold block">Hasil yang Diharapkan:</span>
            <span class="font-semibold text-slate-800">${p.hasil_diharapkan || '-'}</span>
          </div>
          <div class="col-span-2 pt-1 border-t border-slate-200/70">
            <span class="text-slate-400 font-bold">Keterangan: </span>
            <span class="font-semibold text-slate-700">${p.keterangan || '-'}</span>
          </div>
        </div>

        ${isEditor ? `
          <div class="flex items-center justify-end gap-1.5 pt-1">
            ${kategoriTarget === 'Draft' ? `
              <button type="button" class="btn-approve-draft px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[10px] flex items-center gap-1 shadow-2xs">
                <i class="fa-solid fa-gavel"></i>
                <span>Sahkan ke Proker Disepakati</span>
              </button>
            ` : ''}
            <button type="button" class="btn-edit-proker px-2.5 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-900 font-extrabold text-[10px] flex items-center gap-1">
              <i class="fa-solid fa-pen"></i> Edit
            </button>
            <button type="button" class="btn-del-proker px-2.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-extrabold text-[10px] flex items-center gap-1">
              <i class="fa-solid fa-trash"></i> Hapus
            </button>
          </div>
        ` : ''}
      `;

      if (isEditor) {
        card.querySelector(".btn-approve-draft")?.addEventListener("click", async () => {
          await sb.from("produk_proker_2027").update({
            kategori_dokumen: "Disepakati",
            waktu_update: new Date().toLocaleString("id-ID")
          }).eq("id_proker", p.id_proker);
          toast("Program Kerja resmi disahkan ke Proker Disepakati 2027!");
          await fetchProkerDatabase();
          renderProdukModalContent(activeUser, layananList, bodyEl, reloadCallback);
        });

        card.querySelector(".btn-edit-proker")?.addEventListener("click", () => {
          editingProkerId = p.id_proker;
          showInputForm = true;
          renderProkerListTab(activeUser, kategoriTarget, container, layananList, bodyEl, reloadCallback);
        });

        card.querySelector(".btn-del-proker")?.addEventListener("click", async () => {
          if (!confirm(`Hapus kegiatan "${p.uraian_kegiatan}"?`)) return;
          await sb.from("produk_proker_2027").delete().eq("id_proker", p.id_proker);
          toast("Program kegiatan dihapus.");
          await fetchProkerDatabase();
          renderProdukModalContent(activeUser, layananList, bodyEl, reloadCallback);
        });
      }

      box.appendChild(card);
    });
  };

  renderFilteredCards();

  document.getElementById("prkFilterBidang")?.addEventListener("change", (e) => {
    filterBidang = e.target.value;
    renderFilteredCards();
  });

  document.getElementById("prkSearchKeyword")?.addEventListener("input", renderFilteredCards);
}

// =========================================================================
// TAB 3: INFO JADWAL KEGIATAN PER BULAN (JANUARI - DESEMBER 2027)
// =========================================================================
function renderJadwalBulananTab(listDisepakati, container) {
  container.innerHTML = `
    <div class="p-3.5 rounded-2xl bg-indigo-50 border border-indigo-200 flex items-center justify-between gap-2">
      <div>
        <div class="text-[10px] font-extrabold uppercase text-indigo-800">Kalender Kerja Tahunan K3S 2027</div>
        <div class="text-xs font-extrabold text-slate-900">Jadwal Pelaksanaan Kegiatan Per Bulan (Dari Proker Disahkan)</div>
      </div>
      <select id="jadwalFilterBulan" class="rounded-xl border border-indigo-300 bg-white px-2.5 py-1.5 text-xs font-extrabold text-indigo-950 shrink-0">
        <option value="ALL" ${filterBulan === 'ALL' ? 'selected' : ''}>Semua Bulan (12)</option>
        ${BULAN_LIST.map(b => `<option value="${b}" ${filterBulan === b ? 'selected' : ''}>${b}</option>`).join('')}
      </select>
    </div>

    <div id="jadwalBulananTimelineBox" class="space-y-2.5 max-h-96 overflow-y-auto pr-0.5"></div>
  `;

  const renderTimeline = () => {
    const box = document.getElementById("jadwalBulananTimelineBox");
    if (!box) return;

    const monthsToShow = filterBulan === "ALL" ? BULAN_LIST : [filterBulan];
    box.innerHTML = "";

    monthsToShow.forEach(bln => {
      const agendas = listDisepakati.filter(p =>
        p.bulan_pelaksanaan === bln ||
        (p.waktu_pelaksanaan || "").toLowerCase().includes(bln.toLowerCase())
      );

      if (filterBulan === "ALL" && agendas.length === 0) return;

      const totalBulanRp = agendas.reduce((acc, c) => acc + Number(c.besaran_dana || 0), 0);

      const mCard = document.createElement("div");
      mCard.className = "p-3.5 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-2";
      mCard.innerHTML = `
        <div class="flex items-center justify-between border-b border-slate-100 pb-1.5">
          <div class="flex items-center gap-2">
            <span class="w-7 h-7 rounded-xl bg-blue-900 text-amber-300 flex items-center justify-center text-xs font-extrabold">
              <i class="fa-regular fa-calendar-check"></i>
            </span>
            <div>
              <h4 class="font-extrabold text-xs text-slate-900 uppercase">${bln} 2027</h4>
              <span class="text-[10px] text-slate-500 font-semibold">${agendas.length} Agenda Kegiatan</span>
            </div>
          </div>
          <span class="text-xs font-extrabold text-emerald-700">${formatRp(totalBulanRp)}</span>
        </div>

        ${agendas.length === 0 ? `
          <div class="text-[11px] text-slate-400 py-2 text-center">Belum ada kegiatan terjadwal pada bulan ${bln}.</div>
        ` : `
          <div class="space-y-1.5">
            ${agendas.map(a => `
              <div class="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 flex items-start justify-between gap-2">
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-1.5 flex-wrap">
                    <span class="text-[9px] font-extrabold bg-blue-100 text-blue-900 px-1.5 py-0.5 rounded">${a.bidang}</span>
                    <span class="text-[9px] font-bold ${isBospFunded(a.sumber_dana) ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'} px-1.5 py-0.5 rounded">${a.sumber_dana}</span>
                  </div>
                  <div class="font-extrabold text-xs text-slate-900 mt-1">${a.uraian_kegiatan}</div>
                  <div class="text-[10px] text-slate-500 mt-0.5">
                    PJ: <b>${a.penanggung_jawab || '-'}</b> • Waktu: <b>${a.waktu_pelaksanaan || bln}</b>
                  </div>
                </div>
                <div class="text-right shrink-0 font-extrabold text-[11px] text-slate-800">
                  ${formatRp(a.besaran_dana)}
                </div>
              </div>
            `).join('')}
          </div>
        `}
      `;
      box.appendChild(mCard);
    });

    if (box.innerHTML === "") {
      box.innerHTML = `<div class="p-6 text-center text-xs text-slate-400 bg-slate-50 rounded-2xl border">Belum ada kegiatan yang disahkan pada kalender 2027.</div>`;
    }
  };

  renderTimeline();
  document.getElementById("jadwalFilterBulan")?.addEventListener("change", (e) => {
    filterBulan = e.target.value;
    renderTimeline();
  });
}

// =========================================================================
// TAB 4: FILTER KHUSUS KEGIATAN YANG DIBIAYAI DANA BOSP (ACUAN RKAS/ARKAS 2027)
// =========================================================================
function renderKegiatanBospTab(listDisepakati, container) {
  const bospItems = listDisepakati.filter(p => isBospFunded(p.sumber_dana));
  const totalDanaBosp = bospItems.reduce((acc, c) => acc + Number(c.besaran_dana || 0), 0);

  container.innerHTML = `
    <div class="p-4 rounded-2xl bg-gradient-to-r from-emerald-900 to-teal-900 text-white space-y-2 shadow">
      <div class="flex items-center justify-between">
        <span class="text-[9px] font-extrabold uppercase bg-amber-400 text-slate-950 px-2 py-0.5 rounded-full">
          Panduan Penganggaran RKAS / ARKAS Sekolah
        </span>
        <button type="button" id="btnPrintBospProkerPdf" class="px-3 py-1 rounded-xl bg-white/15 hover:bg-white/25 text-amber-300 font-extrabold text-[10px] flex items-center gap-1">
          <i class="fa-solid fa-file-pdf"></i>
          <span>Cetak PDF BOSP</span>
        </button>
      </div>
      <div class="flex items-end justify-between pt-1">
        <div>
          <div class="text-[10px] text-emerald-200 font-bold uppercase">Total Estimasi Kegiatan Bersumber Dana BOSP (2027)</div>
          <div class="text-xl font-extrabold text-amber-300">${formatRp(totalDanaBosp)}</div>
        </div>
        <div class="text-right">
          <span class="text-xs font-extrabold bg-emerald-500/30 border border-emerald-400/40 px-2.5 py-1 rounded-xl">
            ${bospItems.length} Kegiatan
          </span>
        </div>
      </div>
      <p class="text-[10px] text-emerald-100 leading-relaxed pt-1 border-t border-white/10">
        Daftar di bawah ini adalah kegiatan K3S Tahun 2027 yang disepakati menggunakan sumber pembiayaan <b>Dana BOSP</b> agar dapat dianggarkan secara seragam pada ARKAS masing-masing sekolah.
      </p>
    </div>

    <div class="space-y-2 max-h-96 overflow-y-auto pr-0.5">
      ${bospItems.length === 0 ? `
        <div class="p-6 text-center text-xs text-slate-400 bg-slate-50 rounded-2xl border">
          Belum ada kegiatan berstatus Disepakati dengan sumber Dana BOSP.
        </div>
      ` : bospItems.map((p, idx) => `
        <div class="p-3.5 rounded-2xl bg-white border-2 border-emerald-200 shadow-2xs space-y-2">
          <div class="flex items-start justify-between gap-2">
            <div>
              <div class="flex items-center gap-1.5 flex-wrap">
                <span class="text-[9px] font-extrabold bg-emerald-700 text-white px-2 py-0.5 rounded">${p.sumber_dana}</span>
                <span class="text-[9px] font-extrabold bg-blue-100 text-blue-900 px-2 py-0.5 rounded">${p.bidang}</span>
                <span class="text-[9px] font-bold bg-amber-100 text-amber-900 px-2 py-0.5 rounded">Bulan: ${p.bulan_pelaksanaan}</span>
              </div>
              <h4 class="font-extrabold text-xs text-slate-900 mt-1.5">${idx + 1}. ${p.uraian_kegiatan}</h4>
            </div>
            <div class="text-right shrink-0">
              <div class="text-xs font-extrabold text-emerald-700">${formatRp(p.besaran_dana)}</div>
              <div class="text-[9px] text-slate-400">Per Sekolah / Paket</div>
            </div>
          </div>

          <div class="text-[10px] text-slate-600 bg-emerald-50/60 p-2.5 rounded-xl border border-emerald-200/70 space-y-1">
            <div><b>Tujuan & Sasaran:</b> ${p.tujuan_kegiatan || '-'} (${p.sasaran || '-'})</div>
            <div><b>Waktu & PJ:</b> ${p.waktu_pelaksanaan || p.bulan_pelaksanaan} • PJ: ${p.penanggung_jawab || '-'}</div>
            <div><b>Catatan ARKAS / Keterangan:</b> <span class="text-emerald-950 font-bold">${p.keterangan || '-'}</span></div>
          </div>
        </div>
      `).join('')}
    </div>
  `;

  document.getElementById("btnPrintBospProkerPdf")?.addEventListener("click", () => {
    generatePdfMatriksProker("Khusus_Sumber_Dana_BOSP", bospItems);
  });
}

// =========================================================================
// TAB 5: REKOMENDASI RAKOR 2027 (DOKUMEN PDF RESMI)
// =========================================================================
function renderRekomendasiPdfTab(activeUser, layananList, container, bodyEl, reloadCallback) {
  const isEditor = canManageProdukRakor(activeUser);
  const rekomItem = (layananList || []).find(x => x.kode_menu === "rekomendasi_2027") || {
    kode_menu: "rekomendasi_2027",
    judul: "Rekomendasi Resmi Rakor K3S Tahun 2027",
    deskripsi: "Dokumen rumusan rekomendasi hasil Rapat Koordinasi Kepala SD/MI Se-Kota Kupang (26–28 November 2026) untuk tahun anggaran 2027.",
    url_link: "",
    status_tersedia: "Segera Hadir"
  };

  const hasPdfUrl = Boolean(rekomItem.url_link && rekomItem.url_link.trim() !== "");

  container.innerHTML = `
    <div class="p-4 rounded-3xl bg-slate-50 border-2 border-slate-200 space-y-3 text-center">
      <div class="w-14 h-14 rounded-2xl bg-red-100 text-red-700 flex items-center justify-center text-2xl mx-auto shadow-2xs">
        <i class="fa-solid fa-file-pdf"></i>
      </div>
      <div>
        <span class="text-[9px] font-extrabold uppercase px-2.5 py-0.5 rounded-full ${hasPdfUrl ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">
          ${hasPdfUrl ? '✓ Dokumen PDF Tersedia' : 'Menunggu Pengesahan Pleno'}
        </span>
        <h4 class="font-extrabold text-sm text-slate-900 mt-1.5">${rekomItem.judul}</h4>
        <p class="text-[11px] text-slate-600 leading-relaxed mt-1">${rekomItem.deskripsi}</p>
      </div>

      ${hasPdfUrl ? `
        <div class="space-y-2 pt-1">
          <a href="${rekomItem.url_link}" target="_blank" rel="noopener noreferrer" download class="w-full py-3 rounded-2xl bg-blue-900 hover:bg-blue-800 text-white font-extrabold text-xs shadow flex items-center justify-center gap-2">
            <i class="fa-solid fa-download text-amber-300"></i>
            <span>Buka / Unduh PDF Rekomendasi Rakor 2027</span>
          </a>
        </div>
      ` : ''}

      <button type="button" id="btnGenerateDefaultRekomPdf" class="w-full py-2.5 rounded-2xl bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs shadow flex items-center justify-center gap-2">
        <i class="fa-solid fa-print text-amber-300"></i>
        <span>Cetak Lembar Resmi Rekomendasi & Proker 2027 (PDF Ber-Kop K3S)</span>
      </button>
    </div>

    ${isEditor ? `
      <div class="p-4 rounded-2xl bg-blue-50 border border-blue-300 space-y-2.5">
        <div class="flex items-center justify-between">
          <span class="font-extrabold text-xs text-blue-950">
            <i class="fa-solid fa-cloud-arrow-up text-blue-700 mr-1"></i> Upload / Update Dokumen PDF Rekomendasi 2027
          </span>
          <span class="text-[9px] font-extrabold uppercase bg-blue-900 text-amber-300 px-2 py-0.5 rounded">Khusus Kesekretariatan</span>
        </div>

        <div>
          <label class="block text-[10px] font-bold text-slate-700 mb-1">Judul / Ringkasan Rekomendasi:</label>
          <input id="inpRekomJudul" type="text" value="${rekomItem.judul}" class="w-full rounded-xl border bg-white px-3 py-1.5 text-xs font-bold mb-1.5" />
          <textarea id="inpRekomDeskripsi" rows="2" placeholder="Ringkasan poin rekomendasi..." class="w-full rounded-xl border bg-white px-3 py-1.5 text-xs font-semibold">${rekomItem.deskripsi}</textarea>
        </div>

        <div>
          <label class="block text-[10px] font-bold text-slate-700 mb-1">Pilih File PDF Rekomendasi Rakor 2027:</label>
          <input id="inpRekomPdfFile" type="file" accept=".pdf,application/pdf" class="w-full rounded-xl border border-blue-300 bg-white px-3 py-1.5 text-xs font-semibold file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:bg-blue-900 file:text-white file:text-[11px] file:font-bold" />
        </div>

        <div class="flex gap-2">
          <button type="button" id="btnUploadRekomPdfNow" class="flex-1 py-2.5 rounded-xl bg-blue-900 hover:bg-blue-800 text-white font-extrabold text-xs shadow flex items-center justify-center gap-1.5">
            <i class="fa-solid fa-floppy-disk"></i>
            <span>Simpan & Publikasikan PDF</span>
          </button>
          ${hasPdfUrl ? `
            <button type="button" id="btnDeleteRekomPdf" class="px-3 py-2.5 rounded-xl bg-rose-100 hover:bg-rose-200 text-rose-700 font-extrabold text-xs">
              Hapus PDF
            </button>
          ` : ''}
        </div>
      </div>
    ` : ''}
  `;

  document.getElementById("btnGenerateDefaultRekomPdf")?.addEventListener("click", () => {
    const disepakati = prokerList.filter(p => p.kategori_dokumen === "Disepakati");
    generatePdfMatriksProker("Rekomendasi_dan_Proker_Disepakati", disepakati, rekomItem.deskripsi);
  });

  document.getElementById("btnUploadRekomPdfNow")?.addEventListener("click", async () => {
    if (!isEditor) return;
    const judul = document.getElementById("inpRekomJudul")?.value.trim() || "Rekomendasi Resmi Rakor K3S Tahun 2027";
    const deskripsi = document.getElementById("inpRekomDeskripsi")?.value.trim() || "";
    const file = document.getElementById("inpRekomPdfFile")?.files?.[0];

    const btn = document.getElementById("btnUploadRekomPdfNow");
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner animate-spin"></i> Menyimpan...`;

    let finalUrl = rekomItem.url_link || "";
    if (file) {
      const fileName = `rekomendasi_rakor_2027_${Date.now()}.pdf`;
      const { error: upErr } = await sb.storage
        .from("dokumen_rakor")
        .upload(fileName, file, { cacheControl: "3600", upsert: true });

      if (upErr) {
        btn.disabled = false;
        btn.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> Simpan & Publikasikan PDF`;
        return toast("Gagal mengunggah file PDF.");
      }
      const { data: pubData } = sb.storage.from("dokumen_rakor").getPublicUrl(fileName);
      finalUrl = pubData?.publicUrl || "";
    }

    const updated = {
      kode_menu: "rekomendasi_2027",
      judul,
      deskripsi,
      url_link: finalUrl,
      status_tersedia: finalUrl ? "Tersedia PDF" : "Segera Hadir"
    };

    await sb.from("info_layanan").upsert([updated]);
    toast("Dokumen Rekomendasi Rakor 2027 berhasil diperbarui!");
    if (reloadCallback) await reloadCallback();
    openProdukRakorModal(activeUser, [updated], reloadCallback);
  });

  document.getElementById("btnDeleteRekomPdf")?.addEventListener("click", async () => {
    if (!isEditor || !confirm("Hapus file PDF Rekomendasi saat ini?")) return;
    const updated = {
      kode_menu: "rekomendasi_2027",
      judul: rekomItem.judul,
      deskripsi: rekomItem.deskripsi,
      url_link: "",
      status_tersedia: "Segera Hadir"
    };
    await sb.from("info_layanan").upsert([updated]);
    toast("File PDF Rekomendasi dihapus.");
    if (reloadCallback) await reloadCallback();
    openProdukRakorModal(activeUser, [updated], reloadCallback);
  });
}

// =========================================================================
// GENERATOR PDF MATRIKS PROGRAM KERJA & REKOMENDASI K3S 2027 BER-KOP RESMI
// =========================================================================
async function generatePdfMatriksProker(judulKategori, listItems, catatanRekomendasi = "") {
  toast("Menyiapkan dokumen PDF resmi ber-Kop K3S...");
  await ensureJsPdfLoaded();
  const logoImg = await preloadLogo();

  const canvas = document.createElement("canvas");
  canvas.width = 1123; // A4 Landscape agar 9 kolom muat lebar & jelas
  canvas.height = 794;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Kop Surat Resmi K3S Kota Kupang
  if (logoImg) {
    ctx.drawImage(logoImg, 55, 22, 105, 95);
  }

  const centerX = canvas.width / 2 + 25;
  ctx.textAlign = "center";
  ctx.fillStyle = "#0f172a";
  ctx.font = "bold 15px 'Plus Jakarta Sans', Arial, sans-serif";
  ctx.fillText("PEMERINTAH KOTA KUPANG • DINAS PENDIDIKAN DAN KEBUDAYAAN KOTA KUPANG", centerX, 38);

  ctx.font = "800 18px 'Plus Jakarta Sans', Arial, sans-serif";
  ctx.fillText("KELOMPOK KERJA KEPALA SEKOLAH (K3S) SD/MI KOTA KUPANG", centerX, 62);

  ctx.fillStyle = "#1e3a8a";
  ctx.font = "800 16px 'Plus Jakarta Sans', Arial, sans-serif";
  ctx.fillText("PANITIA PELAKSANA RAKOR KEPALA SD/MI KOTA KUPANG 2026", centerX, 84);

  ctx.fillStyle = "#334155";
  ctx.font = "bold 11px 'Plus Jakarta Sans', Arial, sans-serif";
  ctx.fillText("SEKRETARIAT: SD NCIPS - JL. KENANGA, NO. 01 NAIKOLAN - KUPANG | Email: k3s.sdmikotakupang@gmail.com", centerX, 103);

  ctx.strokeStyle = "#0f172a";
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(40, 118); ctx.lineTo(canvas.width - 40, 118); ctx.stroke();

  // Judul Tabel
  ctx.fillStyle = "#0f172a";
  ctx.font = "800 15px 'Plus Jakarta Sans', Arial, sans-serif";
  const docHeader = judulKategori.includes("BOSP")
    ? "MATRIKS PROGRAM KEGIATAN K3S SD/MI KOTA KUPANG TAHUN 2027 (SUMBER DANA BOSP)"
    : judulKategori === "Draft"
    ? "DRAFT RANCANGAN PROGRAM KERJA K3S SD/MI KOTA KUPANG TAHUN 2027"
    : "MATRIKS PROGRAM KERJA & REKOMENDASI K3S SD/MI KOTA KUPANG TAHUN 2027";
  ctx.fillText(docHeader, canvas.width / 2, 144);

  let startY = 160;
  if (catatanRekomendasi) {
    ctx.font = "italic 11px 'Plus Jakarta Sans', Arial, sans-serif";
    ctx.fillStyle = "#334155";
    ctx.fillText(`Rumusan Rekomendasi: "${String(catatanRekomendasi).slice(0, 135)}"`, canvas.width / 2, 160);
    startY = 172;
  }

  // Tabel 9 Kolom Utama
  const startX = 35;
  const colW = [28, 130, 185, 135, 95, 110, 95, 90, 105, 80];
  const headers = ["No", "Bidang K3S", "Uraian Kegiatan", "Tujuan & Sasaran", "Sumber Dana", "Besaran Dana", "Waktu", "PJ", "Hasil Diharapkan", "Ket."];

  ctx.fillStyle = "#0f172a";
  ctx.fillRect(startX, startY, 1053, 28);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 9.5px 'Plus Jakarta Sans', Arial, sans-serif";
  ctx.textAlign = "left";

  let cx = startX;
  headers.forEach((h, i) => {
    ctx.fillText(h, cx + 4, startY + 18);
    cx += colW[i];
  });

  let y = startY + 28;
  listItems.slice(0, 14).forEach((item, idx) => {
    const rowH = 30;
    ctx.fillStyle = idx % 2 === 0 ? "#f8fafc" : "#ffffff";
    ctx.fillRect(startX, y, 1053, rowH);
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 0.8;
    ctx.strokeRect(startX, y, 1053, rowH);

    const cells = [
      String(idx + 1),
      String(item.bidang || "").replace("BIDANG ", "").slice(0, 22),
      String(item.uraian_kegiatan || "").slice(0, 34),
      String((item.tujuan_kegiatan || "") + " (" + (item.sasaran || "") + ")").slice(0, 26),
      String(item.sumber_dana || "").slice(0, 16),
      formatRp(item.besaran_dana),
      String(item.waktu_pelaksanaan || item.bulan_pelaksanaan || "").slice(0, 16),
      String(item.penanggung_jawab || "").slice(0, 15),
      String(item.hasil_diharapkan || "").slice(0, 19),
      String(item.keterangan || "").slice(0, 14)
    ];

    let curX = startX;
    cells.forEach((txt, cIdx) => {
      ctx.fillStyle = cIdx === 5 ? "#047857" : "#0f172a";
      ctx.font = (cIdx === 2 || cIdx === 5) ? "bold 9px 'Plus Jakarta Sans', Arial, sans-serif" : "9px 'Plus Jakarta Sans', Arial, sans-serif";
      ctx.fillText(txt, curX + 4, y + 19);
      curX += colW[cIdx];
    });
    y += rowH;
  });

  // Blok Pengesahan di Bawah
  const signY = Math.min(y + 30, 680);
  ctx.fillStyle = "#0f172a";
  ctx.font = "bold 11px 'Plus Jakarta Sans', Arial, sans-serif";
  ctx.fillText("Mengetahui,", 90, signY);
  ctx.fillText("Ketua K3S / Penanggung Jawab", 90, signY + 16);
  ctx.fillText("Ketua Panitia Pelaksana,", 460, signY + 16);
  ctx.fillText("Surahman Husain, S.Pd.", 460, signY + 75);

  ctx.fillText("Ditetapkan di: Kupang, 28 November 2026", 800, signY);
  ctx.fillText("Sekretaris Panitia,", 800, signY + 16);
  ctx.fillText("Emanuel Nata Huler, S.Pd., Gr.", 800, signY + 75);

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [1123, 794] });
  pdf.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, 1123, 794);
  pdf.save(`Produk_Rakor_K3S_2027_${judulKategori}.pdf`);
  toast("PDF Produk Rakor 2027 berhasil diunduh!");
}
