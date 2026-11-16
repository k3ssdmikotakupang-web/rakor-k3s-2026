// js/produk_rakor.js
// Mencakup:
// 1. Grid Menu Layanan: Baris Pertama Khusus Panitia (SK Panitia, Job Deskripsi, Meeting Panitia) + 9 Menu Standar
// 2. Modal SK Panitia (View/Download untuk Panitia, Upload PDF khusus Sekretaris)
// 3. Modal Job Deskripsi Interaktif (Terhubung langsung ke tabel manajemen_tugas / Kinerja + Pengingat Berkala)
// 4. Modal Meeting Panitia (Info Rapat, Notulen & Dokumentasi Foto/Video - Upload khusus Sekretaris)
// 5. Modal Produk Rakor & Program Kerja K3S 2027 (Draft Multi-Format Word/Excel/Sheet/PDF, Disahkan, Kalender, BOSP, Rekomendasi)

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

export const DIVISI_PANITIA_LIST = [
  "Penanggung Jawab",
  "Ketua Panitia",
  "Sekretaris",
  "Bendahara",
  "Seksi Kesekretariatan",
  "Seksi Acara dan Humas",
  "Seksi Konsumsi",
  "Seksi Perlengkapan, Dokumentasi, dan Publikasi",
  "Seksi Keamanan dan Ketertiban"
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
let activeProdukTab = "disepakati";
let filterBidang = "ALL";
let filterBulan = "ALL";
let editingProkerId = null;
let showInputForm = false;
let logoImgCache = null;

let cachedMainGridContainer = null;
let cachedLayananSectionCard = null;
let isEnforcingLayout = false;

// State untuk Job Deskripsi & Meeting Panitia
let jobDeskFilterDivisi = "MY_DIVISI";
let jobDeskFilterPhase = "ALL";
let showMeetingForm = false;
let editingMeetingId = null;

// Otoritas Khusus Sekretaris (Untuk Upload SK Panitia & Meeting Panitia)
export function isStrictSekretaris(activeUser) {
  return Boolean(
    activeUser &&
    activeUser.role === "panitia" &&
    activeUser.profile?.divisi === "Sekretaris"
  );
}

export function canManageProdukRakor(activeUser) {
  return Boolean(
    activeUser &&
    activeUser.role === "panitia" &&
    activeUser.profile &&
    ["Sekretaris", "Seksi Kesekretariatan"].includes(activeUser.profile.divisi)
  );
}

function canManagePanitiaTicker(activeUser) {
  return Boolean(
    activeUser &&
    activeUser.role === "panitia" &&
    activeUser.profile &&
    [
      "Penanggung Jawab",
      "Ketua Panitia",
      "Sekretaris",
      "Seksi Konsumsi"
    ].includes(activeUser.profile.divisi)
  );
}

function canToggleDivisionTaskInJobDesk(user, targetDivisi) {
  if (!user || user.role !== "panitia" || !user.profile) return false;
  const userDivisi = user.profile.divisi;
  if (["Ketua Panitia", "Sekretaris"].includes(userDivisi)) return true;
  return userDivisi === targetDivisi;
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
// 1. PENATAAN GRID MENU LAYANAN:
// - BARIS PERTAMA (KHUSUS PANITIA): SK Panitia, Job Deskripsi, Meeting Panitia
// - BARIS BERIKUTNYA (PESERTA & PANITIA): 9 Menu Standar
// =========================================================================
export function renderProdukRakorAndUniformCards(activeUser, layananList, reloadCallback) {
  if (!cachedMainGridContainer || !document.body.contains(cachedMainGridContainer)) {
    const anyBtn = document.querySelector('[data-service="undangan"], [data-service="panduan"], [data-service="kamar"], .service-menu-btn');
    if (anyBtn) {
      cachedMainGridContainer = anyBtn.parentElement;
      cachedLayananSectionCard = cachedMainGridContainer.closest(".bg-white") || cachedMainGridContainer.parentElement;
    }
  }

  const gridContainer = cachedMainGridContainer;
  if (!gridContainer) return;

  gridContainer.id = "k3sUniformNineGrid";
  gridContainer.className = "grid grid-cols-3 gap-2.5";

  const isPanitiaUser = Boolean(activeUser && activeUser.role === "panitia");

  const getOrCreateServiceBtn = (serviceCode, fallbackSelector = "") => {
    let btn = document.querySelector(`[data-service="${serviceCode}"]`);
    if (!btn && fallbackSelector) {
      btn = document.querySelector(fallbackSelector);
    }
    if (!btn) {
      btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.service = serviceCode;
      btn.className = "service-menu-btn";
    }
    return btn;
  };

  const styleGridTile = (btn, bgBoxClass, iconClass, titleText, badgeText, badgeClass, badgeId = "", isSpecialPanitiaRow = false) => {
    if (!btn) return;
    btn.className = isSpecialPanitiaRow
      ? "service-grid-tile p-3 rounded-2xl bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 hover:from-slate-800 hover:to-blue-900 border-2 border-amber-400/50 flex flex-col items-center justify-between text-center gap-1.5 active:scale-95 transition shadow-sm"
      : "service-menu-btn service-grid-tile p-3 rounded-2xl bg-slate-50 hover:bg-blue-50/60 border border-slate-200/90 flex flex-col items-center justify-between text-center gap-1.5 active:scale-95 transition shadow-2xs";

    btn.innerHTML = `
      <div class="w-10 h-10 rounded-2xl ${bgBoxClass} flex items-center justify-center text-base shadow-xs shrink-0">
        <i class="fa-solid ${iconClass}"></i>
      </div>
      <span class="text-[11px] font-extrabold ${isSpecialPanitiaRow ? 'text-white' : 'text-slate-800'} leading-tight line-clamp-1">${titleText}</span>
      <span ${badgeId ? `id="${badgeId}"` : ""} class="text-[9px] font-bold ${badgeClass} px-2 py-0.5 rounded-full truncate max-w-full">${badgeText}</span>
    `;
  };

  // --- 3 TOMBOL MENU BARIS PERTAMA (KHUSUS USER PANITIA) ---
  let btnSkPanitia = document.getElementById("btnServiceSkPanitia");
  let btnJobDeskripsi = document.getElementById("btnServiceJobDeskripsi");
  let btnMeetingPanitia = document.getElementById("btnServiceMeetingPanitia");

  if (isPanitiaUser) {
    if (!btnSkPanitia) {
      btnSkPanitia = document.createElement("button");
      btnSkPanitia.id = "btnServiceSkPanitia";
      btnSkPanitia.type = "button";
    }
    const skRec = (layananList || []).find(x => x.kode_menu === "sk_panitia_2026");
    const hasSk = Boolean(skRec && skRec.url_link && skRec.url_link.trim() !== "");
    styleGridTile(
      btnSkPanitia,
      "bg-amber-400 text-slate-950",
      "fa-file-shield",
      "SK Panitia",
      hasSk ? "✓ Tersedia PDF" : "Dokumen SK",
      hasSk ? "bg-emerald-400 text-slate-950" : "bg-amber-400/20 text-amber-300 border border-amber-400/30",
      "",
      true
    );
    btnSkPanitia.onclick = () => openSkPanitiaModal(activeUser, layananList, reloadCallback);

    if (!btnJobDeskripsi) {
      btnJobDeskripsi = document.createElement("button");
      btnJobDeskripsi.id = "btnServiceJobDeskripsi";
      btnJobDeskripsi.type = "button";
    }
    styleGridTile(
      btnJobDeskripsi,
      "bg-emerald-400 text-slate-950",
      "fa-list-check",
      "Job Deskripsi",
      "Update Berkala",
      "bg-emerald-400/20 text-emerald-300 border border-emerald-400/30",
      "",
      true
    );
    btnJobDeskripsi.onclick = () => openJobDeskripsiModal(activeUser, reloadCallback);

    if (!btnMeetingPanitia) {
      btnMeetingPanitia = document.createElement("button");
      btnMeetingPanitia.id = "btnServiceMeetingPanitia";
      btnMeetingPanitia.type = "button";
    }
    styleGridTile(
      btnMeetingPanitia,
      "bg-sky-400 text-slate-950",
      "fa-users-viewfinder",
      "Meeting Panitia",
      "Notulen & Foto",
      "bg-sky-400/20 text-sky-300 border border-sky-400/30",
      "",
      true
    );
    btnMeetingPanitia.onclick = () => openMeetingPanitiaModal(activeUser, layananList, reloadCallback);
  } else {
    // Jika yang login adalah Peserta, hapus ke-3 tombol khusus panitia ini agar tidak terlihat
    btnSkPanitia?.remove();
    btnJobDeskripsi?.remove();
    btnMeetingPanitia?.remove();
  }

  // --- 9 TOMBOL MENU LAYANAN STANDAR ---
  const btnUndangan = getOrCreateServiceBtn("undangan");
  const btnPanduan = getOrCreateServiceBtn("panduan");
  const btnDokumentasi = getOrCreateServiceBtn("dokumentasi");
  const btnKamar = getOrCreateServiceBtn("kamar");
  const btnMateri = getOrCreateServiceBtn("materi");
  const btnSertifikat = getOrCreateServiceBtn("sertifikat");
  const btnLaporan = getOrCreateServiceBtn(
    "laporan",
    '[data-service="lpj"], [data-service="lph"], [data-service="laporan_rakor"]'
  );

  let btnProduk = document.getElementById("btnServiceProdukRakor");
  if (!btnProduk) {
    btnProduk = document.createElement("button");
    btnProduk.id = "btnServiceProdukRakor";
    btnProduk.type = "button";
  }
  btnProduk.onclick = () => openProdukRakorModal(activeUser, layananList, reloadCallback);

  let btnTentang = document.getElementById("btnServiceTentangAplikasi");
  if (!btnTentang) {
    btnTentang = document.createElement("button");
    btnTentang.id = "btnServiceTentangAplikasi";
    btnTentang.type = "button";
  }
  btnTentang.onclick = () => openTentangAplikasiModal();

  const currentKamarText = isPanitiaUser
    ? "Atur Kamar"
    : (activeUser?.profile?.nomor_kamar && activeUser.profile.nomor_kamar !== "Belum Ditentukan"
        ? activeUser.profile.nomor_kamar
        : "Cek Kamar");

  styleGridTile(btnUndangan, "bg-blue-900 text-amber-300", "fa-envelope-open-text", "Surat Undangan", "Resmi PDF", "bg-blue-100 text-blue-900");
  styleGridTile(btnPanduan, "bg-indigo-700 text-white", "fa-book-open", "Buku Panduan", "Pedoman", "bg-indigo-100 text-indigo-900");
  styleGridTile(btnDokumentasi, "bg-sky-600 text-white", "fa-camera-retro", "Dokumentasi", "Galeri Foto", "bg-sky-100 text-sky-900");

  styleGridTile(btnKamar, "bg-violet-700 text-amber-300", "fa-bed", "Info Kamar", currentKamarText, "bg-violet-100 text-violet-900", "badgeHomeKamar");
  styleGridTile(btnMateri, "bg-teal-700 text-white", "fa-chalkboard-user", "Materi Rakor", "Narasumber", "bg-teal-100 text-teal-900");
  styleGridTile(btnProduk, "bg-emerald-700 text-amber-300", "fa-briefcase", "Produk Rakor", "Proker 2027", "bg-emerald-100 text-emerald-900");

  styleGridTile(btnSertifikat, "bg-amber-500 text-slate-950", "fa-award", "Sertifikat", "Pola 32 JP", "bg-amber-100 text-amber-900");
  styleGridTile(btnLaporan, "bg-rose-700 text-white", "fa-file-contract", "Laporan/LPH", "Dokumen", "bg-rose-100 text-rose-900");
  styleGridTile(btnTentang, "bg-slate-900 text-amber-300", "fa-mobile-screen-button", "Tentang Aplikasi", "Install & Paten", "bg-slate-200 text-slate-800");

  // Susun urutan tombol: Jika Panitia -> 3 Menu Panitia di Baris Pertama + 9 Menu Standar. Jika Peserta -> 9 Menu Standar.
  const orderedGridButtons = isPanitiaUser
    ? [
        btnSkPanitia,
        btnJobDeskripsi,
        btnMeetingPanitia,
        btnUndangan,
        btnPanduan,
        btnDokumentasi,
        btnKamar,
        btnMateri,
        btnProduk,
        btnSertifikat,
        btnLaporan,
        btnTentang
      ]
    : [
        btnUndangan,
        btnPanduan,
        btnDokumentasi,
        btnKamar,
        btnMateri,
        btnProduk,
        btnSertifikat,
        btnLaporan,
        btnTentang
      ];

  const enforceCleanLayout = () => {
    if (isEnforcingLayout) return;
    isEnforcingLayout = true;

    try {
      const layananCard = cachedLayananSectionCard || gridContainer.closest(".bg-white") || gridContainer.parentElement;
      const subrayonBarsEl = document.getElementById("homeSubrayonBars");
      const subrayonSectionCard = subrayonBarsEl ? (subrayonBarsEl.closest(".bg-white") || subrayonBarsEl.parentElement) : null;

      if (layananCard && layananCard.parentElement) {
        const parentBeranda = layananCard.parentElement;

        let middleSlot = document.getElementById("berandaMiddleSlotContainer");
        if (!middleSlot) {
          middleSlot = document.createElement("div");
          middleSlot.id = "berandaMiddleSlotContainer";
          middleSlot.className = "space-y-3.5";
        }

        if (subrayonSectionCard && subrayonSectionCard.parentElement === parentBeranda) {
          parentBeranda.insertBefore(middleSlot, subrayonSectionCard);
        } else {
          layananCard.insertAdjacentElement("afterend", middleSlot);
        }

        const userDivisi = activeUser?.profile?.divisi || "";
        const hasSubrayonDuty = Boolean(activeUser?.profile?.tugas_subrayon && activeUser.profile.tugas_subrayon.trim() !== "");

        const allowKeuangan = isPanitiaUser && (["Penanggung Jawab", "Ketua Panitia", "Sekretaris", "Bendahara"].includes(userDivisi) || hasSubrayonDuty);
        const allowSpjToggle = isPanitiaUser && ["Sekretaris", "Bendahara", "Seksi Kesekretariatan"].includes(userDivisi);
        const allowIdCardPrint = isPanitiaUser && ["Sekretaris", "Seksi Kesekretariatan"].includes(userDivisi);

        if (!allowKeuangan) document.getElementById("btnServiceInfoKeuangan")?.remove();
        if (!allowSpjToggle) document.getElementById("panitiaSpjControlWidget")?.remove();
        if (!allowIdCardPrint) document.getElementById("btnServiceBulkIdCards")?.remove();
        if (!isPanitiaUser) {
          document.getElementById("btnServiceRekapProfilKepsek")?.remove();
          document.getElementById("btnServiceCatatanPanitia")?.remove();
        }

        let panitiaSpecialCard = document.getElementById("panitiaSpecialAccessSection");

        if (isPanitiaUser) {
          if (!panitiaSpecialCard) {
            panitiaSpecialCard = document.createElement("div");
            panitiaSpecialCard.id = "panitiaSpecialAccessSection";
            panitiaSpecialCard.className = "bg-white rounded-3xl p-4 border-2 border-indigo-100 shadow-sm space-y-3";
            panitiaSpecialCard.innerHTML = `
              <div class="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <div class="flex items-center gap-2">
                  <div class="w-8 h-8 rounded-xl bg-slate-900 text-amber-300 flex items-center justify-center text-xs shadow-2xs">
                    <i class="fa-solid fa-user-shield"></i>
                  </div>
                  <div>
                    <h3 class="font-extrabold text-xs text-slate-900 uppercase tracking-tight">Khusus Panitia & Akses Khusus</h3>
                    <p class="text-[10px] text-slate-500">Manajemen Keuangan, Rekap Profil, Evaluasi & Koordinasi</p>
                  </div>
                </div>
                <span id="badgePanitiaRoleActive" class="text-[9px] font-extrabold uppercase bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded-full">
                  ${userDivisi || 'Internal Panitia'}
                </span>
              </div>
              <div id="panitiaInternalTickerSlot"></div>
              <div id="panitiaSpecialCardsBox" class="space-y-2.5"></div>
            `;
          } else {
            const roleBadge = document.getElementById("badgePanitiaRoleActive");
            if (roleBadge) roleBadge.textContent = userDivisi || "Internal Panitia";
          }

          middleSlot.appendChild(panitiaSpecialCard);
          renderPanitiaInternalTicker(activeUser, layananList, reloadCallback);

          const cardsBox = document.getElementById("panitiaSpecialCardsBox");
          if (cardsBox) {
            const panitiaCardIds = [
              "btnServiceInfoKeuangan",
              "btnServiceRekapProfilKepsek",
              "btnServiceCatatanPanitia",
              "panitiaSpjControlWidget",
              "btnServiceBulkIdCards"
            ];

            panitiaCardIds.forEach(id => {
              const el = document.getElementById(id);
              if (el) {
                el.classList.remove("col-span-3");
                el.classList.add("w-full");
                cardsBox.appendChild(el);
              }
            });

            Array.from(gridContainer.children).forEach(child => {
              if (!orderedGridButtons.includes(child) && child.id !== "btnServiceStatistikSekolah") {
                child.classList.remove("col-span-3");
                child.classList.add("w-full");
                cardsBox.appendChild(child);
              }
            });
          }
        } else {
          if (panitiaSpecialCard) panitiaSpecialCard.remove();
          Array.from(gridContainer.children).forEach(child => {
            if (!orderedGridButtons.includes(child) && child.id !== "btnServiceStatistikSekolah") {
              child.remove();
            }
          });
        }

        const statCard = document.getElementById("btnServiceStatistikSekolah");
        if (statCard) {
          statCard.classList.remove("col-span-3");
          statCard.classList.add("w-full");
          middleSlot.appendChild(statCard);
        }
      }

      orderedGridButtons.forEach(btn => {
        if (btn) gridContainer.appendChild(btn);
      });
    } finally {
      isEnforcingLayout = false;
    }
  };

  enforceCleanLayout();
  setTimeout(enforceCleanLayout, 180);
  setTimeout(enforceCleanLayout, 550);
}

// =========================================================================
// MENU BARU 1: MODAL "SK PANITIA" (TAMPILKAN PDF SK, UPLOAD KHUSUS SEKRETARIS)
// =========================================================================
export async function openSkPanitiaModal(activeUser, layananList, reloadCallback) {
  if (!activeUser || activeUser.role !== "panitia") {
    return toast("Menu SK Panitia hanya dapat diakses oleh Panitia!");
  }

  const modal = document.getElementById("serviceModal");
  const titleEl = document.getElementById("serviceModalTitle");
  const bodyEl = document.getElementById("serviceModalBody");
  if (!modal || !titleEl || !bodyEl) return;

  modal.classList.remove("hidden");
  titleEl.innerHTML = `<i class="fa-solid fa-file-shield text-blue-900 mr-1.5"></i> SK Kepanitiaan Rakor K3S 2026`;

  const { data: freshSk } = await sb
    .from("info_layanan")
    .select("*")
    .eq("kode_menu", "sk_panitia_2026")
    .maybeSingle();

  const skItem = freshSk || (layananList || []).find(x => x.kode_menu === "sk_panitia_2026") || {
    kode_menu: "sk_panitia_2026",
    judul: "Surat Keputusan (SK) Panitia Pelaksana Rakor Kepala SD/MI Kota Kupang 2026",
    deskripsi: "Dokumen resmi penetapan susunan personalia dan uraian tugas Panitia Rakor K3S SD/MI Kota Kupang (26–28 November 2026).",
    url_link: "",
    status_tersedia: "Menunggu Upload Sekretaris"
  };

  const isSekretaris = isStrictSekretaris(activeUser);
  const hasPdf = Boolean(skItem.url_link && skItem.url_link.trim() !== "");

  bodyEl.innerHTML = `
    <div class="p-4 rounded-3xl bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 text-white space-y-2.5 shadow-lg border border-amber-400/40">
      <div class="flex items-center justify-between">
        <span class="text-[9px] font-extrabold uppercase tracking-wider bg-amber-400 text-slate-950 px-2.5 py-0.5 rounded-full">
          Dokumen Legalitas Kepanitiaan
        </span>
        <span class="text-[10px] font-extrabold ${hasPdf ? 'text-emerald-300' : 'text-amber-300'}">
          ${hasPdf ? '✓ PDF SK Tersedia' : '⏳ Belum Diunggah'}
        </span>
      </div>
      <div>
        <h4 class="text-sm font-extrabold text-white leading-snug">${skItem.judul}</h4>
        <p class="text-[10px] text-blue-200 mt-1 leading-relaxed">${skItem.deskripsi}</p>
      </div>

      ${hasPdf ? `
        <div class="pt-1 flex gap-2">
          <a href="${skItem.url_link}" target="_blank" rel="noopener noreferrer" download class="flex-1 py-2.5 px-3 rounded-2xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold text-xs shadow flex items-center justify-center gap-2 transition">
            <i class="fa-solid fa-file-arrow-down"></i>
            <span>Buka / Download PDF SK Panitia</span>
          </a>
        </div>
      ` : `
        <div class="p-3 rounded-2xl bg-white/10 border border-white/15 text-center text-[11px] text-amber-200 font-semibold">
          <i class="fa-solid fa-clock mr-1"></i> Dokumen PDF SK Panitia sedang disiapkan untuk diunggah oleh <b>Sekretaris Panitia</b>.
        </div>
      `}
    </div>

    ${hasPdf && skItem.url_link.toLowerCase().includes('.pdf') ? `
      <div class="rounded-2xl overflow-hidden border-2 border-slate-200 bg-slate-100 h-80">
        <iframe src="${skItem.url_link}" class="w-full h-full" title="Preview SK Panitia"></iframe>
      </div>
    ` : ''}

    <!-- FORM UPLOAD KHUSUS SEKRETARIS -->
    ${isSekretaris ? `
      <div class="p-4 rounded-2xl bg-blue-50 border-2 border-blue-300 space-y-3 shadow-2xs">
        <div class="flex items-center justify-between border-b border-blue-200 pb-2">
          <span class="font-extrabold text-xs text-blue-950">
            <i class="fa-solid fa-cloud-arrow-up text-blue-700 mr-1"></i> Upload / Perbarui PDF SK Panitia
          </span>
          <span class="text-[9px] font-extrabold uppercase bg-blue-900 text-amber-300 px-2 py-0.5 rounded">
            Otoritas Sekretaris
          </span>
        </div>

        <div>
          <label class="block text-[10px] font-bold text-slate-700 mb-1">1. Pilih File PDF SK Panitia (.PDF):</label>
          <input id="inpSkPanitiaFile" type="file" accept=".pdf,application/pdf" class="w-full rounded-xl border border-blue-300 bg-white px-3 py-1.5 text-xs font-semibold file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:bg-blue-900 file:text-white file:text-[10px] file:font-extrabold" />
        </div>

        <div>
          <label class="block text-[10px] font-bold text-slate-700 mb-1">Atau Tempel Link Google Drive PDF SK (Opsional):</label>
          <input id="inpSkPanitiaUrl" type="url" value="${skItem.url_link || ''}" placeholder="https://drive.google.com/..." class="w-full rounded-xl border border-blue-300 bg-white px-3 py-2 text-xs font-semibold" />
        </div>

        <div>
          <label class="block text-[10px] font-bold text-slate-700 mb-1">Nomor & Judul SK Panitia:</label>
          <input id="inpSkPanitiaJudul" type="text" value="${skItem.judul || ''}" class="w-full rounded-xl border border-blue-300 bg-white px-3 py-2 text-xs font-bold mb-1.5" />
          <textarea id="inpSkPanitiaDesc" rows="2" class="w-full rounded-xl border border-blue-300 bg-white px-3 py-1.5 text-xs font-semibold">${skItem.deskripsi || ''}</textarea>
        </div>

        <div class="flex gap-2">
          <button type="button" id="btnSaveSkPanitiaNow" class="flex-1 py-2.5 rounded-xl bg-blue-900 hover:bg-blue-800 text-white font-extrabold text-xs shadow flex items-center justify-center gap-1.5">
            <i class="fa-solid fa-floppy-disk"></i>
            <span>Simpan & Publikasikan SK Panitia</span>
          </button>
          ${hasPdf ? `
            <button type="button" id="btnDeleteSkPanitiaNow" class="px-3.5 py-2.5 rounded-xl bg-rose-100 hover:bg-rose-200 text-rose-700 font-extrabold text-xs">
              Hapus
            </button>
          ` : ''}
        </div>
      </div>
    ` : `
      <div class="text-[10px] text-center text-slate-400 font-semibold">
        <i class="fa-solid fa-lock mr-1"></i> Dokumen SK Panitia hanya dapat diunggah atau diperbarui oleh <b>Sekretaris Panitia</b>.
      </div>
    `}
  `;

  document.getElementById("btnSaveSkPanitiaNow")?.addEventListener("click", async () => {
    if (!isSekretaris) return;
    const file = document.getElementById("inpSkPanitiaFile")?.files?.[0];
    let finalUrl = document.getElementById("inpSkPanitiaUrl")?.value.trim() || "";
    const judul = document.getElementById("inpSkPanitiaJudul")?.value.trim() || "SK Panitia Pelaksana Rakor K3S 2026";
    const deskripsi = document.getElementById("inpSkPanitiaDesc")?.value.trim() || "";

    const btn = document.getElementById("btnSaveSkPanitiaNow");
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner animate-spin"></i> Mengunggah PDF SK...`;

    if (file) {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'pdf';
      const fileName = `sk_panitia_rakor2026_${Date.now()}.${ext}`;
      const { error: upErr } = await sb.storage
        .from("dokumen_rakor")
        .upload(fileName, file, { cacheControl: "3600", upsert: true });

      if (upErr) {
        btn.disabled = false;
        btn.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> Simpan & Publikasikan SK Panitia`;
        return toast("Gagal mengunggah file PDF SK Panitia.");
      }
      const { data: pubData } = sb.storage.from("dokumen_rakor").getPublicUrl(fileName);
      finalUrl = pubData?.publicUrl || "";
    }

    if (!finalUrl) {
      btn.disabled = false;
      btn.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> Simpan & Publikasikan SK Panitia`;
      return toast("Pilih file PDF SK atau masukkan link terlebih dahulu!");
    }

    const payload = {
      kode_menu: "sk_panitia_2026",
      judul,
      deskripsi,
      url_link: finalUrl,
      status_tersedia: "Tersedia PDF"
    };

    await sb.from("info_layanan").upsert([payload]);
    toast("Dokumen PDF SK Panitia berhasil dipublikasikan!");
    if (reloadCallback) await reloadCallback();
    openSkPanitiaModal(activeUser, [payload], reloadCallback);
  });

  document.getElementById("btnDeleteSkPanitiaNow")?.addEventListener("click", async () => {
    if (!isSekretaris || !confirm("Hapus dokumen PDF SK Panitia saat ini?")) return;
    const payload = {
      kode_menu: "sk_panitia_2026",
      judul: skItem.judul,
      deskripsi: skItem.deskripsi,
      url_link: "",
      status_tersedia: "Belum Diunggah"
    };
    await sb.from("info_layanan").upsert([payload]);
    toast("File PDF SK Panitia dihapus.");
    if (reloadCallback) await reloadCallback();
    openSkPanitiaModal(activeUser, [payload], reloadCallback);
  });
}

// =========================================================================
// MENU BARU 2: MODAL "JOB DESKRIPSI" (TERINTEGRASI TABEL KINERJA + PENGINGAT BERKALA)
// =========================================================================
export async function openJobDeskripsiModal(activeUser, reloadCallback) {
  if (!activeUser || activeUser.role !== "panitia") {
    return toast("Menu Job Deskripsi hanya untuk Panitia!");
  }

  const modal = document.getElementById("serviceModal");
  const titleEl = document.getElementById("serviceModalTitle");
  const bodyEl = document.getElementById("serviceModalBody");
  if (!modal || !titleEl || !bodyEl) return;

  modal.classList.remove("hidden");
  titleEl.innerHTML = `<i class="fa-solid fa-list-check text-emerald-700 mr-1.5"></i> Job Deskripsi & Update Kinerja`;

  bodyEl.innerHTML = `
    <div class="p-6 text-center text-xs font-bold text-slate-500">
      <i class="fa-solid fa-spinner animate-spin mr-1.5 text-emerald-600"></i> Memuat rincian Job Deskripsi & capaian kinerja...
    </div>
  `;

  const { data: allTasks } = await sb
    .from("manajemen_tugas")
    .select("*")
    .order("deadline", { ascending: true });

  const tasks = allTasks || [];
  renderJobDeskripsiModalBody(activeUser, tasks, bodyEl, reloadCallback);
}

function renderJobDeskripsiModalBody(activeUser, tasks, bodyEl, reloadCallback) {
  const myDivisi = activeUser.profile?.divisi || "Panitia";
  const myName = activeUser.profile?.nama_panitia || "Anggota Panitia";

  if (jobDeskFilterDivisi === "MY_DIVISI") {
    jobDeskFilterDivisi = myDivisi;
  }

  const myDivTasks = tasks.filter(t => t.divisi === myDivisi);
  const myDivDone = myDivTasks.filter(t => t.status === "Selesai").length;
  const myDivPending = myDivTasks.length - myDivDone;
  const myDivPct = myDivTasks.length > 0 ? Math.round((myDivDone / myDivTasks.length) * 100) : 0;

  const totalAllDone = tasks.filter(t => t.status === "Selesai").length;
  const totalAllPct = tasks.length > 0 ? Math.round((totalAllDone / tasks.length) * 100) : 0;

  bodyEl.innerHTML = `
    <!-- Kartu Pengingat Aktif & Ringkasan Job Deskripsi Divisi User -->
    <div class="p-4 rounded-3xl bg-gradient-to-br from-slate-900 via-emerald-950 to-slate-900 text-white space-y-3 shadow-lg border border-emerald-400/40">
      <div class="flex items-center justify-between">
        <span class="text-[9px] font-extrabold uppercase tracking-wider bg-amber-400 text-slate-950 px-2.5 py-0.5 rounded-full">
          Job Deskripsi: ${myDivisi}
        </span>
        <span class="text-xs font-extrabold text-emerald-300">Total Panitia: ${totalAllPct}%</span>
      </div>

      <div class="flex items-center justify-between gap-3">
        <div class="min-w-0 flex-1">
          <h4 class="text-sm font-extrabold text-white truncate">${myName}</h4>
          <p class="text-[10px] text-emerald-200 mt-0.5">
            Capaian Divisi Anda: <b class="text-amber-300">${myDivDone} Selesai</b> dari <b>${myDivTasks.length} Job Desk</b> (${myDivPending} Belum Selesai)
          </p>
        </div>
        <div class="w-14 h-14 rounded-2xl bg-white/10 border-2 border-emerald-400/50 flex flex-col items-center justify-center shrink-0">
          <span class="text-sm font-extrabold text-amber-300 leading-none">${myDivPct}%</span>
          <span class="text-[8px] text-emerald-200 font-bold mt-0.5">Progres</span>
        </div>
      </div>

      <div class="w-full bg-white/15 h-2 rounded-full overflow-hidden">
        <div class="bg-gradient-to-r from-amber-400 to-emerald-400 h-full rounded-full transition-all duration-300" style="width:${myDivPct}%"></div>
      </div>

      <!-- Banner Himbauan Update Kinerja Secara Berkala -->
      <div class="p-2.5 rounded-2xl bg-amber-400/15 border border-amber-300/40 flex items-start gap-2 text-[10px] text-amber-100 leading-relaxed">
        <i class="fa-solid fa-bell text-amber-300 text-xs mt-0.5 shrink-0 animate-bounce"></i>
        <div>
          <b class="text-amber-300 uppercase">Himbauan Kepanitiaan:</b> Mohon setiap anggota panitia memeriksa rincian <b>Job Deskripsi</b> di bawah ini dan <b>mengupdate (mencentang) progres kinerja secara berkala</b> sesuai tahapan yang telah diselesaikan.
        </div>
      </div>
    </div>

    <!-- Filter Divisi & Tahapan Kerja -->
    <div class="grid grid-cols-2 gap-2">
      <select id="jobDeskSelectDivisi" class="rounded-xl border border-slate-300 bg-slate-50 px-2.5 py-2 text-xs font-extrabold text-emerald-950">
        <option value="ALL" ${jobDeskFilterDivisi === 'ALL' ? 'selected' : ''}>Semua Divisi (${tasks.length} Tugas)</option>
        ${DIVISI_PANITIA_LIST.map(d => `<option value="${d}" ${jobDeskFilterDivisi === d ? 'selected' : ''}>${d === myDivisi ? '⭐ ' + d + ' (Divisi Saya)' : d}</option>`).join('')}
      </select>

      <select id="jobDeskSelectPhase" class="rounded-xl border border-slate-300 bg-slate-50 px-2.5 py-2 text-xs font-bold text-slate-800">
        <option value="ALL" ${jobDeskFilterPhase === 'ALL' ? 'selected' : ''}>Semua Tahapan</option>
        <option value="Perencanaan" ${jobDeskFilterPhase === 'Perencanaan' ? 'selected' : ''}>1. Perencanaan</option>
        <option value="Persiapan" ${jobDeskFilterPhase === 'Persiapan' ? 'selected' : ''}>2. Persiapan</option>
        <option value="Pelaksanaan" ${jobDeskFilterPhase === 'Pelaksanaan' ? 'selected' : ''}>3. Pelaksanaan</option>
        <option value="Pasca-Acara" ${jobDeskFilterPhase === 'Pasca-Acara' ? 'selected' : ''}>4. Pasca-Acara</option>
      </select>
    </div>

    <!-- Daftar Rincian Job Deskripsi (Bisa Langsung Dicentang dari Sini!) -->
    <div id="jobDeskCardsContainer" class="space-y-2 max-h-80 overflow-y-auto pr-0.5"></div>

    <!-- Tombol Pintas ke Menu Kinerja Lengkap -->
    <button type="button" id="btnGoToFullKinerjaTab" class="w-full py-2.5 rounded-2xl bg-slate-900 hover:bg-slate-800 text-amber-300 font-extrabold text-xs shadow flex items-center justify-center gap-2 transition">
      <i class="fa-solid fa-chart-pie"></i>
      <span>Buka Dashboard Penuh Menu Kinerja</span>
    </button>
  `;

  const renderTaskCards = () => {
    const box = document.getElementById("jobDeskCardsContainer");
    if (!box) return;

    let filtered = tasks;
    if (jobDeskFilterDivisi !== "ALL") {
      filtered = filtered.filter(t => t.divisi === jobDeskFilterDivisi);
    }
    if (jobDeskFilterPhase !== "ALL") {
      filtered = filtered.filter(t => t.tahapan === jobDeskFilterPhase);
    }

    if (filtered.length === 0) {
      box.innerHTML = `<div class="p-5 text-center text-xs text-slate-400 bg-slate-50 rounded-2xl border">Belum ada rincian Job Deskripsi pada filter ini.</div>`;
      return;
    }

    box.innerHTML = "";
    filtered.forEach((t, idx) => {
      const isDone = t.status === "Selesai";
      const canToggle = canToggleDivisionTaskInJobDesk(activeUser, t.divisi);

      const card = document.createElement("div");
      card.className = `p-3.5 rounded-2xl bg-white border ${isDone ? 'border-emerald-300 bg-emerald-50/25' : 'border-slate-200'} flex items-start gap-3 shadow-2xs`;
      card.innerHTML = `
        <button type="button" title="${canToggle ? 'Ketuk untuk Update Status Kinerja' : 'Hanya untuk ' + t.divisi}" class="btn-check-jobdesk mt-0.5 w-7 h-7 rounded-xl border-2 flex items-center justify-center shrink-0 transition ${
          canToggle
            ? (isDone ? 'bg-emerald-600 border-emerald-600 text-white cursor-pointer active:scale-90 shadow-2xs' : 'border-slate-300 bg-white hover:border-emerald-600 text-transparent cursor-pointer active:scale-90')
            : (isDone ? 'bg-emerald-600/50 border-emerald-600/50 text-white opacity-60 cursor-not-allowed' : 'bg-slate-100 border-slate-200 text-slate-400 opacity-60 cursor-not-allowed')
        }">
          <i class="fa-solid ${canToggle ? 'fa-check text-xs' : (isDone ? 'fa-check text-xs' : 'fa-lock text-[10px]')}"></i>
        </button>

        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-1.5 flex-wrap">
            <span class="text-[9px] font-extrabold text-slate-400">#${idx + 1}</span>
            <span class="text-[9px] font-extrabold px-2 py-0.5 rounded ${isDone ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}">
              ${isDone ? '✓ SELESAI' : '⏳ BELUM SELESAI'}
            </span>
            <span class="text-[9px] font-bold bg-blue-50 text-blue-800 px-2 py-0.5 rounded">${t.tahapan || 'Persiapan'}</span>
          </div>
          <h5 class="font-extrabold text-xs text-slate-900 mt-1 ${isDone ? 'line-through text-slate-400' : ''}">${t.nama_pekerjaan}</h5>
          <div class="flex items-center justify-between text-[10px] text-slate-500 mt-1">
            <span><i class="fa-solid fa-users-gear mr-1 text-slate-400"></i>${t.divisi}</span>
            <span><i class="fa-regular fa-calendar mr-1 text-slate-400"></i>Target: ${t.deadline || '-'}</span>
          </div>
        </div>
      `;

      card.querySelector(".btn-check-jobdesk")?.addEventListener("click", async () => {
        if (!canToggle) {
          return toast(`Akses Ditolak: Anda hanya dapat mengupdate Job Deskripsi ${myDivisi}!`);
        }
        const nextStatus = isDone ? "Belum Mulai" : "Selesai";
        const waktu = new Date().toLocaleString("id-ID");

        await sb.from("manajemen_tugas").update({
          status: nextStatus,
          waktu_update: waktu
        }).eq("id_tugas", t.id_tugas);

        t.status = nextStatus;
        t.waktu_update = waktu;
        toast(`Progres Job Desk diperbarui: ${nextStatus}!`);
        renderJobDeskripsiModalBody(activeUser, tasks, bodyEl, reloadCallback);
        if (reloadCallback) await reloadCallback();
      });

      box.appendChild(card);
    });
  };

  renderTaskCards();

  document.getElementById("jobDeskSelectDivisi")?.addEventListener("change", (e) => {
    jobDeskFilterDivisi = e.target.value;
    renderTaskCards();
  });

  document.getElementById("jobDeskSelectPhase")?.addEventListener("change", (e) => {
    jobDeskFilterPhase = e.target.value;
    renderTaskCards();
  });

  document.getElementById("btnGoToFullKinerjaTab")?.addEventListener("click", () => {
    document.getElementById("serviceModal")?.classList.add("hidden");
    document.getElementById("footerBtnFifth")?.click();
  });
}

// =========================================================================
// MENU BARU 3: MODAL "MEETING PANITIA" (INFO PENTING, NOTULEN, & DOKUMENTASI FOTO/VIDEO)
// SEMUA INFO, NOTULEN & DOKUMENTASI HANYA BISA DIUPLOAD OLEH SEKRETARIS
// =========================================================================
export async function openMeetingPanitiaModal(activeUser, layananList, reloadCallback) {
  if (!activeUser || activeUser.role !== "panitia") {
    return toast("Menu Meeting Panitia hanya untuk jajaran Panitia!");
  }

  const modal = document.getElementById("serviceModal");
  const titleEl = document.getElementById("serviceModalTitle");
  const bodyEl = document.getElementById("serviceModalBody");
  if (!modal || !titleEl || !bodyEl) return;

  modal.classList.remove("hidden");
  titleEl.innerHTML = `<i class="fa-solid fa-users-viewfinder text-sky-700 mr-1.5"></i> Meeting Panitia, Notulen & Dokumentasi`;

  bodyEl.innerHTML = `
    <div class="p-6 text-center text-xs font-bold text-slate-500">
      <i class="fa-solid fa-spinner animate-spin mr-1.5 text-sky-600"></i> Memuat data rapat, notulen & dokumentasi panitia...
    </div>
  `;

  const { data: rec } = await sb
    .from("info_layanan")
    .select("*")
    .eq("kode_menu", "meeting_panitia_2026")
    .maybeSingle();

  let meetingsList = [];
  if (rec && rec.deskripsi) {
    try {
      const parsed = JSON.parse(rec.deskripsi);
      if (Array.isArray(parsed)) meetingsList = parsed;
    } catch (e) {}
  }

  // Jika belum ada data rapat sama sekali, sediakan 1 contoh entri awal
  if (meetingsList.length === 0) {
    meetingsList = [
      {
        id: "MTG-INIT-01",
        judul: "Rapat Koordinasi Persiapan Akhir Panitia Rakor K3S 2026",
        tanggal: "November 2026",
        lokasi: "Sekretariat K3S — SD NCIPS Kupang",
        info_penting: "Pemantapan kesiapan 6 Sub Rayon, finalisasi kuota kamar hotel, serta kesiapan perangkat pemindai QR Code di 6 pos layanan.",
        notulen_teks: "1. Seluruh Ketua Sub Rayon memastikan pelunasan kontribusi BOSP sebelum H-3.\n2. Seksi Kesekretariatan menyiapkan ID Card Kalung dan draf Proker 2027.\n3. Seksi Acara memastikan materi narasumber siap diunggah ke aplikasi.",
        notulen_url: "",
        media_url: "",
        media_type: ""
      }
    ];
  }

  renderMeetingPanitiaBody(activeUser, meetingsList, bodyEl, reloadCallback);
}

async function saveMeetingsArrayToDb(meetingsList) {
  await sb.from("info_layanan").upsert([{
    kode_menu: "meeting_panitia_2026",
    judul: "Arsip Meeting Panitia, Notulen & Dokumentasi Rakor 2026",
    deskripsi: JSON.stringify(meetingsList),
    url_link: String(meetingsList.length),
    status_tersedia: "AKTIF"
  }]);
}

function renderMeetingPanitiaBody(activeUser, meetingsList, bodyEl, reloadCallback) {
  const isSekretaris = isStrictSekretaris(activeUser);
  const editingItem = editingMeetingId ? meetingsList.find(m => m.id === editingMeetingId) : null;

  bodyEl.innerHTML = `
    <!-- Header Meeting Panitia -->
    <div class="p-4 rounded-3xl bg-gradient-to-br from-slate-900 via-sky-950 to-indigo-950 text-white space-y-2.5 shadow-lg border border-sky-400/40">
      <div class="flex items-center justify-between">
        <span class="text-[9px] font-extrabold uppercase tracking-wider bg-amber-400 text-slate-950 px-2.5 py-0.5 rounded-full">
          Ruang Koordinasi & Notulensi Panitia
        </span>
        <span class="text-[10px] font-extrabold text-sky-300">${meetingsList.length} Agenda Rapat</span>
      </div>
      <div>
        <h4 class="text-sm font-extrabold text-white">Informasi Rapat, Notulen & Dokumentasi Panitia</h4>
        <p class="text-[10px] text-sky-200 mt-0.5">
          Memuat informasi penting hasil rapat kepanitiaan, dokumen notulen resmi, serta dokumentasi foto/video rapat.
        </p>
      </div>

      ${isSekretaris ? `
        <div class="pt-1.5 border-t border-white/10 flex items-center justify-between gap-2">
          <span class="text-[10px] font-bold text-amber-300">
            <i class="fa-solid fa-user-pen mr-1"></i>Otoritas Sekretaris:
          </span>
          <button type="button" id="btnToggleAddMeetingForm" class="px-3 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold text-[11px] shadow flex items-center gap-1.5">
            <i class="fa-solid ${showMeetingForm ? 'fa-xmark' : 'fa-plus'}"></i>
            <span>${showMeetingForm ? 'Tutup Form Rapat' : 'Upload Info / Notulen / Foto Rapat'}</span>
          </button>
        </div>
      ` : ''}
    </div>

    <!-- FORM UPLOAD INFO RAPAT, NOTULEN & FOTO/VIDEO (KHUSUS SEKRETARIS) -->
    ${isSekretaris && (showMeetingForm || editingItem) ? `
      <div class="p-4 rounded-2xl bg-sky-50 border-2 border-sky-300 space-y-3 shadow-sm">
        <div class="flex items-center justify-between border-b border-sky-200 pb-2">
          <span class="font-extrabold text-xs text-sky-950">
            <i class="fa-solid fa-cloud-arrow-up text-sky-700 mr-1"></i>
            ${editingItem ? 'Edit Hasil Meeting & Dokumentasi' : 'Tambah Info Meeting, Notulen & Dokumentasi Baru'}
          </span>
          <span class="text-[9px] font-extrabold uppercase bg-sky-900 text-amber-300 px-2 py-0.5 rounded">
            Khusus Sekretaris
          </span>
        </div>

        <div>
          <label class="block text-[10px] font-bold text-slate-700 mb-0.5">1. Judul / Topik Meeting Panitia:</label>
          <input id="mtgInpJudul" type="text" value="${editingItem?.judul || ''}" placeholder="Contoh: Rapat Pemantapan Panitia ke-2..." class="w-full rounded-xl border border-sky-300 bg-white px-3 py-2 text-xs font-extrabold text-slate-900" />
        </div>

        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="block text-[10px] font-bold text-slate-700 mb-0.5">2. Hari / Tanggal & Waktu:</label>
            <input id="mtgInpTanggal" type="text" value="${editingItem?.tanggal || ''}" placeholder="Contoh: Sabtu, 14 Nov 2026 (10.00 WITA)" class="w-full rounded-xl border border-sky-300 bg-white px-2.5 py-1.5 text-xs font-semibold" />
          </div>
          <div>
            <label class="block text-[10px] font-bold text-slate-700 mb-0.5">3. Lokasi Rapat:</label>
            <input id="mtgInpLokasi" type="text" value="${editingItem?.lokasi || 'Sekretariat K3S / SD NCIPS'}" placeholder="Tempat rapat..." class="w-full rounded-xl border border-sky-300 bg-white px-2.5 py-1.5 text-xs font-semibold" />
          </div>
        </div>

        <div>
          <label class="block text-[10px] font-bold text-slate-700 mb-0.5">4. Info Penting / Keputusan Utama Rapat:</label>
          <textarea id="mtgInpInfo" rows="2" placeholder="Tuliskan poin pengumuman penting bagi seluruh anggota panitia..." class="w-full rounded-xl border border-sky-300 bg-white px-3 py-1.5 text-xs font-semibold">${editingItem?.info_penting || ''}</textarea>
        </div>

        <div>
          <label class="block text-[10px] font-bold text-slate-700 mb-0.5">5. Isi Ringkasan Notulen Rapat:</label>
          <textarea id="mtgInpNotulenTeks" rows="3" placeholder="Rincian notulen rapat..." class="w-full rounded-xl border border-sky-300 bg-white px-3 py-1.5 text-xs font-semibold">${editingItem?.notulen_teks || ''}</textarea>
        </div>

        <div class="p-3 rounded-xl bg-white border border-sky-200 space-y-2">
          <label class="block text-[10px] font-extrabold text-sky-950">
            <i class="fa-solid fa-file-pdf text-rose-600 mr-1"></i>6. Upload Dokumen Notulen / Daftar Hadir Rapat (.PDF / .DOCX) [Opsional]:
          </label>
          <input id="mtgInpNotulenFile" type="file" accept=".pdf,.doc,.docx,.xls,.xlsx" class="w-full text-xs font-semibold file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:bg-sky-900 file:text-white file:text-[10px] file:font-extrabold" />
          <input id="mtgInpNotulenUrl" type="url" value="${editingItem?.notulen_url || ''}" placeholder="Atau tempel link Google Drive dokumen notulen..." class="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] font-semibold" />
        </div>

        <div class="p-3 rounded-xl bg-white border border-sky-200 space-y-2">
          <label class="block text-[10px] font-extrabold text-sky-950">
            <i class="fa-solid fa-photo-film text-emerald-600 mr-1"></i>7. Upload Dokumentasi Foto / Video Meeting (.JPG / .PNG / .MP4) [Opsional]:
          </label>
          <input id="mtgInpMediaFile" type="file" accept="image/*,video/mp4,video/webm,video/*" class="w-full text-xs font-semibold file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:bg-emerald-700 file:text-white file:text-[10px] file:font-extrabold" />
          <input id="mtgInpMediaUrl" type="url" value="${editingItem?.media_url || ''}" placeholder="Atau tempel link Foto / Video / Google Drive / YouTube..." class="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] font-semibold" />
        </div>

        <div class="flex gap-2 pt-1">
          <button type="button" id="btnSaveMeetingItemNow" class="flex-1 py-2.5 rounded-xl bg-sky-900 hover:bg-sky-800 text-white font-extrabold text-xs shadow flex items-center justify-center gap-1.5">
            <i class="fa-solid fa-floppy-disk"></i>
            <span>${editingItem ? 'Simpan Perubahan Rapat' : 'Publikasikan Meeting & Notulen'}</span>
          </button>
          <button type="button" id="btnCancelMeetingForm" class="px-4 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-600 font-bold text-xs">
            Batal
          </button>
        </div>
      </div>
    ` : ''}

    <!-- Daftar Riwayat Meeting, Notulen & Dokumentasi Foto/Video -->
    <div class="space-y-3 max-h-96 overflow-y-auto pr-0.5">
      ${meetingsList.map((m, idx) => {
        const hasDoc = Boolean(m.notulen_url && m.notulen_url.trim() !== "");
        const hasMedia = Boolean(m.media_url && m.media_url.trim() !== "");
        const isVideo = Boolean(
          m.media_type === "video" ||
          (m.media_url && /\.(mp4|webm|mov)(\?|$)/i.test(m.media_url))
        );
        const isImage = Boolean(
          m.media_type === "image" ||
          (m.media_url && /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(m.media_url))
        );

        return `
          <div class="p-4 rounded-3xl bg-white border-2 border-slate-200 shadow-2xs space-y-3">
            <div class="flex items-start justify-between gap-2 border-b border-slate-100 pb-2.5">
              <div>
                <div class="flex items-center gap-1.5 flex-wrap">
                  <span class="text-[9px] font-extrabold uppercase bg-sky-900 text-amber-300 px-2 py-0.5 rounded">
                    Meeting #${meetingsList.length - idx}
                  </span>
                  <span class="text-[10px] font-bold text-slate-500">
                    <i class="fa-regular fa-calendar mr-0.5 text-sky-700"></i>${m.tanggal || '-'}
                  </span>
                  <span class="text-[10px] font-bold text-slate-500">
                    <i class="fa-solid fa-location-dot mr-0.5 text-rose-600"></i>${m.lokasi || '-'}
                  </span>
                </div>
                <h4 class="font-extrabold text-xs text-slate-900 mt-1.5 leading-snug">${m.judul}</h4>
              </div>

              ${isSekretaris ? `
                <div class="flex items-center gap-1 shrink-0">
                  <button type="button" data-mid="${m.id}" class="btn-edit-meeting w-7 h-7 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-800 text-xs flex items-center justify-center">
                    <i class="fa-solid fa-pen"></i>
                  </button>
                  <button type="button" data-mid="${m.id}" class="btn-del-meeting w-7 h-7 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs flex items-center justify-center">
                    <i class="fa-solid fa-trash"></i>
                  </button>
                </div>
              ` : ''}
            </div>

            ${m.info_penting ? `
              <div class="p-3 rounded-2xl bg-amber-50 border border-amber-200 space-y-1">
                <div class="text-[9px] font-extrabold uppercase text-amber-900 flex items-center gap-1">
                  <i class="fa-solid fa-bullhorn text-amber-600"></i>
                  <span>Info Penting / Keputusan Rapat:</span>
                </div>
                <p class="text-[11px] font-bold text-slate-800 leading-relaxed whitespace-pre-line">${m.info_penting}</p>
              </div>
            ` : ''}

            ${m.notulen_teks ? `
              <div class="p-3 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
                <div class="text-[9px] font-extrabold uppercase text-slate-600 flex items-center gap-1">
                  <i class="fa-solid fa-clipboard-list text-sky-700"></i>
                  <span>Ringkasan Notulen Rapat:</span>
                </div>
                <p class="text-[11px] text-slate-700 leading-relaxed whitespace-pre-line">${m.notulen_teks}</p>
              </div>
            ` : ''}

            <!-- Tampilan Dokumentasi Foto / Video -->
            ${hasMedia ? `
              <div class="space-y-1.5">
                <div class="text-[9px] font-extrabold uppercase text-slate-500">
                  <i class="fa-solid fa-camera text-emerald-600 mr-1"></i>Dokumentasi Meeting Panitia:
                </div>
                ${isVideo ? `
                  <video src="${m.media_url}" controls class="w-full max-h-60 rounded-2xl bg-slate-950 border border-slate-200"></video>
                ` : isImage ? `
                  <a href="${m.media_url}" target="_blank" rel="noopener noreferrer" class="block overflow-hidden rounded-2xl border border-slate-200">
                    <img src="${m.media_url}" alt="Dokumentasi Rapat" class="w-full max-h-60 object-cover hover:scale-105 transition duration-300" />
                  </a>
                ` : `
                  <a href="${m.media_url}" target="_blank" rel="noopener noreferrer" class="w-full py-2 px-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 font-extrabold text-[11px] flex items-center justify-center gap-1.5">
                    <i class="fa-solid fa-photo-film text-emerald-600"></i>
                    <span>Buka Folder / Link Dokumentasi Foto & Video Rapat</span>
                  </a>
                `}
              </div>
            ` : ''}

            ${hasDoc ? `
              <a href="${m.notulen_url}" target="_blank" rel="noopener noreferrer" download class="w-full py-2.5 px-3 rounded-xl bg-blue-900 hover:bg-blue-800 text-amber-300 font-extrabold text-[11px] shadow-2xs flex items-center justify-center gap-2 transition">
                <i class="fa-solid fa-file-arrow-down"></i>
                <span>Download Dokumen Notulen Rapat Resmi</span>
              </a>
            ` : ''}
          </div>
        `;
      }).join('')}
    </div>
  `;

  document.getElementById("btnToggleAddMeetingForm")?.addEventListener("click", () => {
    showMeetingForm = !showMeetingForm;
    editingMeetingId = null;
    renderMeetingPanitiaBody(activeUser, meetingsList, bodyEl, reloadCallback);
  });

  document.getElementById("btnCancelMeetingForm")?.addEventListener("click", () => {
    showMeetingForm = false;
    editingMeetingId = null;
    renderMeetingPanitiaBody(activeUser, meetingsList, bodyEl, reloadCallback);
  });

  document.getElementById("btnSaveMeetingItemNow")?.addEventListener("click", async () => {
    if (!isSekretaris) return;
    const judul = document.getElementById("mtgInpJudul")?.value.trim() || "";
    const tanggal = document.getElementById("mtgInpTanggal")?.value.trim() || new Date().toLocaleDateString("id-ID");
    const lokasi = document.getElementById("mtgInpLokasi")?.value.trim() || "Sekretariat K3S";
    const info_penting = document.getElementById("mtgInpInfo")?.value.trim() || "";
    const notulen_teks = document.getElementById("mtgInpNotulenTeks")?.value.trim() || "";

    const notulenFile = document.getElementById("mtgInpNotulenFile")?.files?.[0];
    let notulen_url = document.getElementById("mtgInpNotulenUrl")?.value.trim() || "";

    const mediaFile = document.getElementById("mtgInpMediaFile")?.files?.[0];
    let media_url = document.getElementById("mtgInpMediaUrl")?.value.trim() || "";
    let media_type = editingItem?.media_type || "";

    if (!judul) return toast("Judul / Topik Meeting wajib diisi!");

    const btn = document.getElementById("btnSaveMeetingItemNow");
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner animate-spin"></i> Mengunggah & Menyimpan...`;

    if (notulenFile) {
      const ext = notulenFile.name.split('.').pop()?.toLowerCase() || 'pdf';
      const fName = `notulen_meeting_${Date.now()}.${ext}`;
      const { error: errDoc } = await sb.storage.from("dokumen_rakor").upload(fName, notulenFile, { upsert: true });
      if (!errDoc) {
        const { data: pubDoc } = sb.storage.from("dokumen_rakor").getPublicUrl(fName);
        notulen_url = pubDoc?.publicUrl || "";
      }
    }

    if (mediaFile) {
      const ext = mediaFile.name.split('.').pop()?.toLowerCase() || 'jpg';
      const isVid = mediaFile.type.startsWith("video/");
      media_type = isVid ? "video" : "image";
      const fName = `dokumentasi_meeting_${Date.now()}.${ext}`;
      const { error: errMed } = await sb.storage.from("dokumen_rakor").upload(fName, mediaFile, { upsert: true });
      if (!errMed) {
        const { data: pubMed } = sb.storage.from("dokumen_rakor").getPublicUrl(fName);
        media_url = pubMed?.publicUrl || "";
      }
    }

    const newEntry = {
      id: editingItem ? editingItem.id : "MTG-" + Date.now(),
      judul,
      tanggal,
      lokasi,
      info_penting,
      notulen_teks,
      notulen_url,
      media_url,
      media_type
    };

    if (editingItem) {
      const idx = meetingsList.findIndex(x => x.id === editingItem.id);
      if (idx >= 0) meetingsList[idx] = newEntry;
    } else {
      meetingsList.unshift(newEntry);
    }

    await saveMeetingsArrayToDb(meetingsList);
    showMeetingForm = false;
    editingMeetingId = null;
    toast("Data Meeting Panitia, Notulen & Dokumentasi berhasil disimpan!");
    renderMeetingPanitiaBody(activeUser, meetingsList, bodyEl, reloadCallback);
  });

  bodyEl.querySelectorAll(".btn-edit-meeting").forEach(btn => {
    btn.addEventListener("click", () => {
      editingMeetingId = btn.dataset.mid;
      showMeetingForm = true;
      renderMeetingPanitiaBody(activeUser, meetingsList, bodyEl, reloadCallback);
    });
  });

  bodyEl.querySelectorAll(".btn-del-meeting").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!isSekretaris || !confirm("Hapus catatan meeting panitia ini?")) return;
      const mid = btn.dataset.mid;
      const updated = meetingsList.filter(x => x.id !== mid);
      await saveMeetingsArrayToDb(updated);
      toast("Catatan meeting dihapus.");
      renderMeetingPanitiaBody(activeUser, updated, bodyEl, reloadCallback);
    });
  });
}

// =========================================================================
// RUNNING TEXT KHUSUS INTERNAL PANITIA
// =========================================================================
function renderPanitiaInternalTicker(activeUser, layananList, reloadCallback) {
  const slot = document.getElementById("panitiaInternalTickerSlot");
  if (!slot) return;

  if (!document.getElementById("runningTextStyleTag")) {
    const st = document.createElement("style");
    st.id = "runningTextStyleTag";
    st.textContent = `
      @keyframes k3sSeamlessMarquee {
        0% { transform: translate3d(0%, 0, 0); }
        100% { transform: translate3d(-50%, 0, 0); }
      }
      .k3s-marquee-track {
        display: flex;
        width: max-content;
        will-change: transform;
        animation-name: k3sSeamlessMarquee;
        animation-timing-function: linear;
        animation-iteration-count: infinite;
      }
      .k3s-marquee-track:hover,
      .k3s-marquee-track:active {
        animation-play-state: paused;
      }
    `;
    document.head.appendChild(st);
  }

  const item = (layananList || []).find(x => x.kode_menu === "pengumuman_panitia") || {
    kode_menu: "pengumuman_panitia",
    judul: "Koordinasi Internal Panitia",
    deskripsi: "Semangat rekan-rekan Panitia Rakor K3S 2026! Pastikan seluruh kesiapan seksi dimonitor melalui menu Job Deskripsi & Kinerja menjelang pelaksanaan 26–28 November 2026.",
    url_link: "35",
    status_tersedia: "AKTIF"
  };

  const rawSpeed = parseInt(item.url_link, 10);
  const speedSec = (!isNaN(rawSpeed) && rawSpeed >= 15 && rawSpeed <= 90) ? rawSpeed : 35;
  const isActive = item.status_tersedia !== "NONAKTIF";
  const canEdit = canManagePanitiaTicker(activeUser);

  if (!isActive && !canEdit) {
    slot.innerHTML = "";
    slot.dataset.sig = "";
    return;
  }

  const sig = `${activeUser?.profile?.id_panitia || ''}|${isActive}|${canEdit}|${speedSec}|${item.judul}|${item.deskripsi}`;
  if (slot.dataset.sig === sig) {
    const barEl = slot.firstElementChild;
    if (barEl) barEl.onclick = () => openPanitiaTickerEditorModal(activeUser, item, speedSec, reloadCallback);
    return;
  }
  slot.dataset.sig = sig;

  const segmentHtml = `
    <span class="inline-flex items-center pr-12">
      <b class="text-amber-300 mr-1.5">[${item.judul}]:</b>
      <span>${item.deskripsi}</span>
      <span class="mx-6 text-indigo-400">•</span>
      <b class="text-amber-300 mr-1.5">[${item.judul}]:</b>
      <span>${item.deskripsi}</span>
      <span class="mx-6 text-indigo-400">•</span>
    </span>
  `;

  slot.innerHTML = `
    <div class="rounded-2xl p-2.5 border shadow-2xs flex items-center justify-between gap-2 cursor-pointer ${
      isActive
        ? 'bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border-indigo-500/40 text-white'
        : 'bg-slate-100 border-slate-300 text-slate-500'
    }">
      <div class="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
        <span class="px-2 py-1 rounded-xl ${isActive ? 'bg-amber-400 text-slate-950' : 'bg-slate-400 text-white'} font-extrabold text-[9px] uppercase tracking-wider shrink-0 flex items-center gap-1 shadow-2xs">
          <i class="fa-solid fa-walkie-talkie"></i>
          <span>${isActive ? 'INFO PANITIA' : 'OFF'}</span>
        </span>
        <div class="overflow-hidden flex-1 relative">
          ${isActive ? `
            <div class="k3s-marquee-track text-xs font-bold text-slate-100" style="animation-duration: ${speedSec}s;">
              ${segmentHtml}
              ${segmentHtml}
            </div>
          ` : `
            <div class="text-xs font-bold text-slate-500 truncate">
              [Info Panitia Nonaktif] ${item.deskripsi}
            </div>
          `}
        </div>
      </div>
      ${canEdit ? `
        <button type="button" class="px-2.5 py-1 rounded-xl bg-white/15 hover:bg-white/25 text-amber-300 border border-amber-400/30 font-extrabold text-[10px] shrink-0 flex items-center gap-1">
          <i class="fa-solid fa-pen"></i>
          <span>Siarkan</span>
        </button>
      ` : ''}
    </div>
  `;

  if (slot.firstElementChild) {
    slot.firstElementChild.onclick = () => openPanitiaTickerEditorModal(activeUser, item, speedSec, reloadCallback);
  }
}

function openPanitiaTickerEditorModal(activeUser, item, currentSpeedSec, reloadCallback) {
  const modal = document.getElementById("serviceModal");
  const titleEl = document.getElementById("serviceModalTitle");
  const bodyEl = document.getElementById("serviceModalBody");
  if (!modal || !titleEl || !bodyEl) return;

  const canEdit = canManagePanitiaTicker(activeUser);
  const isActive = item.status_tersedia !== "NONAKTIF";

  modal.classList.remove("hidden");
  titleEl.innerHTML = `<i class="fa-solid fa-walkie-talkie text-indigo-700 mr-1.5"></i> Info & Instruksi Khusus Panitia`;

  bodyEl.innerHTML = `
    <div class="p-4 rounded-2xl bg-slate-900 text-white border border-indigo-400/40 space-y-2">
      <div class="flex items-center justify-between">
        <span class="text-[10px] font-extrabold uppercase bg-amber-400 text-slate-950 px-2.5 py-0.5 rounded-full">
          ${item.judul || 'Koordinasi Internal Panitia'}
        </span>
        <span class="text-[10px] font-bold text-indigo-300">Khusus Internal Panitia</span>
      </div>
      <p class="text-xs font-bold text-slate-100 leading-relaxed pt-1">
        "${item.deskripsi}"
      </p>
    </div>

    ${canEdit ? `
      <div class="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
        <div class="flex items-center justify-between border-b border-slate-200 pb-2">
          <span class="font-extrabold text-xs text-slate-900">
            <i class="fa-solid fa-sliders text-indigo-800 mr-1"></i> Rilis Running Text Khusus Panitia
          </span>
          <span class="text-[9px] font-extrabold uppercase bg-indigo-100 text-indigo-900 px-2 py-0.5 rounded">
            ${activeUser.profile?.divisi}
          </span>
        </div>

        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="block text-[10px] font-bold text-slate-700 mb-1">Sumber / Topik Instruksi:</label>
            <input id="inpPanTickerTitle" type="text" value="${item.judul || 'Koordinasi Internal Panitia'}" placeholder="Contoh: Instruksi Ketua / Seksi Konsumsi" class="w-full rounded-xl border bg-white px-3 py-2 text-xs font-bold" />
          </div>
          <div>
            <label class="block text-[10px] font-bold text-slate-700 mb-1">Kecepatan Jalan Teks:</label>
            <select id="inpPanTickerSpeed" class="w-full rounded-xl border bg-white px-2.5 py-2 text-xs font-extrabold text-indigo-950">
              <option value="55" ${currentSpeedSec >= 50 ? 'selected' : ''}>Santai (Lambat)</option>
              <option value="35" ${currentSpeedSec >= 30 && currentSpeedSec < 50 ? 'selected' : ''}>Normal Nyaman (Default)</option>
              <option value="24" ${currentSpeedSec < 30 ? 'selected' : ''}>Sedang / Cepat</option>
            </select>
          </div>
        </div>

        <div>
          <label class="block text-[10px] font-bold text-slate-700 mb-1">Isi Pesan / Koordinasi Khusus Panitia:</label>
          <textarea id="inpPanTickerDesc" rows="3" placeholder="Ketik pesan koordinasi untuk seluruh panitia..." class="w-full rounded-xl border bg-white px-3 py-2 text-xs font-semibold">${item.deskripsi || ''}</textarea>
        </div>

        <div class="flex items-center justify-between pt-1">
          <label class="flex items-center gap-2 text-xs font-extrabold text-slate-800 cursor-pointer">
            <input id="chkPanTickerActive" type="checkbox" ${isActive ? 'checked' : ''} class="w-4 h-4 rounded accent-emerald-600" />
            <span>Tampilkan Running Text di Box Khusus Panitia</span>
          </label>
        </div>

        <button type="button" id="btnSavePanTickerNow" class="w-full py-3 rounded-xl bg-indigo-900 hover:bg-indigo-800 text-white font-extrabold text-xs shadow flex items-center justify-center gap-2">
          <i class="fa-solid fa-paper-plane"></i>
          <span>Simpan & Siarkan ke Seluruh Panitia</span>
        </button>
      </div>
    ` : `
      <div class="text-[10px] text-center text-slate-400 font-semibold">
        Running text internal ini hanya dapat dirilis oleh Penanggung Jawab, Ketua Panitia, Sekretaris & Seksi Konsumsi.
      </div>
    `}
  `;

  document.getElementById("btnSavePanTickerNow")?.addEventListener("click", async () => {
    if (!canEdit) return;
    const judul = document.getElementById("inpPanTickerTitle")?.value.trim() || "Koordinasi Internal Panitia";
    const deskripsi = document.getElementById("inpPanTickerDesc")?.value.trim() || "";
    const speedVal = document.getElementById("inpPanTickerSpeed")?.value || "35";
    const active = document.getElementById("chkPanTickerActive")?.checked;

    if (!deskripsi) return toast("Isi pesan khusus panitia tidak boleh kosong!");

    await sb.from("info_layanan").upsert([{
      kode_menu: "pengumuman_panitia",
      judul,
      deskripsi,
      url_link: String(speedVal),
      status_tersedia: active ? "AKTIF" : "NONAKTIF"
    }]);

    toast(active ? "Info Khusus Panitia berhasil disiarkan!" : "Running Text Panitia disembunyikan.");
    modal.classList.add("hidden");
    if (reloadCallback) await reloadCallback();
  });
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
  } catch (e) {}
}

function renderProdukModalContent(activeUser, layananList, bodyEl, reloadCallback) {
  const isEditor = canManageProdukRakor(activeUser);

  const countDraft = prokerList.filter(p => p.kategori_dokumen === "Draft").length;
  const listDisepakati = prokerList.filter(p => p.kategori_dokumen === "Disepakati");
  const countDisepakati = listDisepakati.length;
  const countBosp = listDisepakati.filter(p => isBospFunded(p.sumber_dana)).length;

  bodyEl.innerHTML = `
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

function renderProkerListTab(activeUser, kategoriTarget, container, layananList, bodyEl, reloadCallback) {
  const isEditor = canManageProdukRakor(activeUser);
  const itemsInCategory = prokerList.filter(p => p.kategori_dokumen === kategoriTarget);
  const totalAnggaranKategori = itemsInCategory.reduce((acc, cur) => acc + Number(cur.besaran_dana || 0), 0);

  const editingItem = editingProkerId
    ? prokerList.find(p => p.id_proker === editingProkerId)
    : null;

  const draftFileRec = (layananList || []).find(x => x.kode_menu === "draft_proker_file_2027") || {
    kode_menu: "draft_proker_file_2027",
    judul: "File Dokumen Draft Program Kerja 2027 (Word / Excel / Spreadsheet / PDF)",
    deskripsi: "Unduh bahan rancangan Draft Program Kerja K3S 2027 untuk pembahasan sidang komisi.",
    url_link: "",
    status_tersedia: "Segera Hadir"
  };
  const hasDraftFile = Boolean(draftFileRec.url_link && draftFileRec.url_link.trim() !== "");

  container.innerHTML = `
    ${kategoriTarget === 'Draft' ? `
      <div class="p-3.5 rounded-2xl bg-gradient-to-r from-amber-50 via-yellow-50/70 to-white border-2 border-amber-300 space-y-2.5 shadow-2xs">
        <div class="flex items-start justify-between gap-2">
          <div class="flex items-center gap-2.5">
            <div class="w-10 h-10 rounded-2xl bg-amber-400 text-slate-950 flex items-center justify-center text-base font-extrabold shrink-0 shadow-2xs">
              <i class="fa-solid fa-file-word"></i>
            </div>
            <div>
              <span class="text-[9px] font-extrabold uppercase bg-amber-200 text-amber-950 px-2 py-0.5 rounded">
                Dokumen Bahan Sidang (Word / Excel / Spreadsheet / PDF)
              </span>
              <h4 class="font-extrabold text-xs text-slate-900 mt-0.5">${draftFileRec.judul}</h4>
              <p class="text-[10px] text-slate-600">${draftFileRec.deskripsi}</p>
            </div>
          </div>
        </div>

        <div class="flex items-center gap-2">
          ${hasDraftFile ? `
            <a href="${draftFileRec.url_link}" target="_blank" rel="noopener noreferrer" download class="flex-1 py-2 px-3 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-[11px] shadow flex items-center justify-center gap-1.5">
              <i class="fa-solid fa-download text-amber-300"></i>
              <span>Buka / Download File Draft (Word/Excel/Sheet/PDF)</span>
            </a>
          ` : `
            <div class="flex-1 py-2 px-3 rounded-xl bg-white border border-amber-200 text-[10px] font-bold text-slate-400 text-center">
              Belum ada file Word / Excel / Spreadsheet Draft yang diunggah
            </div>
          `}
          ${isEditor ? `
            <button type="button" id="btnToggleDraftDocUploadBox" class="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-amber-300 font-extrabold text-[10px] shrink-0 flex items-center gap-1 shadow">
              <i class="fa-solid fa-cloud-arrow-up"></i>
              <span>${hasDraftFile ? 'Ganti File' : 'Upload File'}</span>
            </button>
          ` : ''}
        </div>

        ${isEditor ? `
          <div id="draftDocUploadFormBox" class="hidden pt-2.5 border-t border-amber-200 space-y-2">
            <div>
              <label class="block text-[10px] font-bold text-slate-700 mb-1">Pilih File Draft (.DOCX, .XLSX, .CSV, atau .PDF):</label>
              <input id="inpDraftMultiFile" type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.csv" class="w-full rounded-xl border border-amber-300 bg-white px-2.5 py-1.5 text-xs font-semibold file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:bg-blue-900 file:text-white file:text-[10px] file:font-extrabold" />
            </div>
            <div>
              <label class="block text-[10px] font-bold text-slate-700 mb-1">Atau Tempel Link Google Docs / Google Spreadsheet / Drive:</label>
              <input id="inpDraftMultiUrl" type="url" value="${draftFileRec.url_link || ''}" placeholder="https://docs.google.com/spreadsheets/..." class="w-full rounded-xl border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold" />
            </div>
            <div>
              <label class="block text-[10px] font-bold text-slate-700 mb-1">Judul / Keterangan File Draft:</label>
              <input id="inpDraftMultiDesc" type="text" value="${draftFileRec.deskripsi || ''}" placeholder="Contoh: File Excel Simulasi Anggaran & Draft Proker 2027" class="w-full rounded-xl border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold" />
            </div>
            <div class="flex gap-2">
              <button type="button" id="btnSaveDraftMultiFileNow" class="flex-1 py-2 rounded-xl bg-blue-900 hover:bg-blue-800 text-white font-extrabold text-xs shadow">
                <i class="fa-solid fa-floppy-disk mr-1"></i> Publikasikan File Draft
              </button>
              ${hasDraftFile ? `
                <button type="button" id="btnRemoveDraftMultiFile" class="px-3 py-2 rounded-xl bg-rose-100 text-rose-700 font-extrabold text-xs">
                  Hapus
                </button>
              ` : ''}
            </div>
          </div>
        ` : ''}
      </div>
    ` : ''}

    <div class="p-3.5 rounded-2xl ${kategoriTarget === 'Disepakati' ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'} border flex items-center justify-between gap-2">
      <div>
        <div class="text-[10px] font-extrabold uppercase ${kategoriTarget === 'Disepakati' ? 'text-emerald-800' : 'text-amber-800'}">
          ${kategoriTarget === 'Disepakati' ? '✓ Program Kerja K3S 2027 (Telah Disahkan)' : '⏳ Rincian Item Draft Program Kerja 2027'}
        </div>
        <div class="text-xs font-extrabold text-slate-900 mt-0.5">
          Total ${itemsInCategory.length} Kegiatan • Estimasi Dana: ${formatRp(totalAnggaranKategori)}
        </div>
      </div>

      <div class="flex items-center gap-1.5 shrink-0">
        <button type="button" id="btnPrintProkerPdf" class="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-amber-300 font-extrabold text-[10px] shadow flex items-center gap-1">
          <i class="fa-solid fa-file-pdf"></i>
          <span>Cetak PDF</span>
        </button>
        ${isEditor ? `
          <button type="button" id="btnToggleAddProkerForm" class="px-3 py-2 rounded-xl bg-blue-900 hover:bg-blue-800 text-white font-extrabold text-[10px] shadow flex items-center gap-1">
            <i class="fa-solid ${showInputForm ? 'fa-xmark' : 'fa-plus'}"></i>
            <span>${showInputForm ? 'Tutup Form' : 'Input Proker'}</span>
          </button>
        ` : ''}
      </div>
    </div>

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

    <div class="grid grid-cols-2 gap-2">
      <select id="prkFilterBidang" class="rounded-xl border border-slate-300 bg-slate-50 px-2.5 py-2 text-xs font-extrabold text-blue-950">
        <option value="ALL" ${filterBidang === 'ALL' ? 'selected' : ''}>Semua 6 Bidang K3S</option>
        ${BIDANG_K3S_LIST.map(b => `<option value="${b}" ${filterBidang === b ? 'selected' : ''}>${b}</option>`).join('')}
      </select>
      <input id="prkSearchKeyword" type="text" placeholder="Cari kegiatan / sumber dana..." class="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-semibold" />
    </div>

    <div id="prkCardsListBox" class="space-y-2.5 max-h-96 overflow-y-auto pr-0.5"></div>
  `;

  document.getElementById("btnToggleDraftDocUploadBox")?.addEventListener("click", () => {
    document.getElementById("draftDocUploadFormBox")?.classList.toggle("hidden");
  });

  document.getElementById("btnSaveDraftMultiFileNow")?.addEventListener("click", async () => {
    if (!isEditor) return;
    const file = document.getElementById("inpDraftMultiFile")?.files?.[0];
    let finalUrl = document.getElementById("inpDraftMultiUrl")?.value.trim() || "";
    const deskripsi = document.getElementById("inpDraftMultiDesc")?.value.trim() || "Dokumen Draft Program Kerja 2027 (Word/Excel/Spreadsheet/PDF)";

    const btn = document.getElementById("btnSaveDraftMultiFileNow");
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner animate-spin"></i> Mengunggah...`;

    if (file) {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'docx';
      const fileName = `draft_proker_2027_${Date.now()}.${ext}`;
      const { error: upErr } = await sb.storage
        .from("dokumen_rakor")
        .upload(fileName, file, { cacheControl: "3600", upsert: true });

      if (upErr) {
        btn.disabled = false;
        btn.innerHTML = `<i class="fa-solid fa-floppy-disk mr-1"></i> Publikasikan File Draft`;
        return toast("Gagal mengunggah file Draft.");
      }
      const { data: pubData } = sb.storage.from("dokumen_rakor").getPublicUrl(fileName);
      finalUrl = pubData?.publicUrl || "";
    }

    if (!finalUrl) {
      btn.disabled = false;
      btn.innerHTML = `<i class="fa-solid fa-floppy-disk mr-1"></i> Publikasikan File Draft`;
      return toast("Pilih file Word/Excel/PDF atau tempel link Spreadsheet terlebih dahulu!");
    }

    const updated = {
      kode_menu: "draft_proker_file_2027",
      judul: file ? `File Draft Proker 2027 (${file.name})` : "Dokumen Draft Program Kerja 2027 (Word/Excel/Spreadsheet)",
      deskripsi,
      url_link: finalUrl,
      status_tersedia: "Tersedia"
    };

    await sb.from("info_layanan").upsert([updated]);
    toast("File Draft Program Kerja 2027 berhasil dipublikasikan!");
    if (reloadCallback) await reloadCallback();
    openProdukRakorModal(activeUser, [updated, ...(layananList || []).filter(x => x.kode_menu !== "draft_proker_file_2027")], reloadCallback);
  });

  document.getElementById("btnRemoveDraftMultiFile")?.addEventListener("click", async () => {
    if (!isEditor || !confirm("Hapus file lampiran Draft saat ini?")) return;
    const updated = {
      kode_menu: "draft_proker_file_2027",
      judul: "File Dokumen Draft Program Kerja 2027",
      deskripsi: draftFileRec.deskripsi,
      url_link: "",
      status_tersedia: "Segera Hadir"
    };
    await sb.from("info_layanan").upsert([updated]);
    toast("File Draft dihapus.");
    if (reloadCallback) await reloadCallback();
    openProdukRakorModal(activeUser, [updated], reloadCallback);
  });

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
      return toast("Pastikan SQL tabel produk_proker_2027 sudah dijalankan di Supabase!");
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

async function generatePdfMatriksProker(judulKategori, listItems, catatanRekomendasi = "") {
  toast("Menyiapkan dokumen PDF resmi ber-Kop K3S...");
  await ensureJsPdfLoaded();
  const logoImg = await preloadLogo();

  const canvas = document.createElement("canvas");
  canvas.width = 1123;
  canvas.height = 794;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

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
