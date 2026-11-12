// js/sertifikat.js
import { sb, toast } from './supabase.js';

let certConfig = {
  id: 1,
  url_depan: '',
  url_belakang: '',
  nomor_prefix: '421.2/K3S-KK/RAKOR/IX/2026',
  status_terbit: true,
  wajib_hadir: false,
  posisi_nama_y: 440
};

let activeSidePreview = 'depan'; // 'depan' | 'belakang'
let frontBgImg = null;
let backBgImg = null;

// Hanya Seksi Kesekretariatan yang berwenang mengunggah template Sisi Depan & Belakang
export function isUserSeksiKesekretariatan(activeUser) {
  return Boolean(
    activeUser &&
    activeUser.role === 'panitia' &&
    activeUser.profile &&
    activeUser.profile.divisi === 'Seksi Kesekretariatan'
  );
}

// Cek apakah URL yang dibuka adalah hasil scan QR Code Sertifikat (?verify_cert=...)
export async function checkCertificateVerificationUrl(sekolahList, panitiaList) {
  const params = new URLSearchParams(window.location.search);
  const verifyCode = params.get('verify_cert');
  if (!verifyCode) return;

  const { data: cfg } = await sb.from("pengaturan_sertifikat").select("*").eq("id", 1).single();
  if (cfg) certConfig = cfg;

  let ownerName = "Tidak Ditemukan";
  let ownerUnit = "-";
  let ownerRole = "-";
  let certNum = "-";
  let isValid = false;

  if (verifyCode.startsWith("SEK-")) {
    const npsn = verifyCode.replace("SEK-", "");
    const s = sekolahList.find(x => String(x.npsn) === npsn);
    if (s) {
      isValid = true;
      ownerName = s.nama_kepsek || `Kepala ${s.nama_sekolah}`;
      ownerUnit = `${s.nama_sekolah} (NPSN: ${s.npsn} • Sub Rayon ${s.subrayon})`;
      ownerRole = "Peserta Rapat Koordinasi";
      const numOrder = String(s.id_sekolah || "001").replace(/\D/g, "").slice(-3) || "001";
      certNum = `${numOrder}/PESERTA/${certConfig.nomor_prefix}`;
    }
  } else if (verifyCode.startsWith("PAN-")) {
    const p = panitiaList.find(x => x.id_panitia === verifyCode);
    if (p) {
      isValid = true;
      ownerName = p.nama_panitia;
      ownerUnit = `${p.divisi} (${p.jabatan})`;
      ownerRole = p.tugas_subrayon ? `Panitia & Ketua Sub Rayon ${p.tugas_subrayon}` : "Panitia Pelaksana";
      const numOrder = String(p.no || 1).padStart(3, '0');
      certNum = `${numOrder}/PANITIA/${certConfig.nomor_prefix}`;
    }
  }

  const modal = document.getElementById("serviceModal");
  const titleEl = document.getElementById("serviceModalTitle");
  const bodyEl = document.getElementById("serviceModalBody");
  if (!modal || !titleEl || !bodyEl) return;

  modal.classList.remove("hidden");
  titleEl.innerHTML = `<i class="fa-solid fa-shield-check text-emerald-600 mr-1.5"></i> Verifikasi E-Sertifikat Resmi`;

  bodyEl.innerHTML = isValid ? `
    <div class="p-4 rounded-3xl bg-gradient-to-br from-emerald-600 to-teal-700 text-white text-center space-y-1.5 shadow-lg">
      <div class="w-12 h-12 rounded-full bg-white text-emerald-600 mx-auto flex items-center justify-center text-2xl shadow">
        <i class="fa-solid fa-check"></i>
      </div>
      <div class="text-[10px] font-extrabold uppercase tracking-widest text-emerald-200 mt-1">Dokumen Terverifikasi Asli</div>
      <h4 class="text-sm font-extrabold leading-snug">${ownerName}</h4>
      <p class="text-[11px] text-emerald-100">${ownerUnit}</p>
    </div>

    <div class="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
      <div class="flex justify-between border-b pb-1.5">
        <span class="text-slate-500">No. Sertifikat:</span>
        <span class="font-extrabold text-slate-900 text-right">${certNum}</span>
      </div>
      <div class="flex justify-between border-b pb-1.5">
        <span class="text-slate-500">Status Peran:</span>
        <span class="font-bold text-blue-800">${ownerRole}</span>
      </div>
      <div class="flex justify-between border-b pb-1.5">
        <span class="text-slate-500">Nama Kegiatan:</span>
        <span class="font-bold text-slate-800 text-right">Rakor Kepala SD/MI Kota Kupang 2026</span>
      </div>
      <div class="flex justify-between border-b pb-1.5">
        <span class="text-slate-500">Penyelenggara:</span>
        <span class="font-bold text-slate-800">K3S SD/MI Kota Kupang</span>
      </div>
      <div class="flex justify-between">
        <span class="text-slate-500">Waktu & Pola:</span>
        <span class="font-bold text-emerald-700">24–26 Sept 2026 (32 JP)</span>
      </div>
    </div>
  ` : `
    <div class="p-5 rounded-2xl bg-rose-50 border border-rose-200 text-center text-rose-800 space-y-2">
      <i class="fa-solid fa-triangle-exclamation text-2xl text-rose-600"></i>
      <div class="font-extrabold text-xs">Data Sertifikat Tidak Ditemukan</div>
      <p class="text-[11px]">Kode QR tidak terdaftar dalam database SIM-RAKOR K3S Kota Kupang.</p>
    </div>
  `;
}

export async function openSertifikatModal(activeUser, sekolahList, reloadCallback) {
  const modal = document.getElementById("serviceModal");
  const titleEl = document.getElementById("serviceModalTitle");
  const bodyEl = document.getElementById("serviceModalBody");
  if (!modal || !titleEl || !bodyEl) return;

  modal.classList.remove("hidden");
  titleEl.innerHTML = `<i class="fa-solid fa-award text-amber-500 mr-1.5"></i> E-Sertifikat 2 Sisi & QR Validasi`;
  bodyEl.innerHTML = `<div class="py-6 text-center text-xs text-slate-400">Memuat generator E-Sertifikat...</div>`;

  const { data } = await sb.from("pengaturan_sertifikat").select("*").eq("id", 1).single();
  if (data) certConfig = data;

  await preloadCertTemplates();
  renderSertifikatUI(activeUser, sekolahList, bodyEl, reloadCallback);
}

async function preloadCertTemplates() {
  frontBgImg = null;
  backBgImg = null;

  const loadImg = (url) => new Promise((resolve) => {
    if (!url) return resolve(null);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });

  [frontBgImg, backBgImg] = await Promise.all([
    loadImg(certConfig.url_depan),
    loadImg(certConfig.url_belakang)
  ]);
}

function getCertificateIdentity(activeUser, sekolahList) {
  const baseUrl = window.location.origin + window.location.pathname;
  if (activeUser && activeUser.role === 'peserta') {
    const s = sekolahList.find(x => x.id_sekolah === activeUser.profile.id_sekolah) || activeUser.profile;
    const numOrder = String(s.id_sekolah || "001").replace(/\D/g, "").slice(-3) || "001";
    const isHadirAny = Boolean(s.hadir_h1 || s.hadir_h2 || s.hadir_h3 || s.status_ikut === 'Ikut');
    return {
      nama: s.nama_kepsek ? s.nama_kepsek : `Kepala ${s.nama_sekolah}`,
      instansi: `${s.nama_sekolah} (NPSN: ${s.npsn})`,
      peran: "PESERTA",
      subrayon: `Sub Rayon ${s.subrayon}`,
      nomorSertifikat: `Nomor: ${numOrder}/PESERTA/${certConfig.nomor_prefix}`,
      verifyUrl: `${baseUrl}?verify_cert=SEK-${s.npsn}`,
      verifyCodeText: `SEK-${s.npsn}`,
      hasNameFilled: Boolean(s.nama_kepsek && s.nama_kepsek.trim().length > 2),
      isEligible: !certConfig.wajib_hadir || isHadirAny
    };
  } else {
    const p = activeUser?.profile || { no: 1, id_panitia: 'PAN-1', nama_panitia: 'Panitia K3S', divisi: 'Panitia', jabatan: 'Anggota' };
    const numOrder = String(p.no || 1).padStart(3, '0');
    return {
      nama: p.nama_panitia,
      instansi: `${p.divisi} — ${p.jabatan}`,
      peran: p.tugas_subrayon ? `PANITIA & KETUA RAYON ${p.tugas_subrayon.toUpperCase()}` : "PANITIA PELAKSANA",
      subrayon: "K3S SD/MI Kota Kupang",
      nomorSertifikat: `Nomor: ${numOrder}/PANITIA/${certConfig.nomor_prefix}`,
      verifyUrl: `${baseUrl}?verify_cert=${p.id_panitia}`,
      verifyCodeText: p.id_panitia,
      hasNameFilled: true,
      isEligible: true
    };
  }
}

function renderSertifikatUI(activeUser, sekolahList, bodyEl, reloadCallback) {
  const isKesekretariatan = isUserSeksiKesekretariatan(activeUser);
  const ident = getCertificateIdentity(activeUser, sekolahList);

  bodyEl.innerHTML = `
    <!-- Info Wewenang Seksi Kesekretariatan -->
    <div class="p-3 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-between">
      <div>
        <div class="text-[10px] font-bold uppercase text-amber-700">Otoritas Penerbitan E-Sertifikat</div>
        <div class="text-xs font-extrabold text-amber-950">Seksi Kesekretariatan K3S Kota Kupang</div>
      </div>
      <span class="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full ${certConfig.status_terbit ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}">
        ${certConfig.status_terbit ? '✓ Terbit' : '🔒 Belum Dibuka'}
      </span>
    </div>

    ${!ident.hasNameFilled && activeUser?.role === 'peserta' ? `
      <div class="p-3 rounded-2xl bg-blue-50 border border-blue-200 text-[11px] text-blue-900 space-y-2">
        <div class="font-extrabold"><i class="fa-solid fa-user-pen mr-1"></i> Lengkapi Nama & Gelar Kepala Sekolah untuk Sertifikat:</div>
        <div class="flex gap-2">
          <input id="certQuickKepsekName" type="text" placeholder="Ketik Nama Lengkap & Gelar..." class="flex-1 rounded-xl border bg-white px-3 py-1.5 text-xs font-bold" />
          <button id="btnSaveCertKepsekName" class="bg-blue-900 text-white font-extrabold px-3 py-1.5 rounded-xl text-xs">Simpan</button>
        </div>
      </div>
    ` : ''}

    <!-- Switcher Sisi Depan vs Sisi Belakang -->
    <div class="grid grid-cols-2 gap-1.5 bg-slate-100 p-1 rounded-2xl">
      <button id="btnPreviewDepan" class="py-2 rounded-xl text-xs font-extrabold ${activeSidePreview === 'depan' ? 'bg-blue-900 text-white shadow' : 'text-slate-600'}">
        <i class="fa-solid fa-id-card mr-1"></i> 1. Sisi Depan (Identitas & QR)
      </button>
      <button id="btnPreviewBelakang" class="py-2 rounded-xl text-xs font-extrabold ${activeSidePreview === 'belakang' ? 'bg-blue-900 text-white shadow' : 'text-slate-600'}">
        <i class="fa-solid fa-list-check mr-1"></i> 2. Sisi Belakang (Materi JP)
      </button>
    </div>

    <!-- Area Canvas Pratinjau Sertifikat (A4 Landscape Ratio) -->
    <div class="p-2.5 rounded-2xl bg-slate-900 border border-slate-800 space-y-2">
      <canvas id="certCanvasPreview" width="1123" height="794" class="w-full rounded-xl shadow-lg bg-white"></canvas>
      <div class="flex items-center justify-between text-[10px] text-slate-300 px-1">
        <span><i class="fa-solid fa-qrcode text-emerald-400 mr-1"></i>QR Code Aktif: Scan untuk cek keaslian</span>
        <span>Kode: <b>${ident.verifyCodeText}</b></span>
      </div>
    </div>

    <!-- Tombol Unduh Sertifikat (PDF 2 Sisi & Gambar PNG) -->
    ${(certConfig.status_terbit && ident.isEligible) || isKesekretariatan ? `
      <div class="grid grid-cols-2 gap-2">
        <button id="btnDownloadCertPdf2Sides" class="py-3 rounded-2xl bg-gradient-to-r from-blue-900 to-indigo-900 text-white font-extrabold text-xs shadow-md flex items-center justify-center gap-1.5">
          <i class="fa-solid fa-file-pdf text-amber-300"></i>
          <span>Unduh PDF (2 Sisi)</span>
        </button>
        <button id="btnDownloadCertCurrentPng" class="py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-md flex items-center justify-center gap-1.5">
          <i class="fa-solid fa-image"></i>
          <span>Unduh Sisi ${activeSidePreview === 'depan' ? 'Depan' : 'Belakang'}</span>
        </button>
      </div>
    ` : `
      <div class="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-center text-xs text-rose-800 font-bold">
        <i class="fa-solid fa-lock mr-1"></i>
        ${!certConfig.status_terbit
          ? 'Unduhan E-Sertifikat akan dibuka oleh Seksi Kesekretariatan pada akhir kegiatan.'
          : 'Sertifikat hanya terbuka bagi peserta yang sudah melakukan konfirmasi kehadiran.'}
      </div>
    `}

    <!-- PANEL KHUSUS SEKSI KESEKRETARIATAN: UPLOAD TEMPLATE DEPAN & BELAKANG -->
    ${isKesekretariatan ? `
      <div class="p-4 rounded-2xl bg-emerald-50/90 border border-emerald-300 space-y-3 mt-2">
        <div class="flex items-center justify-between border-b border-emerald-200 pb-2">
          <span class="font-extrabold text-xs text-emerald-950">
            <i class="fa-solid fa-sliders text-emerald-600 mr-1"></i> Panel Desain Sertifikat (Seksi Kesekretariatan)
          </span>
          <span class="text-[9px] font-extrabold uppercase bg-emerald-200 text-emerald-900 px-2 py-0.5 rounded">Khusus Seksi Kesekretariatan</span>
        </div>

        <p class="text-[10px] text-emerald-800 leading-relaxed">
          Unggah gambar desain kosong <b>Sisi Depan</b> dan <b>Sisi Belakang</b> (format PNG/JPG ukuran A4 Landscape <code>1123 x 794 px</code>). Sistem otomatis menuliskan Nama, Asal Sekolah, Nomor Surat, dan QR Code Validasi di atasnya!
        </p>

        <div class="space-y-2">
          <div>
            <label class="block text-[10px] font-bold text-slate-700 mb-1">1. Upload Desain Sisi Depan (PNG/JPG):</label>
            <div class="flex gap-2">
              <input id="inputCertFrontFile" type="file" accept="image/*" class="flex-1 rounded-xl border bg-white px-2.5 py-1.5 text-[11px]" />
              <button id="btnUploadCertFront" class="bg-blue-900 text-white font-extrabold px-3 py-1.5 rounded-xl text-[11px] shrink-0">Upload Depan</button>
            </div>
          </div>

          <div>
            <label class="block text-[10px] font-bold text-slate-700 mb-1">2. Upload Desain Sisi Belakang (PNG/JPG):</label>
            <div class="flex gap-2">
              <input id="inputCertBackFile" type="file" accept="image/*" class="flex-1 rounded-xl border bg-white px-2.5 py-1.5 text-[11px]" />
              <button id="btnUploadCertBack" class="bg-blue-900 text-white font-extrabold px-3 py-1.5 rounded-xl text-[11px] shrink-0">Upload Belakang</button>
            </div>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-2 pt-1">
          <div>
            <label class="block text-[10px] font-bold text-slate-700 mb-1">Format Nomor Sertifikat:</label>
            <input id="inputCertPrefix" type="text" value="${certConfig.nomor_prefix || ''}" class="w-full rounded-xl border bg-white px-2.5 py-1.5 text-xs font-bold" />
          </div>
          <div>
            <label class="block text-[10px] font-bold text-slate-700 mb-1">Tinggi Posisi Nama (Y: ${certConfig.posisi_nama_y || 440}):</label>
            <input id="sliderCertNameY" type="range" min="260" max="560" step="5" value="${certConfig.posisi_nama_y || 440}" class="w-full accent-emerald-600 mt-1.5" />
          </div>
        </div>

        <div class="flex items-center justify-between gap-2 pt-1">
          <label class="flex items-center gap-1.5 text-[11px] font-bold text-slate-800 cursor-pointer">
            <input id="chkCertOpen" type="checkbox" ${certConfig.status_terbit ? 'checked' : ''} class="rounded accent-emerald-600" />
            <span>Buka Unduhan Sertifikat</span>
          </label>
          <label class="flex items-center gap-1.5 text-[11px] font-bold text-slate-800 cursor-pointer">
            <input id="chkCertRequireAttend" type="checkbox" ${certConfig.wajib_hadir ? 'checked' : ''} class="rounded accent-emerald-600" />
            <span>Wajib Hadir</span>
          </label>
        </div>

        <button id="btnSaveCertSettings" class="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow">
          Simpan Pengaturan Sertifikat
        </button>
      </div>
    ` : ''}
  `;

  // Gambar pratinjau kanvas sesuai sisi yang aktif
  drawCertificateCanvas(activeSidePreview, ident);

  // Simpan cepat nama kepala sekolah jika belum diisi
  document.getElementById("btnSaveCertKepsekName")?.addEventListener("click", async () => {
    const val = document.getElementById("certQuickKepsekName")?.value.trim();
    if (!val) return toast("Ketik nama lengkap & gelar Kepala Sekolah!");
    await sb.from("db_sekolah").update({ nama_kepsek: val }).eq("id_sekolah", activeUser.profile.id_sekolah);
    activeUser.profile.nama_kepsek = val;
    if (reloadCallback) await reloadCallback();
    toast("Nama Kepala Sekolah berhasil dicetak pada sertifikat!");
    renderSertifikatUI(activeUser, sekolahList, bodyEl, reloadCallback);
  });

  // Switch Sisi Depan / Belakang
  document.getElementById("btnPreviewDepan")?.addEventListener("click", () => {
    activeSidePreview = 'depan';
    renderSertifikatUI(activeUser, sekolahList, bodyEl, reloadCallback);
  });
  document.getElementById("btnPreviewBelakang")?.addEventListener("click", () => {
    activeSidePreview = 'belakang';
    renderSertifikatUI(activeUser, sekolahList, bodyEl, reloadCallback);
  });

  // Unduh Sisi Aktif (PNG)
  document.getElementById("btnDownloadCertCurrentPng")?.addEventListener("click", () => {
    const canvas = document.getElementById("certCanvasPreview");
    if (!canvas) return;
    const a = document.createElement("a");
    a.download = `Sertifikat_Sisi_${activeSidePreview}_${ident.nama.replace(/\s+/g, '_')}.png`;
    a.href = canvas.toDataURL("image/png");
    a.click();
    toast(`Sertifikat Sisi ${activeSidePreview} berhasil diunduh!`);
  });

  // Unduh Gabungan 2 Sisi Menjadi 1 File PDF (Halaman 1: Depan, Halaman 2: Belakang)
  document.getElementById("btnDownloadCertPdf2Sides")?.addEventListener("click", async () => {
    const btn = document.getElementById("btnDownloadCertPdf2Sides");
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner animate-spin"></i> Menyiapkan PDF 2 Sisi...`;

    try {
      await ensureJsPdfLoaded();
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [1123, 794] });

      const canvas = document.getElementById("certCanvasPreview");

      // Render Halaman 1 (Sisi Depan)
      await drawCertificateCanvas('depan', ident);
      const imgDepan = canvas.toDataURL("image/jpeg", 0.95);
      pdf.addImage(imgDepan, "JPEG", 0, 0, 1123, 794);

      // Render Halaman 2 (Sisi Belakang)
      pdf.addPage([1123, 794], "landscape");
      await drawCertificateCanvas('belakang', ident);
      const imgBelakang = canvas.toDataURL("image/jpeg", 0.95);
      pdf.addImage(imgBelakang, "JPEG", 0, 0, 1123, 794);

      // Kembalikan tampilan ke tab semula
      await drawCertificateCanvas(activeSidePreview, ident);

      pdf.save(`E-Sertifikat_Rakor2026_${ident.nama.replace(/\s+/g, '_')}.pdf`);
      toast("E-Sertifikat PDF (2 Sisi) berhasil diunduh!");
    } catch (e) {
      console.error(e);
      toast("Mengunduh gambar sertifikat...");
    }

    btn.disabled = false;
    btn.innerHTML = `<i class="fa-solid fa-file-pdf text-amber-300"></i> Unduh PDF (2 Sisi)`;
  });

  // Handler Khusus Seksi Kesekretariatan
  if (isKesekretariatan) {
    document.getElementById("sliderCertNameY")?.addEventListener("input", (e) => {
      certConfig.posisi_nama_y = Number(e.target.value);
      drawCertificateCanvas('depan', ident);
    });

    document.getElementById("btnUploadCertFront")?.addEventListener("click", () => uploadCertTemplateSide('depan', activeUser, sekolahList, bodyEl, reloadCallback));
    document.getElementById("btnUploadCertBack")?.addEventListener("click", () => uploadCertTemplateSide('belakang', activeUser, sekolahList, bodyEl, reloadCallback));

    document.getElementById("btnSaveCertSettings")?.addEventListener("click", async () => {
      const nomor_prefix = document.getElementById("inputCertPrefix").value.trim();
      const posisi_nama_y = Number(document.getElementById("sliderCertNameY").value || 440);
      const status_terbit = document.getElementById("chkCertOpen").checked;
      const wajib_hadir = document.getElementById("chkCertRequireAttend").checked;

      certConfig = { ...certConfig, nomor_prefix, posisi_nama_y, status_terbit, wajib_hadir };
      await sb.from("pengaturan_sertifikat").upsert([{
        id: 1,
        url_depan: certConfig.url_depan,
        url_belakang: certConfig.url_belakang,
        nomor_prefix,
        posisi_nama_y,
        status_terbit,
        wajib_hadir,
        waktu_update: new Date().toLocaleString("id-ID")
      }]);

      toast("Pengaturan E-Sertifikat berhasil disimpan!");
      renderSertifikatUI(activeUser, sekolahList, bodyEl, reloadCallback);
    });
  }
}

async function uploadCertTemplateSide(side, activeUser, sekolahList, bodyEl, reloadCallback) {
  const inputId = side === 'depan' ? 'inputCertFrontFile' : 'inputCertBackFile';
  const btnId = side === 'depan' ? 'btnUploadCertFront' : 'btnUploadCertBack';
  const file = document.getElementById(inputId)?.files?.[0];
  if (!file) return toast(`Pilih file gambar desain Sisi ${side} terlebih dahulu!`);

  const btn = document.getElementById(btnId);
  btn.disabled = true;
  btn.textContent = "Uploading...";

  const ext = file.name.split('.').pop() || 'png';
  const fileName = `template_sertifikat_${side}_${Date.now()}.${ext}`;

  const { error } = await sb.storage.from("dokumen_rakor").upload(fileName, file, { upsert: true });
  if (error) {
    btn.disabled = false;
    btn.textContent = `Upload ${side}`;
    return toast("Gagal mengunggah gambar template.");
  }

  const { data: pub } = sb.storage.from("dokumen_rakor").getPublicUrl(fileName);
  if (side === 'depan') certConfig.url_depan = pub.publicUrl;
  else certConfig.url_belakang = pub.publicUrl;

  await sb.from("pengaturan_sertifikat").upsert([{ ...certConfig, id: 1 }]);
  await preloadCertTemplates();
  activeSidePreview = side;
  toast(`Template Sisi ${side} berhasil diperbarui!`);
  renderSertifikatUI(activeUser, sekolahList, bodyEl, reloadCallback);
}

// Mesin Penggambar Sisi Depan & Sisi Belakang + QR Code Verifikasi Unik
async function drawCertificateCanvas(side, ident) {
  const canvas = document.getElementById("certCanvasPreview");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const W = canvas.width;  // 1123 px
  const H = canvas.height; // 794 px

  ctx.clearRect(0, 0, W, H);

  if (side === 'depan') {
    // 1. Gambar Desain Latar Sisi Depan
    if (frontBgImg) {
      ctx.drawImage(frontBgImg, 0, 0, W, H);
    } else {
      // Desain Default Sisi Depan Elegan K3S Kota Kupang
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, W, H);

      ctx.strokeStyle = "#1e3a8a";
      ctx.lineWidth = 18;
      ctx.strokeRect(24, 24, W - 48, H - 48);

      ctx.strokeStyle = "#d97706";
      ctx.lineWidth = 4;
      ctx.strokeRect(42, 42, W - 84, H - 84);

      ctx.fillStyle = "#0f172a";
      ctx.font = "800 24px 'Plus Jakarta Sans', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("KELOMPOK KERJA KEPALA SEKOLAH (K3S) SD/MI KOTA KUPANG", W / 2, 115);

      ctx.fillStyle = "#b45309";
      ctx.font = "800 54px 'Plus Jakarta Sans', sans-serif";
      ctx.fillText("SERTIFIKAT", W / 2, 195);

      ctx.fillStyle = "#334155";
      ctx.font = "600 20px 'Plus Jakarta Sans', sans-serif";
      ctx.fillText("Diberikan kepada:", W / 2, 290);

      ctx.fillStyle = "#334155";
      ctx.font = "500 20px 'Plus Jakarta Sans', sans-serif";
      ctx.fillText("Telah berpartisipasi aktif dalam kegiatan Rapat Koordinasi Kepala SD/MI Se-Kota Kupang Tahun 2026", W / 2, 540);
      ctx.fillText("yang diselenggarakan pada tanggal 24 s.d. 26 September 2026 di Kota Kupang (Pola 32 JP).", W / 2, 572);

      // Tanda Tangan Default
      ctx.font = "bold 18px 'Plus Jakarta Sans', sans-serif";
      ctx.fillStyle = "#0f172a";
      ctx.fillText("Ketua K3S SD/MI Kota Kupang", W * 0.3, 645);
      ctx.fillText("Joni A. Higa Huki, S.Pd., M.M.", W * 0.3, 725);

      ctx.fillText("Ketua Panitia Pelaksana", W * 0.72, 645);
      ctx.fillText("Surahman Husain, S.Pd.", W * 0.72, 725);
    }

    // 2. Cetak Nomor Sertifikat, Nama Pemilik, Sekolah, dan Peran di Atas Sisi Depan
    const nameY = Number(certConfig.posisi_nama_y || 440);

    ctx.textAlign = "center";
    ctx.fillStyle = "#475569";
    ctx.font = "bold 20px 'Plus Jakarta Sans', sans-serif";
    ctx.fillText(ident.nomorSertifikat, W / 2, 232);

    ctx.fillStyle = "#0f172a";
    ctx.font = "800 40px 'Plus Jakarta Sans', sans-serif";
    ctx.fillText(ident.nama, W / 2, nameY - 55);

    // Garis bawah nama
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(W / 2 - 280, nameY - 38);
    ctx.lineTo(W / 2 + 280, nameY - 38);
    ctx.stroke();

    ctx.fillStyle = "#1e3a8a";
    ctx.font = "bold 23px 'Plus Jakarta Sans', sans-serif";
    ctx.fillText(ident.instansi, W / 2, nameY);

    ctx.fillStyle = "#b45309";
    ctx.font = "800 22px 'Plus Jakarta Sans', sans-serif";
    ctx.fillText(`SEBAGAI ${ident.peran}`, W / 2, nameY + 42);

    // 3. Gambar QR Code Keaslian Unik di Pojok Kiri Bawah Sisi Depan
    await drawQrOnCanvas(ctx, ident.verifyUrl, 70, H - 195, 115);
    ctx.textAlign = "left";
    ctx.fillStyle = "#475569";
    ctx.font = "bold 12px 'Plus Jakarta Sans', sans-serif";
    ctx.fillText("Scan Uji Keaslian", 74, H - 64);
    ctx.font = "11px monospace";
    ctx.fillText(ident.verifyCodeText, 74, H - 48);

  } else {
    // SISI BELAKANG (STRUKTUR KURIKULUM / MATERI RAKOR 32 JP)
    if (backBgImg) {
      ctx.drawImage(backBgImg, 0, 0, W, H);
    } else {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, W, H);

      ctx.strokeStyle = "#1e3a8a";
      ctx.lineWidth = 14;
      ctx.strokeRect(28, 28, W - 56, H - 56);

      ctx.textAlign = "center";
      ctx.fillStyle = "#0f172a";
      ctx.font = "800 28px 'Plus Jakarta Sans', sans-serif";
      ctx.fillText("STRUKTUR MATERI RAPAT KOORDINASI KEPALA SD/MI TAHUN 2026", W / 2, 95);
      ctx.font = "600 18px 'Plus Jakarta Sans', sans-serif";
      ctx.fillStyle = "#475569";
      ctx.fillText(`Pemilik Sertifikat: ${ident.nama} (${ident.instansi})`, W / 2, 130);

      // Tabel Materi Sisi Belakang
      const rows = [
        ["No", "Materi / Pokok Bahasan Rapat Koordinasi", "Narasumber / Fasilitator", "JP"],
        ["1", "Kebijakan Dinas Pendidikan & Kebudayaan Kota Kupang", "Plt. Kadis P&K Kota Kupang", "4 JP"],
        ["2", "Evaluasi & Sinkronisasi Program Kerja K3S SD/MI", "Pengurus Inti K3S Kota Kupang", "6 JP"],
        ["3", "Manajemen Satuan Pendidikan, Akreditasi & ARKAS/BOS", "Tim Teknis & Narasumber", "8 JP"],
        ["4", "Sidang Komisi Pengembangan Kurikulum & Kesiswaan", "Koordinator 6 Sub Rayon", "8 JP"],
        ["5", "Perumusan Rencana Strategis & Rekomendasi Rakor 2026", "Pleno Komisi & Sekretaris", "6 JP"],
        ["", "TOTAL JAM PELAJARAN (JP)", "", "32 JP"]
      ];

      let startY = 175;
      const colWidths = [70, 520, 290, 110];
      const startX = (W - 990) / 2;

      rows.forEach((r, idx) => {
        const isHeader = idx === 0;
        const isTotal = idx === rows.length - 1;
        const rowH = isHeader || isTotal ? 50 : 54;

        ctx.fillStyle = isHeader ? "#1e3a8a" : isTotal ? "#fef3c7" : idx % 2 === 1 ? "#f8fafc" : "#ffffff";
        ctx.fillRect(startX, startY, 990, rowH);

        ctx.strokeStyle = "#cbd5e1";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(startX, startY, 990, rowH);

        let curX = startX;
        r.forEach((cell, cIdx) => {
          ctx.fillStyle = isHeader ? "#ffffff" : "#0f172a";
          ctx.font = (isHeader || isTotal) ? "bold 18px 'Plus Jakarta Sans', sans-serif" : "600 17px 'Plus Jakarta Sans', sans-serif";
          ctx.textAlign = (cIdx === 0 || cIdx === 3) ? "center" : "left";
          const textX = (cIdx === 0 || cIdx === 3) ? curX + colWidths[cIdx] / 2 : curX + 16;
          ctx.fillText(cell, textX, startY + 32);
          curX += colWidths[cIdx];
        });

        startY += rowH;
      });

      ctx.textAlign = "right";
      ctx.fillStyle = "#0f172a";
      ctx.font = "bold 18px 'Plus Jakarta Sans', sans-serif";
      ctx.fillText("Kupang, 26 September 2026", W - 95, 625);
      ctx.fillText("Sekretaris Panitia,", W - 95, 650);
      ctx.fillText("Emanuel Nata Huler, S.Pd., Gr.", W - 95, 725);
    }

    // QR Code Validasi juga tersemat di Sisi Belakang
    await drawQrOnCanvas(ctx, ident.verifyUrl, 75, H - 185, 105);
    ctx.textAlign = "left";
    ctx.fillStyle = "#475569";
    ctx.font = "bold 12px 'Plus Jakarta Sans', sans-serif";
    ctx.fillText(`Terverifikasi: ${ident.verifyCodeText}`, 75, H - 64);
  }
}

function drawQrOnCanvas(ctx, textUrl, x, y, size) {
  return new Promise((resolve) => {
    try {
      const tempDiv = document.createElement("div");
      new window.QRCode(tempDiv, {
        text: textUrl,
        width: size,
        height: size,
        colorDark: "#0f172a",
        colorLight: "#ffffff"
      });
      setTimeout(() => {
        const qrCanvas = tempDiv.querySelector("canvas");
        const qrImg = tempDiv.querySelector("img");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(x - 6, y - 6, size + 12, size + 12);
        ctx.strokeStyle = "#cbd5e1";
        ctx.lineWidth = 2;
        ctx.strokeRect(x - 6, y - 6, size + 12, size + 12);
        if (qrCanvas) {
          ctx.drawImage(qrCanvas, x, y, size, size);
          resolve();
        } else if (qrImg && qrImg.complete) {
          ctx.drawImage(qrImg, x, y, size, size);
          resolve();
        } else {
          resolve();
        }
      }, 60);
    } catch (e) {
      resolve();
    }
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
