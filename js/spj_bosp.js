// js/spj_bosp.js
// Mencakup:
// 1. Dokumen Pertanggungjawaban BOSP (26-28 Nov 2026) + Tombol Download Absensi Manual
// 2. Panel Upload Absensi Manual (Khusus Sekretaris & Seksi Kesekretariatan)
// 3. Upgrade Card Meja Layanan & Otorisasi Pos (Hadir H1, H2, H3, Rakor Kit, Transpor) + Pelacak Peserta Belum Absen
import { sb, toast } from './supabase.js';

const SUBRAYON_LIST = ["Maulafa", "Alak", "Kota Raja", "Oebobo", "Kelapa Lima", "Kota Lama"];

let spjLockState = {
  spj_absen: false,    // Dikendalikan oleh Sekretaris
  spj_kwitansi: false  // Dikendalikan oleh Bendahara
};

let manualAbsenRecord = {
  kode_menu: 'absensi_manual_spj',
  judul: 'Dokumen Daftar Hadir Manual (Scan TTD Basah)',
  deskripsi: 'File scan daftar hadir manual untuk lampiran SPJ BOSP.',
  url_link: '',
  status_tersedia: 'Belum Diunggah'
};

let logoK3sImageObj = null;
let selectedRekapDay = "H1";
let selectedRekapRayon = "ALL";
let selectedRekapStatus = "BELUM"; // Default langsung melacak yang BELUM absen

function isUserSekretaris(activeUser) {
  return Boolean(
    activeUser &&
    activeUser.role === 'panitia' &&
    activeUser.profile?.divisi === 'Sekretaris'
  );
}

// Hak Akses Upload Absensi Manual: Sekretaris & Seksi Kesekretariatan
function canUploadManualAbsen(activeUser) {
  return Boolean(
    activeUser &&
    activeUser.role === 'panitia' &&
    ['Sekretaris', 'Seksi Kesekretariatan'].includes(activeUser.profile?.divisi)
  );
}

function isUserBendahara(activeUser) {
  return Boolean(
    activeUser &&
    activeUser.role === 'panitia' &&
    activeUser.profile?.divisi === 'Bendahara'
  );
}

async function fetchSpjLockAndManualDocState() {
  try {
    const [posRes, layRes] = await Promise.all([
      sb.from("pengaturan_pos").select("*").in("id_pos", ["spj_absen", "spj_kwitansi"]),
      sb.from("info_layanan").select("*").eq("kode_menu", "absensi_manual_spj").maybeSingle()
    ]);

    if (posRes.data) {
      posRes.data.forEach(r => {
        spjLockState[r.id_pos] = Boolean(r.status_buka);
      });
    }
    if (layRes.data) {
      manualAbsenRecord = layRes.data;
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

// Fungsi Utama yang Dipanggil dari renderAllViews() di app.js
export async function renderSpjBospWidgets(activeUser, sekolahList, panitiaList) {
  await fetchSpjLockAndManualDocState();
  injectPanitiaSpjControlCard(activeUser, sekolahList, panitiaList);
  injectPesertaSpjDownloadCard(activeUser, sekolahList, panitiaList);
  upgradeMejaLayananCardWithAttendanceTracker(activeUser, sekolahList);
}

// =========================================================================
// 1. PANEL KONTROL AKTIVASI SPJ & UPLOAD ABSENSI MANUAL (SEKRETARIS, KESEKRETARIATAN & BENDAHARA)
// =========================================================================
function injectPanitiaSpjControlCard(activeUser, sekolahList, panitiaList) {
  const existing = document.getElementById("panitiaSpjControlWidget");
  const isSek = isUserSekretaris(activeUser);
  const isBen = isUserBendahara(activeUser);
  const canUpManual = canUploadManualAbsen(activeUser);

  if (!isSek && !isBen && !canUpManual) {
    if (existing) existing.remove();
    return;
  }

  const targetContainer = document.getElementById("panitiaSpecialCardsBox") ||
    document.querySelector(".service-menu-btn")?.parentElement;
  if (!targetContainer) return;

  if (!existing) {
    const box = document.createElement("div");
    box.id = "panitiaSpjControlWidget";
    box.className = "w-full";
    targetContainer.appendChild(box);
  }

  const target = document.getElementById("panitiaSpjControlWidget");
  if (!target) return;

  const isOpen = isSek ? spjLockState.spj_absen : spjLockState.spj_kwitansi;
  const hasManualFile = Boolean(manualAbsenRecord.url_link && manualAbsenRecord.url_link.trim() !== "");

  let toggleSectionHtml = "";
  if (isSek || isBen) {
    const roleTitle = isSek ? "Otoritas Sekretaris: Daftar Hadir SPJ" : "Otoritas Bendahara: E-Kwitansi BOSP";
    const descText = isSek
      ? "Aktifkan agar peserta dapat mengunduh PDF Daftar Hadir Individu, Kolektif Sub Rayon & Absensi Manual."
      : "Aktifkan agar sekolah yang sudah LUNAS dapat mengunduh PDF E-Kwitansi Kontribusi Rp 2.000.000.";

    toggleSectionHtml = `
      <div class="flex items-center justify-between gap-3">
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-1.5 flex-wrap">
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
  }

  let uploadManualHtml = "";
  if (canUpManual) {
    uploadManualHtml = `
      <div class="${toggleSectionHtml ? 'pt-2.5 mt-2.5 border-t border-white/15' : ''} flex items-center justify-between gap-2">
        <div class="min-w-0">
          <div class="text-[10px] font-extrabold text-amber-300 flex items-center gap-1.5">
            <i class="fa-solid fa-file-signature"></i>
            <span>Dokumen Absensi Manual (TTD Basah)</span>
          </div>
          <div class="text-[9px] text-slate-300 truncate">
            Status: <b class="${hasManualFile ? 'text-emerald-400' : 'text-amber-300'}">${hasManualFile ? '✓ File Tersedia & Siap Diunduh' : 'Belum Diunggah'}</b>
          </div>
        </div>
        <button type="button" id="btnOpenUploadManualAbsenModal" class="px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-[10px] shrink-0 flex items-center gap-1.5 shadow">
          <i class="fa-solid fa-cloud-arrow-up"></i>
          <span>${hasManualFile ? 'Ganti File' : 'Upload File'}</span>
        </button>
      </div>
    `;
  }

  target.innerHTML = `
    <div class="p-3.5 rounded-2xl ${isOpen ? 'bg-emerald-950 border-emerald-400/40' : 'bg-slate-900 border-amber-400/40'} text-white border shadow-md">
      ${toggleSectionHtml}
      ${uploadManualHtml}
    </div>
  `;

  document.getElementById("btnToggleSpjAccessNow")?.addEventListener("click", async () => {
    const key = isSek ? "spj_absen" : "spj_kwitansi";
    const nextVal = !spjLockState[key];
    spjLockState[key] = nextVal;

    await sb.from("pengaturan_pos").upsert([{
      id_pos: key,
      nama_pos: isSek ? "Otoritas Sekretaris: Daftar Hadir SPJ" : "Otoritas Bendahara: E-Kwitansi BOSP",
      status_buka: nextVal,
      diupdate_oleh: activeUser.profile?.nama_panitia || "Panitia",
      waktu_update: new Date().toLocaleString("id-ID")
    }]);

    toast(nextVal
      ? `Dokumen SPJ resmi DIBUKA untuk peserta!`
      : `Dokumen SPJ DIKUNCI kembali.`);
    renderSpjBospWidgets(activeUser, sekolahList, panitiaList);
  });

  document.getElementById("btnOpenUploadManualAbsenModal")?.addEventListener("click", () => {
    openUploadManualAbsenModal(activeUser, sekolahList, panitiaList);
  });
}

// Modal Upload File Absensi Manual (Khusus Sekretaris & Seksi Kesekretariatan)
export function openUploadManualAbsenModal(activeUser, sekolahList, panitiaList) {
  if (!canUploadManualAbsen(activeUser)) {
    return toast("Akses Ditolak: Hanya Sekretaris & Seksi Kesekretariatan yang dapat mengunggah Absensi Manual!");
  }

  const modal = document.getElementById("serviceModal");
  const titleEl = document.getElementById("serviceModalTitle");
  const bodyEl = document.getElementById("serviceModalBody");
  if (!modal || !titleEl || !bodyEl) return;

  modal.classList.remove("hidden");
  titleEl.innerHTML = `<i class="fa-solid fa-file-signature text-blue-700 mr-1.5"></i> Upload Dokumen Absensi Manual`;

  const hasFile = Boolean(manualAbsenRecord.url_link && manualAbsenRecord.url_link.trim() !== "");

  bodyEl.innerHTML = `
    <div class="p-4 rounded-2xl bg-blue-50 border border-blue-200 space-y-2">
      <div class="flex items-center justify-between">
        <span class="text-[10px] font-extrabold uppercase bg-blue-900 text-amber-300 px-2.5 py-0.5 rounded-full">
          Otoritas Sekretaris & Kesekretariatan
        </span>
        <span class="text-[10px] font-extrabold ${hasFile ? 'text-emerald-700' : 'text-amber-700'}">
          ${hasFile ? '✓ Sudah Diunggah' : 'Belum Ada File'}
        </span>
      </div>
      <p class="text-[11px] text-slate-700 leading-relaxed">
        Unggah file <b>Scan Daftar Hadir Manual (PDF / Gambar / ZIP)</b> yang telah ditandatangani peserta dan distempel basah agar dapat diunduh oleh Kepala Sekolah melalui tombol <b>"Download Absensi Manual"</b> di tab Absensi.
      </p>
      ${hasFile ? `
        <div class="pt-1">
          <a href="${manualAbsenRecord.url_link}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1.5 text-[11px] font-extrabold text-blue-800 hover:underline">
            <i class="fa-solid fa-up-right-from-square"></i> Lihat File Absensi Manual Saat Ini
          </a>
        </div>
      ` : ''}
    </div>

    <div class="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
      <div>
        <label class="block text-[10px] font-bold text-slate-700 mb-1">1. Pilih File Scan Absensi Manual (.PDF / .JPG / .PNG):</label>
        <input id="inpManualAbsenFile" type="file" accept=".pdf,image/*,.zip" class="w-full rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:bg-blue-900 file:text-white file:text-[11px] file:font-bold" />
      </div>

      <div>
        <label class="block text-[10px] font-bold text-slate-700 mb-1">Atau Tempel Link Google Drive (Opsional):</label>
        <input id="inpManualAbsenUrl" type="url" value="${manualAbsenRecord.url_link || ''}" placeholder="https://drive.google.com/..." class="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold" />
      </div>

      <div>
        <label class="block text-[10px] font-bold text-slate-700 mb-1">Keterangan Dokumen:</label>
        <input id="inpManualAbsenDesc" type="text" value="${manualAbsenRecord.deskripsi || 'File scan daftar hadir manual berstempel basah (26–28 Nov 2026).'}" class="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold" />
      </div>

      <div class="flex gap-2 pt-1">
        <button type="button" id="btnSaveManualAbsenNow" class="flex-1 py-3 rounded-xl bg-blue-900 hover:bg-blue-800 text-white font-extrabold text-xs shadow flex items-center justify-center gap-2">
          <i class="fa-solid fa-cloud-arrow-up"></i>
          <span>Simpan & Publikasikan Absensi Manual</span>
        </button>
        ${hasFile ? `
          <button type="button" id="btnRemoveManualAbsenFile" class="px-3 py-3 rounded-xl bg-rose-100 hover:bg-rose-200 text-rose-700 font-extrabold text-xs">
            Hapus
          </button>
        ` : ''}
      </div>
    </div>
  `;

  document.getElementById("btnSaveManualAbsenNow")?.addEventListener("click", async () => {
    const file = document.getElementById("inpManualAbsenFile")?.files?.[0];
    let finalUrl = document.getElementById("inpManualAbsenUrl")?.value.trim() || "";
    const deskripsi = document.getElementById("inpManualAbsenDesc")?.value.trim() || "";

    const btn = document.getElementById("btnSaveManualAbsenNow");
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner animate-spin"></i> Mengunggah Dokumen...`;

    if (file) {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'pdf';
      const fileName = `absensi_manual_rakor2026_${Date.now()}.${ext}`;

      const { error: upErr } = await sb.storage
        .from("dokumen_rakor")
        .upload(fileName, file, { cacheControl: "3600", upsert: true });

      if (upErr) {
        btn.disabled = false;
        btn.innerHTML = `<i class="fa-solid fa-cloud-arrow-up"></i> Simpan & Publikasikan Absensi Manual`;
        return toast("Gagal mengunggah file ke server.");
      }

      const { data: pubData } = sb.storage.from("dokumen_rakor").getPublicUrl(fileName);
      finalUrl = pubData?.publicUrl || "";
    }

    if (!finalUrl) {
      btn.disabled = false;
      btn.innerHTML = `<i class="fa-solid fa-cloud-arrow-up"></i> Simpan & Publikasikan Absensi Manual`;
      return toast("Pilih file dokumen atau masukkan link terlebih dahulu!");
    }

    const payload = {
      kode_menu: 'absensi_manual_spj',
      judul: 'Dokumen Daftar Hadir Manual (26–28 Nov 2026)',
      deskripsi,
      url_link: finalUrl,
      status_tersedia: 'Tersedia'
    };

    await sb.from("info_layanan").upsert([payload]);
    manualAbsenRecord = payload;
    toast("Dokumen Absensi Manual berhasil dipublikasikan!");
    modal.classList.add("hidden");
    renderSpjBospWidgets(activeUser, sekolahList, panitiaList);
  });

  document.getElementById("btnRemoveManualAbsenFile")?.addEventListener("click", async () => {
    if (!confirm("Hapus file Absensi Manual saat ini?")) return;
    const payload = {
      kode_menu: 'absensi_manual_spj',
      judul: 'Dokumen Daftar Hadir Manual (26–28 Nov 2026)',
      deskripsi: manualAbsenRecord.deskripsi,
      url_link: '',
      status_tersedia: 'Belum Diunggah'
    };
    await sb.from("info_layanan").upsert([payload]);
    manualAbsenRecord = payload;
    toast("File Absensi Manual dihapus.");
    modal.classList.add("hidden");
    renderSpjBospWidgets(activeUser, sekolahList, panitiaList);
  });
}

// =========================================================================
// 2. KARTU UNDUH PAKET DOKUMEN SPJ BOSP DI TAB ABSENSI PESERTA
// (Tanggal 26–28 Nov 2026 + Tombol Download Absensi Manual)
// =========================================================================
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
  const hasManualAbsenUrl = Boolean(manualAbsenRecord.url_link && manualAbsenRecord.url_link.trim() !== "");

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

    <!-- BAGIAN A: DAFTAR HADIR RESMI (26–28 NOV 2026) & ABSENSI MANUAL -->
    <div class="p-3 rounded-xl bg-white border border-slate-200 space-y-2">
      <div class="flex items-center justify-between">
        <span class="text-[11px] font-extrabold text-slate-800">
          <i class="fa-solid fa-users-rectangle text-blue-700 mr-1"></i> 1. Daftar Hadir Resmi (26–28 Nov 2026)
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

        <!-- Tombol ke-3: Download Absensi Manual (Hasil Upload Sekretaris & Kesekretariatan) -->
        <button type="button" id="btnDownloadAbsensiManual" class="w-full py-2.5 px-3 rounded-xl ${
          hasManualAbsenUrl
            ? 'bg-amber-400 hover:bg-amber-300 text-slate-950'
            : 'bg-slate-100 text-slate-500 border border-slate-200'
        } font-extrabold text-[11px] shadow-2xs flex items-center justify-center gap-2 transition mt-1.5">
          <i class="fa-solid fa-file-signature ${hasManualAbsenUrl ? 'text-blue-950' : 'text-slate-400'}"></i>
          <span>${hasManualAbsenUrl ? 'Download Absensi Manual (Scan Tanda Tangan)' : 'Download Absensi Manual (Menunggu Upload Sekretariat)'}</span>
        </button>
      ` : `
        <p class="text-[10px] text-slate-500 bg-slate-50 p-2 rounded-lg border border-slate-200/80 text-center font-semibold">
          <i class="fa-solid fa-lock mr-1 text-amber-600"></i> Unduhan Daftar Hadir Individu, Kolektif Sub Rayon & Absensi Manual akan terbuka setelah diaktifkan oleh <b>Sekretaris Panitia</b>.
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

  document.getElementById("btnDownloadAbsensiManual")?.addEventListener("click", () => {
    if (!hasManualAbsenUrl) {
      return toast("File Scan Absensi Manual sedang disiapkan oleh Sekretaris / Seksi Kesekretariatan.");
    }
    window.open(manualAbsenRecord.url_link, "_blank", "noopener,noreferrer");
  });

  document.getElementById("btnDownloadSpjKwitansi")?.addEventListener("click", () => {
    generatePdfEKwitansiBosp(s);
  });
}

// =========================================================================
// 3. UPGRADE CARD "MEJA LAYANAN & OTORISASI POS" DI AKUN PANITIA:
// Tampilkan Hadir H1, Hadir H2, Hadir H3, Rakor Kit & Transpor + Lacak Siapa yang Belum Absen
// =========================================================================
function upgradeMejaLayananCardWithAttendanceTracker(activeUser, sekolahList) {
  if (!activeUser || activeUser.role !== "panitia") return;

  const box = document.getElementById("berandaPosLayananBox");
  if (!box) return;

  const totalSek = sekolahList.length || 160;
  const h1Count = sekolahList.filter(s => s.hadir_h1).length;
  const h2Count = sekolahList.filter(s => s.hadir_h2).length;
  const h3Count = sekolahList.filter(s => s.hadir_h3).length;
  const kitCount = sekolahList.filter(s => s.ambil_kit).length;
  const transCount = sekolahList.filter(s => s.terima_transport).length;

  const canUploadManual = canUploadManualAbsen(activeUser);
  const hasManualFile = Boolean(manualAbsenRecord.url_link && manualAbsenRecord.url_link.trim() !== "");

  // Cari grid 3 kolom lama (Hadir H1, Rakor Kit, Transpor) di dalam berandaPosLayananBox dan ganti dengan 5 indikator lengkap
  let statsGrid = document.getElementById("upgradedMejaLayananStatsGrid");
  if (!statsGrid) {
    const oldThreeGrid = box.querySelector(".grid.grid-cols-3");
    if (oldThreeGrid) {
      oldThreeGrid.id = "upgradedMejaLayananStatsGrid";
      statsGrid = oldThreeGrid;
    } else {
      statsGrid = document.createElement("div");
      statsGrid.id = "upgradedMejaLayananStatsGrid";
      box.insertBefore(statsGrid, box.firstChild);
    }
  }

  statsGrid.className = "space-y-2";
  statsGrid.innerHTML = `
    <!-- Baris 1: Rekap Kehadiran 3 Hari (H1, H2, H3) -->
    <div class="grid grid-cols-3 gap-2 text-center">
      <div data-trackday="H1" class="btn-quick-track-day bg-blue-50 hover:bg-blue-100 rounded-2xl p-2 border border-blue-200 cursor-pointer transition">
        <div class="text-sm font-extrabold text-blue-900">${h1Count}<span class="text-[10px] font-semibold text-slate-400">/${totalSek}</span></div>
        <div class="text-[9px] font-extrabold text-blue-800 uppercase">Hadir H1 (26/11)</div>
        <div class="text-[8px] font-bold text-rose-600 mt-0.5">Belum: ${totalSek - h1Count}</div>
      </div>
      <div data-trackday="H2" class="btn-quick-track-day bg-indigo-50 hover:bg-indigo-100 rounded-2xl p-2 border border-indigo-200 cursor-pointer transition">
        <div class="text-sm font-extrabold text-indigo-900">${h2Count}<span class="text-[10px] font-semibold text-slate-400">/${totalSek}</span></div>
        <div class="text-[9px] font-extrabold text-indigo-800 uppercase">Hadir H2 (27/11)</div>
        <div class="text-[8px] font-bold text-rose-600 mt-0.5">Belum: ${totalSek - h2Count}</div>
      </div>
      <div data-trackday="H3" class="btn-quick-track-day bg-violet-50 hover:bg-violet-100 rounded-2xl p-2 border border-violet-200 cursor-pointer transition">
        <div class="text-sm font-extrabold text-violet-900">${h3Count}<span class="text-[10px] font-semibold text-slate-400">/${totalSek}</span></div>
        <div class="text-[9px] font-extrabold text-violet-800 uppercase">Hadir H3 (28/11)</div>
        <div class="text-[8px] font-bold text-rose-600 mt-0.5">Belum: ${totalSek - h3Count}</div>
      </div>
    </div>

    <!-- Baris 2: Rakor Kit & Uang Transpor -->
    <div class="grid grid-cols-2 gap-2 text-center">
      <div data-trackday="KIT" class="btn-quick-track-day bg-amber-50 hover:bg-amber-100 rounded-2xl p-2 border border-amber-200 flex items-center justify-between px-3 cursor-pointer transition">
        <div class="text-left">
          <div class="text-[9px] font-extrabold text-amber-900 uppercase">Ambil Rakor Kit</div>
          <div class="text-[8px] font-bold text-rose-600">Belum: ${totalSek - kitCount} Sekolah</div>
        </div>
        <div class="text-sm font-extrabold text-amber-800">${kitCount}<span class="text-[10px] font-normal text-slate-400">/${totalSek}</span></div>
      </div>
      <div data-trackday="TRANS" class="btn-quick-track-day bg-emerald-50 hover:bg-emerald-100 rounded-2xl p-2 border border-emerald-200 flex items-center justify-between px-3 cursor-pointer transition">
        <div class="text-left">
          <div class="text-[9px] font-extrabold text-emerald-900 uppercase">Terima Transpor</div>
          <div class="text-[8px] font-bold text-rose-600">Belum: ${totalSek - transCount} Sekolah</div>
        </div>
        <div class="text-sm font-extrabold text-emerald-800">${transCount}<span class="text-[10px] font-normal text-slate-400">/${totalSek}</span></div>
      </div>
    </div>

    <!-- Tombol Pelacak Kehadiran Peserta (Siapa yang Belum Absen) & Upload Absensi Manual -->
    <div class="pt-1 space-y-1.5">
      <button type="button" id="btnOpenAttendanceTrackerModal" class="w-full py-2.5 px-3 rounded-2xl bg-gradient-to-r from-slate-900 via-blue-950 to-indigo-950 hover:from-slate-800 hover:to-blue-900 text-white font-extrabold text-xs shadow flex items-center justify-between">
        <div class="flex items-center gap-2">
          <i class="fa-solid fa-user-clock text-amber-300"></i>
          <span>Rekap Kehadiran & Lacak Peserta Belum Absen</span>
        </div>
        <span class="text-[9px] bg-rose-600 text-white px-2 py-0.5 rounded-full font-extrabold">Lacak</span>
      </button>

      ${canUploadManual ? `
        <button type="button" id="btnQuickUploadManualFromMeja" class="w-full py-2 px-3 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-950 font-extrabold text-[11px] flex items-center justify-between transition">
          <span><i class="fa-solid fa-file-signature text-amber-700 mr-1.5"></i>Upload Scan Absensi Manual (SPJ BOSP)</span>
          <span class="text-[9px] font-extrabold px-2 py-0.5 rounded ${hasManualFile ? 'bg-emerald-200 text-emerald-900' : 'bg-amber-200 text-amber-900'}">
            ${hasManualFile ? '✓ Terunggah' : 'Upload PDF'}
          </span>
        </button>
      ` : ''}
    </div>
  `;

  statsGrid.querySelectorAll(".btn-quick-track-day").forEach(card => {
    card.addEventListener("click", () => {
      selectedRekapDay = card.dataset.trackday || "H1";
      selectedRekapStatus = "BELUM";
      openAttendanceTrackerModal(activeUser, sekolahList);
    });
  });

  document.getElementById("btnOpenAttendanceTrackerModal")?.addEventListener("click", () => {
    openAttendanceTrackerModal(activeUser, sekolahList);
  });

  document.getElementById("btnQuickUploadManualFromMeja")?.addEventListener("click", () => {
    openUploadManualAbsenModal(activeUser, sekolahList, []);
  });
}

// =========================================================================
// MODAL PELACAK KEHADIRAN PESERTA (SIAPA YANG HADIR & SIAPA YANG BELUM ABSEN)
// =========================================================================
export function openAttendanceTrackerModal(activeUser, sekolahList) {
  if (!activeUser || activeUser.role !== "panitia") return;

  const modal = document.getElementById("serviceModal");
  const titleEl = document.getElementById("serviceModalTitle");
  const bodyEl = document.getElementById("serviceModalBody");
  if (!modal || !titleEl || !bodyEl) return;

  modal.classList.remove("hidden");
  titleEl.innerHTML = `<i class="fa-solid fa-user-clock text-blue-700 mr-1.5"></i> Pelacak Kehadiran & Layanan Peserta`;

  if (activeUser.profile?.tugas_subrayon && selectedRekapRayon === "ALL") {
    selectedRekapRayon = activeUser.profile.tugas_subrayon;
  }

  renderAttendanceTrackerBody(activeUser, sekolahList, bodyEl);
}

function getFieldByTrackKey(s, key) {
  if (key === "H1") return Boolean(s.hadir_h1);
  if (key === "H2") return Boolean(s.hadir_h2);
  if (key === "H3") return Boolean(s.hadir_h3);
  if (key === "KIT") return Boolean(s.ambil_kit);
  if (key === "TRANS") return Boolean(s.terima_transport);
  return false;
}

function getLabelByTrackKey(key) {
  if (key === "H1") return "Absensi Hari Ke-1 (Kamis, 26 Nov 2026)";
  if (key === "H2") return "Absensi Hari Ke-2 (Jumat, 27 Nov 2026)";
  if (key === "H3") return "Absensi Hari Ke-3 (Sabtu, 28 Nov 2026)";
  if (key === "KIT") return "Pengambilan Rakor Kit";
  if (key === "TRANS") return "Penerimaan Uang Transpor";
  return "Absensi Peserta";
}

function renderAttendanceTrackerBody(activeUser, sekolahList, bodyEl) {
  const totalSek = sekolahList.length || 160;
  const sudahCount = sekolahList.filter(s => getFieldByTrackKey(s, selectedRekapDay)).length;
  const belumCount = totalSek - sudahCount;
  const pct = totalSek > 0 ? Math.round((sudahCount / totalSek) * 100) : 0;

  bodyEl.innerHTML = `
    <!-- Pilih Kategori Pelacakan: H1, H2, H3, Rakor Kit, Transpor -->
    <div class="grid grid-cols-5 gap-1 bg-slate-100 p-1 rounded-2xl text-center">
      ${[
        { k: "H1", lbl: "Hadir H1" },
        { k: "H2", lbl: "Hadir H2" },
        { k: "H3", lbl: "Hadir H3" },
        { k: "KIT", lbl: "Rakor Kit" },
        { k: "TRANS", lbl: "Transpor" }
      ].map(tab => `
        <button type="button" data-tk="${tab.k}" class="track-tab-btn py-2 rounded-xl text-[10px] font-extrabold transition ${
          selectedRekapDay === tab.k ? 'bg-blue-900 text-amber-300 shadow' : 'text-slate-600 hover:bg-white'
        }">${tab.lbl}</button>
      `).join('')}
    </div>

    <!-- Banner Ringkasan Status -->
    <div class="p-4 rounded-3xl bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 text-white space-y-2.5 shadow">
      <div class="flex items-center justify-between">
        <span class="text-[9px] font-extrabold uppercase bg-amber-400 text-slate-950 px-2.5 py-0.5 rounded-full">
          ${getLabelByTrackKey(selectedRekapDay)}
        </span>
        <span class="text-xs font-extrabold text-emerald-300">${pct}% Selesai</span>
      </div>

      <div class="w-full bg-white/15 h-2 rounded-full overflow-hidden">
        <div class="bg-gradient-to-r from-emerald-400 to-teal-300 h-full rounded-full" style="width:${pct}%"></div>
      </div>

      <div class="grid grid-cols-3 gap-2 pt-1 text-center">
        <button type="button" data-st="BELUM" class="track-status-btn p-2 rounded-2xl border transition ${
          selectedRekapStatus === 'BELUM' ? 'bg-rose-600 border-amber-300 text-white ring-2 ring-amber-300/40' : 'bg-rose-500/20 border-rose-400/30 text-rose-200'
        }">
          <div class="text-sm font-extrabold">${belumCount}</div>
          <div class="text-[9px] font-bold uppercase">Belum Absen</div>
        </button>
        <button type="button" data-st="SUDAH" class="track-status-btn p-2 rounded-2xl border transition ${
          selectedRekapStatus === 'SUDAH' ? 'bg-emerald-600 border-amber-300 text-white ring-2 ring-amber-300/40' : 'bg-emerald-500/20 border-emerald-400/30 text-emerald-200'
        }">
          <div class="text-sm font-extrabold">${sudahCount}</div>
          <div class="text-[9px] font-bold uppercase">Sudah Absen</div>
        </button>
        <button type="button" data-st="ALL" class="track-status-btn p-2 rounded-2xl border transition ${
          selectedRekapStatus === 'ALL' ? 'bg-blue-600 border-amber-300 text-white ring-2 ring-amber-300/40' : 'bg-white/10 border-white/15 text-slate-200'
        }">
          <div class="text-sm font-extrabold">${totalSek}</div>
          <div class="text-[9px] font-bold uppercase">Semua</div>
        </button>
      </div>
    </div>

    <!-- Rekap Per Sub Rayon (Klik untuk menyaring siapa yang belum absen di rayon tersebut) -->
    <div class="grid grid-cols-3 gap-1.5">
      ${SUBRAYON_LIST.map(sr => {
        const srList = sekolahList.filter(s => s.subrayon === sr);
        const srSudah = srList.filter(s => getFieldByTrackKey(s, selectedRekapDay)).length;
        const srBelum = srList.length - srSudah;
        const activeSr = selectedRekapRayon === sr;
        return `
          <div data-sr="${sr}" class="track-sr-pill p-2 rounded-xl border cursor-pointer text-center transition ${
            activeSr ? 'bg-blue-50 border-blue-600 ring-2 ring-blue-500/20' : 'bg-slate-50 border-slate-200 hover:bg-white'
          }">
            <div class="text-[10px] font-extrabold text-slate-900 truncate">${sr}</div>
            <div class="text-[9px] font-bold mt-0.5">
              <span class="text-emerald-700">${srSudah}✓</span> • <span class="text-rose-600 font-extrabold">${srBelum}✕</span>
            </div>
          </div>
        `;
      }).join('')}
    </div>

    <!-- Filter & Pencarian Cepat -->
    <div class="grid grid-cols-2 gap-2">
      <select id="trackFilterRayonSelect" class="rounded-xl border border-slate-300 bg-slate-50 px-2.5 py-2 text-xs font-extrabold text-blue-950">
        <option value="ALL" ${selectedRekapRayon === 'ALL' ? 'selected' : ''}>Semua Sub Rayon (${totalSek})</option>
        ${SUBRAYON_LIST.map(sr => `<option value="${sr}" ${selectedRekapRayon === sr ? 'selected' : ''}>Sub Rayon ${sr}</option>`).join('')}
      </select>
      <input id="trackSearchSchoolInput" type="text" placeholder="Cari sekolah / Kepsek..." class="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-semibold" />
    </div>

    <div id="trackParticipantListContainer" class="space-y-2 max-h-72 overflow-y-auto pr-0.5"></div>
  `;

  bodyEl.querySelectorAll(".track-tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      selectedRekapDay = btn.dataset.tk;
      renderAttendanceTrackerBody(activeUser, sekolahList, bodyEl);
    });
  });

  bodyEl.querySelectorAll(".track-status-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      selectedRekapStatus = btn.dataset.st;
      renderAttendanceTrackerBody(activeUser, sekolahList, bodyEl);
    });
  });

  bodyEl.querySelectorAll(".track-sr-pill").forEach(pill => {
    pill.addEventListener("click", () => {
      const sr = pill.dataset.sr;
      selectedRekapRayon = selectedRekapRayon === sr ? "ALL" : sr;
      renderAttendanceTrackerBody(activeUser, sekolahList, bodyEl);
    });
  });

  document.getElementById("trackFilterRayonSelect")?.addEventListener("change", (e) => {
    selectedRekapRayon = e.target.value;
    renderAttendanceTrackerBody(activeUser, sekolahList, bodyEl);
  });

  document.getElementById("trackSearchSchoolInput")?.addEventListener("input", () => {
    renderTrackedParticipantRows(sekolahList);
  });

  renderTrackedParticipantRows(sekolahList);
}

function renderTrackedParticipantRows(sekolahList) {
  const box = document.getElementById("trackParticipantListContainer");
  if (!box) return;

  const kw = (document.getElementById("trackSearchSchoolInput")?.value || "").toLowerCase().trim();

  let list = sekolahList;
  if (selectedRekapRayon !== "ALL") {
    list = list.filter(s => s.subrayon === selectedRekapRayon);
  }
  if (selectedRekapStatus === "BELUM") {
    list = list.filter(s => !getFieldByTrackKey(s, selectedRekapDay));
  } else if (selectedRekapStatus === "SUDAH") {
    list = list.filter(s => getFieldByTrackKey(s, selectedRekapDay));
  }
  if (kw) {
    list = list.filter(s =>
      (s.nama_sekolah || "").toLowerCase().includes(kw) ||
      (s.nama_kepsek || "").toLowerCase().includes(kw) ||
      String(s.npsn || "").includes(kw)
    );
  }

  if (list.length === 0) {
    box.innerHTML = `<div class="p-5 text-center text-xs text-slate-400 bg-slate-50 rounded-2xl border">Tidak ada peserta pada filter ini.</div>`;
    return;
  }

  box.innerHTML = list.slice(0, 200).map((s, idx) => {
    const isDone = getFieldByTrackKey(s, selectedRekapDay);
    const waClean = String(s.no_hp || "").replace(/\D/g, "").replace(/^0/, "62");
    const hasIzin = Boolean(s.status_izin && s.status_izin.trim() !== "");

    return `
      <div class="p-3 rounded-2xl bg-white border ${isDone ? 'border-emerald-300' : 'border-rose-200 bg-rose-50/20'} flex items-start justify-between gap-2 shadow-2xs">
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-1.5 flex-wrap">
            <span class="text-[9px] font-extrabold text-slate-400">#${idx + 1}</span>
            <span class="text-[9px] font-extrabold px-2 py-0.5 rounded ${isDone ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}">
              ${isDone ? '✓ SUDAH ABSEN' : '✕ BELUM ABSEN'}
            </span>
            <span class="text-[9px] font-bold bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">Rayon ${s.subrayon}</span>
            ${hasIzin ? `<span class="text-[9px] font-extrabold bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded">Izin: ${s.status_izin}</span>` : ''}
          </div>
          <h4 class="font-extrabold text-xs text-slate-900 truncate mt-1">${s.nama_sekolah}</h4>
          <p class="text-[10px] text-slate-600 mt-0.5">
            Kepsek: <b>${s.nama_kepsek || 'Belum Diisi'}</b> • Kamar: <b>${s.nomor_kamar || '-'}</b>
          </p>
        </div>

        <div class="flex flex-col items-end gap-1 shrink-0">
          ${s.no_hp ? `
            <a href="https://wa.me/${waClean}" target="_blank" rel="noopener noreferrer" class="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[10px] flex items-center gap-1 shadow-2xs">
              <i class="fa-brands fa-whatsapp"></i> Hubungi
            </a>
          ` : `<span class="text-[9px] text-slate-400">Tanpa No WA</span>`}
        </div>
      </div>
    `;
  }).join('');
}

// =========================================================================
// GENERATOR KOP SURAT RESMI K3S KOTA KUPANG
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
// CETAK PDF DAFTAR HADIR INDIVIDU (26 s.d. 28 NOVEMBER 2026)
// =========================================================================
async function generatePdfDaftarHadirIndividu(school) {
  toast("Menyiapkan PDF Daftar Hadir Individu...");
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
  ctx.fillText("26 s.d. 28 November 2026 dengan rincian rekapitulasi presensi digital (QR Scan) sebagai berikut:", 50, yPos + 35);

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

  const signY = rowY + 115;
  ctx.font = "bold 13px 'Plus Jakarta Sans', Arial, sans-serif";
  ctx.fillText("Mengetahui,", 80, signY);
  ctx.fillText("Ketua Panitia Pelaksana", 80, signY + 20);
  ctx.fillText("Surahman Husain, S.Pd.", 80, signY + 100);

  ctx.fillText("Kupang, 28 November 2026", 480, signY);
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
// CETAK PDF DAFTAR HADIR KOLEKTIF SUB RAYON (26 s.d. 28 NOVEMBER 2026)
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
  ctx.fillText(`Tanggal Pelaksanaan: 26 s.d. 28 November 2026 • Koordinator: ${ketuaRayon ? ketuaRayon.nama_panitia : '-'}`, canvas.width / 2, 224);

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

  const signY = Math.min(y + 25, 995);
  ctx.textAlign = "left";
  ctx.fillStyle = "#0f172a";
  ctx.font = "bold 11px 'Plus Jakarta Sans', Arial, sans-serif";
  ctx.fillText("Ketua Panitia Pelaksana,", 60, signY);
  ctx.fillText("Surahman Husain, S.Pd.", 60, signY + 65);

  ctx.fillText("Kupang, 28 November 2026", 510, signY - 14);
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
// CETAK PDF E-KWITANSI RESMI DANA BOSP (26 s.d. 28 NOVEMBER 2026)
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

  ctx.strokeStyle = "#1e3a8a";
  ctx.lineWidth = 2;
  ctx.strokeRect(45, 248, 704, 195);

  const rows = [
    ["Sudah Terima Dari", `: Bendahara BOSP ${school.nama_sekolah} (NPSN: ${school.npsn})`],
    ["Nama Peserta", `: ${school.nama_kepsek || 'Kepala ' + school.nama_sekolah} (Sub Rayon ${school.subrayon})`],
    ["Uang Sejumlah", `: Dua Juta Rupiah`],
    ["Untuk Pembayaran", `: Kontribusi Peserta Kegiatan Rapat Koordinasi (Rakor) Kepala SD/MI`],
    ["", `  Se-Kota Kupang Tahun 2026 pada tanggal 26 s.d. 28 November 2026.`],
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

  ctx.fillStyle = "#fef3c7";
  ctx.fillRect(45, 465, 250, 48);
  ctx.strokeStyle = "#d97706";
  ctx.lineWidth = 2;
  ctx.strokeRect(45, 465, 250, 48);

  ctx.fillStyle = "#0f172a";
  ctx.font = "800 20px 'Plus Jakarta Sans', Arial, sans-serif";
  ctx.fillText("Rp 2.000.000,-", 75, 496);

  ctx.font = "bold 12px 'Plus Jakarta Sans', Arial, sans-serif";
  ctx.fillStyle = "#0f172a";
  ctx.fillText("Mengetahui,", 330, 475);
  ctx.fillText("Ketua Panitia Pelaksana", 330, 492);
  ctx.fillText("Surahman Husain, S.Pd.", 330, 565);

  ctx.fillText("Kupang, 28 November 2026", 545, 475);
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
