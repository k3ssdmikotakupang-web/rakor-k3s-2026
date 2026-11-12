// js/fitur_ekstra.js
// Mencakup: (1) Cetak PDF ID Card Kalung Kolektif, (3) Running Text Pengumuman Live, (5) Install Web-App (PWA)
import { sb, toast } from './supabase.js';

const SUBRAYON_LIST = ["Maulafa", "Alak", "Kota Raja", "Oebobo", "Kelapa Lima", "Kota Lama"];
let deferredPwaPrompt = null;
let pwaInitialized = false;
let logoImgCache = null;

// Wewenang Edit Pengumuman Live & Cetak ID Card Kolektif
function canManageBroadcast(activeUser) {
  return Boolean(
    activeUser &&
    activeUser.role === 'panitia' &&
    ['Sekretaris', 'Seksi Kesekretariatan', 'Seksi Acara dan Humas', 'Ketua Panitia', 'Penanggung Jawab'].includes(activeUser.profile?.divisi)
  );
}

function canPrintIdCards(activeUser) {
  return Boolean(
    activeUser &&
    activeUser.role === 'panitia' &&
    ['Sekretaris', 'Seksi Kesekretariatan', 'Seksi Perlengkapan, Dokumentasi, dan Publikasi', 'Ketua Panitia', 'Penanggung Jawab'].includes(activeUser.profile?.divisi)
  );
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
    img.src = "./logo-k3s.png";
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

// Fungsi Utama Pemanggil Ketiga Fitur
export function renderFiturEkstraWidgets(activeUser, sekolahList, panitiaList, layananList, reloadCallback) {
  initPwaInstallSupport();
  renderLiveRunningTextBanner(activeUser, layananList, reloadCallback);
  renderBulkIdCardGeneratorWidget(activeUser, sekolahList, panitiaList);
}

// =========================================================================
// FITUR 5: PWA INSTALL KE LAYAR UTAMA HP ANDROID / IOS
// =========================================================================
export function initPwaInstallSupport() {
  if (pwaInitialized) return;
  pwaInitialized = true;

  // 1. Suntikkan Meta Tags Mobile Web-App & Dynamic Manifest berlogo K3S
  const head = document.head;
  const metaTheme = document.createElement("meta");
  metaTheme.name = "theme-color";
  metaTheme.content = "#0f172a";
  head.appendChild(metaTheme);

  const metaMobile = document.createElement("meta");
  metaMobile.name = "mobile-web-app-capable";
  metaMobile.content = "yes";
  head.appendChild(metaMobile);

  const metaApple = document.createElement("meta");
  metaApple.name = "apple-mobile-web-app-capable";
  metaApple.content = "yes";
  head.appendChild(metaApple);

  const baseUrl = window.location.origin + window.location.pathname.replace(/\/[^/]*$/, '/');
  const manifestObj = {
    name: "SIM-RAKOR K3S SD/MI Kota Kupang 2026",
    short_name: "SIM-RAKOR K3S",
    description: "Aplikasi Resmi Rapat Koordinasi Kepala SD/MI Kota Kupang 2026",
    start_url: window.location.origin + window.location.pathname,
    display: "standalone",
    background_color: "#0f172a",
    theme_color: "#0f172a",
    orientation: "portrait",
    icons: [
      {
        src: baseUrl + "logo-k3s.png",
        sizes: "192x192",
        type: "image/png"
      },
      {
        src: baseUrl + "logo-k3s.png",
        sizes: "512x512",
        type: "image/png"
      }
    ]
  };

  const manifestBlob = new Blob([JSON.stringify(manifestObj)], { type: "application/manifest+json" });
  const manifestUrl = URL.createObjectURL(manifestBlob);
  const linkManifest = document.createElement("link");
  linkManifest.rel = "manifest";
  linkManifest.href = manifestUrl;
  head.appendChild(linkManifest);

  // Tangkap event install native Android Chrome
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPwaPrompt = e;
    injectInstallAppButtons();
  });

  // Tetap tampilkan tombol Pasang Aplikasi di halaman Login & Header agar mudah diakses
  injectInstallAppButtons();
}

function injectInstallAppButtons() {
  // Jika sudah dibuka dalam mode aplikasi terinstal (standalone), sembunyikan tombol install
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  if (isStandalone) return;

  // Tambahkan tombol "Install Aplikasi ke HP" di bagian bawah kartu Login
  const loginScreen = document.getElementById("loginScreen");
  if (loginScreen && !document.getElementById("btnInstallAppLogin")) {
    const targetCard = loginScreen.querySelector(".max-w-md") || loginScreen.firstElementChild;
    if (targetCard) {
      const btn = document.createElement("button");
      btn.id = "btnInstallAppLogin";
      btn.type = "button";
      btn.className = "mt-3 w-full py-2.5 px-4 rounded-2xl bg-white/10 hover:bg-white/15 border border-amber-400/40 text-amber-300 font-extrabold text-xs flex items-center justify-center gap-2 shadow transition active:scale-95";
      btn.innerHTML = `
        <i class="fa-brands fa-android text-emerald-400 text-sm"></i>
        <span>Pasang Aplikasi SIM-RAKOR di Layar HP</span>
      `;
      btn.addEventListener("click", triggerInstallAppFlow);
      targetCard.appendChild(btn);
    }
  }
}

export async function triggerInstallAppFlow() {
  if (deferredPwaPrompt) {
    deferredPwaPrompt.prompt();
    const { outcome } = await deferredPwaPrompt.userChoice;
    if (outcome === 'accepted') {
      toast("Aplikasi SIM-RAKOR sedang dipasang ke layar utama HP Anda!");
      deferredPwaPrompt = null;
    }
    return;
  }

  // Jika browser tidak memicu prompt otomatis, tampilkan panduan 2 langkah praktis
  const modal = document.getElementById("serviceModal");
  const titleEl = document.getElementById("serviceModalTitle");
  const bodyEl = document.getElementById("serviceModalBody");
  if (!modal || !titleEl || !bodyEl) {
    return toast("Klik menu Titik Tiga di pojok kanan atas browser Chrome Anda, lalu pilih 'Tambahkan ke Layar Utama' (Add to Home Screen).");
  }

  modal.classList.remove("hidden");
  titleEl.innerHTML = `<i class="fa-solid fa-mobile-screen-button text-emerald-600 mr-1.5"></i> Pasang Aplikasi di Layar HP`;
  bodyEl.innerHTML = `
    <div class="p-4 rounded-3xl bg-slate-900 text-white text-center space-y-2.5">
      <div class="w-16 h-16 rounded-2xl bg-white p-2 mx-auto shadow border-2 border-amber-400 flex items-center justify-center">
        <img src="./logo-k3s.png" alt="K3S" class="w-full h-full object-contain" onerror="this.outerHTML='<i class=\\'fa-solid fa-mobile-screen text-2xl text-blue-900\\'></i>'" />
      </div>
      <h4 class="font-extrabold text-sm text-amber-300">SIM-RAKOR K3S Kota Kupang</h4>
      <p class="text-[11px] text-slate-300 leading-relaxed">
        Pasang ikon aplikasi ini di layar depan HP Anda agar dapat dibuka kapan saja dalam mode layar penuh tanpa mengetik alamat link.
      </p>
    </div>

    <div class="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 space-y-2.5 text-xs text-slate-800">
      <div class="font-extrabold text-emerald-950 uppercase text-[11px]">
        <i class="fa-brands fa-android text-emerald-600 mr-1"></i> Cara Pasang di HP Android (Chrome):
      </div>
      <ol class="list-decimal list-inside space-y-1.5 text-[11px] font-semibold">
        <li>Ketuk ikon <b>Titik Tiga (⋮)</b> di pojok kanan atas browser Chrome Anda.</li>
        <li>Pilih menu <b>"Instal aplikasi"</b> atau <b>"Tambahkan ke layar utama"</b> (<i>Add to Home screen</i>).</li>
        <li>Ketuk <b>Instal / Tambah</b> — ikon berlogo K3S akan langsung muncul di layar HP Anda!</li>
      </ol>
    </div>

    <div class="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1.5 text-xs text-slate-700">
      <div class="font-extrabold text-slate-900 uppercase text-[10px]">
        <i class="fa-brands fa-apple mr-1"></i> Cara Pasang di iPhone (Safari):
      </div>
      <p class="text-[11px]">Ketuk tombol <b>Bagikan (Share)</b> di bagian bawah Safari, lalu pilih <b>"Tambah ke Layar Utama"</b>.</p>
    </div>
  `;
}

// =========================================================================
// FITUR 3: RUNNING TEXT / PENGUMUMAN DARURAT LIVE DI ATAS BERANDA
// =========================================================================
function renderLiveRunningTextBanner(activeUser, layananList, reloadCallback) {
  const tabBeranda = document.getElementById("tabContentBeranda");
  if (!tabBeranda) return;

  // Pastikan animasi marquee tersedia
  if (!document.getElementById("runningTextStyleTag")) {
    const st = document.createElement("style");
    st.id = "runningTextStyleTag";
    st.textContent = `
      @keyframes k3sMarquee {
        0% { transform: translateX(100%); }
        100% { transform: translateX(-100%); }
      }
      .animate-k3s-marquee {
        display: inline-block;
        white-space: nowrap;
        animation: k3sMarquee 22s linear infinite;
      }
      .animate-k3s-marquee:hover {
        animation-play-state: paused;
      }
    `;
    document.head.appendChild(st);
  }

  const broadcastItem = (layananList || []).find(x => x.kode_menu === 'pengumuman_live') || {
    kode_menu: 'pengumuman_live',
    judul: 'Info Penting Panitia',
    deskripsi: 'Selamat datang Peserta Rakor Kepala SD/MI Kota Kupang (19–21 November 2026). Pastikan menunjukkan QR Code saat registrasi & pengambilan Rakor Kit.',
    status_tersedia: 'AKTIF'
  };

  const isActive = broadcastItem.status_tersedia !== 'NONAKTIF';
  const canEdit = canManageBroadcast(activeUser);

  let bar = document.getElementById("liveBroadcastTickerBar");
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "liveBroadcastTickerBar";
    tabBeranda.insertBefore(bar, tabBeranda.firstChild);
  }

  // Jika pengumuman dinonaktifkan dan yang login adalah peserta, sembunyikan bar
  if (!isActive && !canEdit) {
    bar.className = "hidden";
    bar.innerHTML = "";
    return;
  }

  bar.className = `rounded-2xl p-2.5 border shadow-sm flex items-center justify-between gap-2 ${
    isActive
      ? 'bg-gradient-to-r from-amber-50 via-yellow-50 to-amber-50 border-amber-300 text-slate-900'
      : 'bg-slate-100 border-slate-300 text-slate-500'
  }`;

  bar.innerHTML = `
    <div class="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
      <span class="px-2 py-1 rounded-xl ${isActive ? 'bg-red-600 text-white animate-pulse' : 'bg-slate-400 text-white'} font-extrabold text-[9px] uppercase tracking-wider shrink-0 flex items-center gap-1 shadow-2xs">
        <i class="fa-solid fa-bullhorn"></i>
        <span>${isActive ? 'INFO LIVE' : 'OFF'}</span>
      </span>
      <div class="overflow-hidden flex-1 relative">
        <div class="text-xs font-extrabold ${isActive ? 'text-slate-900 animate-k3s-marquee' : 'text-slate-500 truncate'}">
          ${broadcastItem.deskripsi} &nbsp; • &nbsp; <b>[${broadcastItem.judul}]</b> &nbsp; • &nbsp; ${broadcastItem.deskripsi}
        </div>
      </div>
    </div>
    ${canEdit ? `
      <button type="button" id="btnEditLiveBroadcast" class="px-2.5 py-1 rounded-xl bg-slate-900 hover:bg-slate-800 text-amber-300 font-extrabold text-[10px] shrink-0 flex items-center gap-1 shadow-2xs">
        <i class="fa-solid fa-pen"></i>
        <span>Siarkan</span>
      </button>
    ` : ''}
  `;

  // Klik pita untuk membaca pesan penuh (atau mengedit bagi Sekretaris/Acara)
  bar.onclick = (e) => {
    if (e.target.closest("#btnEditLiveBroadcast")) {
      openBroadcastEditorModal(activeUser, broadcastItem, reloadCallback);
    } else {
      openBroadcastEditorModal(activeUser, broadcastItem, reloadCallback);
    }
  };
}

function openBroadcastEditorModal(activeUser, broadcastItem, reloadCallback) {
  const modal = document.getElementById("serviceModal");
  const titleEl = document.getElementById("serviceModalTitle");
  const bodyEl = document.getElementById("serviceModalBody");
  if (!modal || !titleEl || !bodyEl) return;

  const canEdit = canManageBroadcast(activeUser);
  const isActive = broadcastItem.status_tersedia !== 'NONAKTIF';

  modal.classList.remove("hidden");
  titleEl.innerHTML = `<i class="fa-solid fa-bullhorn text-red-600 mr-1.5"></i> Pengumuman Resmi Panitia`;

  bodyEl.innerHTML = `
    <div class="p-4 rounded-2xl bg-amber-50 border-2 border-amber-300 space-y-2">
      <div class="flex items-center justify-between">
        <span class="text-[10px] font-extrabold uppercase bg-red-600 text-white px-2.5 py-0.5 rounded-full">
          ${broadcastItem.judul || 'Info Penting Panitia'}
        </span>
        <span class="text-[10px] font-bold text-amber-800">Siaran Langsung Rakor</span>
      </div>
      <p class="text-xs font-bold text-slate-900 leading-relaxed pt-1">
        "${broadcastItem.deskripsi}"
      </p>
    </div>

    ${canEdit ? `
      <div class="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
        <div class="flex items-center justify-between border-b border-slate-200 pb-2">
          <span class="font-extrabold text-xs text-slate-900">
            <i class="fa-solid fa-tower-broadcast text-blue-800 mr-1"></i> Panel Siaran Pengumuman (Running Text)
          </span>
          <span class="text-[9px] font-extrabold uppercase bg-blue-100 text-blue-900 px-2 py-0.5 rounded">Khusus Panitia</span>
        </div>

        <div>
          <label class="block text-[10px] font-bold text-slate-700 mb-1">Label / Kategori Info:</label>
          <input id="inpBroadcastTitle" type="text" value="${broadcastItem.judul || 'Info Penting Panitia'}" placeholder="Contoh: Pengumuman Ruang Komisi / Info Konsumsi" class="w-full rounded-xl border bg-white px-3 py-2 text-xs font-bold" />
        </div>

        <div>
          <label class="block text-[10px] font-bold text-slate-700 mb-1">Isi Kalimat Pengumuman (Tampil Berjalan di Layar Peserta):</label>
          <textarea id="inpBroadcastText" rows="3" placeholder="Ketik pengumuman yang ingin ditampilkan ke seluruh peserta..." class="w-full rounded-xl border bg-white px-3 py-2 text-xs font-semibold">${broadcastItem.deskripsi || ''}</textarea>
        </div>

        <div class="flex items-center justify-between pt-1">
          <label class="flex items-center gap-2 text-xs font-extrabold text-slate-800 cursor-pointer">
            <input id="chkBroadcastActive" type="checkbox" ${isActive ? 'checked' : ''} class="w-4 h-4 rounded accent-emerald-600" />
            <span>Tampilkan Running Text di Beranda</span>
          </label>
        </div>

        <button type="button" id="btnSaveBroadcastNow" class="w-full py-3 rounded-xl bg-blue-900 hover:bg-blue-800 text-white font-extrabold text-xs shadow flex items-center justify-center gap-2">
          <i class="fa-solid fa-paper-plane"></i>
          <span>Siarkan Pengumuman Sekarang</span>
        </button>
      </div>
    ` : ''}
  `;

  document.getElementById("btnSaveBroadcastNow")?.addEventListener("click", async () => {
    if (!canEdit) return;
    const judul = document.getElementById("inpBroadcastTitle")?.value.trim() || "Info Penting Panitia";
    const deskripsi = document.getElementById("inpBroadcastText")?.value.trim() || "";
    const active = document.getElementById("chkBroadcastActive")?.checked;

    if (!deskripsi) return toast("Isi kalimat pengumuman tidak boleh kosong!");

    await sb.from("info_layanan").upsert([{
      kode_menu: 'pengumuman_live',
      judul,
      deskripsi,
      url_link: '',
      status_tersedia: active ? 'AKTIF' : 'NONAKTIF'
    }]);

    toast(active ? "Pengumuman Live berhasil disiarkan ke seluruh peserta!" : "Running Text disembunyikan.");
    modal.classList.add("hidden");
    if (reloadCallback) await reloadCallback();
  });
}

// =========================================================================
// FITUR 1: GENERATOR CETAK PDF ID CARD KALUNG KOLEKTIF SIAP GUNTING
// =========================================================================
function renderBulkIdCardGeneratorWidget(activeUser, sekolahList, panitiaList) {
  const existingBtn = document.getElementById("btnServiceBulkIdCards");

  if (!canPrintIdCards(activeUser)) {
    if (existingBtn) existingBtn.remove();
    return;
  }

  const firstServiceBtn = document.querySelector(".service-menu-btn");
  const gridContainer = firstServiceBtn ? firstServiceBtn.parentElement : null;
  if (!gridContainer) return;

  if (!existingBtn) {
    const btn = document.createElement("button");
    btn.id = "btnServiceBulkIdCards";
    btn.type = "button";
    btn.className = "col-span-3 p-3.5 rounded-2xl bg-gradient-to-r from-indigo-950 via-slate-900 to-blue-950 text-white border border-indigo-400/30 flex items-center justify-between px-4 active:scale-[0.99] transition shadow-md";
    gridContainer.appendChild(btn);
  }

  const targetBtn = document.getElementById("btnServiceBulkIdCards");
  if (targetBtn) {
    targetBtn.innerHTML = `
      <div class="flex items-center gap-3 text-left">
        <div class="w-11 h-11 rounded-2xl bg-amber-400 text-slate-950 flex items-center justify-center text-lg font-extrabold shadow shrink-0">
          <i class="fa-solid fa-id-badge"></i>
        </div>
        <div>
          <div class="flex items-center gap-1.5">
            <span class="text-xs font-extrabold text-white">Cetak ID Card Kalung (PDF Kolektif)</span>
            <span class="text-[9px] font-extrabold uppercase bg-amber-400/20 text-amber-300 border border-amber-400/30 px-1.5 py-0.5 rounded">Siap Gunting</span>
          </div>
          <div class="text-[10px] text-indigo-200 mt-0.5">
            Unduh PDF Name Tag QR Code per Sub Rayon (158 Kepsek) & 19 Panitia
          </div>
        </div>
      </div>
      <i class="fa-solid fa-print text-amber-300 text-sm shrink-0"></i>
    `;
    targetBtn.onclick = () => openBulkIdCardModal(activeUser, sekolahList, panitiaList);
  }
}

export function openBulkIdCardModal(activeUser, sekolahList, panitiaList) {
  if (!canPrintIdCards(activeUser)) return;

  const modal = document.getElementById("serviceModal");
  const titleEl = document.getElementById("serviceModalTitle");
  const bodyEl = document.getElementById("serviceModalBody");
  if (!modal || !titleEl || !bodyEl) return;

  modal.classList.remove("hidden");
  titleEl.innerHTML = `<i class="fa-solid fa-id-badge text-indigo-700 mr-1.5"></i> Cetak ID Card Kalung QR (PDF A4)`;

  bodyEl.innerHTML = `
    <div class="p-4 rounded-2xl bg-indigo-50 border border-indigo-200 space-y-2">
      <div class="flex items-center justify-between">
        <span class="text-[10px] font-extrabold uppercase bg-indigo-900 text-amber-300 px-2.5 py-0.5 rounded-full">
          Layout A4 Siap Cetak & Gunting
        </span>
        <span class="text-[10px] font-bold text-indigo-800">4 Kartu Besar / Halaman</span>
      </div>
      <p class="text-[11px] text-slate-700 leading-relaxed">
        Setiap halaman A4 berisi <b>4 Kartu ID Kalung (Name Tag)</b> lengkap dengan Logo K3S, Nama, Asal Sekolah/Divisi, Nomor Kamar, dan <b>QR Code Resmi</b> untuk dimasukkan ke plastik kalung peserta di dalam Rakor Kit.
      </p>
    </div>

    <div class="space-y-2">
      <div class="text-xs font-extrabold text-slate-800 uppercase">1. Cetak Kartu Peserta Per Sub Rayon:</div>
      <div class="grid grid-cols-2 gap-2">
        ${SUBRAYON_LIST.map(sr => {
          const count = sekolahList.filter(s => s.subrayon === sr).length;
          return `
            <button type="button" data-sr="${sr}" class="btn-print-sr-cards p-3 rounded-2xl bg-white hover:bg-blue-50 border border-slate-200 shadow-2xs text-left flex items-center justify-between transition">
              <div>
                <div class="font-extrabold text-xs text-slate-900">Rayon ${sr}</div>
                <div class="text-[10px] text-slate-500">${count} Kartu Kepsek</div>
              </div>
              <div class="w-8 h-8 rounded-xl bg-blue-900 text-amber-300 flex items-center justify-center text-xs shrink-0">
                <i class="fa-solid fa-file-pdf"></i>
              </div>
            </button>
          `;
        }).join('')}
      </div>
    </div>

    <div class="space-y-2 pt-2 border-t border-slate-200">
      <div class="text-xs font-extrabold text-slate-800 uppercase">2. Cetak Kartu Panitia Pelaksana:</div>
      <button type="button" id="btnPrintPanitiaCards" class="w-full p-3.5 rounded-2xl bg-gradient-to-r from-slate-900 to-blue-950 hover:from-slate-800 hover:to-blue-900 text-white font-extrabold text-xs shadow flex items-center justify-between">
        <div class="flex items-center gap-2.5">
          <i class="fa-solid fa-user-shield text-amber-300 text-base"></i>
          <span>Unduh PDF ID Card Seluruh Panitia (${panitiaList.length} Orang)</span>
        </div>
        <span class="text-[10px] bg-amber-400 text-slate-950 px-2.5 py-1 rounded-xl font-extrabold">Unduh PDF</span>
      </button>
    </div>

    <div id="bulkPrintProgressBox" class="hidden p-3.5 rounded-2xl bg-emerald-50 border border-emerald-300 text-center text-xs font-extrabold text-emerald-900">
      <i class="fa-solid fa-spinner animate-spin mr-1.5"></i> Sedang menyusun halaman PDF & men-generate QR Code...
    </div>
  `;

  document.querySelectorAll(".btn-print-sr-cards").forEach(btn => {
    btn.addEventListener("click", async () => {
      const sr = btn.dataset.sr;
      const list = sekolahList.filter(s => s.subrayon === sr);
      await generateBulkIdCardsPdf(`Sub_Rayon_${sr}`, list, "peserta");
    });
  });

  document.getElementById("btnPrintPanitiaCards")?.addEventListener("click", async () => {
    await generateBulkIdCardsPdf("Panitia_Rakor_2026", panitiaList, "panitia");
  });
}

function renderSingleQrToImage(payloadText, size = 180) {
  return new Promise((resolve) => {
    try {
      const tempDiv = document.createElement("div");
      new window.QRCode(tempDiv, {
        text: payloadText,
        width: size,
        height: size,
        colorDark: "#0f172a",
        colorLight: "#ffffff"
      });
      setTimeout(() => {
        const qrCanvas = tempDiv.querySelector("canvas");
        const qrImg = tempDiv.querySelector("img");
        resolve(qrCanvas || qrImg || null);
      }, 45);
    } catch (e) {
      resolve(null);
    }
  });
}

async function generateBulkIdCardsPdf(fileLabel, itemList, mode = "peserta") {
  const progBox = document.getElementById("bulkPrintProgressBox");
  progBox?.classList.remove("hidden");

  try {
    await ensureJsPdfLoaded();
    const logoImg = await preloadLogo();
    const { jsPDF } = window.jspdf;

    // Ukuran A4 Portrait dalam piksel (794 x 1123) -> 4 Kartu per halaman (Grid 2x2)
    const pdf = new jsPDF({ orientation: "portrait", unit: "px", format: [794, 1123] });
    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = 794;
    pageCanvas.height = 1123;
    const ctx = pageCanvas.getContext("2d");

    const cardW = 335;
    const cardH = 495;
    const positions = [
      { x: 42, y: 48 },
      { x: 417, y: 48 },
      { x: 42, y: 575 },
      { x: 417, y: 575 }
    ];

    for (let i = 0; i < itemList.length; i += 4) {
      if (i > 0) pdf.addPage([794, 1123], "portrait");

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, 794, 1123);

      const chunk = itemList.slice(i, i + 4);
      for (let j = 0; j < chunk.length; j++) {
        const item = chunk[j];
        const pos = positions[j];
        await drawIdBadgeOnCanvas(ctx, pos.x, pos.y, cardW, cardH, item, mode, logoImg);
      }

      pdf.addImage(pageCanvas.toDataURL("image/jpeg", 0.94), "JPEG", 0, 0, 794, 1123);
    }

    pdf.save(`ID_Card_Kalung_${fileLabel}.pdf`);
    toast(`PDF ID Card (${itemList.length} Kartu) berhasil diunduh!`);
  } catch (err) {
    console.error(err);
    toast("Gagal membuat PDF ID Card.");
  }

  progBox?.classList.add("hidden");
}

async function drawIdBadgeOnCanvas(ctx, x, y, w, h, item, mode, logoImg) {
  // 1. Garis Putus-Putus Potong Gunting Luar
  ctx.save();
  ctx.strokeStyle = "#94a3b8";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 6]);
  ctx.strokeRect(x, y, w, h);
  ctx.restore();

  // 2. Header Biru Tua / Emas Kartu ID
  ctx.fillStyle = "#0f172a";
  ctx.fillRect(x + 6, y + 6, w - 12, 112);

  // Lubang Tali Kalung (Lanyard Slot) di Tengah Atas
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x + w / 2 - 28, y + 14, 56, 10);

  // Logo K3S di Header Kartu
  if (logoImg) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x + 20, y + 34, 58, 58);
    ctx.drawImage(logoImg, x + 23, y + 37, 52, 52);
  }

  ctx.textAlign = "left";
  ctx.fillStyle = "#fbbf24";
  ctx.font = "800 13px 'Plus Jakarta Sans', Arial, sans-serif";
  ctx.fillText("RAKOR KEPALA SD/MI 2026", x + 88, y + 52);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 11.5px 'Plus Jakarta Sans', Arial, sans-serif";
  ctx.fillText("K3S SD/MI KOTA KUPANG", x + 88, y + 70);

  ctx.fillStyle = "#93c5fd";
  ctx.font = "bold 10px 'Plus Jakarta Sans', Arial, sans-serif";
  ctx.fillText("19 – 21 NOVEMBER 2026", x + 88, y + 86);

  // Pita Peran (PESERTA vs PANITIA)
  const isPeserta = mode === "peserta";
  ctx.fillStyle = isPeserta ? "#059669" : "#d97706";
  ctx.fillRect(x + 6, y + 118, w - 12, 30);

  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.font = "800 13px 'Plus Jakarta Sans', Arial, sans-serif";
  const badgeRoleText = isPeserta
    ? `PESERTA • SUB RAYON ${(item.subrayon || '').toUpperCase()}`
    : (item.tugas_subrayon ? `PANITIA & KETUA RAYON ${item.tugas_subrayon.toUpperCase()}` : "PANITIA PELAKSANA");
  ctx.fillText(badgeRoleText, x + w / 2, y + 138);

  // 3. Gambar QR Code di Tengah Kartu
  const qrPayload = isPeserta
    ? `PESERTA|${item.npsn}|${item.nama_sekolah}|${item.subrayon}`
    : `PANITIA|${item.id_panitia}|${item.nama_panitia}|${item.divisi}`;

  const qrSource = await renderSingleQrToImage(qrPayload, 175);
  const qrX = x + (w - 175) / 2;
  const qrY = y + 165;

  ctx.strokeStyle = "#cbd5e1";
  ctx.lineWidth = 2;
  ctx.strokeRect(qrX - 8, qrY - 8, 191, 191);
  if (qrSource) {
    ctx.drawImage(qrSource, qrX, qrY, 175, 175);
  }

  // 4. Nama Lengkap, Nama Sekolah / Divisi & Kamar di Bawah QR
  const mainTitle = isPeserta
    ? String(item.nama_sekolah || "").slice(0, 32)
    : String(item.nama_panitia || "").slice(0, 32);

  const subTitle = isPeserta
    ? String(item.nama_kepsek || "Kepala Sekolah").slice(0, 36)
    : String(item.divisi || "Panitia").slice(0, 36);

  const bottomMeta = isPeserta
    ? `NPSN: ${item.npsn}  |  Kamar: ${item.nomor_kamar && item.nomor_kamar !== 'Belum Ditentukan' ? item.nomor_kamar : '....................'}`
    : `Jabatan: ${item.jabatan || 'Anggota'}  |  ID: ${item.id_panitia}`;

  ctx.textAlign = "center";
  ctx.fillStyle = "#0f172a";
  ctx.font = "800 14px 'Plus Jakarta Sans', Arial, sans-serif";
  ctx.fillText(mainTitle, x + w / 2, y + 382);

  ctx.fillStyle = "#1e3a8a";
  ctx.font = "bold 12px 'Plus Jakarta Sans', Arial, sans-serif";
  ctx.fillText(subTitle, x + w / 2, y + 404);

  // Kotak Info Kamar / NPSN di Bawah
  ctx.fillStyle = "#f1f5f9";
  ctx.fillRect(x + 18, y + 422, w - 36, 34);
  ctx.strokeStyle = "#cbd5e1";
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 18, y + 422, w - 36, 34);

  ctx.fillStyle = "#334155";
  ctx.font = "bold 11px 'Plus Jakarta Sans', Arial, sans-serif";
  ctx.fillText(bottomMeta, x + w / 2, y + 443);

  // Footer Kartu
  ctx.fillStyle = "#0f172a";
  ctx.fillRect(x + 6, y + h - 24, w - 12, 18);
  ctx.fillStyle = "#fbbf24";
  ctx.font = "bold 9px 'Plus Jakarta Sans', Arial, sans-serif";
  ctx.fillText("SIM-RAKOR K3S KOTA KUPANG • SCAN QR UNTUK PRESENSI & LAYANAN", x + w / 2, y + h - 12);
}
