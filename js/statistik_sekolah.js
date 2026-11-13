// js/statistik_sekolah.js
import { sb, toast } from './supabase.js';

let activeStatTab = 'infografis';
let editingSchoolId = null;

const SUBRAYON_LIST = ["Maulafa", "Alak", "Kota Raja", "Oebobo", "Kelapa Lima", "Kota Lama"];

export function canManageSchoolDatabase(activeUser) {
  return Boolean(
    activeUser &&
    activeUser.role === 'panitia' &&
    activeUser.profile &&
    ['Sekretaris', 'Seksi Kesekretariatan'].includes(activeUser.profile.divisi)
  );
}

function detectJenjang(namaSekolah = '') {
  const upper = String(namaSekolah).toUpperCase().trim();
  if (upper.startsWith('MI ') || upper.startsWith('MIN ') || upper.startsWith('MIS ') || upper.includes('MADRASAH IBTIDAIYAH')) {
    return 'MI';
  }
  return 'SD';
}

export function renderStatistikSekolahWidget(activeUser, sekolahList, reloadCallback) {
  injectHomeStatButton(activeUser, sekolahList, reloadCallback);
  injectSubrayonStatButton(activeUser, sekolahList, reloadCallback);
}

function injectHomeStatButton(activeUser, sekolahList, reloadCallback) {
  const firstServiceBtn = document.querySelector(".service-menu-btn");
  const gridContainer = firstServiceBtn ? firstServiceBtn.parentElement : null;
  if (!gridContainer) return;

  const isAdminDb = canManageSchoolDatabase(activeUser);
  let btn = document.getElementById("btnServiceStatistikSekolah");

  if (!btn) {
    btn = document.createElement("button");
    btn.id = "btnServiceStatistikSekolah";
    btn.type = "button";
    btn.className = "col-span-3 p-3.5 rounded-2xl bg-gradient-to-r from-blue-950 via-indigo-950 to-slate-900 text-white border border-blue-400/30 flex items-center justify-between px-4 active:scale-[0.99] transition shadow-md";
    gridContainer.appendChild(btn);
  }

  const totalSek = sekolahList.length || 160;
  const totalNegeri = sekolahList.filter(s => String(s.status_sekolah).toLowerCase() === 'negeri').length;
  const totalSwasta = totalSek - totalNegeri;

  btn.innerHTML = `
    <div class="flex items-center gap-3 text-left">
      <div class="w-11 h-11 rounded-2xl bg-sky-400 text-slate-950 flex items-center justify-center text-lg font-extrabold shadow shrink-0">
        <i class="fa-solid fa-chart-column"></i>
      </div>
      <div>
        <div class="flex items-center gap-1.5 flex-wrap">
          <span class="text-xs font-extrabold text-white">Infografis & Profil ${totalSek} Sekolah</span>
          ${isAdminDb ? '<span class="text-[9px] font-extrabold uppercase bg-amber-400 text-slate-950 px-1.5 py-0.5 rounded">Edit & Unduh DB</span>' : ''}
        </div>
        <div class="text-[10px] text-sky-200 mt-0.5">
          Sub Rayon, Jenjang SD/MI, Status (${totalNegeri} Negeri - ${totalSwasta} Swasta), Kecamatan & Kelurahan
        </div>
      </div>
    </div>
    <i class="fa-solid fa-chevron-right text-sky-300 text-xs shrink-0"></i>
  `;

  btn.onclick = () => openStatistikSekolahModal(activeUser, sekolahList, reloadCallback);
}

function injectSubrayonStatButton(activeUser, sekolahList, reloadCallback) {
  const cardsContainer = document.getElementById("srSchoolCardsContainer");
  if (!cardsContainer || !cardsContainer.parentElement) return;

  const isAdminDb = canManageSchoolDatabase(activeUser);
  let bar = document.getElementById("srStatistikBannerBar");
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "srStatistikBannerBar";
    cardsContainer.parentElement.insertBefore(bar, cardsContainer);
  }

  bar.className = "p-3 rounded-2xl bg-white border border-blue-200 shadow-2xs flex items-center justify-between gap-2";
  bar.innerHTML = `
    <div class="flex items-center gap-2.5 min-w-0">
      <div class="w-9 h-9 rounded-xl bg-blue-100 text-blue-800 flex items-center justify-center text-sm shrink-0">
        <i class="fa-solid fa-chart-pie"></i>
      </div>
      <div class="min-w-0">
        <div class="text-xs font-extrabold text-slate-900 truncate">Infografis & Database Sekolah</div>
        <div class="text-[10px] text-slate-500 truncate">Sebaran Jenjang, Status, Kelurahan & Kecamatan</div>
      </div>
    </div>
    <div class="flex items-center gap-1.5 shrink-0">
      ${isAdminDb ? '<button id="btnQuickExportCsv" class="px-2.5 py-1.5 rounded-xl bg-emerald-600 text-white font-extrabold text-[10px] shadow-2xs"><i class="fa-solid fa-file-csv mr-0.5"></i>Unduh</button>' : ''}
      <button id="btnOpenStatFromRayon" class="px-3 py-1.5 rounded-xl bg-blue-900 text-white font-extrabold text-[10px] shadow-2xs">
        Buka Grafik
      </button>
    </div>
  `;

  document.getElementById("btnOpenStatFromRayon")?.addEventListener("click", () => {
    openStatistikSekolahModal(activeUser, sekolahList, reloadCallback);
  });

  document.getElementById("btnQuickExportCsv")?.addEventListener("click", () => {
    exportDatabaseToCsv(activeUser, sekolahList);
  });
}

export function openStatistikSekolahModal(activeUser, sekolahList, reloadCallback) {
  const modal = document.getElementById("serviceModal");
  const titleEl = document.getElementById("serviceModalTitle");
  const bodyEl = document.getElementById("serviceModalBody");
  if (!modal || !titleEl || !bodyEl) return;

  modal.classList.remove("hidden");
  titleEl.innerHTML = `<i class="fa-solid fa-chart-column text-blue-700 mr-1.5"></i> Infografis & Database Sekolah`;

  renderStatistikModalContent(activeUser, sekolahList, bodyEl, reloadCallback);
}

function renderStatistikModalContent(activeUser, sekolahList, bodyEl, reloadCallback) {
  const isAdminDb = canManageSchoolDatabase(activeUser);

  bodyEl.innerHTML = `
    <div class="grid grid-cols-2 gap-1.5 bg-slate-100 p-1 rounded-2xl">
      <button id="tabBtnStatGrafik" class="py-2 rounded-xl text-xs font-extrabold ${activeStatTab === 'infografis' ? 'bg-blue-900 text-white shadow' : 'text-slate-600'}">
        <i class="fa-solid fa-chart-pie mr-1"></i> Infografis Sekolah
      </button>
      <button id="tabBtnStatDb" class="py-2 rounded-xl text-xs font-extrabold ${activeStatTab === 'database' ? 'bg-blue-900 text-white shadow' : 'text-slate-600'}">
        <i class="fa-solid fa-database mr-1"></i> ${isAdminDb ? 'Edit & Unduh DB' : 'Tabel Direktori'}
      </button>
    </div>
    <div id="statSubViewContainer" class="space-y-3.5 pt-1"></div>
  `;

  document.getElementById("tabBtnStatGrafik")?.addEventListener("click", () => {
    activeStatTab = 'infografis';
    renderStatistikModalContent(activeUser, sekolahList, bodyEl, reloadCallback);
  });

  document.getElementById("tabBtnStatDb")?.addEventListener("click", () => {
    activeStatTab = 'database';
    renderStatistikModalContent(activeUser, sekolahList, bodyEl, reloadCallback);
  });

  const subContainer = document.getElementById("statSubViewContainer");
  if (activeStatTab === 'infografis') {
    renderInfografisView(sekolahList, subContainer);
  } else {
    renderDatabaseManagerView(activeUser, isAdminDb, sekolahList, subContainer, bodyEl, reloadCallback);
  }
}

function renderInfografisView(sekolahList, container) {
  const total = sekolahList.length || 1;

  const countSD = sekolahList.filter(s => detectJenjang(s.nama_sekolah) === 'SD').length;
  const countMI = total - countSD;
  const pctSD = Math.round((countSD / total) * 100);
  const pctMI = 100 - pctSD;

  const countNegeri = sekolahList.filter(s => String(s.status_sekolah || '').toLowerCase() === 'negeri').length;
  const countSwasta = total - countNegeri;
  const pctNegeri = Math.round((countNegeri / total) * 100);
  const pctSwasta = 100 - pctNegeri;

  const subrayonStats = SUBRAYON_LIST.map(sr => {
    const items = sekolahList.filter(s => s.subrayon === sr);
    const neg = items.filter(s => String(s.status_sekolah || '').toLowerCase() === 'negeri').length;
    const swa = items.length - neg;
    const ikut = items.filter(s => s.status_ikut === 'Ikut').length;
    return { sr, count: items.length, neg, swa, ikut, pct: Math.round((items.length / total) * 100) };
  });

  const kelurahanMap = {};
  sekolahList.forEach(s => {
    const kel = (s.kelurahan || 'Lainnya').trim();
    if (!kelurahanMap[kel]) kelurahanMap[kel] = { kel, total: 0, kecamatan: s.subrayon || '-' };
    kelurahanMap[kel].total += 1;
  });
  const kelurahanList = Object.values(kelurahanMap).sort((a, b) => b.total - a.total);

  container.innerHTML = `
    <div class="grid grid-cols-2 gap-2.5">
      <div class="p-3.5 rounded-2xl bg-gradient-to-br from-blue-900 to-indigo-950 text-white space-y-2 shadow">
        <div class="text-[10px] font-extrabold uppercase tracking-wider text-amber-300">
          <i class="fa-solid fa-graduation-cap mr-1"></i>Berdasarkan Jenjang
        </div>
        <div class="flex items-end justify-between">
          <div>
            <div class="text-xl font-extrabold">${countSD} <span class="text-xs font-normal text-blue-200">SD</span></div>
            <div class="text-[10px] text-emerald-300 font-bold">${countMI} Madrasah (MI)</div>
          </div>
          <span class="text-xs font-extrabold bg-white/15 px-2 py-0.5 rounded-lg">${pctSD}% : ${pctMI}%</span>
        </div>
        <div class="w-full bg-white/15 h-2 rounded-full overflow-hidden flex">
          <div class="bg-amber-400 h-full" style="width:${pctSD}%"></div>
          <div class="bg-emerald-400 h-full" style="width:${pctMI}%"></div>
        </div>
      </div>

      <div class="p-3.5 rounded-2xl bg-gradient-to-br from-slate-900 to-teal-950 text-white space-y-2 shadow">
        <div class="text-[10px] font-extrabold uppercase tracking-wider text-emerald-300">
          <i class="fa-solid fa-building-flag mr-1"></i>Status Sekolah
        </div>
        <div class="flex items-end justify-between">
          <div>
            <div class="text-xl font-extrabold">${countNegeri} <span class="text-xs font-normal text-teal-200">Negeri</span></div>
            <div class="text-[10px] text-amber-300 font-bold">${countSwasta} Swasta</div>
          </div>
          <span class="text-xs font-extrabold bg-white/15 px-2 py-0.5 rounded-lg">${pctNegeri}% : ${pctSwasta}%</span>
        </div>
        <div class="w-full bg-white/15 h-2 rounded-full overflow-hidden flex">
          <div class="bg-emerald-400 h-full" style="width:${pctNegeri}%"></div>
          <div class="bg-amber-400 h-full" style="width:${pctSwasta}%"></div>
        </div>
      </div>
    </div>

    <div class="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
      <div class="flex items-center justify-between">
        <div>
          <h4 class="font-extrabold text-xs text-slate-900 uppercase">
            <i class="fa-solid fa-map-location-dot text-blue-800 mr-1"></i> Infografis Sub Rayon & Kecamatan
          </h4>
          <p class="text-[10px] text-slate-500">Proporsi jumlah sekolah, rincian Negeri/Swasta & peserta terdaftar</p>
        </div>
        <span class="text-[10px] font-extrabold bg-blue-100 text-blue-900 px-2 py-0.5 rounded-md">6 Wilayah</span>
      </div>

      <div class="space-y-2.5">
        ${subrayonStats.map(st => {
          const negW = st.count > 0 ? Math.round((st.neg / st.count) * 100) : 0;
          const swaW = st.count > 0 ? Math.round((st.swa / st.count) * 100) : 0;
          return `
            <div class="p-2.5 rounded-xl bg-white border border-slate-200 space-y-1.5">
              <div class="flex items-center justify-between text-xs font-extrabold">
                <span class="text-slate-900">Kec. / Sub Rayon ${st.sr}</span>
                <span class="text-blue-900">${st.count} Sekolah (${st.pct}%)</span>
              </div>
              <div class="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden flex">
                <div class="bg-blue-700 h-full" style="width:${negW}%"></div>
                <div class="bg-amber-400 h-full" style="width:${swaW}%"></div>
              </div>
              <div class="flex items-center justify-between text-[10px] font-semibold text-slate-500">
                <span><b class="text-blue-800">Negeri: ${st.neg}</b> | <b class="text-amber-600">Swasta: ${st.swa}</b></span>
                <span class="text-emerald-700 font-bold">Ikut Rakor: ${st.ikut}/${st.count}</span>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>

    <div class="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2.5">
      <div class="flex items-center justify-between">
        <div>
          <h4 class="font-extrabold text-xs text-slate-900 uppercase">
            <i class="fa-solid fa-city text-emerald-700 mr-1"></i> Sebaran Sekolah Per Kelurahan
          </h4>
          <p class="text-[10px] text-slate-500">Total tersebar di <b>${kelurahanList.length} Kelurahan</b> se-Kota Kupang</p>
        </div>
        <input id="statSearchKelurahan" type="text" placeholder="Cari kelurahan..." class="w-32 rounded-xl border bg-white px-2.5 py-1 text-[11px] font-semibold" />
      </div>
      <div id="statKelurahanBarsBox" class="space-y-1.5 max-h-60 overflow-y-auto pr-0.5"></div>
    </div>
  `;

  const maxKelCount = kelurahanList.length > 0 ? kelurahanList[0].total : 1;
  const renderKelurahanRows = () => {
    const kw = (document.getElementById("statSearchKelurahan")?.value || "").toLowerCase().trim();
    const box = document.getElementById("statKelurahanBarsBox");
    if (!box) return;

    const filtered = kelurahanList.filter(
      k => k.kel.toLowerCase().includes(kw) || k.kecamatan.toLowerCase().includes(kw)
    );

    box.innerHTML = filtered.map((k, idx) => {
      const barWidth = Math.max(12, Math.round((k.total / maxKelCount) * 100));
      return `
        <div class="p-2 rounded-xl bg-white border border-slate-200 flex items-center justify-between gap-2 text-[11px]">
          <div class="min-w-0 flex-1">
            <div class="flex items-center justify-between mb-1">
              <span class="font-extrabold text-slate-800 truncate">${idx + 1}. Kel. ${k.kel} <span class="text-[10px] font-normal text-slate-400">(Kec. ${k.kecamatan})</span></span>
              <span class="font-extrabold text-emerald-700 shrink-0">${k.total} SD/MI</span>
            </div>
            <div class="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
              <div class="bg-emerald-500 h-full rounded-full" style="width:${barWidth}%"></div>
            </div>
          </div>
        </div>
      `;
    }).join('');
  };

  renderKelurahanRows();
  document.getElementById("statSearchKelurahan")?.addEventListener("input", renderKelurahanRows);
}

function renderDatabaseManagerView(activeUser, isAdminDb, sekolahList, container, bodyEl, reloadCallback) {
  const editingItem = editingSchoolId
    ? sekolahList.find(s => s.id_sekolah === editingSchoolId)
    : null;

  container.innerHTML = `
    <div class="p-3.5 rounded-2xl ${isAdminDb ? 'bg-emerald-50 border-emerald-300' : 'bg-slate-50 border-slate-200'} border flex items-center justify-between gap-2">
      <div>
        <div class="text-[10px] font-bold uppercase ${isAdminDb ? 'text-emerald-700' : 'text-slate-500'}">
          ${isAdminDb ? 'Mode Editor Database Aktif' : 'Direktori Database Sekolah'}
        </div>
        <div class="text-xs font-extrabold text-slate-900">
          ${isAdminDb ? 'Sekretaris & Seksi Kesekretariatan' : 'Data Master 158 SD/MI Kota Kupang'}
        </div>
      </div>

      ${isAdminDb ? `
        <button id="btnDownloadCsvFull" class="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow flex items-center gap-1.5 shrink-0">
          <i class="fa-solid fa-file-excel"></i>
          <span>Download Excel (.CSV)</span>
        </button>
      ` : ''}
    </div>

    ${isAdminDb ? `
      <div class="p-3.5 rounded-2xl bg-blue-50/80 border border-blue-300 space-y-2.5">
        <div class="flex items-center justify-between">
          <span class="font-extrabold text-xs text-blue-950">
            <i class="fa-solid fa-pen-to-square text-blue-700 mr-1"></i>
            ${editingItem ? 'Edit Data: ' + editingItem.nama_sekolah : '+ Tambah / Edit Data Sekolah Peserta'}
          </span>
          ${editingItem ? '<button id="btnCancelEditSchool" class="text-[10px] font-bold bg-rose-100 text-rose-700 px-2 py-0.5 rounded-md">Batal Edit</button>' : ''}
        </div>

        <div class="grid grid-cols-3 gap-2">
          <div>
            <label class="block text-[10px] font-bold text-slate-700 mb-0.5">NPSN:</label>
            <input id="dbInpNpsn" type="text" value="${editingItem?.npsn || ''}" placeholder="8 Digit NPSN" class="w-full rounded-xl border bg-white px-2.5 py-1.5 text-xs font-bold" />
          </div>
          <div class="col-span-2">
            <label class="block text-[10px] font-bold text-slate-700 mb-0.5">Nama Satuan Pendidikan (SD/MI):</label>
            <input id="dbInpNamaSekolah" type="text" value="${editingItem?.nama_sekolah || ''}" placeholder="Contoh: UPTD SD INPRES..." class="w-full rounded-xl border bg-white px-2.5 py-1.5 text-xs font-bold" />
          </div>
        </div>

        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="block text-[10px] font-bold text-slate-700 mb-0.5">Sub Rayon / Kecamatan:</label>
            <select id="dbInpSubrayon" class="w-full rounded-xl border bg-white px-2.5 py-1.5 text-xs font-bold">
              ${SUBRAYON_LIST.map(sr => `<option value="${sr}" ${editingItem?.subrayon === sr ? 'selected' : ''}>${sr}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="block text-[10px] font-bold text-slate-700 mb-0.5">Status Sekolah:</label>
            <select id="dbInpStatusSekolah" class="w-full rounded-xl border bg-white px-2.5 py-1.5 text-xs font-bold">
              <option value="Negeri" ${editingItem?.status_sekolah === 'Negeri' ? 'selected' : ''}>Negeri</option>
              <option value="Swasta" ${editingItem?.status_sekolah === 'Swasta' ? 'selected' : ''}>Swasta</option>
            </select>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="block text-[10px] font-bold text-slate-700 mb-0.5">Kelurahan:</label>
            <input id="dbInpKelurahan" type="text" value="${editingItem?.kelurahan || ''}" placeholder="Nama Kelurahan" class="w-full rounded-xl border bg-white px-2.5 py-1.5 text-xs font-semibold" />
          </div>
          <div>
            <label class="block text-[10px] font-bold text-slate-700 mb-0.5">Nama Kepala Sekolah:</label>
            <input id="dbInpNamaKepsek" type="text" value="${editingItem?.nama_kepsek || ''}" placeholder="Nama & Gelar Kepsek" class="w-full rounded-xl border bg-white px-2.5 py-1.5 text-xs font-semibold" />
          </div>
        </div>

        <div>
          <label class="block text-[10px] font-bold text-slate-700 mb-0.5">Alamat Lengkap Sekolah:</label>
          <input id="dbInpAlamat" type="text" value="${editingItem?.alamat || ''}" placeholder="Jl. ..." class="w-full rounded-xl border bg-white px-2.5 py-1.5 text-xs font-semibold" />
        </div>

        <button id="btnSaveSchoolDb" class="w-full py-2.5 rounded-xl bg-blue-900 hover:bg-blue-800 text-white font-extrabold text-xs shadow">
          <i class="fa-solid fa-floppy-disk mr-1"></i>
          <span>${editingItem ? 'Simpan Perubahan Data Sekolah' : 'Tambahkan ke Database Sekolah'}</span>
        </button>
      </div>
    ` : ''}

    <div class="grid grid-cols-3 gap-1.5">
      <select id="dbFilterRayon" class="rounded-xl border bg-slate-50 px-2 py-2 text-[11px] font-bold text-blue-950">
        <option value="ALL">Semua Rayon</option>
        ${SUBRAYON_LIST.map(sr => `<option value="${sr}">${sr}</option>`).join('')}
      </select>
      <select id="dbFilterStatus" class="rounded-xl border bg-slate-50 px-2 py-2 text-[11px] font-bold text-slate-800">
        <option value="ALL">Negeri & Swasta</option>
        <option value="Negeri">Negeri</option>
        <option value="Swasta">Swasta</option>
      </select>
      <input id="dbSearchKeyword" type="text" placeholder="Cari sekolah/kelurahan..." class="rounded-xl border bg-slate-50 px-2.5 py-2 text-[11px] font-semibold" />
    </div>

    <div id="dbSchoolTableList" class="space-y-2 max-h-72 overflow-y-auto pr-0.5"></div>
  `;

  document.getElementById("btnDownloadCsvFull")?.addEventListener("click", () => {
    exportDatabaseToCsv(activeUser, sekolahList);
  });

  document.getElementById("btnCancelEditSchool")?.addEventListener("click", () => {
    editingSchoolId = null;
    renderDatabaseManagerView(activeUser, isAdminDb, sekolahList, container, bodyEl, reloadCallback);
  });

  document.getElementById("btnSaveSchoolDb")?.addEventListener("click", async () => {
    if (!isAdminDb) return;
    const npsn = document.getElementById("dbInpNpsn").value.trim();
    const nama_sekolah = document.getElementById("dbInpNamaSekolah").value.trim();
    const subrayon = document.getElementById("dbInpSubrayon").value;
    const status_sekolah = document.getElementById("dbInpStatusSekolah").value;
    const kelurahan = document.getElementById("dbInpKelurahan").value.trim();
    const nama_kepsek = document.getElementById("dbInpNamaKepsek").value.trim();
    const alamat = document.getElementById("dbInpAlamat").value.trim();

    if (!npsn || !nama_sekolah) return toast("NPSN dan Nama Sekolah wajib diisi!");

    if (editingItem) {
      await sb.from("db_sekolah").update({
        npsn,
        nama_sekolah,
        subrayon,
        status_sekolah,
        kelurahan,
        nama_kepsek,
        alamat
      }).eq("id_sekolah", editingItem.id_sekolah);

      Object.assign(editingItem, { npsn, nama_sekolah, subrayon, status_sekolah, kelurahan, nama_kepsek, alamat });
      editingSchoolId = null;
      toast("Data sekolah berhasil diperbarui!");
    } else {
      const newId = "SCH-" + Math.floor(100 + Math.random() * 900);
      const newRow = {
        id_sekolah: newId,
        npsn,
        nama_sekolah,
        subrayon,
        status_sekolah,
        kelurahan,
        nama_kepsek,
        alamat,
        status_ikut: "Belum Konfirmasi"
      };
      await sb.from("db_sekolah").insert([newRow]);
      sekolahList.push(newRow);
      toast("Sekolah baru berhasil ditambahkan!");
    }

    if (reloadCallback) await reloadCallback();
    renderDatabaseManagerView(activeUser, isAdminDb, sekolahList, container, bodyEl, reloadCallback);
  });

  const renderRows = () => {
    const sr = document.getElementById("dbFilterRayon")?.value || "ALL";
    const st = document.getElementById("dbFilterStatus")?.value || "ALL";
    const kw = (document.getElementById("dbSearchKeyword")?.value || "").toLowerCase().trim();
    const listBox = document.getElementById("dbSchoolTableList");
    if (!listBox) return;

    let filtered = sekolahList;
    if (sr !== "ALL") filtered = filtered.filter(s => s.subrayon === sr);
    if (st !== "ALL") filtered = filtered.filter(s => String(s.status_sekolah).toLowerCase() === st.toLowerCase());
    if (kw) {
      filtered = filtered.filter(s =>
        s.nama_sekolah.toLowerCase().includes(kw) ||
        String(s.npsn).includes(kw) ||
        (s.kelurahan || "").toLowerCase().includes(kw) ||
        (s.nama_kepsek || "").toLowerCase().includes(kw)
      );
    }

    listBox.innerHTML = filtered.slice(0, 80).map((s, idx) => {
      const jenjang = detectJenjang(s.nama_sekolah);
      return `
        <div class="p-3 rounded-xl bg-white border border-slate-200 flex items-start justify-between gap-2">
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="text-[9px] font-extrabold text-slate-400">#${idx + 1}</span>
              <span class="text-[9px] font-mono bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">${s.npsn}</span>
              <span class="text-[9px] font-extrabold px-1.5 py-0.5 rounded ${jenjang === 'MI' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'}">${jenjang}</span>
              <span class="text-[9px] font-bold px-1.5 py-0.5 rounded ${String(s.status_sekolah).toLowerCase() === 'negeri' ? 'bg-indigo-50 text-indigo-700' : 'bg-amber-50 text-amber-800'}">${s.status_sekolah}</span>
            </div>
            <h4 class="font-extrabold text-xs text-slate-900 mt-1">${s.nama_sekolah}</h4>
            <p class="text-[10px] text-slate-500">Kel. ${s.kelurahan || '-'} | Kec./Rayon ${s.subrayon} | ${s.alamat || '-'}</p>
            <p class="text-[10px] font-semibold text-blue-900 mt-0.5"><i class="fa-solid fa-user-tie mr-1"></i>Kepsek: ${s.nama_kepsek || 'Belum Diisi'}</p>
          </div>

          ${isAdminDb ? `
            <button class="btn-edit-db-row px-2.5 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-900 font-extrabold text-[10px] shrink-0 flex items-center gap-1" data-id="${s.id_sekolah}">
              <i class="fa-solid fa-pen"></i> Edit
            </button>
          ` : ''}
        </div>
      `;
    }).join('');

    if (isAdminDb) {
      listBox.querySelectorAll(".btn-edit-db-row").forEach(btn => {
        btn.addEventListener("click", () => {
          editingSchoolId = btn.dataset.id;
          renderDatabaseManagerView(activeUser, isAdminDb, sekolahList, container, bodyEl, reloadCallback);
        });
      });
    }
  };

  renderRows();
  document.getElementById("dbFilterRayon")?.addEventListener("change", renderRows);
  document.getElementById("dbFilterStatus")?.addEventListener("change", renderRows);
  document.getElementById("dbSearchKeyword")?.addEventListener("input", renderRows);
}

export function exportDatabaseToCsv(activeUser, sekolahList) {
  if (!canManageSchoolDatabase(activeUser)) {
    return toast("Akses Ditolak: Hanya Sekretaris & Seksi Kesekretariatan yang dapat mengunduh database!");
  }

  const headers = [
    "No", "ID Sekolah", "NPSN", "Nama Sekolah", "Jenjang", "Status Sekolah",
    "Sub Rayon / Kecamatan", "Kelurahan", "Alamat", "Nama Kepala Sekolah",
    "Status Ikut Rakor", "Status Kontribusi (Rp 2 Jt)", "Nomor Kamar",
    "Hadir H1", "Hadir H2", "Hadir H3", "Ambil Rakor Kit", "Terima Transpor",
    "Status Izin", "Alasan Izin"
  ];

  const escapeCsv = (val) => {
    const str = String(val ?? "").replace(/"/g, '""');
    return `"${str}"`;
  };

  const rows = sekolahList.map((s, idx) => [
    idx + 1,
    s.id_sekolah || "",
    s.npsn || "",
    s.nama_sekolah || "",
    detectJenjang(s.nama_sekolah),
    s.status_sekolah || "",
    s.subrayon || "",
    s.kelurahan || "",
    s.alamat || "",
    s.nama_kepsek || "",
    s.status_ikut || "Belum Konfirmasi",
    s.status_bayar || "Belum Bayar",
    s.nomor_kamar || "Belum Ditentukan",
    s.hadir_h1 ? "Hadir" : "Belum",
    s.hadir_h2 ? "Hadir" : "Belum",
    s.hadir_h3 ? "Hadir" : "Belum",
    s.ambil_kit ? "Sudah" : "Belum",
    s.terima_transport ? "Sudah" : "Belum",
    s.status_izin || "",
    s.alasan_izin || ""
  ].map(escapeCsv).join(","));

  const csvBody = [headers.map(escapeCsv).join(","), ...rows].join("\r\n");
  const bomBytes = new Uint8Array([0xEF, 0xBB, 0xBF]);
  const blob = new Blob([bomBytes, csvBody], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = "Database_158_Sekolah_Rakor_K3S_Kupang.csv";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  toast("Database 158 Sekolah (.CSV/Excel) berhasil diunduh!");
}
