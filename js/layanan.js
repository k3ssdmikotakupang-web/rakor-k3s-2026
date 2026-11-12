// js/layanan.js
import { sb, toast } from './supabase.js';

export const DEFAULT_LAYANAN = [
  { kode_menu: "undangan", judul: "Surat Undangan Rakor 2026", deskripsi: "Surat Undangan resmi mengikuti Rapat Koordinasi Kepala SD/MI Kota Kupang 2026.", url_link: "", status_tersedia: "Resmi (PDF)" },
  { kode_menu: "panduan", judul: "Buku Panduan Rakor 2026", deskripsi: "Buku Panduan pelaksanaan, tata tertib, dan pembagian komisi Rakor K3S (Format PDF).", url_link: "", status_tersedia: "Siap Diunduh" },
  { kode_menu: "dokumentasi", judul: "Galeri & Dokumentasi", deskripsi: "Kumpulan foto dan video kegiatan Rakor K3S secara real-time.", url_link: "", status_tersedia: "Live Update" },
  { kode_menu: "sertifikat", judul: "E-Sertifikat Rakor", deskripsi: "Unduh E-Sertifikat resmi bagi Peserta dan Panitia Rakor 2026.", url_link: "", status_tersedia: "Terbit H+3" },
  { kode_menu: "laporan", judul: "Laporan & Hasil Rakor", deskripsi: "Rumusan hasil rapat koordinasi dan Laporan Pertanggungjawaban (LPJ).", url_link: "", status_tersedia: "Pasca-Acara" },
  { kode_menu: "materi", judul: "Materi Narasumber", deskripsi: "Bahan paparan Plt. Kadis P&K Kota Kupang dan pemateri Rakor.", url_link: "", status_tersedia: "Tersedia" }
];

export function openLayananDocumentModal(serviceCode, activeUser, layananList, reloadCallback) {
  const modal = document.getElementById("serviceModal");
  const titleEl = document.getElementById("serviceModalTitle");
  const bodyEl = document.getElementById("serviceModalBody");
  if (!modal || !titleEl || !bodyEl) return;

  modal.classList.remove("hidden");

  const item = layananList.find(x => x.kode_menu === serviceCode) ||
    DEFAULT_LAYANAN.find(x => x.kode_menu === serviceCode);
  if (!item) return;

  // Cek apakah menu ini adalah Surat Undangan atau Buku Panduan (Khusus Upload PDF Sekretaris)
  const isPdfOnlySecretaryMenu = (serviceCode === "undangan" || serviceCode === "panduan");

  const isSekretaris = Boolean(
    activeUser &&
    activeUser.role === "panitia" &&
    activeUser.profile &&
    activeUser.profile.divisi === "Sekretaris"
  );

  const isGeneralPanitiaEditor = Boolean(
    activeUser &&
    activeUser.role === "panitia" &&
    ["Sekretaris", "Seksi Kesekretariatan", "Ketua Panitia", "Seksi Perlengkapan, Dokumentasi, dan Publikasi"].includes(activeUser.profile?.divisi)
  );

  // Hak edit: Jika menu Undangan/Panduan -> WAJIB Sekretaris. Jika menu lain -> Panitia terkait.
  const canEditThisMenu = isPdfOnlySecretaryMenu ? isSekretaris : isGeneralPanitiaEditor;

  titleEl.innerHTML = isPdfOnlySecretaryMenu
    ? `<i class="fa-solid fa-file-pdf text-rose-600 mr-1.5"></i> ${item.judul}`
    : `<i class="fa-solid fa-folder-open text-blue-700 mr-1.5"></i> ${item.judul}`;

  bodyEl.innerHTML = `
    <!-- Kartu Utama Unduh / Lihat Dokumen -->
    <div class="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2.5">
      <div class="flex items-center justify-between">
        <span class="text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full ${item.url_link ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">
          ${item.url_link ? (item.status_tersedia || 'PDF Tersedia') : 'Menunggu Unggahan'}
        </span>
        ${isPdfOnlySecretaryMenu ? `<span class="text-[10px] font-bold text-rose-600"><i class="fa-solid fa-file-pdf mr-1"></i>Dokumen PDF</span>` : ''}
      </div>

      <p class="text-xs text-slate-700 leading-relaxed">${item.deskripsi || ''}</p>

      ${item.url_link ? `
        <div class="pt-1 space-y-2">
          <a href="${item.url_link}" target="_blank" rel="noopener noreferrer" download class="w-full py-3 rounded-xl bg-blue-900 hover:bg-blue-800 text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow">
            <i class="fa-solid fa-file-arrow-down text-amber-300 text-sm"></i>
            <span>Buka / Unduh ${item.judul} (PDF)</span>
          </a>
          ${isPdfOnlySecretaryMenu ? `
            <iframe src="${item.url_link}" class="w-full h-64 rounded-xl border border-slate-300 bg-white"></iframe>
          ` : ''}
        </div>
      ` : `
        <div class="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900 font-semibold text-center">
          ${isPdfOnlySecretaryMenu
            ? 'File PDF belum diunggah oleh Sekretaris Panitia.'
            : 'Tautan dokumen sedang disiapkan oleh Panitia.'}
        </div>
      `}
    </div>

    <!-- PANEL KHUSUS SEKRETARIS: UPLOAD FILE PDF (UNTUK UNDANGAN & BUKU PANDUAN) -->
    ${isPdfOnlySecretaryMenu && canEditThisMenu ? `
      <div class="p-4 rounded-2xl bg-emerald-50/80 border border-emerald-300 space-y-3">
        <div class="flex items-center justify-between">
          <span class="font-extrabold text-xs text-emerald-950">
            <i class="fa-solid fa-cloud-arrow-up text-emerald-600 mr-1"></i> Upload PDF Khusus Sekretaris
          </span>
          <span class="text-[9px] font-extrabold uppercase bg-emerald-200 text-emerald-900 px-2 py-0.5 rounded">Wewenang Sekretaris</span>
        </div>

        <div>
          <label class="block text-[11px] font-bold text-slate-700 mb-1">Pilih File PDF dari HP / Laptop (.pdf):</label>
          <input id="inputPdfFile" type="file" accept="application/pdf,.pdf" class="w-full rounded-xl border border-emerald-300 bg-white px-3 py-2 text-xs font-semibold file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-blue-900 file:text-white file:text-xs file:font-bold" />
        </div>

        <div>
          <label class="block text-[10px] font-bold text-slate-700 mb-1">Keterangan Status:</label>
          <input id="editPdfStatus" type="text" value="${item.status_tersedia || 'Resmi - Siap Diunduh'}" class="w-full rounded-xl border bg-white px-3 py-2 text-xs font-semibold" />
        </div>

        <button id="btnUploadPdfNow" class="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow flex items-center justify-center gap-2">
          <i class="fa-solid fa-upload"></i>
          <span>Unggah & Terbitkan PDF Sekarang</span>
        </button>

        ${item.url_link ? `
          <button id="btnRemovePdfNow" class="w-full py-2 rounded-xl bg-rose-100 hover:bg-rose-200 text-rose-700 font-bold text-[11px]">
            Hapus File PDF Saat Ini
          </button>
        ` : ''}
      </div>
    ` : ''}

    <!-- Info Jika Panitia Lain Membuka Menu Undangan / Panduan -->
    ${isPdfOnlySecretaryMenu && !canEditThisMenu && activeUser?.role === 'panitia' ? `
      <div class="p-2.5 rounded-xl bg-slate-100 border border-slate-200 text-[10px] text-slate-500 text-center font-semibold">
        <i class="fa-solid fa-lock mr-1"></i> Pengunggahan file PDF <b>${item.judul}</b> merupakan wewenang khusus <b>Sekretaris Panitia</b>.
      </div>
    ` : ''}

    <!-- PANEL EDITOR LINK UNTUK MENU LAINNYA (DOKUMENTASI, SERTIFIKAT, MATERI, LAPORAN) -->
    ${!isPdfOnlySecretaryMenu && canEditThisMenu ? `
      <div class="p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-200 space-y-2.5">
        <div class="font-extrabold text-xs text-emerald-950"><i class="fa-solid fa-pen-to-square mr-1"></i> Panel Editor Panitia</div>
        <div>
          <label class="block text-[10px] font-bold text-slate-700 mb-1">Link Google Drive / URL Dokumen:</label>
          <input id="editServiceUrl" type="url" value="${item.url_link || ''}" placeholder="https://drive.google.com/..." class="w-full rounded-xl border bg-white px-3 py-2 text-xs font-semibold" />
        </div>
        <div>
          <label class="block text-[10px] font-bold text-slate-700 mb-1">Label Status:</label>
          <input id="editServiceStatus" type="text" value="${item.status_tersedia || ''}" class="w-full rounded-xl border bg-white px-3 py-2 text-xs font-semibold" />
        </div>
        <button id="btnSaveServiceInfo" class="w-full py-2.5 rounded-xl bg-emerald-600 text-white font-extrabold text-xs shadow">
          Simpan Tautan Layanan
        </button>
      </div>
    ` : ''}
  `;

  // Handler Upload File PDF Khusus Sekretaris (Surat Undangan & Buku Panduan)
  document.getElementById("btnUploadPdfNow")?.addEventListener("click", async () => {
    if (!isSekretaris) return toast("Akses Ditolak: Hanya Sekretaris yang dapat mengunggah PDF!");

    const fileInput = document.getElementById("inputPdfFile");
    const file = fileInput?.files?.[0];
    const status_tersedia = document.getElementById("editPdfStatus")?.value.trim() || "Siap Diunduh (PDF)";

    if (!file) {
      return toast("Pilih file berformat .PDF terlebih dahulu!");
    }
    if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
      return toast("File wajib berformat PDF (.pdf)!");
    }

    const btn = document.getElementById("btnUploadPdfNow");
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner animate-spin"></i> Mengunggah PDF ke Server...`;

    const safeFileName = `${serviceCode}_rakor2026_${Date.now()}.pdf`;

    const { error: uploadErr } = await sb.storage
      .from("dokumen_rakor")
      .upload(safeFileName, file, { cacheControl: "3600", upsert: true, contentType: "application/pdf" });

    if (uploadErr) {
      btn.disabled = false;
      btn.innerHTML = `<i class="fa-solid fa-upload"></i> Unggah & Terbitkan PDF Sekarang`;
      return toast("Gagal upload! Pastikan SQL Langkah 1 (Storage dokumen_rakor) sudah di-Run di Supabase.");
    }

    const { data: pubUrlData } = sb.storage.from("dokumen_rakor").getPublicUrl(safeFileName);
    const publicPdfUrl = pubUrlData?.publicUrl || "";

    await sb.from("info_layanan").upsert([{
      kode_menu: serviceCode,
      judul: item.judul,
      deskripsi: item.deskripsi,
      url_link: publicPdfUrl,
      status_tersedia
    }]);

    toast(`File PDF ${item.judul} berhasil diterbitkan!`);
    if (reloadCallback) await reloadCallback();
    const updatedList = await sb.from("info_layanan").select("*");
    openLayananDocumentModal(serviceCode, activeUser, updatedList.data || layananList, reloadCallback);
  });

  // Handler Hapus PDF
  document.getElementById("btnRemovePdfNow")?.addEventListener("click", async () => {
    if (!isSekretaris) return;
    if (!confirm(`Hapus file PDF ${item.judul} saat ini?`)) return;

    await sb.from("info_layanan").upsert([{
      kode_menu: serviceCode,
      judul: item.judul,
      deskripsi: item.deskripsi,
      url_link: "",
      status_tersedia: "Belum Diunggah"
    }]);

    toast("File PDF dihapus.");
    if (reloadCallback) await reloadCallback();
    const updatedList = await sb.from("info_layanan").select("*");
    openLayananDocumentModal(serviceCode, activeUser, updatedList.data || layananList, reloadCallback);
  });

  // Handler Simpan Link untuk Menu Lainnya
  document.getElementById("btnSaveServiceInfo")?.addEventListener("click", async () => {
    const url_link = document.getElementById("editServiceUrl").value.trim();
    const status_tersedia = document.getElementById("editServiceStatus").value.trim() || "Tersedia";
    await sb.from("info_layanan").upsert([{
      kode_menu: serviceCode,
      judul: item.judul,
      deskripsi: item.deskripsi,
      url_link,
      status_tersedia
    }]);
    toast("Tautan layanan berhasil diperbarui!");
    if (reloadCallback) await reloadCallback();
    const updatedList = await sb.from("info_layanan").select("*");
    openLayananDocumentModal(serviceCode, activeUser, updatedList.data || layananList, reloadCallback);
  });
}
