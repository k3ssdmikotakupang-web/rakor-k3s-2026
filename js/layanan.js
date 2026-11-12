// js/layanan.js
import { sb, toast } from './supabase.js';

export const DEFAULT_LAYANAN = [
  { kode_menu: "undangan", judul: "Surat Undangan Rakor 2026", deskripsi: "Surat Undangan resmi mengikuti Rapat Koordinasi Kepala SD/MI Kota Kupang 2026.", url_link: "", status_tersedia: "Resmi (PDF)" },
  { kode_menu: "panduan", judul: "Buku Panduan Rakor 2026", deskripsi: "Buku Panduan pelaksanaan, tata tertib, dan pembagian komisi Rakor K3S (Format PDF).", url_link: "", status_tersedia: "Siap Diunduh" },
  { kode_menu: "dokumentasi", judul: "Galeri & Dokumentasi", deskripsi: "Kumpulan foto dan video kegiatan Rakor K3S secara real-time.", url_link: "", status_tersedia: "Live Update" },
  { kode_menu: "sertifikat", judul: "E-Sertifikat Rakor", deskripsi: "Unduh E-Sertifikat resmi bagi Peserta dan Panitia Rakor 2026.", url_link: "", status_tersedia: "Menunggu Rilis" },
  { kode_menu: "laporan", judul: "Laporan Kegiatan (LPJ)", deskripsi: "Dokumen resmi Laporan Pertanggungjawaban (LPJ) & Hasil Rakor K3S SD/MI Kota Kupang 2026.", url_link: "", status_tersedia: "Dokumen PDF" },
  { kode_menu: "materi", judul: "Materi Rakor & Narasumber", deskripsi: "Kumpulan bahan paparan Narasumber, materi sidang komisi, dan dokumen pendukung Rakor.", url_link: "", status_tersedia: "Multi-Format" }
];

export async function openLayananDocumentModal(serviceCode, activeUser, layananList, reloadCallback) {
  const modal = document.getElementById("serviceModal");
  const titleEl = document.getElementById("serviceModalTitle");
  const bodyEl = document.getElementById("serviceModalBody");
  if (!modal || !titleEl || !bodyEl) return;

  modal.classList.remove("hidden");

  // KHUSUS MENU MATERI RAKOR -> DIKELOLA SEKSI KESEKRETARIATAN (MULTI FILE PDF/WORD/PPT & LINK DRIVE)
  if (serviceCode === "materi") {
    await renderMateriRakorModal(activeUser, titleEl, bodyEl, reloadCallback);
    return;
  }

  // MENU DOKUMEN PDF KHUSUS SEKRETARIS: SURAT UNDANGAN, BUKU PANDUAN, DAN LAPORAN / LPJ
  const item = layananList.find(x => x.kode_menu === serviceCode) ||
    DEFAULT_LAYANAN.find(x => x.kode_menu === serviceCode);
  if (!item) return;

  const isSecretaryPdfOnly = ["undangan", "panduan", "laporan"].includes(serviceCode);

  const isSekretaris = Boolean(
    activeUser &&
    activeUser.role === "panitia" &&
    activeUser.profile &&
    activeUser.profile.divisi === "Sekretaris"
  );

  titleEl.innerHTML = `<i class="fa-solid fa-file-pdf text-rose-600 mr-1.5"></i> ${item.judul}`;

  bodyEl.innerHTML = `
    <!-- Info Otoritas Sekretaris -->
    <div class="p-3 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-between">
      <div>
        <div class="text-[10px] font-bold uppercase text-slate-500">Wewenang Publikasi Dokumen</div>
        <div class="text-xs font-extrabold text-slate-900">Sekretaris Panitia K3S Kota Kupang</div>
      </div>
      <span class="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full ${item.url_link ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">
        ${item.url_link ? '✓ PDF Tersedia' : 'Belum Diunggah'}
      </span>
    </div>

    <!-- Kartu Pratinjau & Unduh PDF -->
    <div class="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2.5">
      <p class="text-xs text-slate-700 leading-relaxed">${item.deskripsi || ''}</p>

      ${item.url_link ? `
        <div class="pt-1 space-y-2.5">
          <a href="${item.url_link}" target="_blank" rel="noopener noreferrer" download class="w-full py-3 rounded-xl bg-blue-900 hover:bg-blue-800 text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow">
            <i class="fa-solid fa-file-arrow-down text-amber-300 text-sm"></i>
            <span>Buka / Unduh ${item.judul} (PDF)</span>
          </a>
          <iframe src="${item.url_link}" class="w-full h-64 rounded-xl border border-slate-300 bg-white"></iframe>
        </div>
      ` : `
        <div class="p-4 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900 font-semibold text-center">
          <i class="fa-solid fa-clock mr-1"></i> Dokumen PDF <b>${item.judul}</b> belum diunggah oleh Sekretaris Panitia.
        </div>
      `}
    </div>

    <!-- PANEL UPLOAD PDF KHUSUS SEKRETARIS (UNDANGAN, PANDUAN, LPJ) -->
    ${isSecretaryPdfOnly && isSekretaris ? `
      <div class="p-4 rounded-2xl bg-emerald-50/90 border border-emerald-300 space-y-3">
        <div class="flex items-center justify-between">
          <span class="font-extrabold text-xs text-emerald-950">
            <i class="fa-solid fa-cloud-arrow-up text-emerald-600 mr-1"></i> Upload File PDF (${item.judul})
          </span>
          <span class="text-[9px] font-extrabold uppercase bg-emerald-200 text-emerald-900 px-2 py-0.5 rounded">Khusus Sekretaris</span>
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

    ${isSecretaryPdfOnly && !isSekretaris && activeUser?.role === 'panitia' ? `
      <div class="p-2.5 rounded-xl bg-slate-100 border border-slate-200 text-[10px] text-slate-500 text-center font-semibold">
        <i class="fa-solid fa-lock mr-1"></i> Pengunggahan PDF <b>${item.judul}</b> hanya dapat dilakukan oleh <b>Sekretaris Panitia</b>.
      </div>
    ` : ''}
  `;

  // Handler Upload PDF Khusus Sekretaris
  document.getElementById("btnUploadPdfNow")?.addEventListener("click", async () => {
    if (!isSekretaris) return toast("Akses Ditolak: Hanya Sekretaris Panitia yang berwenang!");

    const fileInput = document.getElementById("inputPdfFile");
    const file = fileInput?.files?.[0];
    const status_tersedia = document.getElementById("editPdfStatus")?.value.trim() || "Siap Diunduh (PDF)";

    if (!file) return toast("Pilih file berformat .PDF terlebih dahulu!");
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
      return toast("Gagal mengunggah PDF.");
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

    toast(`PDF ${item.judul} berhasil diterbitkan!`);
    if (reloadCallback) await reloadCallback();
    const updatedList = await sb.from("info_layanan").select("*");
    openLayananDocumentModal(serviceCode, activeUser, updatedList.data || layananList, reloadCallback);
  });

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
}

// =========================================================================
// MENU MATERI RAKOR (KHUSUS SEKSI KESEKRETARIATAN: LINK DRIVE & FILE LANGSUNG)
// =========================================================================
async function renderMateriRakorModal(activeUser, titleEl, bodyEl, reloadCallback) {
  titleEl.innerHTML = `<i class="fa-solid fa-file-powerpoint text-emerald-600 mr-1.5"></i> Pusat Materi Rakor 2026`;
  bodyEl.innerHTML = `<div class="py-6 text-center text-xs text-slate-400">Memuat daftar materi Rakor...</div>`;

  const isKesekretariatan = Boolean(
    activeUser &&
    activeUser.role === "panitia" &&
    activeUser.profile &&
    activeUser.profile.divisi === "Seksi Kesekretariatan"
  );

  const { data: materiData } = await sb.from("daftar_materi").select("*").order("id_materi", { ascending: false });
  const materiList = materiData || [];

  bodyEl.innerHTML = `
    <!-- Info Wewenang Seksi Kesekretariatan -->
    <div class="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-between">
      <div>
        <div class="text-[10px] font-bold uppercase text-emerald-700">Pengelola Materi Kegiatan</div>
        <div class="text-xs font-extrabold text-emerald-950">Seksi Kesekretariatan K3S Kota Kupang</div>
      </div>
      <span class="text-[10px] font-extrabold bg-emerald-600 text-white px-2.5 py-0.5 rounded-full">
        ${materiList.length} Materi
      </span>
    </div>

    <!-- PANEL UPLOAD MATERI KHUSUS SEKSI KESEKRETARIATAN -->
    ${isKesekretariatan ? `
      <div class="p-4 rounded-2xl bg-blue-50/90 border border-blue-300 space-y-3">
        <div class="flex items-center justify-between border-b border-blue-200 pb-2">
          <span class="font-extrabold text-xs text-blue-950">
            <i class="fa-solid fa-folder-plus text-blue-700 mr-1"></i> Tambah Materi Baru (File / Link Drive)
          </span>
          <span class="text-[9px] font-extrabold uppercase bg-blue-200 text-blue-900 px-2 py-0.5 rounded">Seksi Kesekretariatan</span>
        </div>

        <div>
          <label class="block text-[10px] font-bold text-slate-700 mb-1">Judul Materi / Pokok Bahasan:</label>
          <input id="inputJudulMateri" type="text" placeholder="Contoh: Materi Kebijakan Dinas P&K Kota Kupang..." class="w-full rounded-xl border bg-white px-3 py-2 text-xs font-semibold" />
        </div>

        <div>
          <label class="block text-[10px] font-bold text-slate-700 mb-1">Nama Narasumber / Pemateri:</label>
          <input id="inputPemateri" type="text" placeholder="Contoh: Plt. Kepala Dinas P&K Kota Kupang" class="w-full rounded-xl border bg-white px-3 py-2 text-xs font-semibold" />
        </div>

        <!-- Opsi 1: Upload File Langsung (PDF, Word, PPT, Excel, ZIP) -->
        <div class="p-2.5 rounded-xl bg-white border border-blue-200 space-y-1.5">
          <label class="block text-[10px] font-extrabold text-blue-900">
            <i class="fa-solid fa-file-arrow-up mr-1"></i> Opsi A — Upload File Langsung (PDF, Word, PPT, Excel):
          </label>
          <input id="inputFileMateri" type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.zip" class="w-full text-[11px] font-semibold file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:bg-blue-900 file:text-white file:text-[11px] file:font-bold" />
        </div>

        <!-- Opsi 2: Tempel Link Google Drive -->
        <div class="p-2.5 rounded-xl bg-white border border-blue-200 space-y-1.5">
          <label class="block text-[10px] font-extrabold text-emerald-800">
            <i class="fa-brands fa-google-drive mr-1"></i> Opsi B — Atau Tempel Link Google Drive:
          </label>
          <input id="inputLinkDriveMateri" type="url" placeholder="https://drive.google.com/..." class="w-full rounded-lg border px-2.5 py-1.5 text-xs font-semibold" />
        </div>

        <button id="btnSubmitMateriBaru" class="w-full py-3 rounded-xl bg-blue-900 hover:bg-blue-800 text-white font-extrabold text-xs shadow flex items-center justify-center gap-2">
          <i class="fa-solid fa-cloud-arrow-up"></i>
          <span>Simpan & Terbitkan Materi</span>
        </button>
      </div>
    ` : ''}

    ${!isKesekretariatan && activeUser?.role === 'panitia' ? `
      <div class="p-2.5 rounded-xl bg-slate-100 border border-slate-200 text-[10px] text-slate-500 text-center font-semibold">
        <i class="fa-solid fa-lock mr-1"></i> Pengunggahan Materi Rakor merupakan wewenang khusus <b>Seksi Kesekretariatan</b>.
      </div>
    ` : ''}

    <!-- DAFTAR MATERI YANG BISA DIUNDUH PESERTA & PANITIA -->
    <div class="space-y-2.5 max-h-80 overflow-y-auto pr-0.5">
      ${materiList.length === 0 ? `
        <div class="p-6 rounded-2xl bg-slate-50 border border-slate-200 text-center text-xs text-slate-400">
          Belum ada materi yang diunggah oleh Seksi Kesekretariatan.
        </div>
      ` : materiList.map(m => {
        const iconInfo = getFileIconBadge(m.nama_file, m.tipe_sumber);
        return `
          <div class="p-3.5 rounded-2xl bg-white border border-slate-200 shadow-2xs flex items-center justify-between gap-3">
            <div class="flex items-start gap-3 min-w-0 flex-1">
              <div class="w-10 h-10 rounded-xl ${iconInfo.bg} flex items-center justify-center text-base shrink-0">
                <i class="${iconInfo.icon}"></i>
              </div>
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-1.5 flex-wrap">
                  <span class="text-[9px] font-extrabold uppercase px-2 py-0.5 rounded ${iconInfo.badgeBg}">${iconInfo.label}</span>
                  <span class="text-[10px] text-slate-400">${m.waktu_upload || ''}</span>
                </div>
                <h4 class="font-extrabold text-xs text-slate-900 mt-1 leading-snug">${m.judul_materi}</h4>
                ${m.pemateri ? `<p class="text-[10px] font-semibold text-slate-500 mt-0.5"><i class="fa-solid fa-user-tie mr-1"></i>${m.pemateri}</p>` : ''}
              </div>
            </div>
            <div class="flex items-center gap-1.5 shrink-0">
              <a href="${m.url_materi}" target="_blank" rel="noopener noreferrer" download class="px-3 py-2 rounded-xl bg-blue-900 hover:bg-blue-800 text-white font-extrabold text-[11px] flex items-center gap-1 shadow-2xs">
                <i class="fa-solid fa-download"></i>
                <span>Unduh</span>
              </a>
              ${isKesekretariatan ? `
                <button class="btn-del-materi w-8 h-8 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs flex items-center justify-center" data-id="${m.id_materi}" title="Hapus Materi">
                  <i class="fa-solid fa-trash"></i>
                </button>
              ` : ''}
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;

  // Handler Tambah Materi (Seksi Kesekretariatan)
  document.getElementById("btnSubmitMateriBaru")?.addEventListener("click", async () => {
    if (!isKesekretariatan) return toast("Hanya Seksi Kesekretariatan yang dapat mengunggah materi!");

    const judul_materi = document.getElementById("inputJudulMateri").value.trim();
    const pemateri = document.getElementById("inputPemateri").value.trim();
    const file = document.getElementById("inputFileMateri")?.files?.[0];
    const linkDrive = document.getElementById("inputLinkDriveMateri").value.trim();

    if (!judul_materi) return toast("Masukkan Judul Materi terlebih dahulu!");
    if (!file && !linkDrive) return toast("Pilih file dokumen (PDF/Word/PPT) ATAU tempelkan Link Google Drive!");

    const btn = document.getElementById("btnSubmitMateriBaru");
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner animate-spin"></i> Menyimpan Materi...`;

    let url_materi = linkDrive;
    let tipe_sumber = "link";
    let nama_file = "Google Drive Link";

    if (file) {
      const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const storagePath = `materi_${Date.now()}_${cleanName}`;

      const { error: upErr } = await sb.storage
        .from("dokumen_rakor")
        .upload(storagePath, file, { upsert: true });

      if (upErr) {
        btn.disabled = false;
        btn.innerHTML = `<i class="fa-solid fa-cloud-arrow-up"></i> Simpan & Terbitkan Materi`;
        return toast("Gagal mengunggah file materi ke server.");
      }

      const { data: pubData } = sb.storage.from("dokumen_rakor").getPublicUrl(storagePath);
      url_materi = pubData.publicUrl;
      tipe_sumber = "file";
      nama_file = file.name;
    }

    const { error: insErr } = await sb.from("daftar_materi").insert([{
      judul_materi,
      pemateri,
      tipe_sumber,
      nama_file,
      url_materi,
      waktu_upload: new Date().toLocaleDateString("id-ID")
    }]);

    if (insErr) {
      btn.disabled = false;
      btn.innerHTML = `<i class="fa-solid fa-cloud-arrow-up"></i> Simpan & Terbitkan Materi`;
      return toast("Pastikan SQL Langkah 1 (tabel daftar_materi) sudah di-Run di Supabase!");
    }

    toast("Materi Rakor berhasil diterbitkan!");
    if (reloadCallback) await reloadCallback();
    await renderMateriRakorModal(activeUser, titleEl, bodyEl, reloadCallback);
  });

  // Handler Hapus Materi
  if (isKesekretariatan) {
    document.querySelectorAll(".btn-del-materi").forEach(btn => {
      btn.addEventListener("click", async () => {
        if (!confirm("Hapus materi ini dari daftar?")) return;
        await sb.from("daftar_materi").delete().eq("id_materi", Number(btn.dataset.id));
        toast("Materi dihapus.");
        await renderMateriRakorModal(activeUser, titleEl, bodyEl, reloadCallback);
      });
    });
  }
}

function getFileIconBadge(fileName = "", tipe = "file") {
  if (tipe === "link") {
    return { icon: "fa-brands fa-google-drive", bg: "bg-emerald-100 text-emerald-700", badgeBg: "bg-emerald-100 text-emerald-800", label: "Link Drive" };
  }
  const lower = String(fileName).toLowerCase();
  if (lower.endsWith(".pdf")) {
    return { icon: "fa-solid fa-file-pdf", bg: "bg-rose-100 text-rose-600", badgeBg: "bg-rose-100 text-rose-800", label: "PDF" };
  }
  if (lower.endsWith(".doc") || lower.endsWith(".docx")) {
    return { icon: "fa-solid fa-file-word", bg: "bg-blue-100 text-blue-700", badgeBg: "bg-blue-100 text-blue-800", label: "Word" };
  }
  if (lower.endsWith(".ppt") || lower.endsWith(".pptx")) {
    return { icon: "fa-solid fa-file-powerpoint", bg: "bg-amber-100 text-amber-700", badgeBg: "bg-amber-100 text-amber-900", label: "PowerPoint" };
  }
  if (lower.endsWith(".xls") || lower.endsWith(".xlsx")) {
    return { icon: "fa-solid fa-file-excel", bg: "bg-emerald-100 text-emerald-700", badgeBg: "bg-emerald-100 text-emerald-800", label: "Excel" };
  }
  return { icon: "fa-solid fa-file-lines", bg: "bg-slate-100 text-slate-700", badgeBg: "bg-slate-200 text-slate-800", label: "Dokumen" };
}
