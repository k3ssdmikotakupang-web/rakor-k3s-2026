// js/profil.js
import { sb, toast } from './supabase.js';

let headerScrollBound = false;
let cachedSekolahList = [];
let selectedRekapRayon = "ALL";
let selectedRekapKelengkapan = "ALL";

const SUBRAYON_LIST = ["Maulafa", "Alak", "Kota Raja", "Oebobo", "Kelapa Lima", "Kota Lama"];

// Cek Wewenang Download Spreadsheet Rekap Profil: HANYA Sekretaris & Seksi Kesekretariatan
export function canDownloadRekapProfil(activeUser) {
  return Boolean(
    activeUser &&
    activeUser.role === "panitia" &&
    activeUser.profile &&
    ["Sekretaris", "Seksi Kesekretariatan"].includes(activeUser.profile.divisi)
  );
}

function getWitaGreeting() {
  const hour = new Date().getHours();
  if (hour >= 4 && hour < 11) return { text: "Selamat Pagi", icon: "fa-sun text-amber-300" };
  if (hour >= 11 && hour < 15) return { text: "Selamat Siang", icon: "fa-cloud-sun text-amber-300" };
  if (hour >= 15 && hour < 19) return { text: "Selamat Sore", icon: "fa-cloud-sun text-orange-300" };
  return { text: "Selamat Malam", icon: "fa-moon text-indigo-200" };
}

export function bindUserProfileTrigger(activeUser, reloadCallback) {
  const avatarEl = document.getElementById("topUserAvatar");
  const nameEl = document.getElementById("topUserName");
  if (!avatarEl || !activeUser) return;

  // Render widget Rekap Profil Kepsek (Hanya tampil jika yang login adalah Panitia)
  renderRekapProfilKepsekWidget(activeUser, reloadCallback);

  const headerEl = avatarEl.closest("header");
  const p = activeUser.profile || {};
  const fotoUrl = p.foto_profil || "";
  const isPeserta = activeUser.role === "peserta";

  if (headerEl) {
    headerEl.className = "bg-gradient-to-br from-slate-950 via-blue-950 to-indigo-950 text-white px-4 pt-4 pb-5 sticky top-0 z-30 rounded-b-3xl shadow-xl border-b border-white/10 transition-all duration-200 flex items-center justify-between";
  }

  if (nameEl && nameEl.parentElement) {
    const infoWrap = nameEl.parentElement;
    infoWrap.className = "min-w-0 cursor-pointer select-none";
    infoWrap.onclick = () => openUserProfileModal(activeUser, reloadCallback);

    let greetEl = document.getElementById("topAndroidGreeting");
    if (!greetEl) {
      greetEl = document.createElement("div");
      greetEl.id = "topAndroidGreeting";
      infoWrap.insertBefore(greetEl, infoWrap.firstChild);
    }
    const greet = getWitaGreeting();
    const subName = isPeserta && p.nama_kepsek ? ` • ${p.nama_kepsek.split(',')[0]}` : "";
    greetEl.className = "text-[10px] font-semibold text-blue-200/90 flex items-center gap-1 mb-0.5 truncate";
    greetEl.innerHTML = `<i class="fa-solid ${greet.icon} text-[10px]"></i> <span>${greet.text}${subName}</span>`;

    nameEl.className = "font-extrabold text-xs text-white truncate mt-0.5 tracking-tight";

    const srBadge = document.getElementById("topUserSubrayonBadge");
    if (srBadge && srBadge.parentElement) {
      let roomMiniBadge = document.getElementById("topUserRoomMiniBadge");
      if (!roomMiniBadge) {
        roomMiniBadge = document.createElement("span");
        roomMiniBadge.id = "topUserRoomMiniBadge";
        srBadge.parentElement.appendChild(roomMiniBadge);
      }
      if (isPeserta && p.nomor_kamar && p.nomor_kamar !== "Belum Ditentukan") {
        roomMiniBadge.className = "text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-md bg-amber-400/20 text-amber-300 border border-amber-400/30";
        roomMiniBadge.innerHTML = `<i class="fa-solid fa-bed mr-0.5"></i>${p.nomor_kamar}`;
      } else {
        roomMiniBadge.className = "hidden";
      }
    }
  }

  avatarEl.className = "w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-400 to-yellow-300 text-slate-950 font-extrabold flex items-center justify-center text-sm shrink-0 shadow-lg border-2 border-amber-300/80 cursor-pointer hover:scale-105 active:scale-95 transition relative";
  avatarEl.title = "Ketuk untuk Edit Profil & Password";

  const fallbackLogo = window.__RESOLVED_K3S_LOGO || "./logo-k3s.png";
  avatarEl.innerHTML = `
    <div class="w-full h-full rounded-[14px] overflow-hidden flex items-center justify-center ${fotoUrl ? 'bg-slate-900' : 'bg-white p-0.5'}">
      ${fotoUrl
        ? `<img src="${fotoUrl}" alt="Profil" class="w-full h-full object-cover" />`
        : `<img src="${fallbackLogo}" alt="K3S" class="k3s-brand-logo w-full h-full object-contain" />`
      }
    </div>
    <span class="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-400 border-2 border-slate-950 flex items-center justify-center" title="Online"></span>
  `;
  avatarEl.onclick = () => openUserProfileModal(activeUser, reloadCallback);

  const refreshBtn = document.getElementById("btnRefreshApp");
  const logoutBtn = document.getElementById("btnLogout");
  if (refreshBtn && refreshBtn.parentElement) {
    const actionWrap = refreshBtn.parentElement;
    actionWrap.className = "flex items-center gap-1.5 shrink-0";

    refreshBtn.className = "w-9 h-9 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/10 flex items-center justify-center text-xs text-slate-200 active:scale-95 transition";
    if (logoutBtn) {
      logoutBtn.className = "w-9 h-9 rounded-2xl bg-rose-500/20 hover:bg-rose-500/35 border border-rose-400/25 flex items-center justify-center text-xs text-rose-300 active:scale-95 transition";
    }

    let bellBtn = document.getElementById("btnHeaderNotifBell");
    if (!bellBtn) {
      bellBtn = document.createElement("button");
      bellBtn.id = "btnHeaderNotifBell";
      bellBtn.type = "button";
      bellBtn.title = "Pusat Info & Notifikasi";
      actionWrap.insertBefore(bellBtn, refreshBtn);
    }
    bellBtn.className = "w-9 h-9 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/10 flex items-center justify-center text-xs text-amber-300 relative active:scale-95 transition";
    bellBtn.innerHTML = `
      <i class="fa-solid fa-bell"></i>
      <span class="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500 animate-ping"></span>
      <span class="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500"></span>
    `;
    bellBtn.onclick = () => openNotificationQuickModal(activeUser, reloadCallback);
  }

  if (!headerScrollBound && headerEl) {
    headerScrollBound = true;
    window.addEventListener("scroll", () => {
      const greetEl = document.getElementById("topAndroidGreeting");
      if (window.scrollY > 30) {
        headerEl.classList.remove("pt-4", "pb-5");
        headerEl.classList.add("py-2.5", "shadow-2xl");
        if (greetEl) greetEl.classList.add("hidden");
      } else {
        headerEl.classList.add("pt-4", "pb-5");
        headerEl.classList.remove("py-2.5", "shadow-2xl");
        if (greetEl) greetEl.classList.remove("hidden");
      }
    }, { passive: true });
  }
}

// =========================================================================
// FITUR BARU: REKAPAN DATA PROFIL KEPSEK PER SUB RAYON (KHUSUS PANITIA)
// & DOWNLOAD SPREADSHEET (KHUSUS SEKRETARIS & SEKSI KESEKRETARIATAN)
// =========================================================================
function isKepsekProfileComplete(s) {
  return Boolean(
    s &&
    s.nama_kepsek && String(s.nama_kepsek).trim() !== "" &&
    s.nip_kepsek && String(s.nip_kepsek).trim() !== "" &&
    s.no_hp && String(s.no_hp).trim() !== ""
  );
}

async function renderRekapProfilKepsekWidget(activeUser, reloadCallback) {
  const existingHomeBtn = document.getElementById("btnServiceRekapProfilKepsek");
  const existingRayonBar = document.getElementById("srRekapProfilKepsekBar");

  // Sembunyikan sepenuhnya jika yang login BUKAN Panitia (Peserta tidak bisa melihat)
  if (!activeUser || activeUser.role !== "panitia") {
    if (existingHomeBtn) existingHomeBtn.remove();
    if (existingRayonBar) existingRayonBar.remove();
    return;
  }

  try {
    const { data } = await sb.from("db_sekolah").select("*").order("nama_sekolah", { ascending: true });
    if (data) cachedSekolahList = data;
  } catch (e) {}

  const totalSek = cachedSekolahList.length || 160;
  const totalLengkap = cachedSekolahList.filter(isKepsekProfileComplete).length;
  const totalAdaNama = cachedSekolahList.filter(s => s.nama_kepsek && String(s.nama_kepsek).trim() !== "").length;
  const canDownload = canDownloadRekapProfil(activeUser);

  // 1. Tombol di Grid Menu Layanan Beranda (Khusus Panitia)
  const firstServiceBtn = document.querySelector(".service-menu-btn");
  const gridContainer = firstServiceBtn ? firstServiceBtn.parentElement : null;
  if (gridContainer) {
    let btn = document.getElementById("btnServiceRekapProfilKepsek");
    if (!btn) {
      btn = document.createElement("button");
      btn.id = "btnServiceRekapProfilKepsek";
      btn.type = "button";
      btn.className = "col-span-3 p-3.5 rounded-2xl bg-gradient-to-r from-indigo-950 via-blue-900 to-slate-900 text-white border border-indigo-400/40 flex items-center justify-between px-4 active:scale-[0.99] transition shadow-md";
      gridContainer.appendChild(btn);
    }

    btn.innerHTML = `
      <div class="flex items-center gap-3 text-left">
        <div class="w-11 h-11 rounded-2xl bg-amber-400 text-slate-950 flex items-center justify-center text-lg font-extrabold shadow shrink-0">
          <i class="fa-solid fa-address-book"></i>
        </div>
        <div>
          <div class="flex items-center gap-1.5 flex-wrap">
            <span class="text-xs font-extrabold text-white">Rekap Profil Kepsek Per Sub Rayon</span>
            <span class="text-[9px] font-extrabold uppercase bg-indigo-400/20 text-amber-300 border border-amber-400/30 px-1.5 py-0.5 rounded">
              ${canDownload ? 'Unduh Spreadsheet' : 'Khusus Panitia'}
            </span>
          </div>
          <div class="text-[10px] text-indigo-200 mt-0.5">
            Terisi Nama: <b>${totalAdaNama}/${totalSek}</b> • Profil Lengkap (Nama, NIP, WA): <b>${totalLengkap}/${totalSek}</b>
          </div>
        </div>
      </div>
      <i class="fa-solid fa-chevron-right text-amber-300 text-xs shrink-0"></i>
    `;
    btn.onclick = () => openRekapProfilKepsekModal(activeUser, reloadCallback);
  }

  // 2. Pintasan di atas Tab Sub Rayon (Khusus Panitia)
  const cardsContainer = document.getElementById("srSchoolCardsContainer");
  if (cardsContainer && cardsContainer.parentElement) {
    let rBar = document.getElementById("srRekapProfilKepsekBar");
    if (!rBar) {
      rBar = document.createElement("div");
      rBar.id = "srRekapProfilKepsekBar";
      cardsContainer.parentElement.insertBefore(rBar, cardsContainer);
    }

    rBar.className = "p-3 rounded-2xl bg-indigo-50 border border-indigo-200 flex items-center justify-between gap-2 shadow-2xs";
    rBar.innerHTML = `
      <div class="flex items-center gap-2.5 min-w-0">
        <div class="w-9 h-9 rounded-xl bg-indigo-900 text-amber-300 flex items-center justify-center text-sm shrink-0">
          <i class="fa-solid fa-user-check"></i>
        </div>
        <div class="min-w-0">
          <div class="text-xs font-extrabold text-indigo-950 truncate">Rekap Data Profil Kepala Sekolah</div>
          <div class="text-[10px] text-indigo-700 truncate">Nama, NIP, WhatsApp & Foto (${totalLengkap}/${totalSek} Lengkap)</div>
        </div>
      </div>
      <div class="flex items-center gap-1.5 shrink-0">
        ${canDownload ? `
          <button type="button" id="btnQuickExportProfilSheet" class="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[10px] shadow-2xs">
            <i class="fa-solid fa-file-excel mr-0.5"></i>Spreadsheet
          </button>
        ` : ''}
        <button type="button" id="btnOpenRekapProfilFromRayon" class="px-3 py-1.5 rounded-xl bg-indigo-900 text-white font-extrabold text-[10px] shadow-2xs">
          Lihat Rekap
        </button>
      </div>
    `;

    document.getElementById("btnOpenRekapProfilFromRayon")?.addEventListener("click", () => {
      const currentSr = document.getElementById("srSelectFilter")?.value;
      if (currentSr) selectedRekapRayon = currentSr;
      openRekapProfilKepsekModal(activeUser, reloadCallback);
    });

    document.getElementById("btnQuickExportProfilSheet")?.addEventListener("click", () => {
      exportRekapProfilToSpreadsheet(activeUser, cachedSekolahList, "ALL");
    });
  }
}

export async function openRekapProfilKepsekModal(activeUser, reloadCallback) {
  if (!activeUser || activeUser.role !== "panitia") {
    return toast("Akses Ditolak: Rekap Profil Kepala Sekolah hanya dapat dilihat oleh Panitia!");
  }

  const modal = document.getElementById("serviceModal");
  const titleEl = document.getElementById("serviceModalTitle");
  const bodyEl = document.getElementById("serviceModalBody");
  if (!modal || !titleEl || !bodyEl) return;

  modal.classList.remove("hidden");
  titleEl.innerHTML = `<i class="fa-solid fa-address-book text-indigo-700 mr-1.5"></i> Rekap Data Profil Kepsek Per Sub Rayon`;

  const { data } = await sb.from("db_sekolah").select("*").order("nama_sekolah", { ascending: true });
  if (data) cachedSekolahList = data;

  if (activeUser.profile?.tugas_subrayon && selectedRekapRayon === "ALL") {
    selectedRekapRayon = activeUser.profile.tugas_subrayon;
  }

  renderRekapProfilModalBody(activeUser, bodyEl, reloadCallback);
}

function renderRekapProfilModalBody(activeUser, bodyEl, reloadCallback) {
  const sekolahList = cachedSekolahList;
  const totalSek = sekolahList.length || 160;
  const totalLengkap = sekolahList.filter(isKepsekProfileComplete).length;
  const totalAdaNama = sekolahList.filter(s => s.nama_kepsek && String(s.nama_kepsek).trim() !== "").length;
  const totalBelum = totalSek - totalLengkap;
  const pctLengkap = totalSek > 0 ? Math.round((totalLengkap / totalSek) * 100) : 0;

  const canDownload = canDownloadRekapProfil(activeUser);

  bodyEl.innerHTML = `
    <!-- 1. KARTU RINGKASAN KELENGKAPAN PROFIL KEPSEK SE-KOTA KUPANG -->
    <div class="p-4 rounded-3xl bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white space-y-3 shadow-lg border border-indigo-400/30">
      <div class="flex items-center justify-between">
        <span class="text-[9px] font-extrabold uppercase tracking-wider bg-amber-400 text-slate-950 px-2.5 py-0.5 rounded-full">
          Monitoring Biodata Kepsek (${totalSek} Sekolah)
        </span>
        <span class="text-[10px] font-extrabold text-emerald-300">${pctLengkap}% Lengkap</span>
      </div>

      <div class="grid grid-cols-3 gap-2 text-center">
        <div class="bg-white/10 border border-white/15 rounded-2xl p-2">
          <div class="text-sm font-extrabold text-amber-300">${totalAdaNama}</div>
          <div class="text-[9px] text-indigo-200">Sudah Isi Nama</div>
        </div>
        <div class="bg-emerald-500/20 border border-emerald-400/30 rounded-2xl p-2">
          <div class="text-sm font-extrabold text-emerald-300">${totalLengkap}</div>
          <div class="text-[9px] text-emerald-100">Profil Lengkap</div>
        </div>
        <div class="bg-rose-500/20 border border-rose-400/30 rounded-2xl p-2">
          <div class="text-sm font-extrabold text-rose-300">${totalBelum}</div>
          <div class="text-[9px] text-rose-100">Belum Lengkap</div>
        </div>
      </div>

      <!-- Tombol Download Spreadsheet (HANYA Muncul untuk Sekretaris & Seksi Kesekretariatan) -->
      ${canDownload ? `
        <div class="pt-1 border-t border-white/10 space-y-1.5">
          <div class="text-[9px] font-bold text-amber-300 uppercase">
            <i class="fa-solid fa-file-excel mr-1"></i> Otoritas Sekretaris & Kesekretariatan:
          </div>
          <div class="grid grid-cols-2 gap-2">
            <button type="button" id="btnExportAllProfilSheet" class="py-2.5 px-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-[11px] shadow flex items-center justify-center gap-1.5 transition">
              <i class="fa-solid fa-download"></i>
              <span>Unduh Semua (${totalSek})</span>
            </button>
            <button type="button" id="btnExportRayonProfilSheet" class="py-2.5 px-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold text-[11px] shadow flex items-center justify-center gap-1.5 transition">
              <i class="fa-solid fa-filter"></i>
              <span>Unduh Filter Aktif</span>
            </button>
          </div>
        </div>
      ` : `
        <div class="pt-1 border-t border-white/10 text-[10px] text-center text-indigo-200">
          <i class="fa-solid fa-lock text-amber-300 mr-1"></i> Pengunduhan file Spreadsheet dikhususkan bagi <b>Sekretaris & Seksi Kesekretariatan</b>.
        </div>
      `}
    </div>

    <!-- 2. REKAPITULASI KELENGKAPAN PER SUB RAYON (6 WILAYAH) -->
    <div class="space-y-2">
      <div class="flex items-center justify-between">
        <h4 class="font-extrabold text-xs text-slate-900 uppercase">
          <i class="fa-solid fa-map-location-dot text-indigo-700 mr-1"></i> Rekap Profil Per Sub Rayon
        </h4>
        <span class="text-[10px] text-slate-400 font-semibold">Ketuk rayon untuk memfilter</span>
      </div>

      <div class="grid grid-cols-2 gap-2">
        ${SUBRAYON_LIST.map(sr => {
          const srList = sekolahList.filter(s => s.subrayon === sr);
          const srLengkap = srList.filter(isKepsekProfileComplete).length;
          const srNama = srList.filter(s => s.nama_kepsek && String(s.nama_kepsek).trim() !== "").length;
          const srFoto = srList.filter(s => s.foto_profil && String(s.foto_profil).trim() !== "").length;
          const srPct = srList.length > 0 ? Math.round((srLengkap / srList.length) * 100) : 0;
          const isSelected = selectedRekapRayon === sr;

          return `
            <div data-sr="${sr}" class="sr-profil-card p-2.5 rounded-2xl border cursor-pointer transition ${
              isSelected ? 'bg-indigo-50/80 border-indigo-600 ring-2 ring-indigo-500/20' : 'bg-slate-50 border-slate-200 hover:bg-white'
            }">
              <div class="flex items-center justify-between">
                <span class="font-extrabold text-xs text-slate-900">${sr}</span>
                <span class="text-[10px] font-extrabold ${srPct === 100 ? 'text-emerald-700' : 'text-indigo-700'}">${srLengkap}/${srList.length}</span>
              </div>
              <div class="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden my-1.5">
                <div class="bg-indigo-600 h-full rounded-full" style="width:${srPct}%"></div>
              </div>
              <div class="flex items-center justify-between text-[9px] font-bold text-slate-500">
                <span>Nama: ${srNama}</span>
                <span>Foto: ${srFoto}</span>
                <span class="text-emerald-700">${srPct}%</span>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>

    <!-- 3. FILTER & DAFTAR DETAIL PROFIL KEPALA SEKOLAH -->
    <div class="pt-2 border-t border-slate-200 space-y-2">
      <div class="grid grid-cols-2 gap-2">
        <select id="rekapProfFilterRayon" class="rounded-xl border border-slate-300 bg-slate-50 px-2.5 py-2 text-xs font-extrabold text-indigo-950">
          <option value="ALL" ${selectedRekapRayon === 'ALL' ? 'selected' : ''}>Semua Sub Rayon (${totalSek})</option>
          ${SUBRAYON_LIST.map(sr => `<option value="${sr}" ${selectedRekapRayon === sr ? 'selected' : ''}>Sub Rayon ${sr}</option>`).join('')}
        </select>

        <select id="rekapProfFilterStatus" class="rounded-xl border border-slate-300 bg-slate-50 px-2.5 py-2 text-xs font-bold text-slate-800">
          <option value="ALL" ${selectedRekapKelengkapan === 'ALL' ? 'selected' : ''}>Semua Status Profil</option>
          <option value="LENGKAP" ${selectedRekapKelengkapan === 'LENGKAP' ? 'selected' : ''}>✓ Profil Lengkap</option>
          <option value="BELUM" ${selectedRekapKelengkapan === 'BELUM' ? 'selected' : ''}>⏳ Belum Lengkap</option>
        </select>
      </div>

      <input id="rekapProfSearchInput" type="text" placeholder="Cari nama Kepsek, NIP, No WA, atau sekolah..." class="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-semibold" />

      <div id="rekapProfSchoolListContainer" class="space-y-2 max-h-72 overflow-y-auto pr-0.5"></div>
    </div>
  `;

  document.querySelectorAll(".sr-profil-card").forEach(card => {
    card.addEventListener("click", () => {
      const clickedSr = card.dataset.sr;
      selectedRekapRayon = selectedRekapRayon === clickedSr ? "ALL" : clickedSr;
      renderRekapProfilModalBody(activeUser, bodyEl, reloadCallback);
    });
  });

  document.getElementById("rekapProfFilterRayon")?.addEventListener("change", (e) => {
    selectedRekapRayon = e.target.value;
    renderRekapProfilModalBody(activeUser, bodyEl, reloadCallback);
  });

  document.getElementById("rekapProfFilterStatus")?.addEventListener("change", (e) => {
    selectedRekapKelengkapan = e.target.value;
    renderRekapProfilRows(sekolahList);
  });

  document.getElementById("rekapProfSearchInput")?.addEventListener("input", () => {
    renderRekapProfilRows(sekolahList);
  });

  document.getElementById("btnExportAllProfilSheet")?.addEventListener("click", () => {
    exportRekapProfilToSpreadsheet(activeUser, sekolahList, "ALL");
  });

  document.getElementById("btnExportRayonProfilSheet")?.addEventListener("click", () => {
    exportRekapProfilToSpreadsheet(activeUser, sekolahList, selectedRekapRayon);
  });

  renderRekapProfilRows(sekolahList);
}

function renderRekapProfilRows(sekolahList) {
  const box = document.getElementById("rekapProfSchoolListContainer");
  if (!box) return;

  const kw = (document.getElementById("rekapProfSearchInput")?.value || "").toLowerCase().trim();

  let list = sekolahList;
  if (selectedRekapRayon !== "ALL") {
    list = list.filter(s => s.subrayon === selectedRekapRayon);
  }
  if (selectedRekapKelengkapan === "LENGKAP") {
    list = list.filter(isKepsekProfileComplete);
  } else if (selectedRekapKelengkapan === "BELUM") {
    list = list.filter(s => !isKepsekProfileComplete(s));
  }
  if (kw) {
    list = list.filter(s =>
      (s.nama_sekolah || "").toLowerCase().includes(kw) ||
      (s.nama_kepsek || "").toLowerCase().includes(kw) ||
      String(s.nip_kepsek || "").toLowerCase().includes(kw) ||
      String(s.no_hp || "").toLowerCase().includes(kw) ||
      String(s.npsn || "").includes(kw)
    );
  }

  if (list.length === 0) {
    box.innerHTML = `<div class="p-4 text-center text-xs text-slate-400 bg-slate-50 rounded-xl border">Tidak ada data pada filter ini.</div>`;
    return;
  }

  box.innerHTML = list.slice(0, 200).map((s, idx) => {
    const lengkap = isKepsekProfileComplete(s);
    const foto = s.foto_profil || "";
    const waClean = String(s.no_hp || "").replace(/\D/g, "").replace(/^0/, "62");

    return `
      <div class="p-3 rounded-2xl bg-white border ${lengkap ? 'border-emerald-300' : 'border-slate-200'} flex items-start gap-3 shadow-2xs">
        <div class="w-11 h-11 rounded-2xl overflow-hidden bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0 font-extrabold text-xs text-slate-600">
          ${foto
            ? `<img src="${foto}" alt="Foto" class="w-full h-full object-cover" />`
            : `<span>#${idx + 1}</span>`
          }
        </div>
        <div class="min-w-0 flex-1">
          <div class="flex items-center justify-between gap-1">
            <span class="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded ${lengkap ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">
              ${lengkap ? '✓ Profil Lengkap' : 'Belum Lengkap'}
            </span>
            <span class="text-[9px] font-bold text-slate-400">Rayon ${s.subrayon}</span>
          </div>
          <h4 class="font-extrabold text-xs text-slate-900 truncate mt-1">${s.nama_sekolah}</h4>
          <p class="text-[11px] font-extrabold text-indigo-900 mt-0.5">
            <i class="fa-solid fa-user-tie mr-1 text-indigo-600"></i>${s.nama_kepsek || '<span class="text-rose-600 font-semibold">Nama Kepsek Belum Diisi</span>'}
          </p>
          <div class="flex items-center justify-between text-[10px] text-slate-600 mt-1 flex-wrap gap-1">
            <span><b>NIP:</b> ${s.nip_kepsek || '-'}</span>
            ${s.no_hp ? `
              <a href="https://wa.me/${waClean}" target="_blank" rel="noopener noreferrer" class="font-extrabold text-emerald-700 hover:underline flex items-center gap-1">
                <i class="fa-brands fa-whatsapp"></i> ${s.no_hp}
              </a>
            ` : `<span class="text-slate-400">WA: -</span>`}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// Fungsi Export & Download Spreadsheet (.CSV kompatibel penuh Microsoft Excel)
// KHUSUS Sekretaris & Seksi Kesekretariatan
export function exportRekapProfilToSpreadsheet(activeUser, sekolahList, targetSubrayon = "ALL") {
  if (!canDownloadRekapProfil(activeUser)) {
    return toast("Akses Ditolak: Hanya Sekretaris & Seksi Kesekretariatan yang dapat mengunduh Spreadsheet Rekap Profil!");
  }

  let dataToExport = sekolahList || [];
  if (targetSubrayon !== "ALL") {
    dataToExport = dataToExport.filter(s => s.subrayon === targetSubrayon);
  }

  // Urutkan berdasarkan Sub Rayon lalu Nama Sekolah agar rapi saat dibuka di Excel
  const sorted = [...dataToExport].sort((a, b) => {
    const srDiff = SUBRAYON_LIST.indexOf(a.subrayon) - SUBRAYON_LIST.indexOf(b.subrayon);
    if (srDiff !== 0) return srDiff;
    return String(a.nama_sekolah || "").localeCompare(String(b.nama_sekolah || ""));
  });

  const headers = [
    "No",
    "Sub Rayon / Kecamatan",
    "NPSN",
    "Nama Satuan Pendidikan (SD/MI)",
    "Status Sekolah",
    "Kelurahan",
    "Nama Lengkap & Gelar Kepala Sekolah",
    "NIP Kepala Sekolah",
    "No. WhatsApp / HP Aktif",
    "Status Kelengkapan Profil",
    "Foto Profil Diunggah",
    "Status Keikutsertaan Rakor",
    "Nomor Kamar Hotel",
    "Status Kontribusi (Rp 2 Jt)"
  ];

  const escapeCell = (val) => {
    const str = String(val ?? "").replace(/"/g, '""');
    return `"${str}"`;
  };

  const rows = sorted.map((s, idx) => {
    const lengkap = isKepsekProfileComplete(s) ? "Lengkap" : "Belum Lengkap";
    const adaFoto = (s.foto_profil && String(s.foto_profil).trim() !== "") ? "Sudah Upload" : "Belum";
    // Tambahkan tanda petik tunggal di depan NIP & No HP agar Excel tidak mengubahnya menjadi rumus eksponen
    const nipFormatted = s.nip_kepsek ? `'${s.nip_kepsek}` : "-";
    const hpFormatted = s.no_hp ? `'${s.no_hp}` : "-";

    return [
      idx + 1,
      s.subrayon || "",
      s.npsn || "",
      s.nama_sekolah || "",
      s.status_sekolah || "",
      s.kelurahan || "",
      s.nama_kepsek || "Belum Diisi",
      nipFormatted,
      hpFormatted,
      lengkap,
      adaFoto,
      s.status_ikut || "Belum Konfirmasi",
      s.nomor_kamar || "Belum Ditentukan",
      s.status_bayar || "Belum Bayar"
    ].map(escapeCell).join(",");
  });

  const csvBody = [headers.map(escapeCell).join(","), ...rows].join("\r\n");
  const bomBytes = new Uint8Array([0xEF, 0xBB, 0xBF]);
  const blob = new Blob([bomBytes, csvBody], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const labelWilayah = targetSubrayon === "ALL" ? "Semua_SubRayon" : `SubRayon_${targetSubrayon.replace(/\s+/g, '_')}`;
  const link = document.createElement("a");
  link.href = url;
  link.download = `Rekap_Profil_Kepsek_${labelWilayah}_Rakor2026.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  toast(`File Spreadsheet Rekap Profil (${sorted.length} Kepsek) berhasil diunduh!`);
}

// =========================================================================
// MODAL PUSAT NOTIFIKASI DI HEADER
// =========================================================================
async function openNotificationQuickModal(activeUser, reloadCallback) {
  const modal = document.getElementById("serviceModal");
  const titleEl = document.getElementById("serviceModalTitle");
  const bodyEl = document.getElementById("serviceModalBody");
  if (!modal || !titleEl || !bodyEl) return;

  modal.classList.remove("hidden");
  titleEl.innerHTML = `<i class="fa-solid fa-bell text-amber-500 mr-1.5"></i> Pusat Notifikasi SIM-RAKOR`;

  const isPeserta = activeUser.role === "peserta";
  const p = activeUser.profile || {};

  const { data: liveSched } = await sb.from("jadwal_rakor").select("*").eq("status_aktif", true).maybeSingle();

  bodyEl.innerHTML = `
    <div class="space-y-2.5">
      ${liveSched ? `
        <div class="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-300 flex items-start gap-3">
          <div class="w-9 h-9 rounded-xl bg-red-600 text-white flex items-center justify-center shrink-0 animate-pulse">
            <i class="fa-solid fa-tower-broadcast"></i>
          </div>
          <div>
            <span class="text-[9px] font-extrabold uppercase bg-red-100 text-red-700 px-2 py-0.5 rounded">Sedang Berlangsung</span>
            <h4 class="font-extrabold text-xs text-slate-900 mt-1">${liveSched.judul_sesi}</h4>
            <p class="text-[11px] text-slate-600">Hari Ke-${liveSched.hari} (${liveSched.waktu}) • ${liveSched.pemateri_pic || 'Panitia'}</p>
          </div>
        </div>
      ` : ''}

      <div class="p-3.5 rounded-2xl bg-blue-50 border border-blue-200 flex items-start gap-3">
        <div class="w-9 h-9 rounded-xl bg-blue-900 text-amber-300 flex items-center justify-center shrink-0">
          <i class="fa-solid fa-calendar-day"></i>
        </div>
        <div>
          <span class="text-[9px] font-extrabold uppercase bg-blue-200 text-blue-900 px-2 py-0.5 rounded">Jadwal Resmi</span>
          <h4 class="font-extrabold text-xs text-slate-900 mt-1">Pelaksanaan Rakor: 26–28 November 2026</h4>
          <p class="text-[11px] text-slate-600">Pastikan kartu QR Code Anda siap untuk pemindaian registrasi, pengambilan Rakor Kit, dan presensi harian.</p>
        </div>
      </div>

      ${isPeserta ? `
        <div class="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 flex items-start gap-3">
          <div class="w-9 h-9 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center shrink-0">
            <i class="fa-solid fa-id-card"></i>
          </div>
          <div>
            <span class="text-[9px] font-extrabold uppercase bg-amber-200 text-amber-900 px-2 py-0.5 rounded">Status Sekolah Anda</span>
            <h4 class="font-extrabold text-xs text-slate-900 mt-1">${p.nama_sekolah}</h4>
            <p class="text-[11px] text-slate-700">
              Kamar: <b>${p.nomor_kamar || 'Belum Ditentukan'}</b> • Kontribusi: <b>${p.status_bayar || 'Belum Bayar'}</b>
            </p>
          </div>
        </div>
      ` : ''}

      <button id="btnGoProfileFromNotif" class="w-full py-3 rounded-2xl bg-slate-900 text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow">
        <i class="fa-solid fa-user-gear text-amber-300"></i>
        <span>Buka Pengaturan Profil & Password</span>
      </button>
    </div>
  `;

  document.getElementById("btnGoProfileFromNotif")?.addEventListener("click", () => {
    openUserProfileModal(activeUser, reloadCallback);
  });
}

// =========================================================================
// MODAL PENGATURAN PROFIL PRIBADI, UPLOAD FOTO PROFIL & UBAH PASSWORD / PIN
// =========================================================================
export function openUserProfileModal(activeUser, reloadCallback) {
  if (!activeUser || !activeUser.profile) return;

  const modal = document.getElementById("serviceModal");
  const titleEl = document.getElementById("serviceModalTitle");
  const bodyEl = document.getElementById("serviceModalBody");
  if (!modal || !titleEl || !bodyEl) return;

  modal.classList.remove("hidden");
  titleEl.innerHTML = `<i class="fa-solid fa-user-gear text-blue-700 mr-1.5"></i> Profil Pengguna & Keamanan Akun`;

  renderProfileModalBody(activeUser, bodyEl, reloadCallback);
}

function renderProfileModalBody(activeUser, bodyEl, reloadCallback) {
  const isPeserta = activeUser.role === "peserta";
  const p = activeUser.profile;
  const fotoUrl = p.foto_profil || "";

  const displayName = isPeserta ? (p.nama_kepsek || "") : (p.nama_panitia || "");
  const unitLabel = isPeserta
    ? `${p.nama_sekolah} (NPSN: ${p.npsn} • Rayon ${p.subrayon})`
    : `${p.divisi} (${p.jabatan})`;

  const hasCustomPass = isPeserta
    ? Boolean(p.password_custom && p.password_custom.trim() !== "")
    : Boolean(p.pin_custom && p.pin_custom.trim() !== "");

  const fallbackLogo = window.__RESOLVED_K3S_LOGO || "./logo-k3s.png";

  bodyEl.innerHTML = `
    <div class="p-4 rounded-3xl bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 text-white text-center space-y-3 relative overflow-hidden shadow-md">
      <div class="relative w-24 h-24 mx-auto">
        ${fotoUrl ? `
          <img src="${fotoUrl}" alt="Foto Profil" class="w-24 h-24 rounded-3xl object-cover border-4 border-amber-400 shadow-lg mx-auto" />
        ` : `
          <div class="w-24 h-24 rounded-3xl bg-white p-2 flex items-center justify-center border-4 border-amber-400 shadow-lg mx-auto">
            <img src="${fallbackLogo}" alt="K3S" class="k3s-brand-logo w-full h-full object-contain" />
          </div>
        `}
        <label class="absolute -bottom-1 -right-1 w-9 h-9 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center justify-center shadow-lg cursor-pointer border-2 border-slate-900 transition" title="Ganti Foto Profil">
          <i class="fa-solid fa-camera text-sm"></i>
          <input id="inputProfilePhotoFile" type="file" accept="image/*" class="hidden" />
        </label>
      </div>

      <div>
        <span class="text-[9px] font-extrabold uppercase tracking-wider bg-amber-400 text-slate-950 px-2.5 py-0.5 rounded-full">
          ${isPeserta ? 'Profil Kepala Sekolah' : 'Profil Panitia Rakor'}
        </span>
        <h4 class="text-sm font-extrabold mt-1.5">${displayName || (isPeserta ? 'Nama Kepsek Belum Diisi' : p.nama_panitia)}</h4>
        <p class="text-[11px] text-blue-200 mt-0.5">${unitLabel}</p>
      </div>

      <div id="uploadPhotoStatusText" class="hidden text-[10px] font-bold text-amber-300">
        <i class="fa-solid fa-spinner animate-spin mr-1"></i> Mengunggah foto profil...
      </div>
    </div>

    <div class="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
      <div class="font-extrabold text-xs text-slate-900 uppercase flex items-center gap-1.5">
        <i class="fa-solid fa-id-card-clip text-blue-800"></i>
        <span>1. Biodata & Kontak Aktif</span>
      </div>

      <div>
        <label class="block text-[10px] font-bold text-slate-700 mb-1">
          ${isPeserta ? 'Nama Lengkap & Gelar Kepala Sekolah (Tercetak di E-Sertifikat):' : 'Nama Lengkap & Gelar Panitia:'}
        </label>
        <input id="profInputNama" type="text" value="${displayName}" placeholder="Contoh: Drs. Yohanes ..., S.Pd." class="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-900" />
      </div>

      ${isPeserta ? `
        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="block text-[10px] font-bold text-slate-700 mb-1">NIP Kepala Sekolah:</label>
            <input id="profInputNip" type="text" inputmode="numeric" value="${p.nip_kepsek || ''}" placeholder="19xxxxxxxxxxxxxx" class="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold" />
          </div>
          <div>
            <label class="block text-[10px] font-bold text-slate-700 mb-1">No. WhatsApp / HP:</label>
            <input id="profInputHp" type="tel" inputmode="tel" value="${p.no_hp || ''}" placeholder="08xxxxxxxxxx" class="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold" />
          </div>
        </div>
      ` : `
        <div>
          <label class="block text-[10px] font-bold text-slate-700 mb-1">No. WhatsApp / HP Aktif:</label>
          <input id="profInputHp" type="tel" inputmode="tel" value="${p.no_hp || ''}" placeholder="08xxxxxxxxxx" class="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold" />
        </div>
      `}

      <button id="btnSaveBiodataProfile" class="w-full py-2.5 rounded-xl bg-blue-900 hover:bg-blue-800 text-white font-extrabold text-xs shadow flex items-center justify-center gap-2">
        <i class="fa-solid fa-floppy-disk"></i>
        <span>Simpan Perubahan Biodata</span>
      </button>
    </div>

    <div class="p-4 rounded-2xl bg-amber-50/70 border border-amber-200 space-y-3">
      <div class="flex items-center justify-between">
        <div class="font-extrabold text-xs text-amber-950 uppercase flex items-center gap-1.5">
          <i class="fa-solid fa-key text-amber-600"></i>
          <span>2. Ubah ${isPeserta ? 'Password Login' : 'PIN Akses Panitia'}</span>
        </div>
        <span class="text-[9px] font-extrabold px-2 py-0.5 rounded ${hasCustomPass ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'}">
          ${hasCustomPass ? 'Password Kustom Aktif' : (isPeserta ? 'Default: NPSN' : 'Default: 2026')}
        </span>
      </div>

      <div class="grid grid-cols-2 gap-2">
        <div>
          <label class="block text-[10px] font-bold text-slate-700 mb-1">${isPeserta ? 'Password Baru:' : 'PIN Baru:'}</label>
          <input id="profInputNewPass" type="password" placeholder="Minimal 4 karakter" class="w-full rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs font-extrabold text-slate-900" />
        </div>
        <div>
          <label class="block text-[10px] font-bold text-slate-700 mb-1">Ulangi ${isPeserta ? 'Password:' : 'PIN:'}</label>
          <input id="profInputConfirmPass" type="password" placeholder="Ketik ulang" class="w-full rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs font-extrabold text-slate-900" />
        </div>
      </div>

      <div class="flex gap-2">
        <button id="btnUpdatePasswordNow" class="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold text-xs shadow">
          <i class="fa-solid fa-lock mr-1"></i> Simpan ${isPeserta ? 'Password Baru' : 'PIN Baru'}
        </button>
        ${hasCustomPass ? `
          <button id="btnResetDefaultPass" class="px-3 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-600 hover:text-rose-600 font-bold text-[11px]">
            Reset Default
          </button>
        ` : ''}
      </div>
    </div>
  `;

  document.getElementById("inputProfilePhotoFile")?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const statusEl = document.getElementById("uploadPhotoStatusText");
    statusEl?.classList.remove("hidden");

    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const ownerId = isPeserta ? p.id_sekolah : p.id_panitia;
    const fileName = `avatar_${ownerId}_${Date.now()}.${ext}`;

    const { error: upErr } = await sb.storage
      .from("dokumen_rakor")
      .upload(fileName, file, { upsert: true });

    if (upErr) {
      statusEl?.classList.add("hidden");
      return toast("Gagal mengunggah foto profil.");
    }

    const { data: pubData } = sb.storage.from("dokumen_rakor").getPublicUrl(fileName);
    const publicPhotoUrl = pubData?.publicUrl || "";

    const tableName = isPeserta ? "db_sekolah" : "panitia_rakor";
    const idCol = isPeserta ? "id_sekolah" : "id_panitia";

    const { error: dbErr } = await sb
      .from(tableName)
      .update({ foto_profil: publicPhotoUrl })
      .eq(idCol, ownerId);

    statusEl?.classList.add("hidden");
    if (dbErr) {
      return toast("Pastikan kolom foto_profil sudah ditambahkan di SQL Supabase!");
    }

    p.foto_profil = publicPhotoUrl;
    bindUserProfileTrigger(activeUser, reloadCallback);
    if (reloadCallback) await reloadCallback();
    toast("Foto profil berhasil diperbarui!");
    renderProfileModalBody(activeUser, bodyEl, reloadCallback);
  });

  document.getElementById("btnSaveBiodataProfile")?.addEventListener("click", async () => {
    const namaBaru = document.getElementById("profInputNama")?.value.trim() || "";
    const hpBaru = document.getElementById("profInputHp")?.value.trim() || "";

    if (isPeserta) {
      const nipBaru = document.getElementById("profInputNip")?.value.trim() || "";
      const { error } = await sb.from("db_sekolah").update({
        nama_kepsek: namaBaru,
        nip_kepsek: nipBaru,
        no_hp: hpBaru
      }).eq("id_sekolah", p.id_sekolah);

      if (error) return toast("Pastikan SQL kolom profil sudah dijalankan di Supabase!");
      p.nama_kepsek = namaBaru;
      p.nip_kepsek = nipBaru;
      p.no_hp = hpBaru;
    } else {
      if (!namaBaru) return toast("Nama panitia tidak boleh kosong!");
      const { error } = await sb.from("panitia_rakor").update({
        nama_panitia: namaBaru,
        no_hp: hpBaru
      }).eq("id_panitia", p.id_panitia);

      if (error) return toast("Pastikan SQL kolom profil sudah dijalankan di Supabase!");
      p.nama_panitia = namaBaru;
      p.no_hp = hpBaru;
      const topName = document.getElementById("topUserName");
      if (topName) topName.textContent = namaBaru;
    }

    bindUserProfileTrigger(activeUser, reloadCallback);
    if (reloadCallback) await reloadCallback();
    toast("Biodata profil berhasil disimpan!");
    renderProfileModalBody(activeUser, bodyEl, reloadCallback);
  });

  document.getElementById("btnUpdatePasswordNow")?.addEventListener("click", async () => {
    const pass1 = document.getElementById("profInputNewPass")?.value.trim() || "";
    const pass2 = document.getElementById("profInputConfirmPass")?.value.trim() || "";

    if (!pass1) return toast("Masukkan password/PIN baru terlebih dahulu!");
    if (pass1.length < 4) return toast("Password/PIN minimal 4 karakter!");
    if (pass1 !== pass2) return toast("Konfirmasi password/PIN tidak cocok!");

    if (isPeserta) {
      const { error } = await sb.from("db_sekolah")
        .update({ password_custom: pass1 })
        .eq("id_sekolah", p.id_sekolah);
      if (error) return toast("Pastikan SQL kolom password_custom sudah dijalankan di Supabase!");
      p.password_custom = pass1;
      toast("Password baru berhasil diaktifkan!");
    } else {
      const { error } = await sb.from("panitia_rakor")
        .update({ pin_custom: pass1 })
        .eq("id_panitia", p.id_panitia);
      if (error) return toast("Pastikan SQL kolom pin_custom sudah dijalankan di Supabase!");
      p.pin_custom = pass1;
      toast("PIN pribadi berhasil diaktifkan!");
    }

    if (reloadCallback) await reloadCallback();
    renderProfileModalBody(activeUser, bodyEl, reloadCallback);
  });

  document.getElementById("btnResetDefaultPass")?.addEventListener("click", async () => {
    if (!confirm("Kembalikan password/PIN ke pengaturan awal (NPSN / 2026)?")) return;
    if (isPeserta) {
      await sb.from("db_sekolah").update({ password_custom: "" }).eq("id_sekolah", p.id_sekolah);
      p.password_custom = "";
    } else {
      await sb.from("panitia_rakor").update({ pin_custom: "" }).eq("id_panitia", p.id_panitia);
      p.pin_custom = "";
    }
    if (reloadCallback) await reloadCallback();
    toast("Password/PIN dikembalikan ke default!");
    renderProfileModalBody(activeUser, bodyEl, reloadCallback);
  });
}
