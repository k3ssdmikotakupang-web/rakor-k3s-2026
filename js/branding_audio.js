// js/branding_audio.js
import { sb, toast } from './supabase.js';

// Built-in SVG Data URI Logo Resmi K3S Kota Kupang (Biru & Pita Emas)
// Menjamin logo 100% SELALU TAMPIL TAJAM meskipun file PNG belum diupload ke GitHub!
const FALLBACK_K3S_SVG_DATA_URI = "data:image/svg+xml;utf8," + encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 310">
  <defs>
    <linearGradient id="k3sBlue" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0284c7"/>
      <stop offset="45%" stop-color="#1d4ed8"/>
      <stop offset="100%" stop-color="#0f172a"/>
    </linearGradient>
    <linearGradient id="k3sGold" x1="0%" y1="0%" x2="100%" y2="20%">
      <stop offset="0%" stop-color="#b45309"/>
      <stop offset="35%" stop-color="#fbbf24"/>
      <stop offset="65%" stop-color="#fef08a"/>
      <stop offset="100%" stop-color="#d97706"/>
    </linearGradient>
    <filter id="softShadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="4" stdDeviation="4" flood-opacity="0.22"/>
    </filter>
  </defs>
  <rect width="500" height="310" rx="28" fill="#ffffff"/>
  <g filter="url(#softShadow)">
    <text x="85" y="185" font-family="Arial Black, Impact, sans-serif" font-weight="900" font-size="145" fill="url(#k3sBlue)">K</text>
    <text x="202" y="185" font-family="Arial Black, Impact, sans-serif" font-weight="900" font-size="145" fill="url(#k3sGold)">3</text>
    <text x="305" y="185" font-family="Arial Black, Impact, sans-serif" font-weight="900" font-size="145" fill="url(#k3sBlue)">S</text>
    <path d="M 42 188 Q 145 78 258 148 T 458 140 Q 380 212 252 162 T 42 188 Z" fill="url(#k3sGold)"/>
  </g>
  <text x="250" y="232" text-anchor="middle" font-family="Arial, sans-serif" font-weight="900" font-size="21" fill="#0f172a" letter-spacing="0.5">KELOMPOK KERJA KEPALA SEKOLAH</text>
  <line x1="38" y1="262" x2="145" y2="262" stroke="#d97706" stroke-width="3.5"/>
  <text x="250" y="270" text-anchor="middle" font-family="Arial, sans-serif" font-weight="800" font-size="22" fill="#b45309" letter-spacing="5">KOTA KUPANG</text>
  <line x1="355" y1="262" x2="462" y2="262" stroke="#d97706" stroke-width="3.5"/>
</svg>`);

export let LOGO_K3S_PATH = window.__RESOLVED_K3S_LOGO || FALLBACK_K3S_SVG_DATA_URI;

const CANDIDATE_LOGO_FILES = [
  './logo-k3s.png',
  'logo-k3s.png',
  './Untitled design (19).png',
  'Untitled design (19).png',
  './logo.png',
  './js/logo-k3s.png'
];

const DEFAULT_DRIVE_VIEW_URL = 'https://drive.google.com/file/d/1-gXX08p8sx-20XxlKVi3hBJQmNccmlVM/view?usp=sharing';
const DEFAULT_DRIVE_PREVIEW_URL = 'https://drive.google.com/file/d/1-gXX08p8sx-20XxlKVi3hBJQmNccmlVM/preview';

let isAudioPlaying = false;
let currentSongRecord = null;
let logoDetectionDone = false;

// Deteksi otomatis lokasi file logo PNG atau dari database Supabase
export async function resolveBestK3sLogoUrl(layananList = []) {
  // 1. Cek apakah Sekretaris sudah pernah upload logo resmi ke Supabase
  const dbLogo = (layananList || []).find(x => x.kode_menu === 'logo_k3s');
  if (dbLogo && dbLogo.url_link && dbLogo.url_link.startsWith('http')) {
    LOGO_K3S_PATH = dbLogo.url_link;
    window.__RESOLVED_K3S_LOGO = LOGO_K3S_PATH;
    refreshAllLogoImagesOnPage();
    return LOGO_K3S_PATH;
  }

  if (logoDetectionDone) return LOGO_K3S_PATH;
  logoDetectionDone = true;

  // 2. Cek satu per satu nama file gambar di GitHub
  for (const path of CANDIDATE_LOGO_FILES) {
    const ok = await testImageExists(path);
    if (ok) {
      LOGO_K3S_PATH = path;
      window.__RESOLVED_K3S_LOGO = path;
      refreshAllLogoImagesOnPage();
      return LOGO_K3S_PATH;
    }
  }

  // 3. Jika belum ada file yang cocok di GitHub, gunakan SVG Vektor Resmi K3S Kota Kupang
  LOGO_K3S_PATH = FALLBACK_K3S_SVG_DATA_URI;
  window.__RESOLVED_K3S_LOGO = LOGO_K3S_PATH;
  refreshAllLogoImagesOnPage();
  return LOGO_K3S_PATH;
}

function testImageExists(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

function refreshAllLogoImagesOnPage() {
  document.querySelectorAll("img.k3s-brand-logo, #loginK3sLogoImg").forEach(img => {
    img.src = LOGO_K3S_PATH;
    img.style.display = "block";
  });

  let favLink = document.querySelector("link[rel*='icon']");
  if (favLink) favLink.href = LOGO_K3S_PATH;
}

// 1. Terapkan Logo Resmi K3S ke Favicon, Layar Login, dan Avatar Header
export function applyK3sLogoBranding(activeUser) {
  let favLink = document.querySelector("link[rel*='icon']");
  if (!favLink) {
    favLink = document.createElement("link");
    favLink.rel = "icon";
    document.head.appendChild(favLink);
  }
  favLink.href = LOGO_K3S_PATH;

  // Pasang Logo K3S di Halaman Login (Mendeteksi wadah ikon secara akurat)
  const loginScreen = document.getElementById("loginScreen");
  if (loginScreen) {
    let logoImg = document.getElementById("loginK3sLogoImg");
    if (!logoImg) {
      // Cari ikon bawaan di bagian atas kartu login
      const firstIcon = loginScreen.querySelector(".fa-graduation-cap, .fa-school, .fa-award, .fa-user-tie");
      const iconContainer = firstIcon ? firstIcon.parentElement : null;

      if (iconContainer) {
        iconContainer.className = "w-28 h-24 rounded-3xl bg-white p-2 mx-auto mb-2 flex items-center justify-center shadow-2xl border-2 border-amber-400";
        iconContainer.innerHTML = `<img id="loginK3sLogoImg" src="${LOGO_K3S_PATH}" alt="Logo K3S Kota Kupang" class="k3s-brand-logo w-full h-full object-contain" />`;
      } else {
        // Jika tidak ada kotak ikon, sisipkan tepat di atas judul kartu login
        const h1 = loginScreen.querySelector("h1, h2");
        if (h1 && h1.parentElement) {
          const wrap = document.createElement("div");
          wrap.className = "w-28 h-24 rounded-3xl bg-white p-2 mx-auto mb-2.5 flex items-center justify-center shadow-2xl border-2 border-amber-400";
          wrap.innerHTML = `<img id="loginK3sLogoImg" src="${LOGO_K3S_PATH}" alt="Logo K3S Kota Kupang" class="k3s-brand-logo w-full h-full object-contain" />`;
          h1.parentElement.insertBefore(wrap, h1);
        }
      }
    } else {
      logoImg.src = LOGO_K3S_PATH;
      logoImg.style.display = "block";
    }
  }

  // Tampilkan Logo K3S di Avatar Pojok Kiri Atas jika pengguna belum upload foto pribadi
  const avatarEl = document.getElementById("topUserAvatar");
  if (avatarEl && activeUser && !activeUser.profile?.foto_profil) {
    const innerBox = avatarEl.querySelector("div");
    if (innerBox) {
      innerBox.className = "w-full h-full rounded-[14px] overflow-hidden flex items-center justify-center bg-white p-0.5";
      innerBox.innerHTML = `<img src="${LOGO_K3S_PATH}" alt="K3S" class="k3s-brand-logo w-full h-full object-contain" />`;
    }
  }
}

// 2. Pasang Hanya Ikon Musik di Header + Sinkronisasi Logo K3S
export async function renderK3sMusicPlayerWidget(activeUser, layananList, reloadCallback) {
  await resolveBestK3sLogoUrl(layananList);
  applyK3sLogoBranding(activeUser);

  const oldBanner = document.getElementById("k3sMusicHomeBanner");
  if (oldBanner) oldBanner.remove();

  const songItem = (layananList || []).find(x => x.kode_menu === 'lagu_k3s') || {
    kode_menu: 'lagu_k3s',
    judul: 'Mars / Lagu K3S Kota Kupang',
    deskripsi: 'Lagu resmi Kelompok Kerja Kepala Sekolah (K3S) SD/MI Kota Kupang.',
    url_link: DEFAULT_DRIVE_VIEW_URL,
    status_tersedia: 'Audio Resmi'
  };
  currentSongRecord = songItem;

  injectHeaderMusicButton(activeUser, reloadCallback);
}

function isDirectAudioFileUrl(url = '') {
  const lower = String(url).toLowerCase();
  return (
    lower.includes("supabase.co/storage") ||
    lower.endsWith(".mp3") ||
    lower.endsWith(".m4a") ||
    lower.endsWith(".wav") ||
    lower.endsWith(".ogg")
  );
}

function injectHeaderMusicButton(activeUser, reloadCallback) {
  const bellBtn = document.getElementById("btnHeaderNotifBell") || document.getElementById("btnRefreshApp");
  if (!bellBtn || !bellBtn.parentElement) return;

  let musicBtn = document.getElementById("btnHeaderK3sMusic");
  if (!musicBtn) {
    musicBtn = document.createElement("button");
    musicBtn.id = "btnHeaderK3sMusic";
    musicBtn.type = "button";
    musicBtn.title = "Putar Lagu Resmi K3S";
    bellBtn.parentElement.insertBefore(musicBtn, bellBtn);
  }

  musicBtn.className = "w-9 h-9 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/10 flex items-center justify-center text-xs text-emerald-300 active:scale-95 transition";
  musicBtn.innerHTML = `<i class="fa-solid fa-music ${isAudioPlaying ? 'animate-bounce text-amber-300' : ''}"></i>`;
  musicBtn.onclick = () => openK3sMusicModal(activeUser, currentSongRecord, reloadCallback);
}

// 3. Modal Pemutar Lagu K3S + Fitur Upload Logo PNG & File MP3 Langsung dari HP
export function openK3sMusicModal(activeUser, songItem, reloadCallback) {
  const modal = document.getElementById("serviceModal");
  const titleEl = document.getElementById("serviceModalTitle");
  const bodyEl = document.getElementById("serviceModalBody");
  if (!modal || !titleEl || !bodyEl) return;

  modal.classList.remove("hidden");
  titleEl.innerHTML = `<i class="fa-solid fa-music text-amber-500 mr-1.5"></i> Lagu Resmi & Branding K3S`;

  const canManageMedia = Boolean(
    activeUser &&
    activeUser.role === 'panitia' &&
    ['Sekretaris', 'Seksi Kesekretariatan', 'Seksi Acara dan Humas', 'Ketua Panitia', 'Penanggung Jawab'].includes(activeUser.profile?.divisi)
  );

  const rawUrl = songItem?.url_link || DEFAULT_DRIVE_VIEW_URL;
  const isDirectMp3 = isDirectAudioFileUrl(rawUrl);

  let drivePreviewUrl = DEFAULT_DRIVE_PREVIEW_URL;
  const driveIdMatch = String(rawUrl).match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (driveIdMatch && driveIdMatch[1]) {
    drivePreviewUrl = `https://drive.google.com/file/d/${driveIdMatch[1]}/preview`;
  }

  bodyEl.innerHTML = `
    <div class="p-5 rounded-3xl bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 text-white text-center space-y-3 shadow-lg border border-amber-400/30">
      <div class="w-28 h-24 rounded-3xl bg-white p-2 mx-auto shadow-xl border-2 border-amber-400 flex items-center justify-center">
        <img src="${LOGO_K3S_PATH}" alt="Logo K3S Kota Kupang" class="k3s-brand-logo w-full h-full object-contain" />
      </div>
      <div>
        <span class="text-[9px] font-extrabold uppercase tracking-widest bg-amber-400 text-slate-950 px-2.5 py-0.5 rounded-full">
          Audio Resmi K3S Kota Kupang
        </span>
        <h3 class="text-sm font-extrabold mt-2">${songItem?.judul || 'Lagu Resmi K3S SD/MI Kota Kupang'}</h3>
        <p class="text-[11px] text-blue-200 mt-0.5">${songItem?.deskripsi || 'Dengarkan bersama dalam kegiatan Rapat Koordinasi Kepala Sekolah.'}</p>
      </div>

      ${isDirectMp3 ? `
        <div class="pt-2">
          <audio id="modalHtml5AudioPlayer" controls preload="metadata" class="w-full rounded-2xl shadow">
            <source src="${rawUrl}" type="audio/mpeg" />
            Browser Anda tidak mendukung pemutar audio.
          </audio>
        </div>
      ` : `
        <div class="pt-2 space-y-2">
          <div class="rounded-2xl overflow-hidden border border-white/20 bg-black/40">
            <iframe src="${drivePreviewUrl}" width="100%" height="85" allow="autoplay" class="w-full border-0"></iframe>
          </div>
          <p class="text-[10px] text-amber-200/90 leading-relaxed">
            <i class="fa-solid fa-circle-info mr-1"></i> Tekan tombol Play pada pemutar di atas. Jika pemutar Google Drive meminta izin login di HP Anda, klik tombol <b>Buka / Unduh Lagu</b> di bawah.
          </p>
        </div>
      `}

      <div class="pt-1">
        <a href="${rawUrl}" target="_blank" rel="noopener noreferrer" download class="w-full py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold text-xs flex items-center justify-center gap-2 shadow">
          <i class="fa-solid fa-download"></i>
          <span>Buka / Unduh File Lagu K3S</span>
        </a>
      </div>
    </div>

    ${canManageMedia ? `
      <!-- PANEL 1: UPLOAD LOGO PNG LANGSUNG DARI HP/LAPTOP KE SERVER -->
      <div class="p-4 rounded-2xl bg-blue-50 border border-blue-200 space-y-2.5">
        <div class="flex items-center justify-between">
          <span class="font-extrabold text-xs text-blue-950">
            <i class="fa-solid fa-image text-blue-700 mr-1"></i> Ganti / Upload File Gambar Logo K3S (.PNG)
          </span>
          <span class="text-[9px] font-extrabold uppercase bg-blue-200 text-blue-900 px-2 py-0.5 rounded">Panel Panitia</span>
        </div>
        <p class="text-[10px] text-slate-600 leading-relaxed">
          Anda dapat mengunggah langsung file gambar <b>Logo K3S (.png/.jpg)</b> dari HP/Laptop di sini agar langsung tersimpan di server dan tampil di seluruh aplikasi, Kop Surat SPJ & ID Card:
        </p>
        <input id="inputK3sLogoFile" type="file" accept="image/*" class="w-full rounded-xl border border-blue-300 bg-white px-3 py-1.5 text-xs font-semibold file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:bg-blue-900 file:text-white file:text-[11px] file:font-bold" />
        <button type="button" id="btnUploadK3sLogoNow" class="w-full py-2 rounded-xl bg-blue-900 hover:bg-blue-800 text-white font-extrabold text-xs shadow flex items-center justify-center gap-2">
          <i class="fa-solid fa-upload"></i>
          <span>Simpan & Pasang Gambar Logo K3S</span>
        </button>
      </div>

      <!-- PANEL 2: UPLOAD FILE MP3 LAGU K3S LANGSUNG -->
      <div class="p-4 rounded-2xl bg-emerald-50 border border-emerald-300 space-y-2.5">
        <div class="flex items-center justify-between">
          <span class="font-extrabold text-xs text-emerald-950">
            <i class="fa-solid fa-file-audio text-emerald-600 mr-1"></i> Upload File MP3 Lagu K3S (Tanpa Drive)
          </span>
          <span class="text-[9px] font-extrabold uppercase bg-emerald-200 text-emerald-900 px-2 py-0.5 rounded">Panel Panitia</span>
        </div>
        <input id="inputK3sMp3File" type="file" accept="audio/*,.mp3,.m4a,.wav" class="w-full rounded-xl border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:bg-emerald-700 file:text-white file:text-[11px] file:font-bold" />
        <button type="button" id="btnUploadK3sMp3Now" class="w-full py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow flex items-center justify-center gap-2">
          <i class="fa-solid fa-cloud-arrow-up"></i>
          <span>Unggah & Aktifkan Pemutar MP3 Langsung</span>
        </button>
      </div>
    ` : ''}
  `;

  const audioEl = document.getElementById("modalHtml5AudioPlayer");
  if (audioEl) {
    audioEl.addEventListener("play", () => {
      isAudioPlaying = true;
      injectHeaderMusicButton(activeUser, reloadCallback);
    });
    audioEl.addEventListener("pause", () => {
      isAudioPlaying = false;
      injectHeaderMusicButton(activeUser, reloadCallback);
    });
    audioEl.addEventListener("ended", () => {
      isAudioPlaying = false;
      injectHeaderMusicButton(activeUser, reloadCallback);
    });
  }

  // Handler Upload Gambar Logo K3S Langsung ke Supabase Storage
  document.getElementById("btnUploadK3sLogoNow")?.addEventListener("click", async () => {
    const file = document.getElementById("inputK3sLogoFile")?.files?.[0];
    if (!file) return toast("Pilih file gambar logo (.png / .jpg) terlebih dahulu!");

    const btn = document.getElementById("btnUploadK3sLogoNow");
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner animate-spin"></i> Mengunggah Logo K3S...`;

    const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
    const fileName = `official_logo_k3s_${Date.now()}.${ext}`;

    const { error: upErr } = await sb.storage
      .from("dokumen_rakor")
      .upload(fileName, file, { cacheControl: "3600", upsert: true });

    if (upErr) {
      btn.disabled = false;
      btn.innerHTML = `<i class="fa-solid fa-upload"></i> Simpan & Pasang Gambar Logo K3S`;
      return toast("Gagal mengunggah gambar logo.");
    }

    const { data: pubData } = sb.storage.from("dokumen_rakor").getPublicUrl(fileName);
    const logoPublicUrl = pubData?.publicUrl || "";

    await sb.from("info_layanan").upsert([{
      kode_menu: 'logo_k3s',
      judul: 'Logo Resmi K3S Kota Kupang',
      deskripsi: 'File gambar logo resmi K3S SD/MI Kota Kupang',
      url_link: logoPublicUrl,
      status_tersedia: 'AKTIF'
    }]);

    LOGO_K3S_PATH = logoPublicUrl;
    window.__RESOLVED_K3S_LOGO = logoPublicUrl;
    refreshAllLogoImagesOnPage();
    toast("Logo K3S berhasil dipasang di seluruh aplikasi!");

    if (reloadCallback) await reloadCallback();
    openK3sMusicModal(activeUser, songItem, reloadCallback);
  });

  // Handler Upload File MP3 Lagu K3S
  document.getElementById("btnUploadK3sMp3Now")?.addEventListener("click", async () => {
    const file = document.getElementById("inputK3sMp3File")?.files?.[0];
    if (!file) return toast("Pilih file audio (.mp3 / .m4a) terlebih dahulu!");

    const btn = document.getElementById("btnUploadK3sMp3Now");
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner animate-spin"></i> Mengunggah Lagu K3S ke Server...`;

    const ext = file.name.split('.').pop()?.toLowerCase() || 'mp3';
    const fileName = `mars_k3s_kotakupang_${Date.now()}.${ext}`;

    const { error: upErr } = await sb.storage
      .from("dokumen_rakor")
      .upload(fileName, file, { cacheControl: "3600", upsert: true });

    if (upErr) {
      btn.disabled = false;
      btn.innerHTML = `<i class="fa-solid fa-cloud-arrow-up"></i> Unggah & Aktifkan Pemutar MP3 Langsung`;
      return toast("Gagal mengunggah file audio.");
    }

    const { data: pubData } = sb.storage.from("dokumen_rakor").getPublicUrl(fileName);
    const mp3PublicUrl = pubData?.publicUrl || "";

    const updatedRecord = {
      kode_menu: 'lagu_k3s',
      judul: 'Mars / Lagu Resmi K3S Kota Kupang',
      deskripsi: 'Dengarkan dan unduh lagu resmi Kelompok Kerja Kepala Sekolah (K3S) SD/MI Kota Kupang.',
      url_link: mp3PublicUrl,
      status_tersedia: 'MP3 Siap Putar'
    };

    await sb.from("info_layanan").upsert([updatedRecord]);
    toast("File MP3 Lagu K3S berhasil diaktifkan!");

    if (reloadCallback) await reloadCallback();
    openK3sMusicModal(activeUser, updatedRecord, reloadCallback);
  });
}
