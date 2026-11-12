// js/fitur_ekstra.js
// Mencakup: (1) Cetak PDF ID Card Kalung Elegan, (3) Running Text Live dengan Pengatur Kecepatan, (5) PWA Install
import { sb, toast } from './supabase.js';

const SUBRAYON_LIST = ["Maulafa", "Alak", "Kota Raja", "Oebobo", "Kelapa Lima", "Kota Lama"];
let deferredPwaPrompt = null;
let pwaInitialized = false;
let logoImgCache = null;

// Wewenang Merilis Live Info Running Text:
// HANYA Penanggung Jawab, Ketua Panitia, Sekretaris, Bendahara, dan Seksi Konsumsi
function canManageBroadcast(activeUser) {
  return Boolean(
    activeUser &&
    activeUser.role === 'panitia' &&
    [
      'Penanggung Jawab',
      'Ketua Panitia',
      'Sekretaris',
      'Bendahara',
      'Seksi Konsumsi'
    ].includes(activeUser.profile?.divisi)
  );
}

// Wewenang Cetak ID Card Kalung: HANYA Sekretaris dan Seksi Kesekretariatan
function canPrintIdCards(activeUser) {
  return Boolean(
    activeUser &&
    activeUser.role === 'panitia' &&
    ['Sekretaris', 'Seksi Kesekretariatan'].includes(activeUser.profile?.divisi)
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

export function renderFiturEkstraWidgets(activeUser, sekolahList, panitiaList, layananList, reloadCallback) {
  initPwaInstallSupport();
  injectHeaderInstallButton();
  renderLiveRunningTextBanner(activeUser, layananList, reloadCallback);
  renderBulkIdCardGeneratorWidget(activeUser, sekolahList, panitiaList);
}

// =========================================================================
// FITUR 5: PWA INSTALL KE LAYAR UTAMA HP ANDROID / IOS
// =========================================================================
export function initPwaInstallSupport() {
  if (pwaInitialized) return;
  pwaInitialized = true;

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

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPwaPrompt = e;
    injectInstallAppButtons();
    injectHeaderInstallButton();
  });

  injectInstallAppButtons();
}

function isRunningStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function injectInstallAppButtons() {
  if (isRunningStandalone()) return;

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

// Tambahkan juga ikon Install Aplikasi di Header Kanan Atas (Jika belum diinstal)
function injectHeaderInstallButton() {
  const existing = document.getElementById("btnHeaderPwaInstall");
  if (isRunningStandalone()) {
    if (existing) existing.remove();
    return;
  }

  const musicBtn = document.getElementById("btnHeaderK3sMusic") || document.getElementById("btnHeaderNotifBell") || document.getElementById("btnRefreshApp");
  if (!musicBtn || !musicBtn.parentElement) return;

  if (!existing) {
    const btn = document.createElement("button");
    btn.id = "btnHeaderPwaInstall";
    btn.type = "button";
    btn.title = "Pasang Aplikasi ke Layar Utama HP";
    btn.className = "w-9 h-9 rounded-2xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/30 flex items-center justify-center text-xs text-emerald-300 active:scale-95 transition";
    btn.innerHTML = `<i class="fa-solid fa-mobile-screen-button"></i>`;
    btn.onclick = () => triggerInstallAppFlow();
    musicBtn.parentElement.insertBefore(btn, musicBtn);
  }
}

export async function triggerInstallAppFlow() {
  // Jika Chrome Android sudah siap melakukan 1-Click Install
  if (deferredPwaPrompt) {
    deferredPwaPrompt.prompt();
    const { outcome } = await deferredPwaPrompt.userChoice;
    if (outcome === 'accepted') {
      toast("Aplikasi SIM-RAKOR sedang dipasang ke layar utama HP Anda!");
      deferredPwaPrompt = null;
    }
    return;
  }

  // Jika dibuka dari browser internal WhatsApp / iOS / atau sudah terinstal, tampilkan modal panduan interaktif
  const modal = document.getElementById("serviceModal");
  const titleEl = document.getElementById("serviceModalTitle");
  const bodyEl = document.getElementById("serviceModalBody");
  if (!modal || !titleEl || !bodyEl) {
    alert("CARA PASANG DI LAYAR HP:\n\n1. Ketuk ikon Titik Tiga (⋮) di pojok kanan atas browser Chrome Anda.\n2. Pilih 'Instal Aplikasi' atau 'Tambahkan ke Layar Utama' (Add to Home Screen).\n3. Ikon berlogo K3S akan langsung muncul di layar depan HP Anda!");
    return;
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
        Pasang ikon aplikasi ini di layar depan HP Anda agar tampil layar penuh seperti aplikasi Play Store dan tidak perlu mengetik alamat link lagi.
      </p>
    </div>

    <div class="p-4 rounded-2xl bg-emerald-50 border-2 border-emerald-300 space-y-2.5 text-xs text-slate-800">
      <div class="font-extrabold text-emerald-950 uppercase text-[11px] flex items-center gap-1.5">
        <i class="fa-brands fa-android text-emerald-600 text-sm"></i>
        <span>Langkah Cepat di HP Android (Chrome):</span>
      </div>
      <ol class="list-decimal list-inside space-y-2 text-[11px] font-semibold leading-relaxed">
        <li>Pastikan link ini dibuka di browser <b>Google Chrome</b> (jika Anda membukanya dari dalam chat WhatsApp, ketuk pojok kanan atas lalu pilih <i>"Buka di Chrome"</i>).</li>
        <li>Ketuk ikon <b>Titik Tiga (⋮)</b> di pojok kanan atas browser Chrome Anda.</li>
        <li>Pilih menu <b>"Instal aplikasi"</b> atau <b>"Tambahkan ke layar utama"</b> (<i>Add to Home screen</i>).</li>
        <li>Ketuk <b>Instal / Tambah</b> — ikon berlogo K3S langsung muncul di layar utama HP Anda!</li>
      </ol>
    </div>

    <div class="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1.5 text-xs text-slate-700">
      <div class="font-extrabold text-slate-900 uppercase text-[10px]">
        <i class="fa-brands fa-apple mr-1"></i> Pengguna iPhone (Safari):
      </div>
      <p class="text-[11px]">Ketuk ikon <b>Bagikan (Share)</b> di bagian bawah Safari, lalu pilih <b>"Tambah ke Layar Utama" (Add to Home Screen)</b>.</p>
    </div>
  `;
}

// =========================================================================
// FITUR 3: RUNNING TEXT PENGUMUMAN LIVE + PENGATUR KECEPATAN
// =========================================================================
function renderLiveRunningTextBanner(activeUser, layananList, reloadCallback) {
  const tabBeranda = document.getElementById("tabContentBeranda");
  if (!tabBeranda) return;

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
        animation-name: k3sMarquee;
        animation-timing-function: linear;
        animation-iteration-count: infinite;
      }
      .animate-k3s-marquee:hover,
      .animate-k3s-marquee:active {
        animation-play-state: paused;
      }
    `;
    document.head.appendChild(st);
  }

  const broadcastItem = (layananList || []).find(x => x.kode_menu === 'pengumuman_live') || {
    kode_menu: 'pengumuman_live',
    judul: 'Info Penting Panitia',
    deskripsi: 'Selamat datang Peserta Rakor Kepala SD/MI Kota Kupang (19–21 November 2026). Pastikan menunjukkan QR Code saat registrasi & pengambilan Rakor Kit.',
    url_link: '45', // Menyimpan durasi kecepatan dalam detik (Default: 45 detik agar santai & mudah dibaca)
    status_tersedia: 'AKTIF'
  };

  // Ambil durasi kecepatan dari kolom url_link (default 45 detik jika belum diatur)
  const rawSpeedSec = parseInt(broadcastItem.url_link, 10);
  const speedSeconds = (!isNaN(rawSpeedSec) && rawSpeedSec >= 15 && rawSpeedSec <= 90) ? rawSpeedSec : 45;

  const isActive = broadcastItem.status_tersedia !== 'NONAKTIF';
  const canEdit = canManageBroadcast(activeUser);

  let bar = document.getElementById("liveBroadcastTickerBar");
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "liveBroadcastTickerBar";
    tabBeranda.insertBefore(bar, tabBeranda.firstChild);
  }

  if (!isActive && !canEdit) {
    bar.className = "hidden";
    bar.innerHTML = "";
    return;
  }

  bar.className = `rounded-2xl p-2.5 border shadow-sm flex items-center justify-between gap-2 cursor-pointer ${
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
        <div style="animation-duration: ${speedSeconds}s;" class="text-xs font-extrabold ${isActive ? 'text-slate-900 animate-k3s-marquee' : 'text-slate-500 truncate'}">
          <b>[${broadcastItem.judul}]</b>: ${broadcastItem.deskripsi} &nbsp;&nbsp;&nbsp; • &nbsp;&nbsp;&nbsp; <b>[${broadcastItem.judul}]</b>: ${broadcastItem.deskripsi}
        </div>
      </div>
    </div>
    ${canEdit ? `
      <button type="button" id="btnEditLiveBroadcast" class="px-2.5 py-1 rounded-xl bg-slate-900 hover:bg-slate-800 text-amber-300 font-extrabold text-[10px] shrink-0 flex items-center gap-1 shadow-2xs">
        <i class="fa-solid fa-sliders"></i>
        <span>Atur Info</span>
      </button>
    ` : ''}
  `;

  bar.onclick = () => {
    openBroadcastEditorModal(activeUser, broadcastItem, speedSeconds, reloadCallback);
  };
}

function openBroadcastEditorModal(activeUser, broadcastItem, currentSpeedSec, reloadCallback) {
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
            <i class="fa-solid fa-sliders text-blue-800 mr-1"></i> Pengaturan Siaran & Kecepatan Teks
          </span>
          <span class="text-[9px] font-extrabold uppercase bg-blue-100 text-blue-900 px-2 py-0.5 rounded">
            ${activeUser.profile?.divisi}
          </span>
        </div>

        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="block text-[10px] font-bold text-slate-700 mb-1">Kategori / Sumber Info:</label>
            <input id="inpBroadcastTitle" type="text" value="${broadcastItem.judul || 'Info Penting Panitia'}" placeholder="Contoh: Info Seksi Konsumsi" class="w-full rounded-xl border bg-white px-3 py-2 text-xs font-bold" />
          </div>
          <div>
            <label class="block text-[10px] font-bold text-slate-700 mb-1">Kecepatan Jalan Teks:</label>
            <select id="inpBroadcastSpeed" class="w-full rounded-xl border bg-white px-2.5 py-2 text-xs font-extrabold text-blue-950">
              <option value="65" ${currentSpeedSec >= 60 ? 'selected' : ''}>Sangat Santai (Lambat)</option>
              <option value="45" ${currentSpeedSec >= 40 && currentSpeedSec < 60 ? 'selected' : ''}>Normal Nyaman (Default)</option>
              <option value="32" ${currentSpeedSec >= 28 && currentSpeedSec < 40 ? 'selected' : ''}>Sedang</option>
              <option value="22" ${currentSpeedSec < 28 ? 'selected' : ''}>Agak Cepat</option>
            </select>
          </div>
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
          <span>Simpan & Siarkan Pengumuman</span>
        </button>
      </div>
    ` : `
      <div class="text-[10px] text-center text-slate-400 font-semibold">
        Siaran informasi ini dikelola oleh Pimpinan Panitia, Sekretaris, Bendahara & Seksi Konsumsi.
      </div>
    `}
  `;

  document.getElementById("btnSaveBroadcastNow")?.addEventListener("click", async () => {
    if (!canEdit) return;
    const judul = document.getElementById("inpBroadcastTitle")?.value.trim() || "Info Penting Panitia";
    const deskripsi = document.getElementById("inpBroadcastText")?.value.trim() || "";
    const speedVal = document.getElementById("inpBroadcastSpeed")?.value || "45";
    const active = document.getElementById("chkBroadcastActive")?.checked;

    if (!deskripsi) return toast("Isi kalimat pengumuman tidak boleh kosong!");

    await sb.from("info_layanan").upsert([{
      kode_menu: 'pengumuman_live',
      judul,
      deskripsi,
      url_link: String(speedVal),
      status_tersedia: active ? 'AKTIF' : 'NONAKTIF'
    }]);

    toast(active ? "Pengumuman & kecepatan teks berhasil diperbarui!" : "Running Text disembunyikan.");
    modal.classList.add("hidden");
    if (reloadCallback) await reloadCallback();
  });
}

// =========================================================================
// FITUR 1: CETAK PDF ID CARD KALUNG ELEGAN & CERAH (KHUSUS SEKRETARIS & KESEKRETARIATAN)
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
    btn.className = "col-span-3 p-3.5 rounded-2xl bg-gradient-to-r from-sky-600 via-blue-700 to-indigo-800 text-white border border-sky-300/40 flex items-center justify-between px-4 active:scale-[0.99] transition shadow-md";
    gridContainer.appendChild(btn);
  }

  const targetBtn = document.getElementById("btnServiceBulkIdCards");
  if (targetBtn) {
    targetBtn.innerHTML = `
      <div class="flex items-center gap-3 text-left">
        <div class="w-11 h-11 rounded-2xl bg-amber-300 text-slate-950 flex items-center justify-center text-lg font-extrabold shadow shrink-0">
          <i class="fa-solid fa-id-badge"></i>
        </div>
        <div>
          <div class="flex items-center gap-1.5 flex-wrap">
            <span class="text-xs font-extrabold text-white">Cetak ID Card Kalung (Desain Cerah Elegan)</span>
            <span class="text-[9px] font-extrabold uppercase bg-white/20 text-amber-200 border border-amber-300/40 px-1.5 py-0.5 rounded">Khusus Kesekretariatan</span>
          </div>
          <div class="text-[10px] text-sky-100 mt-0.5">
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
  if (!canPrintIdCards(activeUser)) {
    return toast("Akses Ditolak: Menu ini khusus untuk Sekretaris & Seksi Kesekretariatan!");
  }

  const modal = document.getElementById("serviceModal");
  const titleEl = document.getElementById("serviceModalTitle");
  const bodyEl = document.getElementById("serviceModalBody");
  if (!modal || !titleEl || !bodyEl) return;

  modal.classList.remove("hidden");
  titleEl.innerHTML = `<i class="fa-solid fa-id-badge text-blue-600 mr-1.5"></i> Cetak ID Card Kalung (Desain Baru)`;

  bodyEl.innerHTML = `
    <div class="p-4 rounded-2xl bg-gradient-to-br from-sky-50 via-blue-50 to-amber-50/60 border border-sky-200 space-y-2">
      <div class="flex items-center justify-between">
        <span class="text-[10px] font-extrabold uppercase bg-blue-700 text-white px-2.5 py-0.5 rounded-full">
          Desain Cerah, Modern & Elegan
        </span>
        <span class="text-[10px] font-extrabold text-amber-700">Otoritas Kesekretariatan</span>
      </div>
      <p class="text-[11px] text-slate-700 leading-relaxed">
        Setiap lembar A4 menampilkan <b>4 Kartu Name Tag Berwarna Cerah</b> dengan gelombang kurva emas-biru khas Logo K3S, bingkai QR Code modern, serta informasi Sekolah/Jabatan dan Kamar Hotel.
      </p>
    </div>

    <div class="space-y-2">
      <div class="text-xs font-extrabold text-slate-800 uppercase">1. Unduh PDF Kartu Peserta Per Sub Rayon:</div>
      <div class="grid grid-cols-2 gap-2">
        ${SUBRAYON_LIST.map(sr => {
          const count = sekolahList.filter(s => s.subrayon === sr).length;
          return `
            <button type="button" data-sr="${sr}" class="btn-print-sr-cards p-3 rounded-2xl bg-white hover:bg-sky-50 border border-slate-200 hover:border-sky-300 shadow-2xs text-left flex items-center justify-between transition">
              <div>
                <div class="font-extrabold text-xs text-slate-900">Rayon ${sr}</div>
                <div class="text-[10px] text-slate-500">${count} Kartu Kepsek</div>
              </div>
              <div class="w-8 h-8 rounded-xl bg-gradient-to-br from-sky-500 to-blue-700 text-white flex items-center justify-center text-xs shrink-0 shadow-2xs">
                <i class="fa-solid fa-file-pdf"></i>
              </div>
            </button>
          `;
        }).join('')}
      </div>
    </div>

    <div class="space-y-2 pt-2 border-t border-slate-200">
      <div class="text-xs font-extrabold text-slate-800 uppercase">2. Unduh PDF Kartu Panitia Pelaksana:</div>
      <button type="button" id="btnPrintPanitiaCards" class="w-full p-3.5 rounded-2xl bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-300 hover:from-amber-400 hover:to-yellow-200 text-slate-950 font-extrabold text-xs shadow flex items-center justify-between">
        <div class="flex items-center gap-2.5">
          <i class="fa-solid fa-user-shield text-blue-950 text-base"></i>
          <span>Unduh PDF ID Card Seluruh Panitia (${panitiaList.length} Orang)</span>
        </div>
        <span class="text-[10px] bg-slate-950 text-amber-300 px-2.5 py-1 rounded-xl font-extrabold">Unduh PDF</span>
      </button>
    </div>

    <div id="bulkPrintProgressBox" class="hidden p-3.5 rounded-2xl bg-sky-50 border border-sky-300 text-center text-xs font-extrabold text-sky-950">
      <i class="fa-solid fa-spinner animate-spin mr-1.5 text-sky-600"></i> Sedang melukis desain kartu & menyiapkan halaman PDF...
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

function fillRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
}

function strokeRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.stroke();
}

async function generateBulkIdCardsPdf(fileLabel, itemList, mode = "peserta") {
  const progBox = document.getElementById("bulkPrintProgressBox");
  progBox?.classList.remove("hidden");

  try {
    await ensureJsPdfLoaded();
    const logoImg = await preloadLogo();
    const { jsPDF } = window.jspdf;

    const pdf = new jsPDF({ orientation: "portrait", unit: "px", format: [794, 1123] });
    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = 794;
    pageCanvas.height = 1123;
    const ctx = pageCanvas.getContext("2d");

    const cardW = 340;
    const cardH = 502;
    const positions = [
      { x: 38, y: 44 },
      { x: 416, y: 44 },
      { x: 38, y: 576 },
      { x: 416, y: 576 }
    ];

    for (let i = 0; i < itemList.length; i += 4) {
      if (i > 0) pdf.addPage([794, 1123], "portrait");

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, 794, 1123);

      const chunk = itemList.slice(i, i + 4);
      for (let j = 0; j < chunk.length; j++) {
        const item = chunk[j];
        const pos = positions[j];
        await drawModernElegantIdBadge(ctx, pos.x, pos.y, cardW, cardH, item, mode, logoImg);
      }

      pdf.addImage(pageCanvas.toDataURL("image/jpeg", 0.96), "JPEG", 0, 0, 794, 1123);
    }

    pdf.save(`ID_Card_Elegan_${fileLabel}.pdf`);
    toast(`PDF ID Card Elegan (${itemList.length} Kartu) berhasil diunduh!`);
  } catch (err) {
    console.error(err);
    toast("Gagal membuat PDF ID Card.");
  }

  progBox?.classList.add("hidden");
}

async function drawModernElegantIdBadge(ctx, x, y, w, h, item, mode, logoImg) {
  const isPeserta = mode === "peserta";

  ctx.save();

  ctx.beginPath();
  ctx.moveTo(x + 18, y);
  ctx.lineTo(x + w - 18, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + 18);
  ctx.lineTo(x + w, y + h - 18);
  ctx.quadraticCurveTo(x + w, y + h, x + w - 18, y + h);
  ctx.lineTo(x + 18, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - 18);
  ctx.lineTo(x, y + 18);
  ctx.quadraticCurveTo(x, y, x + 18, y);
  ctx.closePath();
  ctx.clip();

  const bgGrad = ctx.createLinearGradient(x, y, x, y + h);
  bgGrad.addColorStop(0, "#ffffff");
  bgGrad.addColorStop(0.55, "#f8fafc");
  bgGrad.addColorStop(1, isPeserta ? "#eff6ff" : "#fffbeb");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(x, y, w, h);

  ctx.fillStyle = isPeserta ? "rgba(59, 130, 246, 0.08)" : "rgba(245, 158, 11, 0.12)";
  for (let gx = x + w - 110; gx < x + w - 15; gx += 14) {
    for (let gy = y + 25; gy < y + 115; gy += 14) {
      ctx.beginPath();
      ctx.arc(gx, gy, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const goldWaveGrad = ctx.createLinearGradient(x, y, x + w, y + 90);
  goldWaveGrad.addColorStop(0, "#fbbf24");
  goldWaveGrad.addColorStop(0.5, "#f59e0b");
  goldWaveGrad.addColorStop(1, "#fde047");
  ctx.fillStyle = goldWaveGrad;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + 66);
  ctx.bezierCurveTo(x + w * 0.65, y + 95, x + w * 0.35, y + 35, x, y + 78);
  ctx.closePath();
  ctx.fill();

  const topWaveGrad = ctx.createLinearGradient(x, y, x + w, y);
  if (isPeserta) {
    topWaveGrad.addColorStop(0, "#1d4ed8");
    topWaveGrad.addColorStop(0.6, "#2563eb");
    topWaveGrad.addColorStop(1, "#0ea5e9");
  } else {
    topWaveGrad.addColorStop(0, "#1e3a8a");
    topWaveGrad.addColorStop(0.6, "#1d4ed8");
    topWaveGrad.addColorStop(1, "#3b82f6");
  }
  ctx.fillStyle = topWaveGrad;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + 54);
  ctx.bezierCurveTo(x + w * 0.68, y + 82, x + w * 0.32, y + 26, x, y + 65);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  fillRoundRect(ctx, x + w / 2 - 30, y + 12, 60, 11, 5.5);
  ctx.strokeStyle = "#cbd5e1";
  ctx.lineWidth = 1;
  strokeRoundRect(ctx, x + w / 2 - 30, y + 12, 60, 11, 5.5);

  if (logoImg) {
    ctx.drawImage(logoImg, x + (w - 138) / 2, y + 50, 138, 68);
  }

  ctx.textAlign = "center";
  ctx.fillStyle = "#1e3a8a";
  ctx.font = "800 12.5px 'Plus Jakarta Sans', Arial, sans-serif";
  ctx.fillText("RAPAT KOORDINASI KEPALA SD/MI", x + w / 2, y + 132);

  ctx.fillStyle = "#d97706";
  ctx.font = "800 10px 'Plus Jakarta Sans', Arial, sans-serif";
  ctx.fillText("KOTA KUPANG • 19 – 21 NOVEMBER 2026", x + w / 2, y + 146);

  const pillW = w - 48;
  const pillX = x + 24;
  const pillY = y + 156;
  const pillGrad = ctx.createLinearGradient(pillX, pillY, pillX + pillW, pillY);

  if (isPeserta) {
    pillGrad.addColorStop(0, "#0284c7");
    pillGrad.addColorStop(0.5, "#2563eb");
    pillGrad.addColorStop(1, "#0284c7");
  } else {
    pillGrad.addColorStop(0, "#f59e0b");
    pillGrad.addColorStop(0.5, "#fbbf24");
    pillGrad.addColorStop(1, "#f59e0b");
  }

  ctx.fillStyle = pillGrad;
  fillRoundRect(ctx, pillX, pillY, pillW, 28, 14);

  ctx.fillStyle = isPeserta ? "#ffffff" : "#0f172a";
  ctx.font = "800 11.5px 'Plus Jakarta Sans', Arial, sans-serif";
  const roleLabel = isPeserta
    ? `PESERTA • SUB RAYON ${(item.subrayon || '').toUpperCase()}`
    : (item.tugas_subrayon ? `PANITIA • KETUA RAYON ${item.tugas_subrayon.toUpperCase()}` : "PANITIA PELAKSANA RAKOR");
  ctx.fillText(roleLabel, x + w / 2, pillY + 18);

  const qrSize = 152;
  const qrBoxSize = qrSize + 20;
  const qrBoxX = x + (w - qrBoxSize) / 2;
  const qrBoxY = y + 195;

  ctx.fillStyle = "rgba(15, 23, 42, 0.06)";
  fillRoundRect(ctx, qrBoxX + 3, qrBoxY + 4, qrBoxSize, qrBoxSize, 18);

  ctx.fillStyle = "#ffffff";
  fillRoundRect(ctx, qrBoxX, qrBoxY, qrBoxSize, qrBoxSize, 18);
  ctx.strokeStyle = isPeserta ? "#93c5fd" : "#fcd34d";
  ctx.lineWidth = 2;
  strokeRoundRect(ctx, qrBoxX, qrBoxY, qrBoxSize, qrBoxSize, 18);

  ctx.strokeStyle = "#f59e0b";
  ctx.lineWidth = 3;
  const cLen = 14;
  ctx.beginPath(); ctx.moveTo(qrBoxX + 6, qrBoxY + 6 + cLen); ctx.lineTo(qrBoxX + 6, qrBoxY + 6); ctx.lineTo(qrBoxX + 6 + cLen, qrBoxY + 6); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(qrBoxX + qrBoxSize - 6 - cLen, qrBoxY + 6); ctx.lineTo(qrBoxX + qrBoxSize - 6, qrBoxY + 6); ctx.lineTo(qrBoxX + qrBoxSize - 6, qrBoxY + 6 + cLen); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(qrBoxX + 6, qrBoxY + qrBoxSize - 6 - cLen); ctx.lineTo(qrBoxX + 6, qrBoxY + qrBoxSize - 6); ctx.lineTo(qrBoxX + 6 + cLen, qrBoxY + qrBoxSize - 6); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(qrBoxX + qrBoxSize - 6 - cLen, qrBoxY + qrBoxSize - 6); ctx.lineTo(qrBoxX + qrBoxSize - 6, qrBoxY + qrBoxSize - 6); ctx.lineTo(qrBoxX + qrBoxSize - 6, qrBoxY + qrBoxSize - 6 - cLen); ctx.stroke();

  const qrPayload = isPeserta
    ? `PESERTA|${item.npsn}|${item.nama_sekolah}|${item.subrayon}`
    : `PANITIA|${item.id_panitia}|${item.nama_panitia}|${item.divisi}`;

  const qrSource = await renderSingleQrToImage(qrPayload, qrSize);
  if (qrSource) {
    ctx.drawImage(qrSource, qrBoxX + 10, qrBoxY + 10, qrSize, qrSize);
  }

  const mainTitle = isPeserta
    ? String(item.nama_sekolah || "").slice(0, 32)
    : String(item.nama_panitia || "").slice(0, 32);

  const subTitle = isPeserta
    ? String(item.nama_kepsek || "Kepala Sekolah Peserta Rakor").slice(0, 36)
    : String(item.divisi || "Panitia Pelaksana").slice(0, 36);

  ctx.textAlign = "center";
  ctx.fillStyle = "#0f172a";
  ctx.font = "800 14.5px 'Plus Jakarta Sans', Arial, sans-serif";
  ctx.fillText(mainTitle, x + w / 2, y + 390);

  ctx.fillStyle = "#1d4ed8";
  ctx.font = "bold 11.5px 'Plus Jakarta Sans', Arial, sans-serif";
  ctx.fillText(subTitle, x + w / 2, y + 410);

  const infoBoxX = x + 22;
  const infoBoxY = y + 422;
  const infoBoxW = w - 44;

  ctx.fillStyle = "#ffffff";
  fillRoundRect(ctx, infoBoxX, infoBoxY, infoBoxW, 34, 12);
  ctx.strokeStyle = "#bae6fd";
  ctx.lineWidth = 1.5;
  strokeRoundRect(ctx, infoBoxX, infoBoxY, infoBoxW, 34, 12);

  const bottomMeta = isPeserta
    ? `NPSN: ${item.npsn}   •   KAMAR: ${item.nomor_kamar && item.nomor_kamar !== 'Belum Ditentukan' ? item.nomor_kamar : '............'}`
    : `JABATAN: ${(item.jabatan || 'ANGGOTA').toUpperCase()}   •   ID: ${item.id_panitia}`;

  ctx.fillStyle = "#0f172a";
  ctx.font = "800 10.5px 'Plus Jakarta Sans', Arial, sans-serif";
  ctx.fillText(bottomMeta, x + w / 2, infoBoxY + 21);

  ctx.fillStyle = goldWaveGrad;
  ctx.fillRect(x, y + h - 32, w, 6);

  ctx.fillStyle = topWaveGrad;
  ctx.fillRect(x, y + h - 26, w, 26);

  ctx.fillStyle = "#ffffff";
  ctx.font = "800 9px 'Plus Jakarta Sans', Arial, sans-serif";
  ctx.fillText("SIM-RAKOR K3S KOTA KUPANG • SCAN QR CODE DI MEJA LAYANAN", x + w / 2, y + h - 10);

  ctx.restore();

  ctx.save();
  ctx.strokeStyle = "#cbd5e1";
  ctx.lineWidth = 1.2;
  ctx.setLineDash([5, 5]);
  strokeRoundRect(ctx, x, y, w, h, 18);
  ctx.restore();
}
