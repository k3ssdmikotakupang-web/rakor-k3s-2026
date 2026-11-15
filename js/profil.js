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

let presenceChannel = null;
let onlineUsersMap = {};

function setupOnlinePresenceTracker(activeUser) {
  if (!activeUser) return;

  const userId = activeUser.role === "peserta"
    ? `SEK-${activeUser.profile?.npsn || activeUser.profile?.id_sekolah}`
    : `PAN-${activeUser.profile?.id_panitia}`;

  const userName = activeUser.role === "peserta"
    ? (activeUser.profile?.nama_kepsek || activeUser.profile?.nama_sekolah || "Peserta")
    : (activeUser.profile?.nama_panitia || "Panitia");

  const userUnit = activeUser.role === "peserta"
    ? `${activeUser.profile?.nama_sekolah} (Rayon ${activeUser.profile?.subrayon})`
    : `${activeUser.profile?.divisi || "Panitia"}`;

  injectOnlineBadgeIntoHeroCard();

  if (presenceChannel && presenceChannel.topic === "realtime:k3s-online-users") {
    updateOnlineBadgeCount();
    return;
  }

  try {
    presenceChannel = sb.channel("k3s-online-users", {
      config: { presence: { key: userId } }
    });

    presenceChannel
      .on("presence", { event: "sync" }, () => {
        const state = presenceChannel.presenceState();
        onlineUsersMap = state || {};
        updateOnlineBadgeCount();
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await presenceChannel.track({
            id: userId,
            nama: userName,
            unit: userUnit,
            role: activeUser.role,
            waktu: new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })
          });
        }
      });
  } catch (e) {
    updateOnlineBadgeCount();
  }
}

// Tempatkan lencana Online di dalam Card Hero SIM-RAKOR 2026 (di samping info 26-28 Nov 2026)
function injectOnlineBadgeIntoHeroCard() {
  // Hapus lencana online lama dari header jika masih ada
  document.getElementById("btnHeaderOnlineUsers")?.remove();

  let badgeBtn = document.getElementById("btnHeroOnlineUsers");
  const tabBeranda = document.getElementById("tabContentBeranda");
  if (!tabBeranda) return;

  // Cari elemen tanggal "26–28 Nov" atau kartu pertama (SIM-RAKOR 2026) di Beranda
  if (!badgeBtn) {
    let dateBadgeEl = null;
    const spans = tabBeranda.querySelectorAll("span, div");
    for (const el of spans) {
      if (el.children.length <= 1 && el.textContent && (el.textContent.includes("26–28 Nov") || el.textContent.includes("26-28 Nov"))) {
        dateBadgeEl = el;
        break;
      }
    }

    badgeBtn = document.createElement("button");
    badgeBtn.id = "btnHeroOnlineUsers";
    badgeBtn.type = "button";
    badgeBtn.title = "Ketuk untuk melihat siapa saja yang sedang online";
    badgeBtn.className = "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-[10px] font-extrabold text-emerald-300 active:scale-95 transition cursor-pointer shrink-0";
    badgeBtn.innerHTML = `
      <span class="relative flex h-2 w-2">
        <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
        <span class="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
      </span>
      <span id="headerOnlineCountText">1 Online</span>
    `;
    badgeBtn.onclick = () => openOnlineUsersModal();

    if (dateBadgeEl && dateBadgeEl.parentElement) {
      dateBadgeEl.parentElement.classList.add("flex", "items-center", "gap-1.5", "flex-wrap");
      dateBadgeEl.insertAdjacentElement("afterend", badgeBtn);
    } else {
      const firstHeroCard = tabBeranda.querySelector(".bg-gradient-to-br, .from-blue-950, .from-slate-900");
      if (firstHeroCard) {
        firstHeroCard.insertBefore(badgeBtn, firstHeroCard.firstChild);
      }
    }
  }
}

function updateOnlineBadgeCount() {
  injectOnlineBadgeIntoHeroCard();
  const badgeEl = document.getElementById("headerOnlineCountText");
  const keys = Object.keys(onlineUsersMap || {});
  const count = Math.max(1, keys.length);
  if (badgeEl) {
    badgeEl.textContent = `${count} Online`;
  }
}

function openOnlineUsersModal() {
  const modal = document.getElementById("serviceModal");
  const titleEl = document.getElementById("serviceModalTitle");
  const bodyEl = document.getElementById("serviceModalBody");
  if (!modal || !titleEl || !bodyEl) return;

  modal.classList.remove("hidden");
  titleEl.innerHTML = `<i class="fa-solid fa-signal text-emerald-600 mr-1.5"></i> Pengguna yang Sedang Online`;

  const users = [];
  Object.values(onlineUsersMap || {}).forEach(arr => {
    if (Array.isArray(arr) && arr[0]) users.push(arr[0]);
  });

  bodyEl.innerHTML = `
    <div class="p-3.5 rounded-2xl bg-emerald-950 text-white flex items-center justify-between border border-emerald-500/40">
      <div class="flex items-center gap-2.5">
        <span class="w-3 h-3 rounded-full bg-emerald-400 animate-ping"></span>
        <div>
          <div class="text-xs font-extrabold">Total Aktif Saat Ini: ${Math.max(1, users.length)} Pengguna</div>
          <div class="text-[10px] text-emerald-200">Terhubung secara realtime di aplikasi SIM-RAKOR</div>
        </div>
      </div>
    </div>
    <div class="space-y-2 max-h-80 overflow-y-auto pr-0.5 pt-1">
      ${users.length === 0 ? `
        <div class="p-4 text-center text-xs text-slate-500 bg-slate-50 rounded-xl border">1 Pengguna Aktif (Anda)</div>
      ` : users.map((u, i) => `
        <div class="p-2.5 rounded-xl bg-white border border-slate-200 flex items-center justify-between gap-2">
          <div class="min-w-0">
            <div class="text-xs font-extrabold text-slate-900 truncate">${i + 1}. ${u.nama}</div>
            <div class="text-[10px] text-slate-500 truncate">${u.unit}</div>
          </div>
          <span class="text-[9px] font-extrabold px-2 py-0.5 rounded-full shrink-0 ${u.role === 'panitia' ? 'bg-indigo-100 text-indigo-800' : 'bg-emerald-100 text-emerald-800'}">
            ${u.role === 'panitia' ? 'Panitia' : 'Peserta'} • ${u.waktu || 'Aktif'}
          </span>
        </div>
      `).join('')}
    </div>
  `;
}

export function bindUserProfileTrigger(activeUser, reloadCallback) {
  const avatarEl = document.getElementById("topUserAvatar");
  const nameEl = document.getElementById("topUserName");
  if (!avatarEl || !activeUser) return;

  setupOnlinePresenceTracker(activeUser);
  injectInteractiveGuideTriggers(activeUser); // <--- Tambahkan 1 baris ini
  renderRekapProfilKepsekWidget(activeUser, reloadCallback);

  const headerEl = avatarEl.closest("header");
  const p = activeUser.profile || {};
  const fotoUrl = p.foto_profil || "";
  const isPeserta = activeUser.role === "peserta";

  // Kunci ukuran header tetap stabil tanpa mengubah tinggi saat scroll (Anti Kedap-Kedip!)
  if (headerEl) {
    headerEl.className = "bg-gradient-to-br from-slate-950 via-blue-950 to-indigo-950 text-white px-4 py-3.5 sticky top-0 z-30 rounded-b-3xl shadow-xl border-b border-white/10 flex items-center justify-between";
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

  // Bersihkan tombol Refresh & tombol Online dari Header agar Header lega (hanya Lonceng & Logout)
  document.getElementById("btnRefreshApp")?.remove();
  document.getElementById("btnHeaderOnlineUsers")?.remove();

  const logoutBtn = document.getElementById("btnLogout");
  const actionWrap = logoutBtn ? logoutBtn.parentElement : null;

  if (actionWrap) {
    actionWrap.className = "flex items-center gap-1.5 shrink-0";

    let bellBtn = document.getElementById("btnHeaderNotifBell");
    if (!bellBtn) {
      bellBtn = document.createElement("button");
      bellBtn.id = "btnHeaderNotifBell";
      bellBtn.type = "button";
      bellBtn.title = "Pusat Info & Notifikasi";
      actionWrap.insertBefore(bellBtn, logoutBtn);
    }
    bellBtn.className = "w-9 h-9 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/10 flex items-center justify-center text-xs text-amber-300 relative active:scale-95 transition";
    bellBtn.innerHTML = `
      <i class="fa-solid fa-bell"></i>
      <span class="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500 animate-ping"></span>
      <span class="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500"></span>
    `;
    bellBtn.onclick = () => openNotificationQuickModal(activeUser, reloadCallback);

    if (logoutBtn) {
      logoutBtn.className = "w-9 h-9 rounded-2xl bg-rose-500/20 hover:bg-rose-500/35 border border-rose-400/25 flex items-center justify-center text-xs text-rose-300 active:scale-95 transition";
    }
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


// =========================================================================
// FITUR PANDUAN PENGGUNAAN INTERAKTIF (OTOMATIS SESUAI PERAN & DIVISI LOGIN)
// =========================================================================
const ROLE_GUIDES_DATA = {
  "PESERTA": {
    title: "Panduan Peserta (Kepala Sekolah SD/MI)",
    badge: "Akses Peserta Rakor",
    icon: "fa-user-graduate",
    color: "from-blue-900 via-indigo-950 to-slate-900",
    steps: [
      {
        judul: "1. Kelengkapan Biodata & Keamanan Akun",
        isi: "Ketuk <b>Foto Profil / Nama Sekolah</b> di pojok kiri atas header untuk mengisi <b>Nama Lengkap & Gelar</b> (wajib sesuai ejaan karena akan tercetak otomatis pada E-Sertifikat Pola 32 JP), <b>NIP</b>, <b>No. WhatsApp</b>, mengunggah Foto Profil, serta mengganti password bawaan (NPSN) dengan password pribadi."
      },
      {
        judul: "2. Kartu ID & QR Code (Mode Scan Cepat)",
        isi: "Buka menu <b>ID & QR</b> di bagian tengah bawah. Tunjukkan QR Code kepada petugas untuk: <b>Absensi H1–H3</b>, <b>Pengambilan Rakor Kit</b>, <b>Uang Transpor</b>, dan <b>Check-In Kamar</b>. <b>Tips:</b> Ketuk gambar QR Code agar membesar satu layar penuh (Full-Screen Zoom) supaya kamera panitia mudah memindainya."
      },
      {
        judul: "3. Cek Nomor Kamar, Teman Sekamar & Kontak Rayon",
        isi: "Buka menu <b>Info Kamar</b> di Beranda untuk melihat nomor kamar hotel Anda beserta nama & kontak WhatsApp <b>teman sekamar Anda</b>. Di menu <b>Rayon</b>, Anda dapat melihat rekap SD/MI Negeri & Swasta serta menghubungi nomor WA rekan Kepala Sekolah satu Sub Rayon."
      },
      {
        judul: "4. Pengajuan Izin & Unduh Paket SPJ BOSP Sekolah",
        isi: "Buka tab <b>Absensi</b> di kanan bawah. Jika berhalangan hadir, gunakan sub-tab <b>Perizinan</b> (tersedia opsi Sakit, Tugas Kedinasan, Kedukaan, atau Lainnya). Pada kotak <b>Dokumen Pertanggungjawaban BOSP</b>, Anda dapat mengunduh: <b>(1) PDF Daftar Hadir Individu</b>, <b>(2) PDF Kolektif Sub Rayon</b>, <b>(3) Scan Absensi Manual Sub Rayon Anda</b>, dan <b>(4) PDF E-Kwitansi Resmi Rp 2.000.000</b>."
      },
      {
        judul: "5. Materi, Produk Rakor 2027 (BOSP) & E-Sertifikat",
        isi: "Buka menu <b>Produk Rakor</b> untuk mengunduh Draft Proker (Word/Excel/PDF), melihat Proker K3S 2027 yang disahkan (6 Bidang), Kalender Bulanan, serta <b>Daftar Kegiatan Bersumber Dana BOSP</b> sebagai acuan penyusunan ARKAS 2027 sekolah Anda."
      }
    ]
  },

  "Penanggung Jawab": {
    title: "Panduan Penanggung Jawab (Pengurus Inti K3S)",
    badge: "Otoritas Pimpinan K3S",
    icon: "fa-crown",
    color: "from-slate-900 via-indigo-950 to-slate-900",
    steps: [
      {
        judul: "1. Monitoring Eksekutif Keuangan & Kontribusi",
        isi: "Buka menu <b>Info Keuangan & Kontribusi</b> di dalam kotak <i>Khusus Panitia</i> untuk memantau total kas masuk dari 160 SD/MI, persentase pelunasan, serta rincian per Sub Rayon secara realtime."
      },
      {
        judul: "2. Monitoring Kuota Kamar Hotel (Panitia Inti)",
        isi: "Buka menu <b>Info Kamar</b> untuk melihat kartu rekapitulasi jumlah kamar hotel (Peserta & Panitia), kamar terisi, dan sisa daya tampung yang diinput oleh Ketua Panitia."
      },
      {
        judul: "3. Akses Penuh Arsip Laporan / LPJ Panitia Inti",
        isi: "Buka menu <b>Laporan/LPH</b> untuk memeriksa seluruh 11 kategori scan dokumen pertanggungjawaban, termasuk dokumen berlabel <b>Khusus Panitia Inti</b> (Pajak, Honor Pemateri/Moderator, Kwitansi ATK & Konsumsi)."
      },
      {
        judul: "4. Siaran Instruksi Internal Panitia (Running Text)",
        isi: "Ketuk baris <b>INFO PANITIA</b> atau tombol <b>Siarkan</b> di dalam kotak <i>Khusus Panitia</i> untuk merilis instruksi berjalan kepada seluruh anggota panitia."
      }
    ]
  },

  "Ketua Panitia": {
    title: "Panduan Khusus Ketua Panitia Pelaksana",
    badge: "Pengendali Utama Kepanitiaan",
    icon: "fa-user-tie",
    color: "from-blue-950 via-indigo-950 to-slate-900",
    steps: [
      {
        judul: "1. Kendali Penuh Master Tugas (Tab Kinerja)",
        isi: "Di tab <b>Kinerja</b>, Anda bersama Sekretaris adalah pemegang otoritas untuk <b>Menambah Tugas Baru (+ Tambah)</b>, <b>Mengedit</b>, <b>Menghapus</b>, serta <b>Mencentang Lintas Divisi</b> seluruh progres kerja seksi."
      },
      {
        judul: "2. Input Nomor Kamar, Kapasitas & Rekapan Kamar",
        isi: "Buka menu <b>Info Kamar</b> &rarr; pilih tab <b>Input Kamar</b>. Masukkan nomor kamar (satuan misal <code>101</code> atau rentang sekaligus misal <code>101-120</code>), kapasitas, dan peruntukan (<b>Kamar Peserta</b> / <b>Kamar Khusus Panitia</b>). Anda juga dapat mengatur penghuni kamar dan mengunduh <b>Rekapan Kamar (Excel .CSV & PDF Resmi)</b>."
      },
      {
        judul: "3. Monitoring Keuangan & Arsip 11 Dokumen LPJ",
        isi: "Pantau kas masuk 160 sekolah di menu <b>Info Keuangan</b> dan periksa seluruh dokumen bukti fisik di menu <b>Laporan/LPH</b> (termasuk kategori <i>Khusus Panitia Inti</i>)."
      },
      {
        judul: "4. Siaran Running Text Publik & Internal Panitia",
        isi: "Anda dapat memperbarui teks berjalan untuk seluruh peserta di Beranda atas maupun merilis instruksi khusus di <b>Running Text Internal Panitia</b>."
      }
    ]
  },

  "Sekretaris": {
    title: "Panduan Khusus Sekretaris Panitia",
    badge: "Pusat Kendali Administrasi & Sistem",
    icon: "fa-file-signature",
    color: "from-emerald-950 via-teal-950 to-slate-900",
    steps: [
      {
        judul: "1. Otorisasi 5 Pos Layanan & Pembukaan SPJ Daftar Hadir",
        isi: "Pada kartu <b>Meja Layanan & Otorisasi Pos</b>, ketuk pos untuk Membuka/Mengunci <b>Absensi H1–H3, Rakor Kit, dan Check-In Kamar</b>. Di kotak <i>Khusus Panitia</i>, aktifkan saklar <b>Otoritas Sekretaris: Daftar Hadir SPJ</b> agar 160 Kepala Sekolah dapat mengunduh PDF Daftar Hadir Individu & Kolektif."
      },
      {
        judul: "2. Upload Absensi Manual Per Sub Rayon & 11 Dokumen LPJ",
        isi: "Klik tombol <b>Absen Rayon</b> untuk mengunggah Scan Absensi Manual (TTD Basah) per Sub Rayon. Buka menu <b>Laporan/LPH</b> untuk mengunggah <b>11 Kategori Scan Dokumen LPJ</b> sekaligus menentukan hak aksesnya (<b>Peserta / Panitia / Panitia Inti</b>)."
      },
      {
        judul: "3. Kelola Produk Rakor 2027 (Draft Word/Excel & Proker Sah)",
        isi: "Buka menu <b>Produk Rakor</b> untuk mengunggah file Draft (Word/Excel/Spreadsheet/PDF), menginput 9 komponen Program Kerja 6 Bidang, menekan tombol <b>Sahkan ke Proker Disepakati</b>, serta mengunggah PDF <b>Rekomendasi Rakor 2027</b>."
      },
      {
        judul: "4. Unduh Spreadsheet Profil Kepsek, Database 160 Sekolah & Kamar",
        isi: "Anda memiliki tombol eksklusif untuk mengunduh <b>Spreadsheet Rekap Profil Kepsek</b> (di menu Rekap Profil), <b>Excel Database 160 Sekolah</b> (di menu Infografis), <b>Rekapan Kamar (Excel & PDF)</b>, serta mencetak <b>ID Card Kalung Massal</b>."
      }
    ]
  },

  "Bendahara": {
    title: "Panduan Khusus Bendahara Panitia",
    badge: "Otoritas Keuangan & E-Kwitansi BOSP",
    icon: "fa-sack-dollar",
    color: "from-emerald-900 via-teal-950 to-slate-900",
    steps: [
      {
        judul: "1. Validasi Status Kontribusi 160 Sekolah (Rp 2.000.000)",
        isi: "Buka menu <b>Info Keuangan & Kontribusi</b> (atau melalui tab <b>Rayon</b>). Ubah status bayar sekolah menjadi <b>Belum Bayar</b>, <b>Dalam Proses</b>, atau <b>Lunas (2 Jt)</b>. Sekolah yang diubah menjadi Lunas/Proses otomatis tercatat <i>Ikut</i>."
      },
      {
        judul: "2. Pembukaan Akses Unduh PDF E-Kwitansi BOSP",
        isi: "Pada kotak <i>Khusus Panitia</i>, tekan tombol <b>Buka Akses</b> pada panel <b>Otoritas Bendahara: E-Kwitansi BOSP</b>. Begitu dibuka, seluruh sekolah yang berstatus <b>Lunas</b> dapat langsung mengunduh PDF E-Kwitansi Resmi ber-Kop K3S & QR Validasi."
      },
      {
        judul: "3. Otorisasi Pos Penerimaan Uang Transpor Peserta",
        isi: "Pada kartu <b>Meja Layanan & Otorisasi Pos</b>, ketuk saklar <b>Penerimaan Uang Transpor</b> untuk membuka/mengunci pos pencairan transpor peserta melalui pemindaian QR Code."
      },
      {
        judul: "4. Akses Dokumen LPJ Keuangan & Kuota Kamar",
        isi: "Sebagai Panitia Inti, Anda dapat melihat rekap kuota kamar hotel di menu <b>Info Kamar</b> serta memeriksa seluruh dokumen bukti pajak dan belanja di menu <b>Laporan/LPH</b>."
      }
    ]
  },

  "KETUA_SUBRAYON": {
    title: "Panduan Koordinator / Ketua Sub Rayon",
    badge: "Otoritas Wilayah Sub Rayon",
    icon: "fa-map-location-dot",
    color: "from-indigo-950 via-blue-950 to-slate-900",
    steps: [
      {
        judul: "1. Validasi Keikutsertaan & Kontribusi Sekolah Wilayah Anda",
        isi: "Buka tab <b>Rayon</b> (atau menu <b>Info Keuangan</b>). Anda memiliki wewenang penuh di wilayah Sub Rayon Anda untuk menekan tombol <b>Ikut / Tidak</b> serta memperbarui status kontribusi sekolah (<b>Belum Bayar / Dalam Proses / Lunas</b>)."
      },
      {
        judul: "2. Penentuan Penghuni Kamar Peserta (Lintas Sub Rayon)",
        isi: "Buka menu <b>Info Kamar</b>. Pilih nomor kamar pada dropdown di samping nama sekolah. Anda dapat memasangkan Kepala Sekolah dari Sub Rayon Anda maupun lintas Sub Rayon. Sistem otomatis menolak jika kamar yang dipilih sudah penuh."
      },
      {
        judul: "3. Pelacakan Kehadiran & Kelengkapan Biodata Kepsek",
        isi: "Gunakan tombol <b>Lacak</b> di kartu <i>Meja Layanan</i> untuk memantau siapa Kepala Sekolah di Sub Rayon Anda yang belum scan absen H1–H3, dan cek menu <b>Rekap Profil Kepsek</b> untuk memastikan seluruh Kepsek di rayon Anda sudah mengisi Nama & NIP sertifikat."
      }
    ]
  },

  "Seksi Kesekretariatan": {
    title: "Panduan Seksi Kesekretariatan",
    badge: "Tim Data, Persidangan & Dokumen SPJ",
    icon: "fa-laptop-file",
    color: "from-blue-900 via-slate-900 to-indigo-950",
    steps: [
      {
        judul: "1. Input & Pengelolaan Produk Rakor 2027",
        isi: "Bersama Sekretaris, Anda memiliki akses editor penuh di menu <b>Produk Rakor</b> untuk mengunggah file Draft (Word/Excel/Spreadsheet/PDF), menginput Program Kerja 2027 (6 Bidang), mengesahkan Draft, dan mengunggah PDF Rekomendasi."
      },
      {
        judul: "2. Upload Absensi Manual Per Rayon & 11 Dokumen LPJ",
        isi: "Unggah file scan <b>Absensi Manual Per Sub Rayon</b> melalui tombol di Meja Layanan/Khusus Panitia, serta kelola ke-11 kategori dokumen scan bukti fisik di menu <b>Laporan/LPH</b>."
      },
      {
        judul: "3. Unduh Spreadsheet Rekap Profil, Edit DB 160 Sekolah & Cetak ID Card",
        isi: "Anda berwenang mengunduh <b>Spreadsheet Rekap Profil Kepsek</b>, menambah/mengedit data di menu <b>Infografis & Profil 160 Sekolah</b>, serta mencetak <b>ID Card Kalung</b>."
      },
      {
        judul: "4. Layanan Scan Pos & Checklist Kinerja Divisi",
        isi: "Gunakan tombol <b>Scan Pos</b> untuk memindai QR peserta di meja registrasi/Rakor Kit, dan centang progres tugas <i>Seksi Kesekretariatan</i> di tab <b>Kinerja</b>."
      }
    ]
  },

  "Seksi Acara dan Humas": {
    title: "Panduan Seksi Acara dan Humas",
    badge: "Manajemen Acara, Materi & Audio",
    icon: "fa-bullhorn",
    color: "from-teal-900 via-slate-900 to-blue-950",
    steps: [
      {
        judul: "1. Upload Surat Undangan, Buku Panduan & Materi Rakor",
        isi: "Buka menu <b>Surat Undangan</b>, <b>Buku Panduan</b>, dan <b>Materi Rakor</b> di Beranda untuk mengunggah file PDF/PPT narasumber agar dapat diunduh langsung oleh 160 peserta."
      },
      {
        judul: "2. Pengelolaan Audio Mars K3S & Lagu Daerah",
        isi: "Pada widget pemutar musik di Beranda, Anda dapat mengunggah dan mengatur daftar lagu pengiring resmi Rakor."
      },
      {
        judul: "3. Pemantauan Jadwal Live & Checklist Kinerja Seksi Acara",
        isi: "Pantau urutan sesi acara harian (26–28 Nov 2026) di tab <b>Jadwal</b>, gunakan <b>Catatan & Evaluasi</b> untuk mencatat dinamika acara, dan centang tugas <i>Seksi Acara dan Humas</i> di tab <b>Kinerja</b>."
      }
    ]
  },

  "Seksi Konsumsi": {
    title: "Panduan Seksi Konsumsi",
    badge: "Koordinasi Konsumsi & Siaran Internal",
    icon: "fa-utensils",
    color: "from-amber-900 via-slate-900 to-stone-900",
    steps: [
      {
        judul: "1. Merilis Running Text Info Khusus Panitia",
        isi: "Anda memiliki hak akses khusus pada kotak <i>Khusus Panitia</i> untuk menekan tombol <b>Siarkan</b> pada <b>Running Text INFO PANITIA</b> guna menginformasikan jadwal makan siang, snack/coffee break, atau koordinasi konsumsi ke seluruh panitia."
      },
      {
        judul: "2. Memantau Jumlah Riil Kehadiran Harian (Acuan Porsi)",
        isi: "Lihat angka <b>Hadir H1, Hadir H2, dan Hadir H3</b> pada kartu <i>Meja Layanan & Otorisasi Pos</i> untuk mengetahui jumlah riil peserta yang hadir di lokasi setiap harinya."
      },
      {
        judul: "3. Checklist Kinerja Seksi Konsumsi",
        isi: "Buka tab <b>Kinerja</b> di kanan bawah untuk mencentang penyelesaian tugas khusus <i>Seksi Konsumsi</i> dari tahap persiapan hingga pelaksanaan."
      }
    ]
  },

  "Seksi Perlengkapan, Dokumentasi, dan Publikasi": {
    title: "Panduan Seksi Perlengkapan, Dokumentasi & Publikasi",
    badge: "Logistik, Galeri Foto & Publikasi",
    icon: "fa-camera-retro",
    color: "from-sky-900 via-slate-900 to-indigo-950",
    steps: [
      {
        judul: "1. Mengunggah Foto Kegiatan ke Menu Dokumentasi",
        isi: "Buka menu <b>Dokumentasi</b> di Beranda untuk mengunggah foto-foto terbaik kegiatan harian (H1–H3) maupun menautkan link folder Google Drive dokumentasi resmi."
      },
      {
        judul: "2. Membantu Pemindaian di Meja Layanan",
        isi: "Gunakan fitur <b>Scan Pos</b> pada kartu <i>Meja Layanan</i> saat membantu distribusi perlengkapan/Rakor Kit peserta."
      },
      {
        judul: "3. Checklist Kinerja Seksi Perlengkapan & Dokumentasi",
        isi: "Buka tab <b>Kinerja</b> untuk memperbarui status penyelesaian tugas kesiapan spanduk, sound system, dan publikasi pada divisi Anda."
      }
    ]
  },

  "Seksi Keamanan dan Ketertiban": {
    title: "Panduan Seksi Keamanan dan Ketertiban",
    badge: "Ketertiban Area & Pemantauan Peserta",
    icon: "fa-shield-halved",
    color: "from-slate-900 via-blue-950 to-slate-950",
    steps: [
      {
        judul: "1. Melacak Kehadiran & Izin Peserta (H1–H3)",
        isi: "Pada kartu <i>Meja Layanan & Otorisasi Pos</i>, tekan tombol <b>Lacak</b> untuk melihat siapa peserta yang belum hadir di ruangan serta memeriksa daftar peserta yang sedang izin."
      },
      {
        judul: "2. Memantau Pembagian Kamar Peserta Per Sub Rayon",
        isi: "Buka menu <b>Info Kamar</b> untuk melihat data penempatan kamar peserta per Sub Rayon guna mendukung ketertiban dan keamanan di area hotel."
      },
      {
        judul: "3. Catatan Lapangan & Checklist Kinerja Keamanan",
        isi: "Tuliskan laporan situasi di menu <b>Catatan & Evaluasi Kegiatan</b> serta centang rincian tugas <i>Seksi Keamanan dan Ketertiban</i> pada tab <b>Kinerja</b>."
      }
    ]
  }
};

function injectInteractiveGuideTriggers(activeUser) {
  if (!activeUser) return;

  // 1. Tambahkan tombol ikon Buku Panduan Penggunaan (?) di Header (sebelah lonceng notifikasi)
  const bellBtn = document.getElementById("btnHeaderNotifBell");
  if (bellBtn && bellBtn.parentElement) {
    let guideHeaderBtn = document.getElementById("btnHeaderInteractiveGuide");
    if (!guideHeaderBtn) {
      guideHeaderBtn = document.createElement("button");
      guideHeaderBtn.id = "btnHeaderInteractiveGuide";
      guideHeaderBtn.type = "button";
      guideHeaderBtn.title = "Panduan Penggunaan Aplikasi Sesuai Peran Anda";
      bellBtn.parentElement.insertBefore(guideHeaderBtn, bellBtn);
    }
    guideHeaderBtn.className = "w-9 h-9 rounded-2xl bg-amber-400/20 hover:bg-amber-400/30 border border-amber-400/40 flex items-center justify-center text-xs text-amber-300 active:scale-95 transition shrink-0";
    guideHeaderBtn.innerHTML = `<i class="fa-solid fa-circle-question"></i>`;
    guideHeaderBtn.onclick = () => openInteractiveUserGuideModal(activeUser);
  }

  // 2. Tambahkan lencana "📖 Panduan" di samping tombol Online pada Card Hero SIM-RAKOR 2026
  const onlineBtn = document.getElementById("btnHeroOnlineUsers");
  if (onlineBtn && onlineBtn.parentElement) {
    let heroGuideBtn = document.getElementById("btnHeroInteractiveGuide");
    if (!heroGuideBtn) {
      heroGuideBtn = document.createElement("button");
      heroGuideBtn.id = "btnHeroInteractiveGuide";
      heroGuideBtn.type = "button";
      onlineBtn.insertAdjacentElement("afterend", heroGuideBtn);
    }
    heroGuideBtn.className = "inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-400/20 hover:bg-amber-400/30 border border-amber-300/40 text-[10px] font-extrabold text-amber-300 active:scale-95 transition cursor-pointer shrink-0";
    heroGuideBtn.innerHTML = `<i class="fa-solid fa-book-open-reader"></i> <span>Panduan Akses</span>`;
    heroGuideBtn.onclick = () => openInteractiveUserGuideModal(activeUser);
  }
}

export function openInteractiveUserGuideModal(activeUser, forcedKey = null) {
  const modal = document.getElementById("serviceModal");
  const titleEl = document.getElementById("serviceModalTitle");
  const bodyEl = document.getElementById("serviceModalBody");
  if (!modal || !titleEl || !bodyEl || !activeUser) return;

  modal.classList.remove("hidden");
  titleEl.innerHTML = `<i class="fa-solid fa-book-open-reader text-blue-800 mr-1.5"></i> Panduan Penggunaan SIM-RAKOR`;

  const isPeserta = activeUser.role === "peserta";
  const userDivisi = activeUser.profile?.divisi || "Panitia";
  const hasRayonDuty = Boolean(activeUser.profile?.tugas_subrayon && String(activeUser.profile.tugas_subrayon).trim() !== "");

  // Tentukan kunci panduan default sesuai akun yang sedang login
  let activeGuideKey = forcedKey;
  if (!activeGuideKey) {
    if (isPeserta) {
      activeGuideKey = "PESERTA";
    } else if (hasRayonDuty && !["Ketua Panitia", "Sekretaris", "Bendahara", "Penanggung Jawab"].includes(userDivisi)) {
      activeGuideKey = "KETUA_SUBRAYON";
    } else if (ROLE_GUIDES_DATA[userDivisi]) {
      activeGuideKey = userDivisi;
    } else {
      activeGuideKey = "Seksi Acara dan Humas";
    }
  }

  const guideObj = ROLE_GUIDES_DATA[activeGuideKey] || ROLE_GUIDES_DATA["PESERTA"];

  // Jika Ketua Sub Rayon juga memiliki divisi seksi, tampilkan tombol switch cepat antara Panduan Ketua Sub Rayon & Panduan Divisinya
  const allRoleKeys = [
    { key: "PESERTA", label: "Peserta (Kepala Sekolah)" },
    { key: "Penanggung Jawab", label: "Penanggung Jawab" },
    { key: "Ketua Panitia", label: "Ketua Panitia" },
    { key: "Sekretaris", label: "Sekretaris Panitia" },
    { key: "Bendahara", label: "Bendahara Panitia" },
    { key: "KETUA_SUBRAYON", label: "Ketua Sub Rayon (6 Wilayah)" },
    { key: "Seksi Kesekretariatan", label: "Seksi Kesekretariatan" },
    { key: "Seksi Acara dan Humas", label: "Seksi Acara dan Humas" },
    { key: "Seksi Konsumsi", label: "Seksi Konsumsi" },
    { key: "Seksi Perlengkapan, Dokumentasi, dan Publikasi", label: "Seksi Perlengkapan & Dokumentasi" },
    { key: "Seksi Keamanan dan Ketertiban", label: "Seksi Keamanan & Ketertiban" }
  ];

  bodyEl.innerHTML = `
    <!-- Banner Identitas Pengguna & Peran Aktif -->
    <div class="p-4 rounded-3xl bg-gradient-to-br ${guideObj.color} text-white space-y-2.5 shadow-lg border border-white/15">
      <div class="flex items-center justify-between">
        <span class="text-[9px] font-extrabold uppercase tracking-wider bg-amber-400 text-slate-950 px-2.5 py-0.5 rounded-full">
          ${guideObj.badge}
        </span>
        <span class="text-[10px] font-bold text-amber-300">26–28 Nov 2026</span>
      </div>

      <div class="flex items-center gap-3 pt-0.5">
        <div class="w-11 h-11 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center text-lg text-amber-300 shrink-0">
          <i class="fa-solid ${guideObj.icon}"></i>
        </div>
        <div>
          <h4 class="text-sm font-extrabold text-white leading-snug">${guideObj.title}</h4>
          <p class="text-[10px] text-blue-200 mt-0.5">
            Login Aktif: <b>${isPeserta ? activeUser.profile?.nama_sekolah : activeUser.profile?.nama_panitia}</b>
            ${hasRayonDuty ? ` • <b>Ketua Rayon ${activeUser.profile.tugas_subrayon}</b>` : ''}
          </p>
        </div>
      </div>
    </div>

    <!-- Pilihan Lihat Panduan Divisi Lain (Khususnya memudahkan Panitia melihat alur kerja lintas seksi) -->
    <div class="p-2.5 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-between gap-2">
      <span class="text-[10px] font-extrabold text-slate-700 uppercase shrink-0">
        <i class="fa-solid fa-compass text-blue-800 mr-1"></i>Pilih Panduan:
      </span>
      <select id="selectInteractiveGuideRole" class="flex-1 rounded-xl border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-extrabold text-blue-950">
        ${allRoleKeys.map(r => `<option value="${r.key}" ${activeGuideKey === r.key ? 'selected' : ''}>${r.label}</option>`).join('')}
      </select>
    </div>

    ${hasRayonDuty && activeGuideKey !== "KETUA_SUBRAYON" ? `
      <button type="button" id="btnSwitchToRayonCoordGuide" class="w-full py-2 px-3 rounded-xl bg-amber-100 hover:bg-amber-200 border border-amber-300 text-amber-950 font-extrabold text-[11px] flex items-center justify-between transition">
        <span><i class="fa-solid fa-map-location-dot mr-1.5 text-amber-700"></i>Anda juga bertugas sebagai Ketua Sub Rayon ${activeUser.profile.tugas_subrayon}</span>
        <span class="underline">Lihat Panduan Rayon &rarr;</span>
      </button>
    ` : ''}

    <!-- Daftar Langkah Panduan Sesuai Peran -->
    <div class="space-y-2.5 max-h-96 overflow-y-auto pr-0.5">
      ${guideObj.steps.map(st => `
        <div class="p-3.5 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-1">
          <h5 class="font-extrabold text-xs text-blue-950 flex items-center gap-1.5">
            <i class="fa-solid fa-circle-check text-emerald-600 text-[11px]"></i>
            <span>${st.judul}</span>
          </h5>
          <p class="text-[11px] text-slate-600 leading-relaxed pl-4">${st.isi}</p>
        </div>
      `).join('')}
    </div>
  `;

  document.getElementById("selectInteractiveGuideRole")?.addEventListener("change", (e) => {
    openInteractiveUserGuideModal(activeUser, e.target.value);
  });

  document.getElementById("btnSwitchToRayonCoordGuide")?.addEventListener("click", () => {
    openInteractiveUserGuideModal(activeUser, "KETUA_SUBRAYON");
  });
}
