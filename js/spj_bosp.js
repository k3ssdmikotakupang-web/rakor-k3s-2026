// js/spj_bosp.js
import { sb, toast } from './supabase.js';

let spjLockState = {
  spj_absen: false,    // Dikendalikan oleh Sekretaris
  spj_kwitansi: false  // Dikendalikan oleh Bendahara
};

let logoK3sImageObj = null;

function isUserSekretaris(activeUser) {
  return Boolean(
    activeUser &&
    activeUser.role === 'panitia' &&
    activeUser.profile?.divisi === 'Sekretaris'
  );
}

function isUserBendahara(activeUser) {
  return Boolean(
    activeUser &&
    activeUser.role === 'panitia' &&
    activeUser.profile?.divisi === 'Bendahara'
  );
}

async function fetchSpjLockState() {
  try {
    const { data } = await sb
      .from("pengaturan_pos")
      .select("*")
      .in("id_pos", ["spj_absen", "spj_kwitansi"]);
    if (data) {
      data.forEach(r => {
        spjLockState[r.id_pos] = Boolean(r.status_buka);
      });
    }
  } catch (e) {}
}

async function preloadK3sLogo() {
  if (logoK3sImageObj) return logoK3sImageObj;
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      logoK3sImageObj = img;
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

// Menyuntikkan Panel SPJ BOSP di Tab Absensi Peserta & Panel Kontrol Saklar di Beranda Sekretaris/Bendahara
export async function renderSpjBospWidgets(activeUser, sekolahList, panitiaList) {
  await fetchSpjLockState();
  injectPanitiaSpjControlCard(activeUser, sekolahList, panitiaList);
  injectPesertaSpjDownloadCard(activeUser, sekolahList, panitiaList);
}

// 1. PANEL KONTROL AKTIVASI SPJ (KHUSUS SEKRETARIS & BENDAHARA DI BERANDA)
function injectPanitiaSpjControlCard(activeUser, sekolahList, panitiaList) {
  const existing = document.getElementById("panitiaSpjControlWidget");
  const isSek = isUserSekretaris(activeUser);
  const isBen = isUserBendahara(activeUser);

  if (!isSek && !isBen) {
    if (existing) existing.remove();
    return;
  }

  const firstServiceBtn = document.querySelector(".service-menu-btn");
  const gridContainer = firstServiceBtn ? firstServiceBtn.parentElement : null;
  if (!gridContainer) return;

  if (!existing) {
    const box = document.createElement("div");
    box.id = "panitiaSpjControlWidget";
    box.className = "col-span-3";
    gridContainer.insertBefore(box, firstServiceBtn);
  }

  const target = document.getElementById("panitiaSpjControlWidget");
  if (!target) return;

  const isOpen = isSek ? spjLockState.spj_absen : spjLockState.spj_kwitansi;
  const roleTitle = isSek ? "Otoritas Sekretaris: Daftar Hadir SPJ" : "Otoritas Bendahara: E-Kwitansi BOSP";
  const descText = isSek
    ? "Aktifkan agar peserta dapat mengunduh PDF Daftar Hadir Individu & Kolektif Sub Rayon ber-Kop Resmi."
    : "Aktifkan agar sekolah yang sudah LUNAS dapat mengunduh PDF E-Kwitansi Kontribusi Rp 2.000.000.";

  target.innerHTML = `
    <div class="p-3.5 rounded-2xl ${isOpen ? 'bg-emerald-950 border-emerald-400/40' : 'bg-slate-900 border-amber-400/40'} text-white border shadow-md flex items-center justify-between gap-3">
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-1.5">
          <span class="text-[9px] font-extrabold uppercase px-2 py-0.5 rounded bg-amber-400 text-slate-950">
            ${roleTitle}
          </span>
          <span class="text-[9px] font-extrabold px-2 py-0.5 rounded ${isOpen ? 'bg-emerald-500 text-slate-950' : 'bg-rose-600 text-white'}">
            ${isOpen ? 'TERBUKA DI PESERTA' : 'TERKUNCI'}
          </span>
        </div>
        <p class="text-[10px] text-slate-300 mt-1 leading-snug">${descText}</p>
      </div>
      <button type="button" id="btnToggleSpjAccessNow" class="px-3.5 py-2.5 rounded-xl font-extrabold text-[11px] shrink-0 shadow transition ${
        isOpen ? 'bg-rose-600 hover:bg-rose-700 text-white' : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
      }">
        <i class="fa-solid ${isOpen ? 'fa-lock' : 'fa-lock-open'} mr-1"></i>
        <span>${isOpen ? 'Kunci Akses' : 'Buka Akses'}</span>
      </button>
    </div>
  `;

  document.getElementById("btnToggleSpjAccessNow")?.addEventListener("click", async () => {
    const key = isSek ? "spj_absen" : "spj_kwitansi";
    const nextVal = !spjLockState[key];
    spjLockState[key] = nextVal;

    await sb.from("pengaturan_pos").upsert([{
      id_pos: key,
      nama_pos: roleTitle,
      status_buka: nextVal,
      diupdate_oleh: activeUser.profile?.nama_panitia || "Panitia",
      waktu_update: new Date().toLocaleString("id-ID")
    }]);

    toast(nextVal
      ? `Dokumen SPJ resmi DIBUKA untuk peserta!`
      : `Dokumen SPJ DIKUNCI kembali.`);
    renderSpjBospWidgets(activeUser, sekolahList, panitiaList);
  });
}

// 2. KARTU UNDUH PAKET DOKUMEN SPJ BOSP DI TAB ABSENSI PESERTA
function injectPesertaSpjDownloadCard(activeUser, sekolahList, panitiaList) {
  if (!activeUser || activeUser.role !== 'peserta') return;
  const absensiContainer = document.getElementById("absensiDaysContainer");
  if (!absensiContainer) return;

  let spjBox = document.getElementById("pesertaSpjBospCard");
  if (!spjBox) {
    spjBox = document.createElement("div");
    spjBox.id = "pesertaSpjBospCard";
    absensiContainer.appendChild(spjBox);
  }

  const s = sekolahList.find(x => x.id_sekolah === activeUser.profile.id_sekolah) || activeUser.profile;
  const isLunas = s.status_bayar === "Lunas";
  const canDownloadAbsen = Boolean(spjLockState.spj_absen);
  const canDownloadKwitansi = Boolean(spjLockState.spj_kwitansi && isLunas);

  spjBox.className = "p-4 rounded-2xl bg-gradient-to-br from-blue-50 via-indigo-50/60 to-white border-2 border-blue-200 space-y-3 shadow-2xs mt-3";
  spjBox.innerHTML = `
    <div class="flex items-start justify-between gap-2 border-b border-blue-200/70 pb-2.5">
      <div>
        <span class="text-[9px] font-extrabold uppercase tracking-wider bg-blue-900 text-amber-300 px-2 py-0.5 rounded-md">
          Dokumen Pertanggungjawaban BOSP
        </span>
        <h4 class="font-extrabold text-xs text-slate-900 mt-1">Unduh Bukti Kehadiran & E-Kwitansi Resmi (PDF)</h4>
        <p class="text-[10px] text-slate-500">Dilengkapi Kop Resmi Panitia K3S Kota Kupang & QR Validasi</p>
      </div>
      <i class="fa-solid fa-file-shield text-blue-800 text-lg"></i>
    </div>

    <!-- BAGIAN A: DAFTAR HADIR INDIVIDU & KOLEKTIF SUB RAYON (DIBUKA OLEH SEKRETARIS) -->
    <div class="p-3 rounded-xl bg-white border border-slate-200 space-y-2">
      <div class="flex items-center justify-between">
        <span class="text-[11px] font-extrabold text-slate-800">
          <i class="fa-solid fa-users-rectangle text-blue-700 mr-1"></i> 1. Daftar Hadir Resmi (19–21 Nov 2026)
        </span>
        <span class="text-[9px] font-extrabold px-2 py-0.5 rounded ${canDownloadAbsen ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">
          ${canDownloadAbsen ? 'Siap Diunduh' : 'Menunggu Sekretaris'}
        </span>
      </div>

      ${canDownloadAbsen ? `
        <div class="grid grid-cols-2 gap-2 pt-1">
          <button type="button" id="btnDownloadSpjIndividu" class="py-2.5 px-2 rounded-xl bg-blue-900 hover:bg-blue-800 text-white font-extrabold text-[10px] shadow flex items-center justify-center gap-1.5">
            <i class="fa-solid fa-file-pdf text-amber-300"></i>
            <span>Daftar Hadir Individu</span>
          </button>
          <button type="button" id="btnDownloadSpjKolektif" class="py-2.5 px-2 rounded-xl bg-indigo-700 hover:bg-indigo-800 text-white font-extrabold text-[10px] shadow flex items-center justify-center gap-1.5">
            <i class="fa-solid fa-table-list text-amber-300"></i>
            <span>Kolektif Rayon ${s.subrayon}</span>
          </button>
        </div>
      ` : `
        <p class="text-[10px] text-slate-500 bg-slate-50 p-2 rounded-lg border border-slate-200/80 text-center font-semibold">
          <i class="fa-solid fa-lock mr-1 text-amber-600"></i> Unduhan Daftar Hadir Individu & Kolektif Sub Rayon akan terbuka setelah diaktifkan oleh <b>Sekretaris Panitia</b>.
        </p>
      `}
    </div>

    <!-- BAGIAN B: E-KWITANSI KONTRIBUSI RP 2.000.000 (DIBUKA OLEH BENDAHARA) -->
    <div class="p-3 rounded-xl bg-white border border-slate-200 space-y-2">
      <div class="flex items-center justify-between">
        <span class="text-[11px] font-extrabold text-slate-800">
          <i class="fa-solid fa-receipt text-emerald-600 mr-1"></i> 2. E-Kwitansi Kontribusi (Rp 2.000.000)
        </span>
        <span class="text-[9px] font-extrabold px-2 py-0.5 rounded ${canDownloadKwitansi ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">
          ${canDownloadKwitansi ? 'Siap Diunduh' : (!spjLockState.spj_kwitansi ? 'Menunggu Bendahara' : 'Status: ' + (s.status_bayar || 'Belum Bayar'))}
        </span>
      </div>

      ${canDownloadKwitansi ? `
        <button type="button" id="btnDownloadSpjKwitansi" class="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow flex items-center justify-center gap-2">
          <i class="fa-solid fa-file-invoice-dollar text-amber-200"></i>
          <span>Unduh E-Kwitansi Resmi BOSP (PDF)</span>
        </button>
      ` : `
        <p class="text-[10px] text-slate-500 bg-slate-50 p-2 rounded-lg border border-slate-200/80 text-center font-semibold">
          <i class="fa-solid fa-lock mr-1 text-amber-600"></i>
          ${!spjLockState.spj_kwitansi
            ? 'Unduhan E-Kwitansi akan terbuka setelah diaktifkan oleh <b>Bendahara Panitia</b>.'
            : 'E-Kwitansi otomatis terbuka setelah status kontribusi sekolah Anda tercatat <b>LUNAS</b>.'}
        </p>
      `}
    </div>
  `;

  document.getElementById("btnDownloadSpjIndividu")?.addEventListener("click", () => {
    generatePdfDaftarHadirIndividu(s);
  });

  document.getElementById("btnDownloadSpjKolektif")?.addEventListener("click", () => {
    const srSchools = sekolahList.filter(x => x.subrayon === s.subrayon);
    const ketua = panitiaList.find(p => p.tugas_subrayon === s.subrayon);
    generatePdfDaftarHadirKolektif(s.subrayon, srSchools, ketua);
  });

  document.getElementById("btnDownloadSpjKwitansi")?.addEventListener("click", () => {
    generatePdfEKwitansiBosp(s);
  });
}

// =========================================================================
// GENERATOR KOP SURAT RESMI K3S KOTA KUPANG (SESUAI PDF YANG DIUPLOAD)
// =========================================================================
async function drawOfficialLetterhead(ctx, width) {
  const logoImg = await preloadK3sLogo();

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, 185);

  if (logoImg) {
    ctx.drawImage(logoImg, 45, 28, 115, 115);
  }

  const centerX = width / 2 + 35;
  ctx.textAlign = "center";
  ctx.fillStyle = "#0f172a";

  ctx.font = "bold 17px 'Plus Jakarta Sans', Arial, sans-serif";
  ctx.fillText("PEMERINTAH KOTA KUPANG", centerX, 42);

  ctx.font = "bold 17px 'Plus Jakarta Sans', Arial, sans-serif";
  ctx.fillText("DINAS PENDIDIKAN DAN KEBUDAYAAN KOTA KUPANG", centerX, 66);

  ctx.font = "800 18px 'Plus Jakarta Sans', Arial, sans-serif";
  ctx.fillText("KELOMPOK KERJA KEPALA SEKOLAH SD/MI KOTA KUPANG", centerX, 90);

  ctx.fillStyle = "#1e3a8a";
  ctx.font = "800 19px 'Plus Jakarta Sans', Arial, sans-serif";
  ctx.fillText("PANITIA PELAKSANA RAKOR KEPALA SD/MI KOTA KUPANG 2026", centerX, 115);

  ctx.fillStyle = "#334155";
  ctx.font = "bold 12px 'Plus Jakarta Sans', Arial, sans-serif";
  ctx.fillText("SEKRETARIAT: SD NCIPS - JL. KENANGA, NO. 01 NAIKOLAN - KUPANG", centerX, 138);

  ctx.fillStyle = "#dc2626";
  ctx.font = "italic 12px 'Plus Jakarta Sans', Arial, sans-serif";
  ctx.fillText("Email: k3s.sdmikotakupang@gmail.com", centerX, 156);

  // Garis Ganda Kop Surat Resmi
  ctx.strokeStyle = "#0f172a";
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(40, 170);
  ctx.lineTo(width - 40, 170);
  ctx.stroke();

  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(40, 175);
  ctx.lineTo(width - 40, 175);
  ctx.stroke();
}

function drawQrOnCanvas(ctx, textUrl, x, y, size) {
  return new Promise((resolve) => {
    try {
      const tempDiv = document.createElement("div");
      new window.QRCode(tempDiv, { text: textUrl, width: size, height: size, colorDark: "#0f172a", colorLight: "#ffffff" });
      setTimeout(() => {
        const qrCanvas = tempDiv.querySelector("canvas");
        const qrImg = tempDiv.querySelector("img");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(x - 4, y - 4, size + 8, size + 8);
        ctx.strokeStyle = "#94a3b8";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x - 4, y - 4, size + 8, size + 8);
        if (qrCanvas) ctx.drawImage(qrCanvas, x, y, size, size);
        else if (qrImg && qrImg.complete) ctx.drawImage(qrImg, x, y, size, size);
        resolve();
      }, 60);
    } catch (e) {
      resolve();
    }
  });
}

// =========================================================================
// 1. CETAK PDF DAFTAR HADIR INDIVIDU (SURAT KETERANGAN KEHADIRAN BOSP)
// =========================================================================
async function generatePdfDaftarHadirIndividu(school) {
  toast("Menyiapkan PDF Daftar Hadir Individu...");
  await ensureJsPdfLoaded();

  const canvas = document.createElement("canvas");
  canvas.width = 794;  // A4 Portrait
  canvas.height = 1123;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  await drawOfficialLetterhead(ctx, canvas.width);

  ctx.textAlign = "center";
  ctx.fillStyle = "#0f172a";
  ctx.font = "800 18px 'Plus Jakarta Sans', Arial, sans-serif";
  ctx.fillText("SURAT KETERANGAN & REKAPITULASI DAFTAR HADIR PESERTA", canvas.width / 2, 215);
  ctx.font = "bold 13px 'Plus Jakarta Sans', Arial, sans-serif";
  ctx.fillStyle = "#475569";
  ctx.fillText("Nomor: 421.2 / DH-SPJ / K3S-KK / XI / 2026", canvas.width / 2, 236);

  ctx.textAlign = "left";
  ctx.fillStyle = "#0f172a";
  ctx.font = "14px 'Plus Jakarta Sans', Arial, sans-serif";
  ctx.fillText("Panitia Pelaksana Rapat Koordinasi Kepala SD/MI Kota Kupang Tahun 2026 menerangkan bahwa:", 50, 275);

  const infoRows = [
    ["Nama Kepala Sekolah", `: ${school.nama_kepsek || 'Kepala ' + school.nama_sekolah}`],
    ["NIP", `: ${school.nip_kepsek || '-'}`],
    ["Satuan Pendidikan", `: ${school.nama_sekolah} (NPSN: ${school.npsn})`],
    ["Sub Rayon / Kecamatan", `: Sub Rayon ${school.subrayon} — Kelurahan ${school.kelurahan || '-'}`],
    ["Status Registrasi & Kamar", `: ${school.status_ikut || 'Ikut'} (Kamar: ${school.nomor_kamar || '-'})`]
  ];

  let yPos = 308;
  infoRows.forEach(r => {
    ctx.font = "bold 13px 'Plus Jakarta Sans', Arial, sans-serif";
    ctx.fillStyle = "#334155";
    ctx.fillText(r[0], 65, yPos);
    ctx.font = "bold 13px 'Plus Jakarta Sans', Arial, sans-serif";
    ctx.fillStyle = "#0f172a";
    ctx.fillText(r[1], 255, yPos);
    yPos += 26;
  });

  ctx.font = "14px 'Plus Jakarta Sans', Arial, sans-serif";
  ctx.fillText("Telah mengikuti kegiatan Rapat Koordinasi Kepala SD/MI Se-Kota Kupang Tahun 2026 pada tanggal", 50, yPos + 15);
  ctx.fillText("19 s.d. 21 November 2026 dengan rincian rekapitulasi presensi digital (QR Scan) sebagai berikut:", 50, yPos + 35);

  // Tabel Kehadiran 3 Hari
  const tableTop = yPos + 58;
  const headers = ["Hari / Tanggal Pelaksanaan", "Agenda Utama Kegiatan", "Status Presensi QR", "Validasi"];
  const colW = [195, 255, 145, 99];
  let startX = 50;

  ctx.fillStyle = "#1e3a8a";
  ctx.fillRect(startX, tableTop, 694, 38);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 12px 'Plus Jakarta Sans', Arial, sans-serif";

  let curX = startX;
  headers.forEach((h, i) => {
    ctx.fillText(h, curX + 10, tableTop + 24);
    curX += colW[i];
  });

  const dayRows = [
  ["Hari Ke-1 (Kamis, 26 Nov 2026)", "Registrasi, Pembukaan & Kebijakan Dinas P&K", school.hadir_h1 ? "HADIR TERVERIFIKASI" : "BELUM TERCATAT", school.hadir_h1 ? "SAH (QR)" : "-"],
  ["Hari Ke-2 (Jumat, 27 Nov 2026)", "Sidang Komisi & Penyusunan Program K3S", school.hadir_h2 ? "HADIR TERVERIFIKASI" : "BELUM TERCATAT", school.hadir_h2 ? "SAH (QR)" : "-"],
  ["Hari Ke-3 (Sabtu, 28 Nov 2026)", "Perumusan Hasil Rakor & Penutupan Resmi", school.hadir_h3 ? "HADIR TERVERIFIKASI" : "BELUM TERCATAT", school.hadir_h3 ? "SAH (QR)" : "-"]
];

  let rowY = tableTop + 38;
  dayRows.forEach((r, idx) => {
    ctx.fillStyle = idx % 2 === 0 ? "#f8fafc" : "#ffffff";
    ctx.fillRect(startX, rowY, 694, 42);
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 1;
    ctx.strokeRect(startX, rowY, 694, 42);

    let cx = startX;
    r.forEach((cell, cIdx) => {
      ctx.fillStyle = cIdx === 2 && cell.includes("HADIR") ? "#047857" : "#0f172a";
      ctx.font = cIdx >= 2 ? "bold 12px 'Plus Jakarta Sans', Arial, sans-serif" : "12px 'Plus Jakarta Sans', Arial, sans-serif";
      ctx.fillText(cell, cx + 10, rowY + 26);
      cx += colW[cIdx];
    });
    rowY += 42;
  });

  ctx.fillStyle = "#0f172a";
  ctx.font = "13px 'Plus Jakarta Sans', Arial, sans-serif";
  ctx.fillText("Demikian dokumen rekapitulasi daftar hadir ini diterbitkan secara resmi melalui Sistem Informasi", 50, rowY + 35);
  ctx.fillText("Manajemen Rakor (SIM-RAKOR) K3S Kota Kupang sebagai lampiran SPJ Dana BOSP Sekolah.", 50, rowY + 55);

  // Tanda Tangan & QR Validasi
  const signY = rowY + 115;
  ctx.font = "bold 13px 'Plus Jakarta Sans', Arial, sans-serif";
  ctx.fillText("Mengetahui,", 80, signY);
  ctx.fillText("Ketua Panitia Pelaksana", 80, signY + 20);
  ctx.fillText("Surahman Husain, S.Pd.", 80, signY + 100);

  ctx.fillText("Kupang, 21 November 2026", 480, signY);
  ctx.fillText("Sekretaris Panitia,", 480, signY + 20);
  ctx.fillText("Emanuel Nata Huler, S.Pd., Gr.", 480, signY + 100);

  const verifyUrl = `${window.location.origin}${window.location.pathname}?verify_cert=SEK-${school.npsn}`;
  await drawQrOnCanvas(ctx, verifyUrl, 335, signY + 5, 95);
  ctx.textAlign = "center";
  ctx.font = "bold 10px monospace";
  ctx.fillStyle = "#475569";
  ctx.fillText(`VALID-SPJ: ${school.npsn}`, 382, signY + 115);

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: "portrait", unit: "px", format: [794, 1123] });
  pdf.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, 794, 1123);
  pdf.save(`Daftar_Hadir_SPJ_BOSP_${school.nama_sekolah.replace(/\s+/g, '_')}.pdf`);
  toast("PDF Daftar Hadir Individu berhasil diunduh!");
}

// =========================================================================
// 2. CETAK PDF DAFTAR HADIR KOLEKTIF SUB RAYON (SEPERTI DAFTAR HADIR MANUAL)
// =========================================================================
async function generatePdfDaftarHadirKolektif(subrayon, srSchools, ketuaRayon) {
  toast(`Menyiapkan PDF Daftar Hadir Kolektif Sub Rayon ${subrayon}...`);
  await ensureJsPdfLoaded();

  const canvas = document.createElement("canvas");
  canvas.width = 794;
  canvas.height = 1123;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  await drawOfficialLetterhead(ctx, canvas.width);

  ctx.textAlign = "center";
  ctx.fillStyle = "#0f172a";
  ctx.font = "800 16px 'Plus Jakarta Sans', Arial, sans-serif";
  ctx.fillText(`DAFTAR HADIR KOLEKTIF PESERTA — SUB RAYON ${subrayon.toUpperCase()}`, canvas.width / 2, 205);
  ctx.font = "bold 12px 'Plus Jakarta Sans', Arial, sans-serif";
  ctx.fillStyle = "#334155";
  ctx.fillText(`Tanggal Pelaksanaan: 19 s.d. 21 November 2026 • Koordinator: ${ketuaRayon ? ketuaRayon.nama_panitia : '-'}`, canvas.width / 2, 224);

  // Header Tabel Kolektif
  const startX = 40;
  let y = 242;
  const colW = [34, 220, 185, 65, 65, 65, 80];
  const headers = ["No", "Nama Sekolah (SD/MI)", "Nama Kepala Sekolah", "H1 (26/11)", "H2 (27/11)", "H3 (28/11)", "Ket. / Sah"];

  ctx.fillStyle = "#0f172a";
  ctx.fillRect(startX, y, 714, 28);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 10px 'Plus Jakarta Sans', Arial, sans-serif";
  ctx.textAlign = "left";

  let cx = startX;
  headers.forEach((h, i) => {
    ctx.fillText(h, cx + 5, y + 18);
    cx += colW[i];
  });
  y += 28;

  srSchools.forEach((s, idx) => {
    const rowH = 20;
    ctx.fillStyle = idx % 2 === 0 ? "#f8fafc" : "#ffffff";
    ctx.fillRect(startX, y, 714, rowH);
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 0.8;
    ctx.strokeRect(startX, y, 714, rowH);

    const cells = [
      String(idx + 1),
      String(s.nama_sekolah || "").slice(0, 34),
      String(s.nama_kepsek || "Kepala Sekolah").slice(0, 28),
      s.hadir_h1 ? "HADIR" : "-",
      s.hadir_h2 ? "HADIR" : "-",
      s.hadir_h3 ? "HADIR" : "-",
      (s.hadir_h1 || s.hadir_h2 || s.hadir_h3) ? "QR-SAH" : (s.status_ikut || "-")
    ];

    let curX = startX;
    cells.forEach((txt, cIdx) => {
      ctx.fillStyle = (cIdx >= 3 && txt === "HADIR") ? "#047857" : "#0f172a";
      ctx.font = cIdx >= 3 ? "bold 9.5px 'Plus Jakarta Sans', Arial, sans-serif" : "9.5px 'Plus Jakarta Sans', Arial, sans-serif";
      ctx.fillText(txt, curX + 5, y + 14);
      curX += colW[cIdx];
    });
    y += rowH;
  });

  // Pengesahan Bawah
  const signY = Math.min(y + 25, 995);
  ctx.textAlign = "left";
  ctx.fillStyle = "#0f172a";
  ctx.font = "bold 11px 'Plus Jakarta Sans', Arial, sans-serif";
  ctx.fillText("Ketua Panitia Pelaksana,", 60, signY);
  ctx.fillText("Surahman Husain, S.Pd.", 60, signY + 65);

  ctx.fillText("Kupang, 21 November 2026", 510, signY - 14);
  ctx.fillText("Sekretaris Panitia,", 510, signY);
  ctx.fillText("Emanuel Nata Huler, S.Pd., Gr.", 510, signY + 65);

  const verifyUrl = `${window.location.origin}${window.location.pathname}`;
  await drawQrOnCanvas(ctx, verifyUrl, 355, signY - 8, 72);

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: "portrait", unit: "px", format: [794, 1123] });
  pdf.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, 794, 1123);
  pdf.save(`Daftar_Hadir_Kolektif_SubRayon_${subrayon}_Rakor2026.pdf`);
  toast(`PDF Daftar Hadir Kolektif Sub Rayon ${subrayon} diunduh!`);
}

// =========================================================================
// 3. CETAK PDF E-KWITANSI RESMI DANA BOSP (RP 2.000.000)
// =========================================================================
async function generatePdfEKwitansiBosp(school) {
  toast("Menyiapkan PDF E-Kwitansi Resmi BOSP...");
  await ensureJsPdfLoaded();

  const canvas = document.createElement("canvas");
  canvas.width = 794;
  canvas.height = 620;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  await drawOfficialLetterhead(ctx, canvas.width);

  const numOrder = String(school.id_sekolah || "001").replace(/\D/g, "").slice(-3) || "001";
  const kwitansiNo = `No. Kwitansi: ${numOrder} / KWT-BOSP / K3S-KK / XI / 2026`;

  ctx.textAlign = "center";
  ctx.fillStyle = "#0f172a";
  ctx.font = "800 20px 'Plus Jakarta Sans', Arial, sans-serif";
  ctx.fillText("KWITANSI BUKTI PEMBAYARAN KONTRIBUSI RAKOR", canvas.width / 2, 212);
  ctx.font = "bold 13px 'Plus Jakarta Sans', Arial, sans-serif";
  ctx.fillStyle = "#047857";
  ctx.fillText(kwitansiNo, canvas.width / 2, 232);

  // Kotak Isi Kwitansi
  ctx.strokeStyle = "#1e3a8a";
  ctx.lineWidth = 2;
  ctx.strokeRect(45, 248, 704, 195);

  const rows = [
    ["Sudah Terima Dari", `: Bendahara BOSP ${school.nama_sekolah} (NPSN: ${school.npsn})`],
    ["Nama Peserta", `: ${school.nama_kepsek || 'Kepala ' + school.nama_sekolah} (Sub Rayon ${school.subrayon})`],
    ["Uang Sejumlah", `: Dua Juta Rupiah`],
    ["Untuk Pembayaran", `: Kontribusi Peserta Kegiatan Rapat Koordinasi (Rakor) Kepala SD/MI`],
    ["", `  Se-Kota Kupang Tahun 2026 pada tanggal 19 s.d. 21 November 2026.`],
    ["Status Pembayaran", `: LUNAS TERVERIFIKASI (${school.waktu_bayar || '2026'})`]
  ];

  ctx.textAlign = "left";
  let y = 278;
  rows.forEach((r, idx) => {
    ctx.font = "bold 13px 'Plus Jakarta Sans', Arial, sans-serif";
    ctx.fillStyle = "#475569";
    ctx.fillText(r[0], 65, y);

    ctx.font = idx === 2 ? "italic bold 14px 'Plus Jakarta Sans', Arial, sans-serif" : "bold 13px 'Plus Jakarta Sans', Arial, sans-serif";
    ctx.fillStyle = idx === 5 ? "#047857" : "#0f172a";
    ctx.fillText(r[1], 230, y);
    y += 26;
  });

  // Kotak Nominal Rp 2.000.000,-
  ctx.fillStyle = "#fef3c7";
  ctx.fillRect(45, 465, 250, 48);
  ctx.strokeStyle = "#d97706";
  ctx.lineWidth = 2;
  ctx.strokeRect(45, 465, 250, 48);

  ctx.fillStyle = "#0f172a";
  ctx.font = "800 20px 'Plus Jakarta Sans', Arial, sans-serif";
  ctx.fillText("Rp 2.000.000,-", 75, 496);

  // Tanda Tangan Ketua Panitia & Bendahara
  ctx.font = "bold 12px 'Plus Jakarta Sans', Arial, sans-serif";
  ctx.fillStyle = "#0f172a";
  ctx.fillText("Mengetahui,", 330, 475);
  ctx.fillText("Ketua Panitia Pelaksana", 330, 492);
  ctx.fillText("Surahman Husain, S.Pd.", 330, 565);

  ctx.fillText("Kupang, November 2026", 545, 475);
  ctx.fillText("Bendahara Panitia,", 545, 492);
  ctx.fillText("Adriana Illi Leto, S.Pd.", 545, 565);

  const verifyUrl = `${window.location.origin}${window.location.pathname}?verify_cert=SEK-${school.npsn}`;
  await drawQrOnCanvas(ctx, verifyUrl, 130, 522, 75);

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [794, 620] });
  pdf.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, 794, 620);
  pdf.save(`E-Kwitansi_BOSP_Rakor2026_${school.nama_sekolah.replace(/\s+/g, '_')}.pdf`);
  toast("PDF E-Kwitansi Resmi BOSP berhasil diunduh!");
}
