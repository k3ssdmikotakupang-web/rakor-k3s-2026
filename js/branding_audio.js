// js/branding_audio.js
import { sb, toast } from './supabase.js';

export const LOGO_K3S_PATH = './logo-k3s.png';
const DEFAULT_DRIVE_VIEW_URL = 'https://drive.google.com/file/d/1-gXX08p8sx-20XxlKVi3hBJQmNccmlVM/view?usp=sharing';
const DEFAULT_DRIVE_PREVIEW_URL = 'https://drive.google.com/file/d/1-gXX08p8sx-20XxlKVi3hBJQmNccmlVM/preview';

let k3sAudioObj = null;
let isAudioPlaying = false;
let currentSongRecord = null;

// 1. Terapkan Logo Resmi K3S ke Favicon, Layar Login, dan Header
export function applyK3sLogoBranding(activeUser) {
  // Pasang Logo K3S sebagai Favicon Tab Browser
  let favLink = document.querySelector("link[rel*='icon']");
  if (!favLink) {
    favLink = document.createElement("link");
    favLink.rel = "icon";
    document.head.appendChild(favLink);
  }
  favLink.href = LOGO_K3S_PATH;

  // Ganti Ikon Topi/Sekolah di Halaman Login menjadi Logo K3S Resmi
  const loginScreen = document.getElementById("loginScreen");
  if (loginScreen && !document.getElementById("loginK3sLogoImg")) {
    const iconBox = loginScreen.querySelector(".fa-graduation-cap, .fa-school, .fa-award")?.parentElement;
    if (iconBox) {
      iconBox.className = "w-24 h-24 rounded-3xl bg-white p-2 mx-auto flex items-center justify-center shadow-2xl border-2 border-amber-400";
      iconBox.innerHTML = `<img id="loginK3sLogoImg" src="${LOGO_K3S_PATH}" alt="Logo K3S Kota Kupang" class="w-full h-full object-contain" onerror="this.style.display='none'" />`;
    }
  }

  // Jika pengguna belum upload foto profil pribadi, tampilkan Logo K3S di Avatar Pojok Kiri Atas
  const avatarEl = document.getElementById("topUserAvatar");
  if (avatarEl && activeUser && !activeUser.profile?.foto_profil) {
    const innerBox = avatarEl.querySelector("div");
    if (innerBox) {
      innerBox.className = "w-full h-full rounded-[14px] overflow-hidden flex items-center justify-center bg-white p-1";
      innerBox.innerHTML = `<img src="${LOGO_K3S_PATH}" alt="K3S" class="w-full h-full object-contain" onerror="this.parentElement.innerHTML='<span>K3S</span>'" />`;
    }
  }
}

// 2. Render Pemutar Lagu K3S di Beranda & Tombol Musik di Header
export async function renderK3sMusicPlayerWidget(activeUser, layananList, reloadCallback) {
  applyK3sLogoBranding(activeUser);

  const songItem = (layananList || []).find(x => x.kode_menu === 'lagu_k3s') || {
    kode_menu: 'lagu_k3s',
    judul: 'Mars / Lagu K3S Kota Kupang',
    deskripsi: 'Lagu resmi Kelompok Kerja Kepala Sekolah (K3S) SD/MI Kota Kupang.',
    url_link: DEFAULT_DRIVE_VIEW_URL,
    status_tersedia: 'Audio Resmi'
  };
  currentSongRecord = songItem;

  // Cek apakah URL saat ini adalah file audio langsung (.mp3/.wav/.m4a dari Supabase) atau link Google Drive
  const isDirectAudio = isDirectAudioFileUrl(songItem.url_link);

  // Pasang Tombol Pintas Musik di Header Sebelah Lonceng Notifikasi
  injectHeaderMusicButton(activeUser, reloadCallback);

  // Pasang Kartu Pemutar Musik Elegan di Beranda (di atas Grid Menu Layanan)
  const tabBeranda = document.getElementById("tabContentBeranda");
  if (!tabBeranda) return;

  let playerCard = document.getElementById("k3sMusicHomeBanner");
  if (!playerCard) {
    playerCard = document.createElement("div");
    playerCard.id = "k3sMusicHomeBanner";
    const firstGrid = tabBeranda.children[1] || null;
    tabBeranda.insertBefore(playerCard, firstGrid);
  }

  playerCard.className = "bg-gradient-to-r from-slate-900 via-blue-950 to-indigo-950 text-white rounded-3xl p-3.5 shadow-lg border border-amber-400/30 flex items-center justify-between gap-3";
  playerCard.innerHTML = `
    <div class="flex items-center gap-3 min-w-0 flex-1">
      <div class="w-12 h-12 rounded-2xl bg-white p-1.5 flex items-center justify-center shrink-0 shadow-md border border-amber-300">
        <img src="${LOGO_K3S_PATH}" alt="Logo K3S" class="w-full h-full object-contain" onerror="this.outerHTML='<i class=\\'fa-solid fa-music text-blue-900 text-lg\\'></i>'" />
      </div>
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-1.5">
          <span class="text-[9px] font-extrabold uppercase tracking-wider bg-amber-400 text-slate-950 px-2 py-0.5 rounded-full">
            <i class="fa-solid fa-headphones mr-0.5"></i> Lagu Resmi K3S
          </span>
          <span id="k3sAudioStatusBadge" class="text-[9px] font-bold text-emerald-300 truncate">
            ${isAudioPlaying ? 'Sedang Diputar...' : 'Siap Diputar'}
          </span>
        </div>
        <h4 class="font-extrabold text-xs text-white truncate mt-1">${songItem.judul || 'Mars K3S Kota Kupang'}</h4>
        <p class="text-[10px] text-blue-200 truncate">Ketuk untuk mendengarkan lagu K3S</p>
      </div>
    </div>

    <div class="flex items-center gap-1.5 shrink-0">
      ${isDirectAudio ? `
        <button type="button" id="btnQuickPlayK3sSong" class="w-10 h-10 rounded-2xl ${isAudioPlaying ? 'bg-emerald-500 text-slate-950 animate-pulse' : 'bg-amber-400 hover:bg-amber-300 text-slate-950'} font-extrabold flex items-center justify-center text-sm shadow-md active:scale-95 transition" title="Putar / Jeda Lagu">
          <i class="fa-solid ${isAudioPlaying ? 'fa-pause' : 'fa-play'}"></i>
        </button>
      ` : ''}
      <button type="button" id="btnOpenK3sMusicModal" class="px-3 py-2.5 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/15 text-[11px] font-extrabold text-amber-300 flex items-center gap-1.5 active:scale-95 transition">
        <i class="fa-solid ${isDirectAudio ? 'fa-sliders' : 'fa-circle-play text-sm'}"></i>
        <span>${isDirectAudio ? 'Player' : 'Putar Lagu'}</span>
      </button>
    </div>
  `;

  document.getElementById("btnQuickPlayK3sSong")?.addEventListener("click", () => {
    toggleDirectAudioPlayback(songItem.url_link);
  });

  document.getElementById("btnOpenK3sMusicModal")?.addEventListener("click", () => {
    openK3sMusicModal(activeUser, songItem, reloadCallback);
  });
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

function toggleDirectAudioPlayback(audioUrl) {
  if (!audioUrl) return;

  if (!k3sAudioObj || k3sAudioObj.src !== audioUrl) {
    if (k3sAudioObj) k3sAudioObj.pause();
    k3sAudioObj = new Audio(audioUrl);
    k3sAudioObj.addEventListener("ended", () => {
      isAudioPlaying = false;
      updateAudioButtonsUI();
    });
  }

  if (isAudioPlaying) {
    k3sAudioObj.pause();
    isAudioPlaying = false;
    toast("Lagu K3S dijeda.");
  } else {
    k3sAudioObj.play().then(() => {
      isAudioPlaying = true;
      toast("Memutar Lagu K3S Kota Kupang...");
      updateAudioButtonsUI();
    }).catch(() => {
      toast("Membuka pemutar lagu K3S...");
    });
  }
  updateAudioButtonsUI();
}

function updateAudioButtonsUI() {
  const btnQuick = document.getElementById("btnQuickPlayK3sSong");
  const statusBadge = document.getElementById("k3sAudioStatusBadge");
  if (btnQuick) {
    btnQuick.className = `w-10 h-10 rounded-2xl ${isAudioPlaying ? 'bg-emerald-400 text-slate-950 animate-pulse' : 'bg-amber-400 hover:bg-amber-300 text-slate-950'} font-extrabold flex items-center justify-center text-sm shadow-md active:scale-95 transition`;
    btnQuick.innerHTML = `<i class="fa-solid ${isAudioPlaying ? 'fa-pause' : 'fa-play'}"></i>`;
  }
  if (statusBadge) {
    statusBadge.textContent = isAudioPlaying ? "Sedang Diputar..." : "Siap Diputar";
  }
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

// 3. Modal Pemutar Lagu K3S + Fitur Upload File MP3 Langsung (Sekretaris / Kesekretariatan)
export function openK3sMusicModal(activeUser, songItem, reloadCallback) {
  const modal = document.getElementById("serviceModal");
  const titleEl = document.getElementById("serviceModalTitle");
  const bodyEl = document.getElementById("serviceModalBody");
  if (!modal || !titleEl || !bodyEl) return;

  modal.classList.remove("hidden");
  titleEl.innerHTML = `<i class="fa-solid fa-music text-amber-500 mr-1.5"></i> Pemutar Lagu Resmi K3S`;

  const canUploadAudio = Boolean(
    activeUser &&
    activeUser.role === 'panitia' &&
    ['Sekretaris', 'Seksi Kesekretariatan', 'Seksi Acara dan Humas', 'Ketua Panitia'].includes(activeUser.profile?.divisi)
  );

  const rawUrl = songItem?.url_link || DEFAULT_DRIVE_VIEW_URL;
  const isDirectMp3 = isDirectAudioFileUrl(rawUrl);

  // Konversi link Google Drive view menjadi link preview embed
  let drivePreviewUrl = DEFAULT_DRIVE_PREVIEW_URL;
  const driveIdMatch = String(rawUrl).match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (driveIdMatch && driveIdMatch[1]) {
    drivePreviewUrl = `https://drive.google.com/file/d/${driveIdMatch[1]}/preview`;
  }

  bodyEl.innerHTML = `
    <!-- Kartu Header Logo & Judul Lagu -->
    <div class="p-5 rounded-3xl bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 text-white text-center space-y-3 shadow-lg border border-amber-400/30">
      <div class="w-24 h-24 rounded-3xl bg-white p-2.5 mx-auto shadow-xl border-2 border-amber-400 flex items-center justify-center">
        <img src="${LOGO_K3S_PATH}" alt="Logo K3S Kota Kupang" class="w-full h-full object-contain" onerror="this.outerHTML='<i class=\\'fa-solid fa-compact-disc text-4xl text-blue-900 animate-spin\\'></i>'" />
      </div>
      <div>
        <span class="text-[9px] font-extrabold uppercase tracking-widest bg-amber-400 text-slate-950 px-2.5 py-0.5 rounded-full">
          Audio Resmi K3S Kota Kupang
        </span>
        <h3 class="text-sm font-extrabold mt-2">${songItem?.judul || 'Lagu Resmi K3S SD/MI Kota Kupang'}</h3>
        <p class="text-[11px] text-blue-200 mt-0.5">${songItem?.deskripsi || 'Dengarkan bersama dalam kegiatan Rapat Koordinasi Kepala Sekolah.'}</p>
      </div>

      <!-- PEMUTAR AUDIO LANGSUNG (JIKA SUDAH DIUPLOAD FILE MP3) ATAU EMBED GOOGLE DRIVE -->
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

    <!-- PANEL UPLOAD FILE MP3 LANGSUNG (AGAR BISA DIPUTAR TANPA GOOGLE DRIVE) -->
    ${canUploadAudio ? `
      <div class="p-4 rounded-2xl bg-emerald-50 border border-emerald-300 space-y-2.5">
        <div class="flex items-center justify-between">
          <span class="font-extrabold text-xs text-emerald-950">
            <i class="fa-solid fa-file-audio text-emerald-600 mr-1"></i> Upload File MP3 Langsung (Tanpa Drive)
          </span>
          <span class="text-[9px] font-extrabold uppercase bg-emerald-200 text-emerald-900 px-2 py-0.5 rounded">Panel Panitia</span>
        </div>
        <p class="text-[10px] text-emerald-800 leading-relaxed">
          Agar peserta bisa memutar lagu secara instan dengan 1 klik tanpa terhalang pembatasan Google Drive, unggah file <b>.mp3 / .m4a</b> lagu K3S langsung di sini:
        </p>
        <input id="inputK3sMp3File" type="file" accept="audio/*,.mp3,.m4a,.wav" class="w-full rounded-xl border border-emerald-300 bg-white px-3 py-2 text-xs font-semibold file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:bg-blue-900 file:text-white file:text-[11px] file:font-bold" />
        <button type="button" id="btnUploadK3sMp3Now" class="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow flex items-center justify-center gap-2">
          <i class="fa-solid fa-cloud-arrow-up"></i>
          <span>Unggah & Aktifkan Pemutar MP3 Langsung</span>
        </button>
      </div>
    ` : ''}
  `;

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
