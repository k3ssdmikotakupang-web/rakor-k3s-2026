// js/dokumentasi.js
import { sb, toast } from './supabase.js';

let activeDokTab = 'twibbon'; // 'twibbon' | 'galeri' | 'internal_panitia'
let galeriCache = [];
let userPhotoImg = null;
let framePhotoImg = null;
let photoScale = 1;
let photoOffsetX = 0;
let photoOffsetY = 0;

export function isUserSeksiDokumentasi(activeUser) {
  return Boolean(
    activeUser &&
    activeUser.role === 'panitia' &&
    activeUser.profile &&
    activeUser.profile.divisi === 'Seksi Perlengkapan, Dokumentasi, dan Publikasi'
  );
}

export async function openDokumentasiModal(activeUser, reloadCallback) {
  const modal = document.getElementById("serviceModal");
  const titleEl = document.getElementById("serviceModalTitle");
  const bodyEl = document.getElementById("serviceModalBody");
  if (!modal || !titleEl || !bodyEl) return;

  modal.classList.remove("hidden");
  titleEl.innerHTML = `<i class="fa-solid fa-camera-retro text-rose-600 mr-1.5"></i> Studio Twibbon & Dokumentasi`;
  bodyEl.innerHTML = `<div class="py-6 text-center text-xs text-slate-400">Memuat galeri & studio twibbon...</div>`;

  const { data } = await sb.from("galeri_dokumentasi").select("*").order("id_dok", { ascending: false });
  galeriCache = data || [];

  // Jika peserta mencoba membuka tab internal panitia, kembalikan ke tab twibbon
  if ((!activeUser || activeUser.role !== 'panitia') && activeDokTab === 'internal_panitia') {
    activeDokTab = 'twibbon';
  }

  renderDokumentasiMain(activeUser, bodyEl, reloadCallback);
}

function renderDokumentasiMain(activeUser, bodyEl, reloadCallback) {
  const isSeksiDok = isUserSeksiDokumentasi(activeUser);
  const isPanitia = Boolean(activeUser && activeUser.role === 'panitia');

  bodyEl.innerHTML = `
    <div class="p-3 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-between">
      <div>
        <div class="text-[10px] font-bold uppercase text-rose-600">Penanggung Jawab Dokumentasi</div>
        <div class="text-xs font-extrabold text-rose-950">Seksi Perlengkapan, Dokumentasi & Publikasi</div>
      </div>
      ${isSeksiDok ? `<span class="text-[9px] font-extrabold bg-rose-600 text-white px-2 py-0.5 rounded-md">Mode Admin</span>` : ''}
    </div>

    <!-- Switcher Sub-Tab: 2 Tab untuk Peserta, 3 Tab untuk Panitia (Ada Tab Internal Panitia!) -->
    <div class="grid ${isPanitia ? 'grid-cols-3' : 'grid-cols-2'} gap-1 bg-slate-100 p-1 rounded-2xl">
      <button id="tabBtnTwibbon" class="py-2 rounded-xl text-[11px] font-extrabold ${activeDokTab === 'twibbon' ? 'bg-blue-900 text-white shadow' : 'text-slate-600'}">
        <i class="fa-solid fa-wand-magic-sparkles mr-0.5"></i> Twibbon
      </button>
      <button id="tabBtnGaleri" class="py-2 rounded-xl text-[11px] font-extrabold ${activeDokTab === 'galeri' ? 'bg-blue-900 text-white shadow' : 'text-slate-600'}">
        <i class="fa-solid fa-photo-film mr-0.5"></i> Acara Umum
      </button>
      ${isPanitia ? `
        <button id="tabBtnInternalPanitia" class="py-2 rounded-xl text-[11px] font-extrabold ${activeDokTab === 'internal_panitia' ? 'bg-amber-500 text-slate-950 shadow' : 'text-slate-600'}">
          <i class="fa-solid fa-user-shield mr-0.5"></i> Internal Panitia
        </button>
      ` : ''}
    </div>

    <div id="dokSubContent" class="space-y-3 pt-1"></div>
  `;

  document.getElementById("tabBtnTwibbon")?.addEventListener("click", () => {
    activeDokTab = 'twibbon';
    renderDokumentasiMain(activeUser, bodyEl, reloadCallback);
  });

  document.getElementById("tabBtnGaleri")?.addEventListener("click", () => {
    activeDokTab = 'galeri';
    renderDokumentasiMain(activeUser, bodyEl, reloadCallback);
  });

  document.getElementById("tabBtnInternalPanitia")?.addEventListener("click", () => {
    if (!isPanitia) return;
    activeDokTab = 'internal_panitia';
    renderDokumentasiMain(activeUser, bodyEl, reloadCallback);
  });

  const subBox = document.getElementById("dokSubContent");
  if (activeDokTab === 'twibbon') {
    renderTwibbonStudio(activeUser, isSeksiDok, subBox, bodyEl, reloadCallback);
  } else if (activeDokTab === 'galeri') {
    renderMediaGallery(activeUser, isSeksiDok, subBox, bodyEl, reloadCallback);
  } else if (activeDokTab === 'internal_panitia' && isPanitia) {
    renderInternalPanitiaGallery(activeUser, isSeksiDok, subBox, bodyEl, reloadCallback);
  }
}

// =========================================================================
// SUB-TAB 1: STUDIO TWIBBON INTERAKTIF
// =========================================================================
function renderTwibbonStudio(activeUser, isSeksiDok, container, bodyEl, reloadCallback) {
  const activeFrameItem = galeriCache.find(x => x.kategori === 'twibbon_frame');
  const pesertaTwibbons = galeriCache.filter(x => x.kategori === 'twibbon_peserta');

  const namaSekolah = activeUser?.role === 'peserta'
    ? activeUser.profile.nama_sekolah
    : (activeUser?.profile?.nama_panitia || 'Peserta Rakor K3S 2026');

  const subTitleBadge = activeUser?.role === 'peserta'
    ? `Sub Rayon ${activeUser.profile.subrayon} • ${activeUser.profile.nama_kepsek || 'Kepala Sekolah'}`
    : `${activeUser?.profile?.divisi || 'Panitia Rakor K3S Kota Kupang'}`;

  container.innerHTML = `
    ${isSeksiDok ? `
      <div class="p-3.5 rounded-2xl bg-amber-50 border border-amber-300 space-y-2">
        <div class="flex items-center justify-between">
          <span class="font-extrabold text-xs text-amber-950"><i class="fa-solid fa-crown text-amber-600 mr-1"></i> Upload Bingkai Twibbon Resmi (PNG)</span>
          <span class="text-[9px] font-bold bg-amber-200 text-amber-900 px-2 py-0.5 rounded">Khusus Seksi Dok.</span>
        </div>
        <div class="flex gap-2">
          <input id="inputMasterFramePng" type="file" accept="image/png" class="flex-1 rounded-xl border border-amber-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold" />
          <button id="btnUploadMasterFrame" class="bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold px-3 py-1.5 rounded-xl text-xs shrink-0 shadow">
            Upload Frame
          </button>
        </div>
      </div>
    ` : ''}

    <div class="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
      <div class="text-center">
        <div class="font-extrabold text-xs text-slate-900">Buat & Unduh Foto Twibbon Anda</div>
        <p class="text-[10px] text-slate-500">Pilih foto terbaik Anda, atur posisi, lalu klik Unduh atau Posting</p>
      </div>

      <div class="flex justify-center">
        <canvas id="twibbonCanvas" width="800" height="800" class="w-64 h-64 rounded-2xl border-2 border-slate-300 shadow-md bg-white"></canvas>
      </div>

      <div>
        <label class="w-full py-2.5 px-4 rounded-xl bg-blue-900 hover:bg-blue-800 text-white font-extrabold text-xs flex items-center justify-center gap-2 cursor-pointer shadow">
          <i class="fa-solid fa-camera"></i>
          <span>1. Pilih Foto Diri dari HP Anda</span>
          <input id="inputUserPhotoTwibbon" type="file" accept="image/*" class="hidden" />
        </label>
      </div>

      <div class="grid grid-cols-3 gap-2 bg-white p-2.5 rounded-xl border border-slate-200 text-[10px] font-bold text-slate-600">
        <div>
          <label class="block mb-1">Perbesar (Zoom)</label>
          <input id="sliderZoom" type="range" min="0.4" max="2.5" step="0.05" value="1" class="w-full accent-blue-900" />
        </div>
        <div>
          <label class="block mb-1">Geser Kiri/Kanan</label>
          <input id="sliderPosX" type="range" min="-300" max="300" step="5" value="0" class="w-full accent-blue-900" />
        </div>
        <div>
          <label class="block mb-1">Geser Atas/Bawah</label>
          <input id="sliderPosY" type="range" min="-300" max="300" step="5" value="0" class="w-full accent-blue-900" />
        </div>
      </div>

      <div class="grid grid-cols-2 gap-2">
        <button id="btnDownloadTwibbon" class="py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow flex items-center justify-center gap-1.5">
          <i class="fa-solid fa-download"></i>
          <span>2. Unduh Twibbon</span>
        </button>
        <button id="btnShareTwibbonWall" class="py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs shadow flex items-center justify-center gap-1.5">
          <i class="fa-solid fa-share-nodes"></i>
          <span>3. Posting ke Galeri</span>
        </button>
      </div>
    </div>

    <div class="space-y-2">
      <h4 class="font-extrabold text-xs text-slate-800 uppercase">
        <i class="fa-solid fa-images text-indigo-600 mr-1"></i> Dinding Twibbon Peserta (${pesertaTwibbons.length})
      </h4>
      ${pesertaTwibbons.length === 0 ? `
        <div class="p-4 rounded-2xl bg-slate-50 border text-center text-[11px] text-slate-400">
          Belum ada foto Twibbon yang diposting.
        </div>
      ` : `
        <div class="grid grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-0.5">
          ${pesertaTwibbons.map(item => `
            <div class="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs flex flex-col justify-between">
              <img src="${item.url_media}" alt="${item.judul}" class="w-full aspect-square object-cover" />
              <div class="p-2">
                <div class="font-extrabold text-[10px] text-slate-900 truncate">${item.pengunggah || item.judul}</div>
                <div class="flex items-center justify-between mt-1">
                  <a href="${item.url_media}" target="_blank" download class="text-[10px] font-bold text-blue-700 hover:underline">
                    <i class="fa-solid fa-download mr-0.5"></i>Unduh
                  </a>
                  ${isSeksiDok ? `
                    <button class="btn-del-dok text-[10px] text-rose-500" data-id="${item.id_dok}">
                      <i class="fa-solid fa-trash"></i>
                    </button>
                  ` : ''}
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      `}
    </div>
  `;

  framePhotoImg = null;
  if (activeFrameItem && activeFrameItem.url_media) {
    const fImg = new Image();
    fImg.crossOrigin = "anonymous";
    fImg.onload = () => {
      framePhotoImg = fImg;
      drawTwibbonCanvas(namaSekolah, subTitleBadge);
    };
    fImg.src = activeFrameItem.url_media;
  }

  drawTwibbonCanvas(namaSekolah, subTitleBadge);

  document.getElementById("inputUserPhotoTwibbon")?.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        userPhotoImg = img;
        photoScale = 1;
        photoOffsetX = 0;
        photoOffsetY = 0;
        document.getElementById("sliderZoom").value = 1;
        document.getElementById("sliderPosX").value = 0;
        document.getElementById("sliderPosY").value = 0;
        drawTwibbonCanvas(namaSekolah, subTitleBadge);
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });

  ["sliderZoom", "sliderPosX", "sliderPosY"].forEach(id => {
    document.getElementById(id)?.addEventListener("input", () => {
      photoScale = parseFloat(document.getElementById("sliderZoom").value || 1);
      photoOffsetX = parseFloat(document.getElementById("sliderPosX").value || 0);
      photoOffsetY = parseFloat(document.getElementById("sliderPosY").value || 0);
      drawTwibbonCanvas(namaSekolah, subTitleBadge);
    });
  });

  document.getElementById("btnDownloadTwibbon")?.addEventListener("click", () => {
    const canvas = document.getElementById("twibbonCanvas");
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `Twibbon_Rakor_K3S_${namaSekolah.replace(/\s+/g, '_')}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
    toast("Twibbon berhasil diunduh ke HP Anda!");
  });

  document.getElementById("btnShareTwibbonWall")?.addEventListener("click", async () => {
    if (!userPhotoImg) return toast("Pilih foto diri Anda terlebih dahulu (Langkah 1)!");
    const canvas = document.getElementById("twibbonCanvas");
    if (!canvas) return;

    const btn = document.getElementById("btnShareTwibbonWall");
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner animate-spin"></i> Memposting...`;

    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const fileName = `twibbon_peserta_${Date.now()}.png`;
      const { error: upErr } = await sb.storage
        .from("dokumen_rakor")
        .upload(fileName, blob, { contentType: "image/png", upsert: true });

      if (upErr) {
        btn.disabled = false;
        btn.innerHTML = `<i class="fa-solid fa-share-nodes"></i> 3. Posting ke Galeri`;
        return toast("Gagal memposting.");
      }

      const { data: pubData } = sb.storage.from("dokumen_rakor").getPublicUrl(fileName);
      await sb.from("galeri_dokumentasi").insert([{
        kategori: "twibbon_peserta",
        judul: `Twibbon ${namaSekolah}`,
        pengunggah: namaSekolah,
        subrayon: activeUser?.profile?.subrayon || "Panitia",
        url_media: pubData.publicUrl,
        waktu_upload: new Date().toLocaleString("id-ID")
      }]);

      toast("Twibbon Anda berhasil tampil di Dinding Galeri!");
      openDokumentasiModal(activeUser, reloadCallback);
    }, "image/png");
  });

  document.getElementById("btnUploadMasterFrame")?.addEventListener("click", async () => {
    if (!isSeksiDok) return;
    const file = document.getElementById("inputMasterFramePng")?.files?.[0];
    if (!file) return toast("Pilih file bingkai .PNG terlebih dahulu!");

    const btn = document.getElementById("btnUploadMasterFrame");
    btn.disabled = true;
    btn.textContent = "Mengunggah...";

    const fileName = `master_twibbon_frame_${Date.now()}.png`;
    const { error: upErr } = await sb.storage
      .from("dokumen_rakor")
      .upload(fileName, file, { contentType: "image/png", upsert: true });

    if (upErr) {
      btn.disabled = false;
      btn.textContent = "Upload Frame";
      return toast("Gagal mengunggah bingkai PNG.");
    }

    const { data: pubData } = sb.storage.from("dokumen_rakor").getPublicUrl(fileName);
    await sb.from("galeri_dokumentasi").delete().eq("kategori", "twibbon_frame");
    await sb.from("galeri_dokumentasi").insert([{
      kategori: "twibbon_frame",
      judul: "Bingkai Resmi Twibbon Rakor 2026",
      pengunggah: activeUser.profile.nama_panitia,
      url_media: pubData.publicUrl,
      waktu_upload: new Date().toLocaleString("id-ID")
    }]);

    toast("Bingkai Twibbon resmi diperbarui!");
    openDokumentasiModal(activeUser, reloadCallback);
  });

  bindDeleteDokButtons(isSeksiDok, activeUser, reloadCallback);
}

function drawTwibbonCanvas(namaSekolah, subTitleBadge) {
  const canvas = document.getElementById("twibbonCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#0f172a";
  ctx.fillRect(0, 0, W, H);

  if (userPhotoImg) {
    const baseScale = Math.max(W / userPhotoImg.width, H / userPhotoImg.height);
    const finalScale = baseScale * photoScale;
    const drawW = userPhotoImg.width * finalScale;
    const drawH = userPhotoImg.height * finalScale;
    const drawX = (W - drawW) / 2 + photoOffsetX;
    const drawY = (H - drawH) / 2 + photoOffsetY;
    ctx.drawImage(userPhotoImg, drawX, drawY, drawW, drawH);
  } else {
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#94a3b8";
    ctx.font = "bold 28px 'Plus Jakarta Sans', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Pilih Foto Diri Anda", W / 2, H / 2 - 10);
    ctx.font = "22px 'Plus Jakarta Sans', sans-serif";
    ctx.fillText("(Klik Tombol Biru di Bawah)", W / 2, H / 2 + 28);
  }

  if (framePhotoImg) {
    ctx.drawImage(framePhotoImg, 0, 0, W, H);
  } else {
    const gradTop = ctx.createLinearGradient(0, 0, W, 130);
    gradTop.addColorStop(0, "#1e3a8a");
    gradTop.addColorStop(1, "#0f172a");
    ctx.fillStyle = gradTop;
    ctx.fillRect(0, 0, W, 115);

    ctx.fillStyle = "#fbbf24";
    ctx.fillRect(0, 115, W, 8);

    ctx.fillStyle = "#ffffff";
    ctx.font = "800 28px 'Plus Jakarta Sans', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("RAPAT KOORDINASI KEPALA SD/MI 2026", W / 2, 52);
    ctx.fillStyle = "#fde68a";
    ctx.font = "bold 22px 'Plus Jakarta Sans', sans-serif";
    ctx.fillText("K3S SD/MI KOTA KUPANG • PROVINSI NTT", W / 2, 88);

    ctx.strokeStyle = "#fbbf24";
    ctx.lineWidth = 16;
    ctx.strokeRect(8, 8, W - 16, H - 16);
  }

  const bannerGrad = ctx.createLinearGradient(0, H - 140, 0, H);
  bannerGrad.addColorStop(0, "rgba(15, 23, 42, 0.85)");
  bannerGrad.addColorStop(1, "rgba(15, 23, 42, 0.98)");
  ctx.fillStyle = bannerGrad;
  ctx.fillRect(16, H - 135, W - 32, 119);

  ctx.fillStyle = "#fbbf24";
  ctx.font = "800 24px 'Plus Jakarta Sans', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("SIAP SUKSESKAN RAKOR K3S KOTA KUPANG 2026", W / 2, H - 92);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 24px 'Plus Jakarta Sans', sans-serif";
  ctx.fillText(String(namaSekolah).slice(0, 38), W / 2, H - 55);

  ctx.fillStyle = "#6ee7b7";
  ctx.font = "600 19px 'Plus Jakarta Sans', sans-serif";
  ctx.fillText(String(subTitleBadge).slice(0, 48), W / 2, H - 25);
}

// =========================================================================
// SUB-TAB 2: GALERI FOTO & VIDEO ACARA UMUM (UNTUK PESERTA & PANITIA)
// =========================================================================
function renderMediaGallery(activeUser, isSeksiDok, container, bodyEl, reloadCallback) {
  const mediaItems = galeriCache.filter(x => x.kategori === 'foto' || x.kategori === 'video');

  container.innerHTML = `
    ${isSeksiDok ? `
      <div class="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-300 space-y-2.5">
        <div class="font-extrabold text-xs text-emerald-950">
          <i class="fa-solid fa-cloud-arrow-up text-emerald-600 mr-1"></i> Upload Dokumentasi Umum (Tampil ke Peserta)
        </div>
        <div class="grid grid-cols-3 gap-2">
          <select id="dokInputType" class="rounded-xl border bg-white px-2.5 py-2 text-xs font-bold">
            <option value="foto">📸 Foto</option>
            <option value="video">🎬 Video / Link</option>
          </select>
          <input id="dokInputTitle" type="text" placeholder="Judul Sesi / Momen Kegiatan..." class="col-span-2 rounded-xl border bg-white px-3 py-2 text-xs font-semibold" />
        </div>
        <input id="dokInputFile" type="file" accept="image/*,video/*" class="w-full rounded-xl border bg-white px-2.5 py-1.5 text-[11px]" />
        <div class="flex gap-2">
          <input id="dokInputExternalUrl" type="url" placeholder="Atau tempel Link Folder Drive / Video..." class="flex-1 rounded-xl border bg-white px-3 py-2 text-xs" />
          <button id="btnSubmitMediaDok" class="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold px-4 py-2 rounded-xl text-xs shadow shrink-0">
            Terbitkan
          </button>
        </div>
      </div>
    ` : ''}

    <div class="space-y-2.5 max-h-96 overflow-y-auto pr-0.5">
      ${mediaItems.length === 0 ? `
        <div class="p-6 rounded-2xl bg-slate-50 border text-center text-xs text-slate-400">
          Belum ada foto atau video dokumentasi acara umum.
        </div>
      ` : mediaItems.map(item => `
        <div class="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
          ${item.kategori === 'foto' ? `
            <img src="${item.url_media}" alt="${item.judul}" class="w-full max-h-56 object-cover" />
          ` : ''}
          <div class="p-3 flex items-center justify-between gap-2">
            <div class="min-w-0 flex-1">
              <span class="text-[9px] font-extrabold uppercase px-2 py-0.5 rounded ${item.kategori === 'video' ? 'bg-rose-100 text-rose-700' : 'bg-blue-100 text-blue-800'}">
                ${item.kategori === 'video' ? '🎬 Video Dokumentasi' : '📸 Foto Kegiatan'}
              </span>
              <h4 class="font-extrabold text-xs text-slate-900 mt-1">${item.judul}</h4>
              <p class="text-[10px] text-slate-400">${item.waktu_upload || ''}</p>
            </div>
            <div class="flex items-center gap-1.5 shrink-0">
              <a href="${item.url_media}" target="_blank" rel="noopener noreferrer" download class="px-3 py-1.5 rounded-xl bg-blue-900 text-white font-extrabold text-[11px]">
                Buka / Unduh
              </a>
              ${isSeksiDok ? `
                <button class="btn-del-dok w-7 h-7 rounded-lg bg-rose-50 text-rose-600 text-xs" data-id="${item.id_dok}">
                  <i class="fa-solid fa-trash"></i>
                </button>
              ` : ''}
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `;

  document.getElementById("btnSubmitMediaDok")?.addEventListener("click", async () => {
    if (!isSeksiDok) return;
    const kategori = document.getElementById("dokInputType").value;
    const judul = document.getElementById("dokInputTitle").value.trim();
    const file = document.getElementById("dokInputFile")?.files?.[0];
    let url_media = document.getElementById("dokInputExternalUrl").value.trim();

    if (!judul) return toast("Masukkan judul foto/video dokumentasi!");
    if (!file && !url_media) return toast("Pilih file foto atau tempelkan link dokumentasi!");

    const btn = document.getElementById("btnSubmitMediaDok");
    btn.disabled = true;
    btn.textContent = "Mengunggah...";

    if (file) {
      const ext = file.name.split('.').pop() || 'jpg';
      const fileName = `dok_${kategori}_${Date.now()}.${ext}`;
      const { error: upErr } = await sb.storage.from("dokumen_rakor").upload(fileName, file, { upsert: true });
      if (upErr) {
        btn.disabled = false;
        btn.textContent = "Terbitkan";
        return toast("Gagal mengunggah file media.");
      }
      const { data: pubData } = sb.storage.from("dokumen_rakor").getPublicUrl(fileName);
      url_media = pubData.publicUrl;
    }

    await sb.from("galeri_dokumentasi").insert([{
      kategori,
      judul,
      pengunggah: activeUser.profile.nama_panitia,
      url_media,
      waktu_upload: new Date().toLocaleString("id-ID")
    }]);

    toast("Dokumentasi acara berhasil diterbitkan!");
    openDokumentasiModal(activeUser, reloadCallback);
  });

  bindDeleteDokButtons(isSeksiDok, activeUser, reloadCallback);
}

// =========================================================================
// SUB-TAB 3: DOKUMENTASI INTERNAL KEPANITIAAN (HANYA DIAKSES PANITIA!)
// =========================================================================
function renderInternalPanitiaGallery(activeUser, isSeksiDok, container, bodyEl, reloadCallback) {
  const internalItems = galeriCache.filter(x => x.kategori === 'panitia_foto' || x.kategori === 'panitia_video');

  container.innerHTML = `
    <div class="p-3 rounded-2xl bg-slate-900 text-white flex items-center justify-between">
      <div>
        <span class="text-[9px] font-extrabold uppercase bg-amber-400 text-slate-950 px-2 py-0.5 rounded">Akses Terbatas Panitia</span>
        <h4 class="text-xs font-extrabold mt-1">Arsip & Dokumentasi Internal Kepanitiaan</h4>
        <p class="text-[10px] text-slate-300">Dokumentasi rapat persiapan, koordinasi seksi & evaluasi internal.</p>
      </div>
      <i class="fa-solid fa-lock text-amber-300 text-lg"></i>
    </div>

    <!-- Seluruh Panitia atau Seksi Dokumentasi dapat mengunggah dokumentasi kerja seksi masing-masing -->
    <div class="p-3.5 rounded-2xl bg-amber-50/90 border border-amber-300 space-y-2.5">
      <div class="font-extrabold text-xs text-amber-950">
        <i class="fa-solid fa-camera text-amber-600 mr-1"></i> Upload Dokumentasi Kerja Kepanitiaan (${activeUser.profile?.divisi})
      </div>
      <div class="grid grid-cols-3 gap-2">
        <select id="panDokType" class="rounded-xl border bg-white px-2.5 py-2 text-xs font-bold">
          <option value="panitia_foto">📸 Foto Panitia</option>
          <option value="panitia_video">🎬 Video / Drive</option>
        </select>
        <input id="panDokTitle" type="text" placeholder="Contoh: Rapat Persiapan Seksi..." class="col-span-2 rounded-xl border bg-white px-3 py-2 text-xs font-semibold" />
      </div>
      <input id="panDokFile" type="file" accept="image/*,video/*" class="w-full rounded-xl border bg-white px-2.5 py-1.5 text-[11px]" />
      <div class="flex gap-2">
        <input id="panDokUrl" type="url" placeholder="Atau tempel Link Folder Drive Internal Panitia..." class="flex-1 rounded-xl border bg-white px-3 py-2 text-xs" />
        <button id="btnSubmitPanDok" class="bg-slate-900 hover:bg-slate-800 text-amber-300 font-extrabold px-4 py-2 rounded-xl text-xs shadow shrink-0">
          Simpan
        </button>
      </div>
    </div>

    <div class="space-y-2.5 max-h-96 overflow-y-auto pr-0.5">
      ${internalItems.length === 0 ? `
        <div class="p-6 rounded-2xl bg-slate-50 border text-center text-xs text-slate-400">
          Belum ada dokumentasi internal kepanitiaan yang diunggah.
        </div>
      ` : internalItems.map(item => {
        const canDel = isSeksiDok || item.pengunggah === activeUser.profile?.nama_panitia;
        return `
          <div class="bg-white rounded-2xl border border-amber-200 overflow-hidden shadow-2xs">
            ${item.kategori === 'panitia_foto' ? `
              <img src="${item.url_media}" alt="${item.judul}" class="w-full max-h-56 object-cover" />
            ` : ''}
            <div class="p-3 flex items-center justify-between gap-2">
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-1.5">
                  <span class="text-[9px] font-extrabold uppercase px-2 py-0.5 rounded bg-amber-100 text-amber-900">
                    🔒 Internal • ${item.subrayon || 'Panitia'}
                  </span>
                  <span class="text-[9px] text-slate-400">${item.waktu_upload || ''}</span>
                </div>
                <h4 class="font-extrabold text-xs text-slate-900 mt-1">${item.judul}</h4>
                <p class="text-[10px] text-slate-500">Diunggah oleh: ${item.pengunggah || 'Panitia'}</p>
              </div>
              <div class="flex items-center gap-1.5 shrink-0">
                <a href="${item.url_media}" target="_blank" rel="noopener noreferrer" download class="px-3 py-1.5 rounded-xl bg-slate-900 text-amber-300 font-extrabold text-[11px]">
                  Buka / Unduh
                </a>
                ${canDel ? `
                  <button class="btn-del-dok w-7 h-7 rounded-lg bg-rose-50 text-rose-600 text-xs" data-id="${item.id_dok}">
                    <i class="fa-solid fa-trash"></i>
                  </button>
                ` : ''}
              </div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;

  document.getElementById("btnSubmitPanDok")?.addEventListener("click", async () => {
    const kategori = document.getElementById("panDokType").value;
    const judul = document.getElementById("panDokTitle").value.trim();
    const file = document.getElementById("panDokFile")?.files?.[0];
    let url_media = document.getElementById("panDokUrl").value.trim();

    if (!judul) return toast("Masukkan judul dokumentasi kepanitiaan!");
    if (!file && !url_media) return toast("Pilih file foto/video atau tempelkan link Drive!");

    const btn = document.getElementById("btnSubmitPanDok");
    btn.disabled = true;
    btn.textContent = "Menyimpan...";

    if (file) {
      const ext = file.name.split('.').pop() || 'jpg';
      const fileName = `internal_panitia_${Date.now()}.${ext}`;
      const { error: upErr } = await sb.storage.from("dokumen_rakor").upload(fileName, file, { upsert: true });
      if (upErr) {
        btn.disabled = false;
        btn.textContent = "Simpan";
        return toast("Gagal mengunggah file.");
      }
      const { data: pubData } = sb.storage.from("dokumen_rakor").getPublicUrl(fileName);
      url_media = pubData.publicUrl;
    }

    await sb.from("galeri_dokumentasi").insert([{
      kategori,
      judul,
      pengunggah: activeUser.profile.nama_panitia,
      subrayon: activeUser.profile.divisi,
      url_media,
      waktu_upload: new Date().toLocaleString("id-ID")
    }]);

    toast("Dokumentasi internal panitia berhasil disimpan!");
    openDokumentasiModal(activeUser, reloadCallback);
  });

  document.querySelectorAll(".btn-del-dok").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("Hapus dokumentasi internal ini?")) return;
      await sb.from("galeri_dokumentasi").delete().eq("id_dok", Number(btn.dataset.id));
      toast("Dokumentasi dihapus.");
      openDokumentasiModal(activeUser, reloadCallback);
    });
  });
}

function bindDeleteDokButtons(isSeksiDok, activeUser, reloadCallback) {
  if (!isSeksiDok) return;
  document.querySelectorAll(".btn-del-dok").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("Hapus item dokumentasi ini?")) return;
      await sb.from("galeri_dokumentasi").delete().eq("id_dok", Number(btn.dataset.id));
      toast("Item dokumentasi dihapus.");
      openDokumentasiModal(activeUser, reloadCallback);
    });
  });
}
