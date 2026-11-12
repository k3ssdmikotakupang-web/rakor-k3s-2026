// js/catatan.js
import { sb, toast } from './supabase.js';

let catatanCache = [];
let filterKategori = 'ALL';

// Menyuntikkan Tombol Menu "Catatan & Evaluasi Kegiatan" Khusus jika Login = Panitia
export function renderCatatanPanitiaWidget(activeUser) {
  const existingBtn = document.getElementById("btnServiceCatatanPanitia");

  // Jika yang login adalah Peserta, sembunyikan/hapus tombol Catatan Kegiatan
  if (!activeUser || activeUser.role !== 'panitia') {
    if (existingBtn) existingBtn.remove();
    return;
  }

  // Suntikkan ke dalam Grid Layanan di Beranda Panitia
  const firstServiceBtn = document.querySelector(".service-menu-btn");
  const gridContainer = firstServiceBtn ? firstServiceBtn.parentElement : null;
  if (!gridContainer) return;

  if (!existingBtn) {
    const btn = document.createElement("button");
    btn.id = "btnServiceCatatanPanitia";
    btn.type = "button";
    btn.className = "col-span-3 p-3 rounded-2xl bg-gradient-to-r from-amber-50 via-orange-50/70 to-white hover:from-amber-100 border border-amber-300 flex items-center justify-between px-4 active:scale-[0.99] transition shadow-2xs";
    btn.innerHTML = `
      <div class="flex items-center gap-3 text-left">
        <div class="w-10 h-10 rounded-2xl bg-amber-500 text-slate-950 flex items-center justify-center text-base shadow-sm shrink-0">
          <i class="fa-solid fa-clipboard-list"></i>
        </div>
        <div>
          <div class="flex items-center gap-1.5">
            <span class="text-xs font-extrabold text-slate-900">Catatan & Evaluasi Kegiatan</span>
            <span class="text-[9px] font-extrabold uppercase bg-slate-900 text-amber-300 px-1.5 py-0.5 rounded">Khusus Panitia</span>
          </div>
          <div class="text-[10px] font-semibold text-slate-500">Input temuan lapangan + bukti foto/video untuk evaluasi LPJ</div>
        </div>
      </div>
      <i class="fa-solid fa-chevron-right text-amber-700 text-xs shrink-0"></i>
    `;
    btn.addEventListener("click", () => openCatatanPanitiaModal(activeUser));
    gridContainer.appendChild(btn);
  }
}

export async function openCatatanPanitiaModal(activeUser) {
  if (!activeUser || activeUser.role !== 'panitia') {
    return toast("Akses Ditolak: Menu ini khusus untuk internal Panitia!");
  }

  const modal = document.getElementById("serviceModal");
  const titleEl = document.getElementById("serviceModalTitle");
  const bodyEl = document.getElementById("serviceModalBody");
  if (!modal || !titleEl || !bodyEl) return;

  modal.classList.remove("hidden");
  titleEl.innerHTML = `<i class="fa-solid fa-clipboard-list text-amber-600 mr-1.5"></i> Catatan & Evaluasi Panitia`;
  bodyEl.innerHTML = `<div class="py-6 text-center text-xs text-slate-400">Memuat catatan evaluasi kepanitiaan...</div>`;

  const { data } = await sb.from("catatan_panitia").select("*").order("id_catatan", { ascending: false });
  catatanCache = data || [];

  renderCatatanModalBody(activeUser, bodyEl);
}

function renderCatatanModalBody(activeUser, bodyEl) {
  const p = activeUser.profile;
  const isPimpinan = ['Ketua Panitia', 'Sekretaris', 'Penanggung Jawab', 'Seksi Kesekretariatan'].includes(p.divisi);

  const countTotal = catatanCache.length;
  const countKendala = catatanCache.filter(c => c.kategori === 'Kendala Mendesak').length;
  const countSelesai = catatanCache.filter(c => c.status_tindak_lanjut === 'Sudah Ditangani').length;

  const filteredList = filterKategori === 'ALL'
    ? catatanCache
    : catatanCache.filter(c => c.kategori === filterKategori);

  bodyEl.innerHTML = `
    <!-- Ringkasan Statistik Catatan Evaluasi -->
    <div class="grid grid-cols-3 gap-2 text-center bg-slate-900 text-white p-3 rounded-2xl">
      <div class="bg-white/10 rounded-xl p-2">
        <div class="text-sm font-extrabold text-amber-300">${countTotal}</div>
        <div class="text-[9px] text-slate-300">Total Catatan</div>
      </div>
      <div class="bg-white/10 rounded-xl p-2">
        <div class="text-sm font-extrabold text-rose-300">${countKendala}</div>
        <div class="text-[9px] text-slate-300">Kendala Teknis</div>
      </div>
      <div class="bg-white/10 rounded-xl p-2">
        <div class="text-sm font-extrabold text-emerald-300">${countSelesai}</div>
        <div class="text-[9px] text-slate-300">Ditindaklanjuti</div>
      </div>
    </div>

    <!-- Form Input Catatan / Temuan Baru + Upload Bukti Foto/Video -->
    <div class="p-3.5 rounded-2xl bg-amber-50/80 border border-amber-300 space-y-2.5">
      <div class="flex items-center justify-between">
        <span class="font-extrabold text-xs text-amber-950">
          <i class="fa-solid fa-pen-clip text-amber-600 mr-1"></i> Input Catatan / Temuan Baru
        </span>
        <span class="text-[9px] font-bold bg-amber-200 text-amber-900 px-2 py-0.5 rounded">${p.divisi}</span>
      </div>

      <div class="grid grid-cols-2 gap-2">
        <div>
          <label class="block text-[10px] font-bold text-slate-700 mb-1">Kategori Temuan:</label>
          <select id="catInputKategori" class="w-full rounded-xl border bg-white px-2.5 py-2 text-xs font-bold text-slate-800">
            <option value="Evaluasi Sesi">📝 Evaluasi Sesi</option>
            <option value="Kendala Mendesak">⚡ Kendala Mendesak</option>
            <option value="Rekomendasi LPJ">💡 Rekomendasi LPJ</option>
            <option value="Hal Positif">✅ Hal Positif / Apresiasi</option>
          </select>
        </div>
        <div>
          <label class="block text-[10px] font-bold text-slate-700 mb-1">Tahapan Kegiatan:</label>
          <select id="catInputTahapan" class="w-full rounded-xl border bg-white px-2.5 py-2 text-xs font-bold text-slate-800">
            <option value="Pelaksanaan">Pelaksanaan (H1-H3)</option>
            <option value="Persiapan">Persiapan</option>
            <option value="Perencanaan">Perencanaan</option>
            <option value="Pasca-Acara">Pasca-Acara / LPJ</option>
          </select>
        </div>
      </div>

      <div>
        <label class="block text-[10px] font-bold text-slate-700 mb-1">Uraian Catatan / Temuan Evaluasi:</label>
        <textarea id="catInputIsi" rows="3" placeholder="Tuliskan detail temuan, kejadian di lapangan, atau saran perbaikan untuk bahan evaluasi..." class="w-full rounded-xl border bg-white px-3 py-2 text-xs font-semibold"></textarea>
      </div>

      <div class="p-2.5 rounded-xl bg-white border border-amber-200 space-y-1.5">
        <label class="block text-[10px] font-extrabold text-slate-700">
          <i class="fa-solid fa-camera text-rose-600 mr-1"></i> Lampirkan Bukti Foto / Video (Opsional):
        </label>
        <input id="catInputFileBukti" type="file" accept="image/*,video/*" class="w-full text-[11px] font-semibold file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:bg-slate-900 file:text-white file:text-[10px] file:font-bold" />
        <input id="catInputLinkBukti" type="url" placeholder="Atau tempel link foto/video Google Drive..." class="w-full rounded-lg border px-2.5 py-1.5 text-[11px]" />
      </div>

      <button id="btnSubmitCatatan" class="w-full py-3 rounded-xl bg-blue-900 hover:bg-blue-800 text-white font-extrabold text-xs shadow flex items-center justify-center gap-2">
        <i class="fa-solid fa-paper-plane"></i>
        <span>Simpan Catatan & Bukti Evaluasi</span>
      </button>
    </div>

    <!-- Filter & Daftar Catatan Evaluasi Panitia -->
    <div class="space-y-2.5 pt-1">
      <div class="flex items-center justify-between">
        <h4 class="font-extrabold text-xs text-slate-800 uppercase">Daftar Catatan Masuk (${filteredList.length})</h4>
        <select id="catFilterSelect" class="rounded-xl border bg-slate-50 px-2.5 py-1 text-[11px] font-bold text-blue-950">
          <option value="ALL" ${filterKategori === 'ALL' ? 'selected' : ''}>Semua Kategori</option>
          <option value="Kendala Mendesak" ${filterKategori === 'Kendala Mendesak' ? 'selected' : ''}>⚡ Kendala Mendesak</option>
          <option value="Evaluasi Sesi" ${filterKategori === 'Evaluasi Sesi' ? 'selected' : ''}>📝 Evaluasi Sesi</option>
          <option value="Rekomendasi LPJ" ${filterKategori === 'Rekomendasi LPJ' ? 'selected' : ''}>💡 Rekomendasi LPJ</option>
          <option value="Hal Positif" ${filterKategori === 'Hal Positif' ? 'selected' : ''}>✅ Hal Positif</option>
        </select>
      </div>

      <div class="space-y-2.5 max-h-80 overflow-y-auto pr-0.5">
        ${filteredList.length === 0 ? `
          <div class="p-6 rounded-2xl bg-slate-50 border text-center text-xs text-slate-400">
            Belum ada catatan evaluasi pada kategori ini.
          </div>
        ` : filteredList.map(c => {
          const isKendala = c.kategori === 'Kendala Mendesak';
          const isDone = c.status_tindak_lanjut === 'Sudah Ditangani';
          const canModify = isPimpinan || c.id_panitia === p.id_panitia;

          const badgeColor = isKendala
            ? 'bg-rose-100 text-rose-800 border-rose-300'
            : c.kategori === 'Rekomendasi LPJ'
            ? 'bg-purple-100 text-purple-800 border-purple-200'
            : c.kategori === 'Hal Positif'
            ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
            : 'bg-blue-100 text-blue-800 border-blue-200';

          return `
            <div class="p-3.5 rounded-2xl bg-white border ${isKendala && !isDone ? 'border-rose-300 bg-rose-50/20' : 'border-slate-200'} shadow-2xs space-y-2">
              <div class="flex items-start justify-between gap-2">
                <div class="flex items-center gap-1.5 flex-wrap">
                  <span class="text-[9px] font-extrabold px-2 py-0.5 rounded-md border ${badgeColor}">${c.kategori}</span>
                  <span class="text-[9px] font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md">${c.tahapan}</span>
                  <span class="text-[9px] font-extrabold px-2 py-0.5 rounded-md ${isDone ? 'bg-emerald-600 text-white' : 'bg-amber-100 text-amber-900'}">
                    ${isDone ? '✓ Sudah Ditangani' : '⏳ Bahan Evaluasi'}
                  </span>
                </div>
                ${canModify ? `
                  <div class="flex items-center gap-1 shrink-0">
                    <button class="btn-toggle-catatan text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 hover:bg-emerald-100 text-slate-700" data-id="${c.id_catatan}" data-status="${c.status_tindak_lanjut}" title="Ubah Status Tindak Lanjut">
                      <i class="fa-solid fa-check"></i>
                    </button>
                    <button class="btn-del-catatan text-[10px] text-rose-500 hover:text-rose-700 px-1.5" data-id="${c.id_catatan}" title="Hapus Catatan">
                      <i class="fa-solid fa-trash"></i>
                    </button>
                  </div>
                ` : ''}
              </div>

              <p class="text-xs font-semibold text-slate-800 leading-relaxed whitespace-pre-line">${c.isi_catatan}</p>

              <!-- Tampilan Bukti Foto / Video jika ada -->
              ${c.url_bukti ? `
                <div class="pt-1">
                  ${c.tipe_bukti === 'foto' ? `
                    <a href="${c.url_bukti}" target="_blank" rel="noopener noreferrer">
                      <img src="${c.url_bukti}" alt="Bukti Evaluasi" class="w-full max-h-48 object-cover rounded-xl border border-slate-200" />
                    </a>
                  ` : c.tipe_bukti === 'video' ? `
                    <video src="${c.url_bukti}" controls class="w-full max-h-52 rounded-xl border border-slate-200 bg-black"></video>
                  ` : `
                    <a href="${c.url_bukti}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1.5 text-[11px] font-extrabold text-blue-800 bg-blue-50 px-3 py-1.5 rounded-xl border border-blue-200">
                      <i class="fa-solid fa-paperclip"></i> Lihat Bukti Lampiran (Foto/Video) &rarr;
                    </a>
                  `}
                </div>
              ` : ''}

              <div class="pt-1.5 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400 font-semibold">
                <span>Oleh: <b class="text-slate-600">${c.nama_panitia}</b> (${c.divisi})</span>
                <span>${c.waktu_input || ''}</span>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;

  // Filter Kategori
  document.getElementById("catFilterSelect")?.addEventListener("change", (e) => {
    filterKategori = e.target.value;
    renderCatatanModalBody(activeUser, bodyEl);
  });

  // Simpan Catatan Baru beserta Upload Bukti Foto/Video
  document.getElementById("btnSubmitCatatan")?.addEventListener("click", async () => {
    const kategori = document.getElementById("catInputKategori").value;
    const tahapan = document.getElementById("catInputTahapan").value;
    const isi_catatan = document.getElementById("catInputIsi").value.trim();
    const file = document.getElementById("catInputFileBukti")?.files?.[0];
    let url_bukti = document.getElementById("catInputLinkBukti").value.trim();
    let tipe_bukti = url_bukti ? "link" : "";

    if (!isi_catatan) return toast("Tuliskan uraian catatan atau temuan terlebih dahulu!");

    const btn = document.getElementById("btnSubmitCatatan");
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner animate-spin"></i> Menyimpan Catatan & Bukti...`;

    if (file) {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const isVideo = file.type.startsWith("video/") || ['mp4', 'mov', 'webm', 'mkv'].includes(ext);
      tipe_bukti = isVideo ? "video" : "foto";
      const fileName = `bukti_evaluasi_${Date.now()}.${ext}`;

      const { error: upErr } = await sb.storage
        .from("dokumen_rakor")
        .upload(fileName, file, { upsert: true });

      if (upErr) {
        btn.disabled = false;
        btn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> Simpan Catatan & Bukti Evaluasi`;
        return toast("Gagal mengunggah file bukti.");
      }

      const { data: pubData } = sb.storage.from("dokumen_rakor").getPublicUrl(fileName);
      url_bukti = pubData.publicUrl;
    }

    const { error } = await sb.from("catatan_panitia").insert([{
      id_panitia: p.id_panitia,
      nama_panitia: p.nama_panitia,
      divisi: p.divisi,
      tahapan,
      kategori,
      isi_catatan,
      url_bukti,
      tipe_bukti,
      status_tindak_lanjut: "Bahan Evaluasi",
      waktu_input: new Date().toLocaleString("id-ID")
    }]);

    if (error) {
      btn.disabled = false;
      btn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> Simpan Catatan & Bukti Evaluasi`;
      return toast("Pastikan SQL Langkah 1 (tabel catatan_panitia) sudah di-Run di Supabase!");
    }

    toast("Catatan & bukti evaluasi berhasil disimpan!");
    openCatatanPanitiaModal(activeUser);
  });

  // Toggle Status Tindak Lanjut
  document.querySelectorAll(".btn-toggle-catatan").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = Number(btn.dataset.id);
      const cur = btn.dataset.status;
      const next = cur === "Sudah Ditangani" ? "Bahan Evaluasi" : "Sudah Ditangani";
      await sb.from("catatan_panitia").update({ status_tindak_lanjut: next }).eq("id_catatan", id);
      toast(`Status catatan: ${next}`);
      openCatatanPanitiaModal(activeUser);
    });
  });

  // Hapus Catatan
  document.querySelectorAll(".btn-del-catatan").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("Hapus catatan evaluasi ini?")) return;
      await sb.from("catatan_panitia").delete().eq("id_catatan", Number(btn.dataset.id));
      toast("Catatan dihapus.");
      openCatatanPanitiaModal(activeUser);
    });
  });
}
