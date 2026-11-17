// js/app.js
import { sb, toast } from './supabase.js';
import { initLogin } from './login.js';
import { initJadwal, renderLiveJadwal, checkSecretaryPrivilege, filterDay } from './jadwal.js'; 
import { openRoomManagerModal } from './kamar.js';
import { openLayananDocumentModal, DEFAULT_LAYANAN } from './layanan.js';
import { openDokumentasiModal } from './dokumentasi.js';
import { openSertifikatModal, checkCertificateVerificationUrl } from './sertifikat.js'; 
import { renderPosScannerWidgets } from './scanner_pos.js';
import { renderCatatanPanitiaWidget } from './catatan.js';
import {
  TARIF_KONTRIBUSI_DEFAULT,
  formatRupiah,
  canAccessInfoKeuangan,
  canEditPaymentAndParticipation,
  renderInfoKeuanganWidget,
  openInfoKeuanganModal
} from './keuangan.js';
import { renderStatistikSekolahWidget } from './statistik_sekolah.js';
import { bindUserProfileTrigger } from './profil.js';
import { initModernDropdowns } from './dropdown_ui.js';
import { applyK3sLogoBranding, renderK3sMusicPlayerWidget } from './branding_audio.js';
import { renderSpjBospWidgets } from './spj_bosp.js';
import { initPwaInstallSupport, renderFiturEkstraWidgets } from './fitur_ekstra.js';
import { renderProdukRakorAndUniformCards } from './produk_rakor.js';

if (!document.querySelector("link[rel*='icon']")) {
  const link = document.createElement("link");
  link.rel = "icon";
  link.href = "data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🏫</text></svg>";
  document.head.appendChild(link);
}

let activeUser = null;
let panitiaList = [];
let sekolahList = [];
let tugasList = [];
let layananList = [];
let tarifKontribusiDefault = TARIF_KONTRIBUSI_DEFAULT;

const DIVISI_LIST = [
  "Penanggung Jawab",
  "Ketua Panitia",
  "Sekretaris",
  "Bendahara",
  "Seksi Kesekretariatan",
  "Seksi Acara dan Humas",
  "Seksi Konsumsi",
  "Seksi Perlengkapan, Dokumentasi, dan Publikasi",
  "Seksi Keamanan dan Ketertiban"
];

const SUBRAYON_LIST = ["Maulafa", "Alak", "Kota Raja", "Oebobo", "Kelapa Lima", "Kota Lama"];

initApp();

async function initApp() {
  initModernDropdowns();
  initPwaInstallSupport();
  applyK3sLogoBranding(null);
  updateStaticEventDatesToNov2026();
  initLogin(session => {
    activeUser = session;
    onLoginSuccess();
  });
  initJadwal();
  bindNavigationAndActions();
  await loadAllDatabase(false);
  checkCertificateVerificationUrl(sekolahList, panitiaList);
  setupRealtimeListeners();
}

function updateStaticEventDatesToNov2026() {
  const totalCount = (sekolahList && sekolahList.length > 0) ? sekolahList.length : 160;
  document.querySelectorAll("span, p, div, h3, h4, button, option").forEach(el => {
    if (el.children.length === 0 && el.textContent) {
      let t = el.textContent;
      let changed = false;
      if (
        t.includes("24–26") || t.includes("24-26") || 
        t.includes("19–21") || t.includes("19-21") || 
        t.includes("19 Nov") || t.includes("20 Nov") || t.includes("21 Nov")
      ) {
        t = t
          .replace(/24[–-]26 September 2026/g, "26–28 November 2026")
          .replace(/24[–-]26 Sept/g, "26–28 Nov")
          .replace(/19[–-]21 November 2026/g, "26–28 November 2026")
          .replace(/19[–-]21 Nov/g, "26–28 Nov")
          .replace(/19 Nov/g, "26 Nov")
          .replace(/20 Nov/g, "27 Nov")
          .replace(/21 Nov/g, "28 Nov");
        changed = true;
      }
      if (t.includes("158")) {
        t = t.replace(/158/g, String(totalCount));
        changed = true;
      }
      if (changed) el.textContent = t;
    }
  });
}

async function loadAllDatabase(showNotif = false) {
  try {
    const [rPan, rSek, rTgs, rLay] = await Promise.all([
      sb.from("panitia_rakor").select("*").order("no", { ascending: true }),
      sb.from("db_sekolah").select("*").order("nama_sekolah", { ascending: true }),
      sb.from("manajemen_tugas").select("*").order("deadline", { ascending: true }),
      sb.from("info_layanan").select("*")
    ]);
    if (rPan.data) panitiaList = rPan.data;
    if (rSek.data) sekolahList = rSek.data;
    if (rTgs.data) tugasList = rTgs.data;
    layananList = (rLay.data && rLay.data.length > 0) ? rLay.data : DEFAULT_LAYANAN;
    tarifKontribusiDefault = TARIF_KONTRIBUSI_DEFAULT;
    
    const pSelect = document.getElementById("loginPanitiaSelect");
    if (pSelect) {
      const prev = pSelect.value;
      pSelect.innerHTML = `<option value="">Pilih Nama Panitia (${panitiaList.length} Orang)</option>`;
      panitiaList.forEach(p => {
        const srTag = p.tugas_subrayon ? ` [Ketua Rayon ${p.tugas_subrayon}]` : "";
        pSelect.innerHTML += `<option value="${p.id_panitia}">${p.no}. ${p.nama_panitia} (${p.divisi}${srTag})</option>`;
      });
      if (prev) pSelect.value = prev;
    }

    const badge = document.getElementById("dbStatusBadge");
    if (badge) badge.textContent = `Online • ${sekolahList.length} Sekolah`;

    if (activeUser) {
      if (activeUser.role === "peserta") {
        const updatedSchool = sekolahList.find(s => s.id_sekolah === activeUser.profile.id_sekolah);
        if (updatedSchool) activeUser.profile = updatedSchool;
      } else {
        const updatedPanitia = panitiaList.find(p => p.id_panitia === activeUser.profile.id_panitia);
        if (updatedPanitia) activeUser.profile = updatedPanitia;
      }
      renderAllViews();
    } else {
      renderBerandaView();
    }
    if (showNotif) toast("Data berhasil diperbarui!");
  } catch (err) {
    console.error("Load error:", err);
  }
}

function bindNavigationAndActions() {
  document.getElementById("footerBtnBeranda")?.addEventListener("click", () => showTab("beranda"));
  document.getElementById("footerBtnJadwal")?.addEventListener("click", () => showTab("jadwal"));
  document.getElementById("footerBtnQr")?.addEventListener("click", () => showTab("qr"));
  document.getElementById("footerBtnSubrayon")?.addEventListener("click", () => showTab("subrayon"));
  document.getElementById("footerBtnFifth")?.addEventListener("click", () => {
    if (activeUser && activeUser.role === "panitia") {
      showTab("kinerja");
    } else {
      showTab("absensi");
    }
  });

  document.querySelectorAll(".service-menu-btn").forEach(btn => {
    btn.addEventListener("click", () => openServiceModal(btn.dataset.service));
  });

  document.getElementById("btnCloseServiceModal")?.addEventListener("click", () => {
    document.getElementById("serviceModal")?.classList.add("hidden");
  });

  document.getElementById("subTabBtnHadir")?.addEventListener("click", () => switchAbsensiSubTab("hadir"));
  document.getElementById("subTabBtnIzin")?.addEventListener("click", () => switchAbsensiSubTab("izin"));
  document.getElementById("btnSubmitIzin")?.addEventListener("click", submitPerijinanPeserta);
  document.getElementById("btnForceRefresh")?.addEventListener("click", () => loadAllDatabase(true));
  document.getElementById("btnRefreshApp")?.addEventListener("click", () => loadAllDatabase(true));
  
  document.getElementById("btnLogout")?.addEventListener("click", () => {
    activeUser = null;
    document.getElementById("mainAppScreen")?.classList.add("hidden");
    document.getElementById("loginScreen")?.classList.remove("hidden");
  });

  document.getElementById("srSelectFilter")?.addEventListener("change", () => renderSubrayonView());
  document.getElementById("srSearchInput")?.addEventListener("input", () => renderSubrayonView());
  document.getElementById("btnMarkAllSr")?.addEventListener("click", markAllSubrayonIkut);
  document.getElementById("btnSaveKepsek")?.addEventListener("click", saveNamaKepsek);
  
  document.getElementById("taskFilterPhase")?.addEventListener("change", () => renderTaskListView());
  document.getElementById("taskFilterDivisi")?.addEventListener("change", () => renderTaskListView());
  document.getElementById("btnAddTaskTop")?.addEventListener("click", () => openTaskModal(null));
  document.getElementById("btnCancelTask")?.addEventListener("click", closeTaskModal);
  document.getElementById("btnDismissTask")?.addEventListener("click", closeTaskModal);
  document.getElementById("btnSaveTask")?.addEventListener("click", saveTaskModal);
}

function setupRealtimeListeners() {
  sb.channel("rakor-realtime-all")
    .on("postgres_changes", { event: "*", schema: "public", table: "jadwal_rakor" }, () => renderLiveJadwal())
    .on("postgres_changes", { event: "*", schema: "public", table: "db_sekolah" }, () => loadAllDatabase(false))
    .on("postgres_changes", { event: "*", schema: "public", table: "manajemen_tugas" }, () => loadAllDatabase(false))
    .on("postgres_changes", { event: "*", schema: "public", table: "info_layanan" }, () => loadAllDatabase(false))
    .subscribe();
}

async function onLoginSuccess() {
  document.getElementById("loginScreen")?.classList.add("hidden");
  document.getElementById("mainAppScreen")?.classList.remove("hidden");
  
  if (sekolahList.length === 0 || tugasList.length === 0) {
    await loadAllDatabase(false);
  }

  const avatar = document.getElementById("topUserAvatar");
  const nameEl = document.getElementById("topUserName");
  const roleBadge = document.getElementById("topUserRoleBadge");
  const srBadge = document.getElementById("topUserSubrayonBadge");
  const fifthIcon = document.getElementById("footerIconFifth");
  const fifthLabel = document.getElementById("footerLabelFifth");

  if (activeUser.role === "panitia") {
    const p = activeUser.profile;
    if (avatar) avatar.textContent = p.nama_panitia.charAt(0);
    if (nameEl) nameEl.textContent = p.nama_panitia;
    if (roleBadge) roleBadge.textContent = p.divisi;
    if (fifthIcon) fifthIcon.className = "fa-solid fa-chart-pie";
    if (fifthLabel) fifthLabel.textContent = "Kinerja";
    if (p.tugas_subrayon) {
      if (srBadge) {
        srBadge.textContent = `Ketua Rayon ${p.tugas_subrayon}`;
        srBadge.classList.remove("hidden");
      }
      const srFilter = document.getElementById("srSelectFilter");
      if (srFilter) srFilter.value = p.tugas_subrayon;
    } else if (srBadge) {
      srBadge.classList.add("hidden");
    }
    const divFilter = document.getElementById("taskFilterDivisi");
    if (divFilter) divFilter.value = p.divisi;
  } else {
    const s = activeUser.profile;
    if (avatar) avatar.textContent = "K3S";
    if (nameEl) nameEl.textContent = s.nama_sekolah;
    if (roleBadge) roleBadge.textContent = "KEPSEK";
    if (fifthIcon) fifthIcon.className = "fa-solid fa-user-check";
    if (fifthLabel) fifthLabel.textContent = "Absensi";
    if (srBadge) {
      srBadge.textContent = `Rayon ${s.subrayon}`;
      srBadge.classList.remove("hidden");
    }
    const srFilter = document.getElementById("srSelectFilter");
    if (srFilter) srFilter.value = s.subrayon;
  }
  
  await checkSecretaryPrivilege(activeUser);
  filterDay(1);
  showTab("beranda");
}

function showTab(name) {
  if (name === "kinerja" && (!activeUser || activeUser.role !== "panitia")) {
    name = "absensi";
  }
  const tabs = {
    beranda: "tabContentBeranda",
    jadwal: "tabContentJadwal",
    qr: "tabContentQr",
    subrayon: "tabContentSubrayon",
    absensi: "tabContentAbsensi",
    kinerja: "tabContentKinerja"
  };
  Object.keys(tabs).forEach(k => {
    document.getElementById(tabs[k])?.classList.toggle("hidden", k !== name);
  });

  const navMap = {
    beranda: "footerBtnBeranda",
    jadwal: "footerBtnJadwal",
    subrayon: "footerBtnSubrayon",
    absensi: "footerBtnFifth",
    kinerja: "footerBtnFifth"
  };

  ["footerBtnBeranda", "footerBtnJadwal", "footerBtnSubrayon", "footerBtnFifth"].forEach(btnId => {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    if (navMap[name] === btnId) {
      btn.className = "flex flex-col items-center justify-center py-1 text-blue-900 font-extrabold scale-105 transition";
    } else {
      btn.className = "flex flex-col items-center justify-center py-1 text-slate-400 font-semibold hover:text-slate-600 transition";
    }
  });

  const qrBtn = document.getElementById("footerBtnQr");
  if (qrBtn) {
    if (name === "qr") {
      qrBtn.className = "-mt-6 w-14 h-14 rounded-2xl bg-gradient-to-tr from-amber-400 to-yellow-300 text-slate-950 shadow-lg flex flex-col items-center justify-center transition";
      const span = qrBtn.querySelector("span");
      if (span) span.className = "text-[9px] font-extrabold text-slate-950 leading-none mt-0.5";
    } else {
      qrBtn.className = "-mt-6 w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-900 to-indigo-700 text-amber-300 shadow-lg flex flex-col items-center justify-center transition";
      const span = qrBtn.querySelector("span");
      if (span) span.className = "text-[9px] font-extrabold text-white leading-none mt-0.5";
    }
  }
  renderAllViews();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderAllViews() {
  updateStaticEventDatesToNov2026();
  bindUserProfileTrigger(activeUser, () => loadAllDatabase(false));
  renderBerandaView();
  renderLiveJadwal();
  renderQrView();
  renderSubrayonView();
  renderAbsensiPesertaView();
  renderPosScannerWidgets(activeUser, sekolahList, () => loadAllDatabase(false));
  renderInfoKeuanganWidget(activeUser, sekolahList, panitiaList, tarifKontribusiDefault, () => loadAllDatabase(false));
  renderCatatanPanitiaWidget(activeUser);
  renderStatistikSekolahWidget(activeUser, sekolahList, () => loadAllDatabase(false));
  renderK3sMusicPlayerWidget(activeUser, layananList, () => loadAllDatabase(false));
  renderSpjBospWidgets(activeUser, sekolahList, panitiaList);
  renderFiturEkstraWidgets(activeUser, sekolahList, panitiaList, layananList, () => loadAllDatabase(false));
  renderProdukRakorAndUniformCards(activeUser, layananList, () => loadAllDatabase(false));
  if (activeUser && activeUser.role === "panitia") {
    renderKinerjaView();
  }
}

function renderBerandaView() {
  const totalSek = sekolahList.length || 160;
  const ikutSek = sekolahList.filter(s => s.status_ikut === "Ikut").length;
  const elTot = document.getElementById("homeMetricTotalSekolah");
  const elIkut = document.getElementById("homeMetricIkut");
  if (elTot) elTot.textContent = totalSek;
  if (elIkut) elIkut.textContent = ikutSek;

  const thirdVal = document.getElementById("homeMetricThirdVal");
  const thirdLbl = document.getElementById("homeMetricThirdLabel");
  const kamarBadge = document.getElementById("badgeHomeKamar");

  if (activeUser && activeUser.role === "panitia") {
    const totalTgs = tugasList.length || 49;
    const doneTgs = tugasList.filter(t => t.status === "Selesai").length;
    const pctTgs = totalTgs > 0 ? Math.round((doneTgs / totalTgs) * 100) : 0;
    if (thirdVal) thirdVal.textContent = pctTgs + "%";
    if (thirdLbl) thirdLbl.textContent = "Kinerja Panitia";
    if (kamarBadge) kamarBadge.textContent = "Atur Kamar";
  } else if (activeUser && activeUser.role === "peserta") {
    const s = activeUser.profile;
    const statusByr = s.status_bayar || "Belum Bayar";
    if (thirdVal) thirdVal.textContent = statusByr === "Lunas" ? "LUNAS" : statusByr === "Dalam Proses" ? "PROSES" : "BELUM";
    if (thirdLbl) thirdLbl.textContent = "Kontribusi (2 Jt)";
    if (kamarBadge) kamarBadge.textContent = s.nomor_kamar || "Cek Kamar";
  }

  const srBox = document.getElementById("homeSubrayonBars");
  if (!srBox) return;
  srBox.innerHTML = "";
  SUBRAYON_LIST.forEach(sr => {
    const all = sekolahList.filter(s => s.subrayon === sr);
    const ikut = all.filter(s => s.status_ikut === "Ikut").length;
    const pct = all.length > 0 ? Math.round((ikut / all.length) * 100) : 0;
    const ketua = panitiaList.find(p => p.tugas_subrayon === sr);
    
    const div = document.createElement("div");
    div.className = "p-2.5 rounded-2xl bg-slate-50 border border-slate-200 cursor-pointer hover:bg-emerald-50/50 transition";
    div.innerHTML = `
      <div class="flex justify-between text-xs font-bold mb-1">
        <span class="text-slate-800">Sub Rayon ${sr} <span class="text-[10px] font-normal text-slate-500">(${ketua ? ketua.nama_panitia : 'Belum Ada Ketua'})</span></span>
        <span class="text-emerald-700 font-extrabold">${ikut}/${all.length} (${pct}%)</span>
      </div>
      <div class="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
        <div class="bg-emerald-500 h-full rounded-full transition-all duration-300" style="width:${pct}%"></div>
      </div>
    `;
    div.addEventListener("click", () => {
      const srSelect = document.getElementById("srSelectFilter");
      if (srSelect) srSelect.value = sr;
      showTab("subrayon");
    });
    srBox.appendChild(div);
  });
}

function openServiceModal(serviceCode) {
  if (serviceCode === "kamar") {
    openRoomManagerModal(activeUser, sekolahList, () => loadAllDatabase(false));
    return;
  }
  if (serviceCode === "dokumentasi") {
    openDokumentasiModal(activeUser, () => loadAllDatabase(false));
    return;
  }
  if (serviceCode === "sertifikat") {
    openSertifikatModal(activeUser, sekolahList, () => loadAllDatabase(false));
    return;
  }
  openLayananDocumentModal(serviceCode, activeUser, layananList, () => loadAllDatabase(false));
}

function switchAbsensiSubTab(mode) {
  const isHadir = mode === "hadir";
  document.getElementById("subViewHadirBox")?.classList.toggle("hidden", !isHadir);
  document.getElementById("subViewIzinBox")?.classList.toggle("hidden", isHadir);
  document.getElementById("subTabBtnHadir").className = isHadir
    ? "py-2 rounded-xl text-xs font-extrabold bg-blue-900 text-white shadow transition"
    : "py-2 rounded-xl text-xs font-bold text-slate-600 transition";
  document.getElementById("subTabBtnIzin").className = !isHadir
    ? "py-2 rounded-xl text-xs font-extrabold bg-blue-900 text-white shadow transition"
    : "py-2 rounded-xl text-xs font-bold text-slate-600 transition";
}

function renderAbsensiPesertaView() {
  if (!activeUser || activeUser.role !== "peserta") return;
  const s = sekolahList.find(x => x.id_sekolah === activeUser.profile.id_sekolah) || activeUser.profile;
  const subEl = document.getElementById("absensiSchoolSubtitle");
  if (subEl) subEl.textContent = `${s.nama_sekolah} (NPSN: ${s.npsn}) • Sub Rayon ${s.subrayon}`;
  
  const h1 = Boolean(s.hadir_h1);
  const h2 = Boolean(s.hadir_h2);
  const h3 = Boolean(s.hadir_h3);
  const hadirCount = [h1, h2, h3].filter(Boolean).length;
  const pctHadir = Math.round((hadirCount / 3) * 100);
  
  const days = [
    { key: "hadir_h1", isHadir: h1, dayNum: 1, label: "Hari Ke-1 • Kamis, 26 Nov 2026", desc: "Registrasi, Pembukaan & Sidang Pleno" },
    { key: "hadir_h2", isHadir: h2, dayNum: 2, label: "Hari Ke-2 • Jumat, 27 Nov 2026", desc: "Sidang Komisi & Penyusunan Program" },
    { key: "hadir_h3", isHadir: h3, dayNum: 3, label: "Hari Ke-3 • Sabtu, 28 Nov 2026", desc: "Perumusan Hasil Rakor & Penutupan" }
  ];

  const subViewHadir = document.getElementById("subViewHadirBox");
  if (subViewHadir && subViewHadir.children.length > 1) {
    const oldInfoBox = subViewHadir.children[1];
    if (oldInfoBox && oldInfoBox.id !== "pesertaKitTransportStatusBox") {
      oldInfoBox.className = "hidden";
    }
  }

  const box = document.getElementById("absensiDaysContainer");
  if (box) {
    const statusBayar = s.status_bayar || "Belum Bayar";
    const bayarColor = statusBayar === "Lunas"
      ? "bg-emerald-100 text-emerald-800 border-emerald-300"
      : statusBayar === "Dalam Proses"
      ? "bg-amber-100 text-amber-800 border-amber-300"
      : "bg-rose-50 text-rose-700 border-rose-200";

    box.innerHTML = `
      <div class="p-4 rounded-2xl bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 text-white space-y-3 shadow-xl">
        <div class="flex items-center justify-between">
          <div>
            <span class="text-[9px] font-extrabold uppercase tracking-wider bg-amber-400 text-slate-950 px-2 py-0.5 rounded-md">
              Sistem Presensi QR Scanner
            </span>
            <h4 class="text-xs font-extrabold mt-1.5">Rekap Kehadiran Anda: ${hadirCount} dari 3 Hari</h4>
          </div>
          <div class="text-right">
            <div class="text-xl font-extrabold text-emerald-300">${pctHadir}%</div>
            <div class="text-[9px] text-blue-200">Pola 32 JP</div>
          </div>
        </div>
        <div class="w-full bg-white/15 h-2.5 rounded-full overflow-hidden">
          <div class="bg-gradient-to-r from-amber-400 to-emerald-400 h-full rounded-full transition-all duration-300" style="width:${pctHadir}%"></div>
        </div>
        <div class="pt-1 flex items-center justify-between gap-2 border-t border-white/10">
          <span class="text-[10px] text-blue-200 leading-snug">
            <i class="fa-solid fa-qrcode text-amber-300 mr-1"></i> Kehadiran dicatat melalui pemindaian QR oleh Panitia/Rayon
          </span>
          <button type="button" id="btnShortcutToQrFromAbsen" class="px-3 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold text-[10px] transition shrink-0">
            Buka QR Saya
          </button>
        </div>
      </div>
      <div class="space-y-2 pt-1">
        <div class="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 px-1">
          Status Verifikasi Kehadiran Harian (H1–H3)
        </div>
        ${days.map(d => `
          <div class="p-3.5 rounded-2xl border ${d.isHadir ? 'bg-emerald-50/60 border-emerald-300' : 'bg-slate-50 border-slate-200'} flex items-center justify-between gap-3">
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-1.5">
                <span class="text-[9px] font-extrabold px-2 py-0.5 rounded-md ${d.isHadir ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'}">
                  ${d.isHadir ? 'TERVERIFIKASI HADIR' : 'BELUM TERCATAT SCAN'}
                </span>
              </div>
              <h4 class="font-extrabold text-xs text-slate-900 mt-1">${d.label}</h4>
              <p class="text-[10px] text-slate-500 mt-0.5">${d.desc}</p>
            </div>
            <div class="shrink-0 text-right">
              <div class="w-10 h-10 rounded-2xl flex items-center justify-center text-sm font-extrabold ${
                d.isHadir
                  ? 'bg-emerald-100 text-emerald-700 border border-emerald-300'
                  : 'bg-slate-200/70 text-slate-400 border border-slate-300'
              }">
                <i class="fa-solid ${d.isHadir ? 'fa-user-check' : 'fa-qrcode'}"></i>
              </div>
              <div class="text-[9px] font-bold mt-1 ${d.isHadir ? 'text-emerald-700' : 'text-slate-400'}">
                ${d.isHadir ? 'Sah (Scan)' : 'Scan di Pos'}
              </div>
            </div>
          </div>
        `).join('')}
      </div>
      <div class="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2.5">
        <div class="font-extrabold text-xs text-slate-800 uppercase flex items-center gap-1.5">
          <i class="fa-solid fa-clipboard-check text-blue-800"></i>
          <span>Rekapitulasi Administrasi & Logistik Anda</span>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <div class="p-2.5 rounded-xl bg-white border border-slate-200">
            <div class="text-[10px] text-slate-500 font-semibold">Status Registrasi</div>
            <div class="text-xs font-extrabold mt-0.5 ${s.status_ikut === 'Ikut' ? 'text-emerald-700' : 'text-amber-700'}">
              ${s.status_ikut === 'Ikut' ? 'Terdaftar Ikut' : (s.status_ikut || 'Belum Konfirmasi')}
            </div>
            <div class="text-[9px] text-slate-400 mt-0.5 truncate">${s.waktu_registrasi || 'Via Sub Rayon / Pos 1'}</div>
          </div>
          <div class="p-2.5 rounded-xl bg-white border border-slate-200">
            <div class="text-[10px] text-slate-500 font-semibold">Kamar Penginapan</div>
            <div class="text-xs font-extrabold text-indigo-900 mt-0.5">
              <i class="fa-solid fa-bed mr-1 text-indigo-600"></i>${s.nomor_kamar || 'Belum Ditentukan'}
            </div>
            <div class="text-[9px] text-slate-400 mt-0.5">Sesuai kuota kamar</div>
          </div>
          <div class="p-2.5 rounded-xl bg-white border border-slate-200">
            <div class="text-[10px] text-slate-500 font-semibold">Kontribusi (Rp 2 Jt)</div>
            <div class="mt-1">
              <span class="text-[10px] font-extrabold px-2 py-0.5 rounded border ${bayarColor}">
                ${statusBayar}
              </span>
            </div>
            <div class="text-[9px] text-slate-400 mt-1 truncate">${s.waktu_bayar ? 'Update: ' + s.waktu_bayar.split(',')[0] : 'Belum lunas'}</div>
          </div>
          <div class="p-2.5 rounded-xl bg-white border border-slate-200">
            <div class="text-[10px] text-slate-500 font-semibold">Catatan Perijinan</div>
            <div class="text-xs font-extrabold mt-0.5 ${s.status_izin && s.status_izin !== 'Hadir Penuh (Tanpa Izin)' ? 'text-amber-700' : 'text-emerald-700'}">
              ${s.status_izin && s.status_izin !== 'Hadir Penuh (Tanpa Izin)' ? s.status_izin : 'Hadir Penuh (Normal)'}
            </div>
            <div class="text-[9px] text-slate-400 mt-0.5">Tab Perijinan di atas</div>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-2 pt-1">
          <div class="p-3 rounded-xl border ${s.ambil_kit ? 'bg-emerald-50 border-emerald-300' : 'bg-white border-slate-200'}">
            <div class="flex items-center justify-between">
              <span class="text-[10px] font-bold text-slate-600">Tas Rakor Kit & ATK</span>
              <i class="fa-solid fa-briefcase text-xs ${s.ambil_kit ? 'text-emerald-600' : 'text-slate-400'}"></i>
            </div>
            <div class="text-xs font-extrabold mt-1 ${s.ambil_kit ? 'text-emerald-800' : 'text-slate-500'}">
              ${s.ambil_kit ? 'SUDAH DITERIMA' : 'Belum Diambil'}
            </div>
            <div class="text-[9px] text-slate-400 mt-0.5 truncate">
              ${s.ambil_kit ? `${s.waktu_ambil_kit || ''} (${s.petugas_kit || 'Panitia'})` : 'Scan QR di Meja Kit'}
            </div>
          </div>
          <div class="p-3 rounded-xl border ${s.terima_transport ? 'bg-blue-50 border-blue-300' : 'bg-white border-slate-200'}">
            <div class="flex items-center justify-between">
              <span class="text-[10px] font-bold text-slate-600">Transpor Peserta</span>
              <i class="fa-solid fa-wallet text-xs ${s.terima_transport ? 'text-blue-700' : 'text-slate-400'}"></i>
            </div>
            <div class="text-xs font-extrabold mt-1 ${s.terima_transport ? 'text-blue-900' : 'text-slate-500'}">
              ${s.terima_transport ? 'SUDAH DITERIMA' : 'Belum Diterima'}
            </div>
            <div class="text-[9px] text-slate-400 mt-0.5 truncate">
              ${s.terima_transport ? `${s.waktu_terima_transport || ''} (${s.petugas_transport || 'Bendahara'})` : 'Ambil di Bendahara'}
            </div>
          </div>
        </div>
      </div>
    `;
    document.getElementById("btnShortcutToQrFromAbsen")?.addEventListener("click", () => {
      showTab("qr");
    });
  }
  const izinBanner = document.getElementById("currentIzinStatusBanner");
  if (s.status_izin && s.status_izin !== "Hadir Penuh (Tanpa Izin)") {
    izinBanner?.classList.remove("hidden");
    const bType = document.getElementById("badgeCurrentIzinType");
    const tReason = document.getElementById("textCurrentIzinReason");
    const tTime = document.getElementById("textCurrentIzinTime");
    const selIzin = document.getElementById("selectJenisIzin");
    const inpAlasan = document.getElementById("inputAlasanIzin");
    if (bType) bType.textContent = s.status_izin;
    if (tReason) tReason.textContent = s.alasan_izin || "-";
    if (tTime) tTime.textContent = `Diperbarui: ${s.waktu_izin || '-'}`;
    if (selIzin) selIzin.value = s.status_izin;
    if (inpAlasan) inpAlasan.value = s.alasan_izin || "";
  } else {
    izinBanner?.classList.add("hidden");
  }
}

async function submitPerijinanPeserta() {
  if (!activeUser || activeUser.role !== "peserta") return;
  const s = activeUser.profile;
  const status_izin = document.getElementById("selectJenisIzin")?.value || "";
  const alasan_izin = document.getElementById("inputAlasanIzin")?.value.trim() || "";
  const waktu_izin = new Date().toLocaleString("id-ID");
  if (status_izin !== "Hadir Penuh (Tanpa Izin)" && !alasan_izin) {
    return toast("Tuliskan alasan atau nama pengganti pada kolom keterangan!");
  }
  await sb.from("db_sekolah").update({
    status_izin,
    alasan_izin,
    waktu_izin
  }).eq("id_sekolah", s.id_sekolah);
  toast("Data perijinan berhasil dikirim ke Panitia!");
  await loadAllDatabase(false);
}

function renderQrView() {
  if (!activeUser) return;
  const qrBox = document.getElementById("qrCodeCanvas");
  if (!qrBox) return;
  document.getElementById("qrClickZoomHint")?.remove();
  const oldKepsekForm = document.getElementById("qrKepsekFormBox");
  if (oldKepsekForm) oldKepsekForm.classList.add("hidden");

  let qrPayloadText = "";
  let zoomTitle = "";
  let zoomSub = "";
  const roomPill = document.getElementById("qrRoomPill");
  let missingFields = [];

  if (activeUser.role === "peserta") {
    const s = sekolahList.find(x => x.id_sekolah === activeUser.profile?.id_sekolah) || activeUser.profile || {};
    const titleEl = document.getElementById("qrCardTitle");
    const subEl = document.getElementById("qrCardSubtitle");
    zoomTitle = s.nama_sekolah || "Sekolah Peserta";
    zoomSub = (s.nama_kepsek ? s.nama_kepsek + " • " : "") + "NPSN: " + (s.npsn || "-") + " • Sub Rayon " + (s.subrayon || "-");
    
    if (titleEl) titleEl.textContent = zoomTitle;
    if (subEl) subEl.textContent = zoomSub;
    if (!s.nama_kepsek || String(s.nama_kepsek).trim() === "") missingFields.push("Nama & Gelar Kepala Sekolah");
    if (!s.nip_kepsek || String(s.nip_kepsek).trim() === "") missingFields.push("NIP");
    if (!s.no_hp || String(s.no_hp).trim() === "") missingFields.push("No. WhatsApp");
    
    if (roomPill) {
      roomPill.classList.remove("hidden");
      roomPill.innerHTML = '<i class="fa-solid fa-bed mr-1"></i>Kamar: ' + (s.nomor_kamar || "Belum Ditentukan");
    }
    const pill = document.getElementById("qrStatusPill");
    if (pill) {
      if (s.status_ikut === "Ikut") {
        pill.className = "inline-block text-xs font-extrabold px-3.5 py-1 rounded-full bg-emerald-100 text-emerald-800";
        pill.textContent = "Terdaftar Ikut Rakor";
      } else if (s.status_ikut === "Tidak Ikut") {
        pill.className = "inline-block text-xs font-extrabold px-3.5 py-1 rounded-full bg-rose-100 text-rose-800";
        pill.textContent = "Tidak Ikut";
      } else {
        pill.className = "inline-block text-xs font-extrabold px-3.5 py-1 rounded-full bg-amber-100 text-amber-800";
        pill.textContent = "Menunggu Validasi Ketua Rayon / Bendahara";
      }
    }
    qrPayloadText = "PESERTA|" + (s.npsn || "") + "|" + (s.nama_sekolah || "") + "|" + (s.subrayon || "");
  } else {
    const p = panitiaList.find(x => x.id_panitia === activeUser.profile?.id_panitia) || activeUser.profile || {};
    const titleEl = document.getElementById("qrCardTitle");
    const subEl = document.getElementById("qrCardSubtitle");
    zoomTitle = p.nama_panitia || "Panitia Rakor";
    zoomSub = (p.divisi || "Panitia") + " (" + (p.jabatan || "Anggota") + ")";
    
    if (titleEl) titleEl.textContent = zoomTitle;
    if (subEl) subEl.textContent = zoomSub;
    roomPill?.classList.add("hidden");
    
    if (!p.no_hp || String(p.no_hp).trim() === "") missingFields.push("No. WhatsApp Aktif");
    const pill = document.getElementById("qrStatusPill");
    if (pill) {
      pill.className = "inline-block text-xs font-extrabold px-3.5 py-1 rounded-full bg-blue-100 text-blue-900";
      pill.textContent = p.tugas_subrayon ? "Panitia & Ketua Rayon " + p.tugas_subrayon : "Panitia Resmi Rakor K3S 2026";
    }
    qrPayloadText = "PANITIA|" + (p.id_panitia || "") + "|" + (p.nama_panitia || "") + "|" + (p.divisi || "");
  }

  let alertBox = document.getElementById("qrProfileWarningBanner");
  if (!alertBox && oldKepsekForm && oldKepsekForm.parentElement) {
    alertBox = document.createElement("div");
    alertBox.id = "qrProfileWarningBanner";
    oldKepsekForm.insertAdjacentElement("afterend", alertBox);
  }

  if (alertBox) {
    if (missingFields.length > 0) {
      alertBox.className = "mt-3 p-3.5 rounded-2xl bg-amber-50 border-2 border-amber-300 text-left space-y-2.5 shadow-md";
      alertBox.innerHTML =
        '<div class="flex items-start gap-2.5">' +
          '<div class="w-8 h-8 rounded-xl bg-amber-400 text-slate-950 flex items-center justify-center shrink-0 text-sm font-bold">' +
            '<i class="fa-solid fa-triangle-exclamation"></i>' +
          '</div>' +
          '<div class="min-w-0 flex-1">' +
            '<h4 class="text-xs font-extrabold text-amber-950">Data Profil Belum Lengkap!</h4>' +
            '<p class="text-[10px] text-amber-900 leading-relaxed mt-0.5">' +
              'Mohon lengkapi <b>' + missingFields.join(", ") + '</b> pada menu Profil untuk keperluan pencetakan E-Sertifikat & Logistik.' +
            '</p>' +
          '</div>' +
        '</div>' +
        '<button type="button" id="btnOpenProfileFromQrAlert" class="w-full py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-extrabold flex items-center justify-center gap-1.5 transition">' +
          '<i class="fa-solid fa-user-pen"></i>' +
          '<span>Lengkapi Data di Menu Profil Sekarang</span>' +
        '</button>';
      document.getElementById("btnOpenProfileFromQrAlert")?.addEventListener("click", () => {
        document.getElementById("topUserAvatar")?.click();
      });
    } else {
      alertBox.className = "mt-3 p-2.5 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-between";
      alertBox.innerHTML =
        '<div class="flex items-center gap-2 text-[11px] font-bold text-emerald-900">' +
          '<i class="fa-solid fa-circle-check text-emerald-600"></i>' +
          '<span>Biodata Profil & Sertifikat Lengkap</span>' +
        '</div>' +
        '<button type="button" id="btnEditProfileFromQr" class="text-[10px] font-extrabold text-blue-800 hover:underline">' +
          'Ubah Profil' +
        '</button>';
      document.getElementById("btnEditProfileFromQr")?.addEventListener("click", () => {
        document.getElementById("topUserAvatar")?.click();
      });
    }
  }

  qrBox.innerHTML = "";
  qrBox.className = "w-[210px] mx-auto bg-white p-3 rounded-3xl border-2 border-slate-200 flex flex-col items-center gap-2 shadow-xl cursor-pointer hover:border-amber-400 transition";
  qrBox.title = "Ketuk untuk memperbesar QR Code";
  
  const innerQrHolder = document.createElement("div");
  innerQrHolder.className = "w-[170px] h-[170px] flex items-center justify-center mx-auto";
  qrBox.appendChild(innerQrHolder);
  
  const hintBadge = document.createElement("div");
  hintBadge.className = "w-full py-1 px-2 rounded-xl bg-blue-50 text-blue-900 border border-blue-200/80 text-[9px] font-extrabold flex items-center justify-center gap-1";
  hintBadge.innerHTML = '<i class="fa-solid fa-magnifying-glass-plus text-blue-700"></i> <span>Ketuk QR untuk Perbesar</span>';
  qrBox.appendChild(hintBadge);

  const encoded = encodeURIComponent(qrPayloadText);
  const fallbackImgUrl = "https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=6&data=" + encoded;
  
  let localSuccess = false;
  if (typeof window.QRCode === "function") {
    try {
      new window.QRCode(innerQrHolder, {
        text: qrPayloadText,
        width: 170,
        height: 170,
        colorDark: "#0f172a",
        colorLight: "#ffffff"
      });
      setTimeout(() => {
        const hasCanvasOrImg = innerQrHolder.querySelector("canvas, img");
        if (!hasCanvasOrImg) {
          innerQrHolder.innerHTML = '<img src="' + fallbackImgUrl + '" alt="QR Code" class="w-[170px] h-[170px] object-contain">';
        }
      }, 80);
      localSuccess = true;
    } catch (e) {
      localSuccess = false;
    }
  }
  if (!localSuccess) {
    innerQrHolder.innerHTML = '<img src="' + fallbackImgUrl + '" alt="QR Code" class="w-[170px] h-[170px] object-contain">';
  }
  qrBox.onclick = () => openFullscreenQrZoomModal(qrPayloadText, zoomTitle, zoomSub);
}

function openFullscreenQrZoomModal(qrPayloadText, titleText, subText) {
  let zoomOverlay = document.getElementById("fullscreenQrZoomOverlay");
  if (!zoomOverlay) {
    zoomOverlay = document.createElement("div");
    zoomOverlay.id = "fullscreenQrZoomOverlay";
    document.body.appendChild(zoomOverlay);
  }
  const encoded = encodeURIComponent(qrPayloadText);
  const bigQrUrl = "https://api.qrserver.com/v1/create-qr-code/?size=420x420&margin=10&data=" + encoded;
  
  zoomOverlay.className = "fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-md flex flex-col items-center justify-center p-4";
  zoomOverlay.innerHTML =
    '<div class="w-full max-w-sm bg-white rounded-3xl p-6 text-center space-y-4 shadow-2xl border-4 border-amber-400">' +
      '<div class="space-y-1">' +
        '<span class="text-[10px] font-extrabold uppercase tracking-widest bg-blue-900 text-amber-300 px-3 py-1 rounded-full">QR Code Resmi</span>' +
        '<h3 class="text-base font-extrabold text-slate-900 pt-1">' + titleText + '</h3>' +
        '<p class="text-xs font-bold text-slate-500">' + subText + '</p>' +
      '</div>' +
      '<div id="zoomBigQrBox" class="w-[270px] h-[270px] mx-auto bg-white p-3 rounded-3xl border-4 border-slate-900 flex items-center justify-center shadow-inner"></div>' +
      '<p class="text-[11px] font-bold text-emerald-800 bg-emerald-50 py-2 px-3 rounded-xl border border-emerald-200">' +
        '<i class="fa-solid fa-sun text-amber-500 mr-1"></i> Arahkan layar ini ke kamera petugas meja layanan' +
      '</p>' +
      '<button type="button" id="btnCloseBigQrZoom" class="w-full py-3 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs transition">' +
        '<i class="fa-solid fa-compress mr-1.5"></i> Tutup Mode Layar Penuh' +
      '</button>' +
    '</div>';

  const bigBox = document.getElementById("zoomBigQrBox");
  if (bigBox) {
    let drawn = false;
    if (typeof window.QRCode === "function") {
      try {
        new window.QRCode(bigBox, {
          text: qrPayloadText,
          width: 240,
          height: 240,
          colorDark: "#0f172a",
          colorLight: "#ffffff"
        });
        drawn = true;
      } catch (e) {
        drawn = false;
      }
    }
    if (!drawn) {
      bigBox.innerHTML = '<img src="' + bigQrUrl + '" alt="QR Besar" class="w-[240px] h-[240px] object-contain">';
    }
  }
  zoomOverlay.onclick = (e) => {
    if (e.target === zoomOverlay || e.target.closest("#btnCloseBigQrZoom")) {
      zoomOverlay.classList.add("hidden");
    }
  };
}

async function saveNamaKepsek() {
  if (!activeUser || activeUser.role !== "peserta") return;
  const val = document.getElementById("qrInputNamaKepsek")?.value.trim() || "";
  await sb.from("db_sekolah").update({ nama_kepsek: val }).eq("id_sekolah", activeUser.profile.id_sekolah);
  toast("Nama Kepala Sekolah berhasil disimpan!");
  await loadAllDatabase(false);
}

function renderSubrayonView() {
  const sr = document.getElementById("srSelectFilter")?.value || "Maulafa";
  const kw = document.getElementById("srSearchInput")?.value.toLowerCase() || "";
  const allSr = sekolahList.filter(s => s.subrayon === sr);
  
  const canEditThisRayon = Boolean(
    activeUser && (
      activeUser.role === "bendahara" || 
      (activeUser.role === "panitia" && (
        ["Ketua Panitia", "Sekretaris", "Bendahara"].includes(activeUser.profile?.divisi) || 
        activeUser.profile?.tugas_subrayon === sr
      ))
    )
  );

  const canSeeFinanceBtn = Boolean(
    activeUser && (
      activeUser.role === "bendahara" ||
      (activeUser.role === "panitia" && ["Ketua Panitia", "Sekretaris", "Bendahara"].includes(activeUser.profile?.divisi))
    )
  );

  const titleEl = document.getElementById("srHeaderTitle");
  const subTitleEl = document.getElementById("srHeaderSubtitle");
  const ketua = panitiaList.find(p => p.tugas_subrayon === sr);
  const ikutCount = allSr.filter(s => s.status_ikut === "Ikut").length;
  
  if (titleEl) titleEl.textContent = `Sub Rayon ${sr}`;
  if (subTitleEl) {
    subTitleEl.textContent = `Ketua Rayon: ${ketua ? ketua.nama_panitia : 'Belum Ditentukan'} • ${ikutCount} dari ${allSr.length} Sekolah Ikut`;
  }

  const cardsContainer = document.getElementById("srSchoolCardsContainer");
  if (!cardsContainer) return;

  const filtered = allSr.filter(
    s => s.nama_sekolah.toLowerCase().includes(kw) || String(s.npsn).includes(kw)
  );
  
  cardsContainer.innerHTML = "";
  if (filtered.length === 0) {
    cardsContainer.innerHTML = `<div class="bg-white rounded-3xl p-6 text-center border text-xs text-slate-500">Tidak ada sekolah yang sesuai pencarian.</div>`;
    return;
  }

  filtered.forEach((s, i) => {
    const isIkut = s.status_ikut === "Ikut";
    const isTidak = s.status_ikut === "Tidak Ikut";
    const statusBayar = s.status_bayar || "Belum Bayar";
    const jenjang = s.nama_sekolah.toLowerCase().includes("mi") ? "MI" : s.nama_sekolah.toLowerCase().includes("mts") ? "MTs" : "MA";
    const waClean = String(s.no_hp || "").replace(/\D/g, "").replace(/^0/, "62");
    
    const bayarBadgeStyle = statusBayar === "Lunas"
      ? "bg-emerald-100 text-emerald-800 border-emerald-300"
      : statusBayar === "Dalam Proses"
      ? "bg-amber-100 text-amber-800 border-amber-300"
      : "bg-rose-50 text-rose-700 border-rose-200";

    const card = document.createElement("div");
    card.className = `bg-white rounded-2xl p-3.5 border ${isIkut ? 'border-emerald-300' : isTidak ? 'border-rose-200' : 'border-slate-200'} shadow-sm space-y-2.5`;
    card.innerHTML = `
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-1.5 flex-wrap">
            <span class="text-[10px] font-extrabold text-slate-400">#${i + 1}</span>
            <span class="text-[10px] font-mono bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">${s.npsn}</span>
            <span class="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-blue-100 text-blue-800">${jenjang}</span>
            ${s.nomor_kamar && s.nomor_kamar !== 'Belum Ditentukan' ? `<span class="text-[10px] font-bold bg-indigo-50 text-indigo-800 px-1.5 py-0.5 rounded"><i class="fa-solid fa-bed mr-1"></i>${s.nomor_kamar}</span>` : ''}
          </div>
          <h4 class="font-extrabold text-xs text-slate-900 truncate mt-1">${s.nama_sekolah}</h4>
          <p class="text-[10px] text-slate-500 truncate">Kepsek: <b>${s.nama_kepsek || 'Belum Diisi'}</b> • Kel. ${s.kelurahan || '-'}</p>
        </div>
        ${canEditThisRayon ? `
          <div class="flex items-center gap-1 shrink-0">
            <button type="button" class="btn-ikut px-2.5 py-1.5 rounded-xl text-[11px] font-extrabold transition ${isIkut ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-emerald-100'}">Ikut</button>
            <button type="button" class="btn-tidak px-2 py-1.5 rounded-xl text-[11px] font-bold transition ${isTidak ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-rose-100'}">Batal</button>
          </div>
        ` : `
          <span class="text-[10px] font-extrabold px-2.5 py-1 rounded-xl shrink-0 ${isIkut ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}">
            ${s.status_ikut}
          </span>
        `}
      </div>
      <div class="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
        <div class="flex items-center gap-1.5 min-w-0">
          <i class="fa-solid fa-money-bill-wave text-xs ${statusBayar === 'Lunas' ? 'text-emerald-600' : 'text-slate-400'}"></i>
          <span class="text-[10px] font-bold text-slate-600">Kontribusi:</span>
          <span class="text-[10px] font-extrabold px-2 py-0.5 rounded-md border ${bayarBadgeStyle}">
            ${statusBayar === 'Lunas' ? 'LUNAS' : statusBayar === 'Dalam Proses' ? 'PROSES' : 'BELUM BAYAR'}
          </span>
        </div>
        ${canEditThisRayon ? `
          <select class="select-status-bayar rounded-xl border border-slate-300 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-800">
            <option value="Belum Bayar" ${statusBayar === 'Belum Bayar' ? 'selected' : ''}>Belum Bayar</option>
            <option value="Dalam Proses" ${statusBayar === 'Dalam Proses' ? 'selected' : ''}>Dalam Proses</option>
            <option value="Lunas" ${statusBayar === 'Lunas' ? 'selected' : ''}>Lunas</option>
          </select>
        ` : `
          <span class="text-[10px] font-bold text-slate-400">${s.waktu_bayar ? s.waktu_bayar.split(',')[0] : ''}</span>
        `}
      </div>
    `;

    if (canEditThisRayon) {
      card.querySelector(".btn-ikut")?.addEventListener("click", () => setSchoolStatus(s.id_sekolah, sr, "Ikut"));
      card.querySelector(".btn-tidak")?.addEventListener("click", () => setSchoolStatus(s.id_sekolah, sr, "Tidak Ikut"));
      card.querySelector(".select-status-bayar")?.addEventListener("change", (e) => {
        setSchoolPaymentStatus(s.id_sekolah, sr, e.target.value);
      });
    }
    cardsContainer.appendChild(card);
  });

  let shortcutBar = document.getElementById("srFinanceShortcutBar");
  if (!shortcutBar && cardsContainer && cardsContainer.parentElement) {
    shortcutBar = document.createElement("div");
    shortcutBar.id = "srFinanceShortcutBar";
    cardsContainer.parentElement.insertBefore(shortcutBar, cardsContainer);
  }
  if (shortcutBar) {
    if (canSeeFinanceBtn) {
      const srLunas = allSr.filter(s => s.status_bayar === "Lunas").length;
      shortcutBar.className = "p-3 rounded-2xl bg-slate-900 text-white flex items-center justify-between gap-2 shadow-md mb-3";
      shortcutBar.innerHTML = `
        <div>
          <div class="text-[10px] font-bold text-amber-300 uppercase">Kas Sub Rayon ${sr} (${srLunas}/${allSr.length} Lunas)</div>
          <div class="text-xs font-extrabold text-white">${formatRupiah(srLunas * tarifKontribusiDefault)}</div>
        </div>
        <button type="button" id="btnOpenKeuFromRayon" class="px-3 py-1.5 rounded-xl bg-amber-400 text-slate-950 font-extrabold text-[10px] transition hover:bg-amber-300">
          <i class="fa-solid fa-sack-dollar mr-1"></i>Buka Info Keuangan
        </button>
      `;
      document.getElementById("btnOpenKeuFromRayon")?.addEventListener("click", () => {
        openInfoKeuanganModal(activeUser, sekolahList, panitiaList, tarifKontribusiDefault, () => loadAllDatabase(false));
      });
    } else {
      shortcutBar.className = "hidden";
      shortcutBar.innerHTML = "";
    }
  }
}

async function setSchoolStatus(idSekolah, targetSubrayon, statusBaru) {
  if (!canEditPaymentAndParticipation(activeUser, targetSubrayon)) {
    return toast("Akses Ditolak: Hanya Ketua Sub Rayon wilayah ini dan Bendahara yang berwenang!");
  }
  const updatePayload = {
    status_ikut: statusBaru,
    waktu_registrasi: new Date().toLocaleString("id-ID")
  };
  if (statusBaru === "Tidak Ikut") {
    updatePayload.nomor_kamar = "Belum Ditentukan";
    updatePayload.hadir_h1 = false;
    updatePayload.hadir_h2 = false;
    updatePayload.hadir_h3 = false;
    updatePayload.ambil_kit = false;
    updatePayload.terima_transport = false;
  }
  await sb.from("db_sekolah").update(updatePayload).eq("id_sekolah", idSekolah);
  toast(
    statusBaru === "Tidak Ikut"
      ? "Status diubah ke Tidak Ikut & alokasi kamar dikosongkan."
      : `Status keikutsertaan: ${statusBaru}`
  );
  await loadAllDatabase(false);
}

async function setSchoolPaymentStatus(idSekolah, targetSubrayon, statusBayarBaru) {
  if (!canEditPaymentAndParticipation(activeUser, targetSubrayon)) {
    return toast("Akses Ditolak: Hanya Ketua Sub Rayon wilayah ini dan Bendahara yang berwenang!");
  }
  const petugas = activeUser?.profile?.nama_panitia || "Bendahara/Rayon";
  const waktu = new Date().toLocaleString("id-ID");
  const updatePayload = {
    status_bayar: statusBayarBaru,
    nominal_kontribusi: statusBayarBaru === "Lunas" ? tarifKontribusiDefault : 0,
    waktu_bayar: waktu,
    petugas_bayar: petugas
  };
  if (statusBayarBaru === "Lunas" || statusBayarBaru === "Dalam Proses") {
    updatePayload.status_ikut = "Ikut";
  }
  await sb.from("db_sekolah").update(updatePayload).eq("id_sekolah", idSekolah);
  toast(`Status kontribusi: ${statusBayarBaru}`);
  await loadAllDatabase(false);
}

async function markAllSubrayonIkut() {
  const sr = document.getElementById("srSelectFilter")?.value || "Maulafa";
  if (!canEditPaymentAndParticipation(activeUser, sr)) {
    return toast("Hanya Ketua Sub Rayon wilayah ini dan Bendahara yang berwenang!");
  }
  if (!confirm(`Tandai seluruh sekolah di Sub Rayon ${sr} sebagai IKUT?`)) return;
  await sb.from("db_sekolah").update({
    status_ikut: "Ikut",
    waktu_registrasi: new Date().toLocaleString("id-ID")
  }).eq("subrayon", sr);
  toast(`Seluruh sekolah Sub Rayon ${sr} ditandai Ikut!`);
  await loadAllDatabase(false);
}

function renderKinerjaView() {
  const total = tugasList.length;
  const done = tugasList.filter(t => t.status === "Selesai").length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  
  const bigPctEl = document.getElementById("kinerjaBigPercent");
  const subCntEl = document.getElementById("kinerjaSubtitleCount");
  const bigBarEl = document.getElementById("kinerjaBigBar");
  
  if (bigPctEl) bigPctEl.textContent = pct + "%";
  if (subCntEl) subCntEl.textContent = `${done} dari ${total} Tugas Selesai`;
  if (bigBarEl) bigBarEl.style.width = pct + "%";

  const phases = ["Perencanaan", "Persiapan", "Pelaksanaan", "Pasca-Acara"];
  const pGrid = document.getElementById("kinerjaPhaseGrid");
  if (pGrid) {
    pGrid.innerHTML = "";
    phases.forEach(ph => {
      const allP = tugasList.filter(t => t.tahapan === ph);
      const doneP = allP.filter(t => t.status === "Selesai").length;
      const pctP = allP.length > 0 ? Math.round((doneP / allP.length) * 100) : 0;
      
      const item = document.createElement("div");
      item.className = "bg-white/10 hover:bg-white/20 rounded-2xl p-2 cursor-pointer transition";
      item.innerHTML = `
        <div class="text-xs font-extrabold text-amber-300">${pctP}%</div>
        <div class="text-[9px] text-blue-100 font-bold truncate">${ph}</div>
        <div class="text-[9px] text-blue-300">${doneP}/${allP.length}</div>
      `;
      item.addEventListener("click", () => {
        const phSel = document.getElementById("taskFilterPhase");
        if (phSel) phSel.value = ph;
        renderTaskListView();
      });
      pGrid.appendChild(item);
    });
  }

  const dBars = document.getElementById("kinerjaDivisiBars");
  if (dBars) {
    dBars.innerHTML = "";
    DIVISI_LIST.forEach(div => {
      const allD = tugasList.filter(t => t.divisi === div);
      const doneD = allD.filter(t => t.status === "Selesai").length;
      const pctD = allD.length > 0 ? Math.round((doneD / allD.length) * 100) : 0;
      const color = pctD === 100 ? "bg-emerald-500" : pctD > 0 ? "bg-blue-600" : "bg-slate-300";
      
      const row = document.createElement("div");
      row.className = "p-3 rounded-2xl bg-slate-50 hover:bg-blue-50/50 border border-slate-200 cursor-pointer transition";
      row.innerHTML = `
        <div class="flex justify-between items-center text-xs font-bold mb-1">
          <span class="text-slate-800 truncate pr-2">${div}</span>
          <span class="text-blue-900 font-extrabold shrink-0">${doneD}/${allD.length} (${pctD}%)</span>
        </div>
        <div class="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
          <div class="${color} h-full rounded-full transition-all duration-300" style="width:${pctD}%"></div>
        </div>
      `;
      row.addEventListener("click", () => {
        const divSel = document.getElementById("taskFilterDivisi");
        if (divSel) divSel.value = div;
        renderTaskListView();
      });
      dBars.appendChild(row);
    });
  }
  renderTaskListView();
}

function canManageMasterTasks(user) {
  return Boolean(
    user &&
    user.role === "panitia" &&
    user.profile &&
    ["Ketua Panitia", "Sekretaris"].includes(user.profile.divisi)
  );
}

function canToggleDivisionTask(user, targetDivisi) {
  if (!user || user.role !== "panitia" || !user.profile) return false;
  const userDivisi = user.profile.divisi;
  if (["Ketua Panitia", "Sekretaris"].includes(userDivisi)) return true;
  return userDivisi === targetDivisi;
}

function renderTaskListView() {
  const ph = document.getElementById("taskFilterPhase")?.value || "ALL";
  const div = document.getElementById("taskFilterDivisi")?.value || "ALL";
  const canEditMaster = canManageMasterTasks(activeUser);
  const btnAddTop = document.getElementById("btnAddTaskTop");
  
  if (btnAddTop) {
    btnAddTop.classList.toggle("hidden", !canEditMaster);
  }

  let list = tugasList;
  if (ph !== "ALL") list = list.filter(t => t.tahapan === ph);
  if (div !== "ALL") list = list.filter(t => t.divisi === div);

  const box = document.getElementById("taskCardsContainer");
  if (!box) return;
  box.innerHTML = "";
  
  if (list.length === 0) {
    box.innerHTML = `<div class="bg-white rounded-3xl p-6 text-center border text-xs text-slate-500">Belum ada rincian tugas untuk filter ini.</div>`;
    return;
  }

  list.forEach(t => {
    const isDone = t.status === "Selesai";
    const canToggleThis = canToggleDivisionTask(activeUser, t.divisi);
    const pillStyle = isDone
      ? "bg-emerald-100 text-emerald-800"
      : t.status === "Sedang Berjalan"
      ? "bg-amber-100 text-amber-800"
      : "bg-slate-100 text-slate-600";

    const card = document.createElement("div");
    card.className = `bg-white rounded-2xl p-3.5 border ${isDone ? 'border-emerald-300 bg-emerald-50/20' : 'border-slate-200'} flex items-start gap-3 shadow-sm`;
    card.innerHTML = `
      <button type="button" title="${canToggleThis ? 'Centang Progres Kinerja' : 'Terkunci: Hanya untuk ' + t.divisi}" class="btn-toggle-task w-7 h-7 rounded-xl border flex items-center justify-center shrink-0 mt-0.5 transition ${
        canToggleThis
          ? (isDone ? 'bg-emerald-600 border-emerald-600 text-white active:scale-90 cursor-pointer' : 'border-slate-300 hover:border-emerald-500 bg-slate-50 text-slate-400 cursor-pointer')
          : (isDone ? 'bg-emerald-600/50 border-emerald-600/50 text-white opacity-60 cursor-not-allowed' : 'bg-slate-100 border-slate-200 text-slate-300 cursor-not-allowed')
      }">
        <i class="fa-solid ${canToggleThis ? 'fa-check text-xs' : (isDone ? 'fa-check text-xs' : 'fa-lock text-[10px])'}"></i>
      </button>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-1.5 flex-wrap">
          <span class="text-[10px] font-extrabold px-2 py-0.5 rounded-md ${pillStyle}">${t.status}</span>
          <span class="text-[10px] font-bold bg-blue-50 text-blue-800 px-2 py-0.5 rounded-md">${t.tahapan}</span>
          ${!canToggleThis ? `<span class="text-[9px] font-bold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">Divisi: ${t.divisi}</span>` : ''}
        </div>
        <h4 class="font-extrabold text-xs text-slate-900 mt-1 ${isDone ? 'line-through text-slate-400' : ''}">${t.nama_pekerjaan}</h4>
        <p class="text-[10px] text-slate-500 mt-0.5">${t.divisi} • Deadline: ${t.deadline || '-'}</p>
      </div>
      ${canEditMaster ? `
        <div class="flex flex-col gap-1 shrink-0">
          <button type="button" title="Edit Tugas" class="btn-edit-task w-7 h-7 rounded-lg bg-slate-100 hover:bg-blue-100 text-blue-700 flex items-center justify-center text-xs transition"><i class="fa-solid fa-pen"></i></button>
          <button type="button" title="Hapus Tugas" class="btn-del-task w-7 h-7 rounded-lg bg-slate-100 hover:bg-rose-100 text-rose-600 flex items-center justify-center text-xs transition"><i class="fa-solid fa-trash"></i></button>
        </div>
      ` : ''}
    `;

    card.querySelector(".btn-toggle-task")?.addEventListener("click", async () => {
      if (!canToggleDivisionTask(activeUser, t.divisi)) {
        return toast(`Akses Ditolak: Anda hanya dapat mencentang kinerja ${activeUser?.profile?.divisi || 'divisi Anda'}!`);
      }
      const next = isDone ? "Belum Mulai" : "Selesai";
      await sb.from("manajemen_tugas").update({
        status: next,
        waktu_update: new Date().toLocaleString("id-ID")
      }).eq("id_tugas", t.id_tugas);
      toast(`Status tugas: ${next}`);
      await loadAllDatabase(false);
    });

    if (canEditMaster) {
      card.querySelector(".btn-edit-task")?.addEventListener("click", () => openTaskModal(t.id_tugas));
      card.querySelector(".btn-del-task")?.addEventListener("click", async () => {
        if (!canManageMasterTasks(activeUser)) {
          return toast("Akses Ditolak: Hanya Ketua Panitia & Sekretaris yang dapat menghapus tugas!");
        }
        if (!confirm("Hapus tugas kepanitiaan ini?")) return;
        await sb.from("manajemen_tugas").delete().eq("id_tugas", t.id_tugas);
        toast("Tugas dihapus.");
        await loadAllDatabase(false);
      });
    }
    box.appendChild(card);
  });
}

function openTaskModal(idTugas = null) {
  if (!canManageMasterTasks(activeUser)) {
    return toast("Akses Ditolak: Hanya Ketua Panitia & Sekretaris yang dapat menambah atau mengedit tugas!");
  }
  document.getElementById("taskModal")?.classList.remove("hidden");
  if (idTugas) {
    const t = tugasList.find(x => x.id_tugas === idTugas);
    if (!t) return;
    document.getElementById("modalTaskHeader").textContent = "Edit Tugas Kepanitiaan";
    document.getElementById("modalTaskId").value = t.id_tugas;
    document.getElementById("modalTaskName").value = t.nama_pekerjaan;
    document.getElementById("modalTaskDivisi").value = t.divisi;
    document.getElementById("modalTaskPhase").value = t.tahapan;
    document.getElementById("modalTaskDeadline").value = t.deadline || "2026-11-25";
    document.getElementById("modalTaskStatus").value = t.status;
  } else {
    document.getElementById("modalTaskHeader").textContent = "Tambah Tugas Baru";
    document.getElementById("modalTaskId").value = "";
    document.getElementById("modalTaskName").value = "";
    document.getElementById("modalTaskDeadline").value = "2026-11-25";
    document.getElementById("modalTaskStatus").value = "Belum Mulai";
  }
}

function closeTaskModal() {
  document.getElementById("taskModal")?.classList.add("hidden");
}

async function saveTaskModal() {
  if (!canManageMasterTasks(activeUser)) {
    return toast("Akses Ditolak: Hanya Ketua Panitia & Sekretaris yang berwenang!");
  }
  const id = document.getElementById("modalTaskId").value;
  const nama_pekerjaan = document.getElementById("modalTaskName").value.trim();
  const divisi = document.getElementById("modalTaskDivisi").value;
  const tahapan = document.getElementById("modalTaskPhase").value;
  const deadline = document.getElementById("modalTaskDeadline").value;
  const status = document.getElementById("modalTaskStatus").value;
  const waktu_update = new Date().toLocaleString("id-ID");

  if (!nama_pekerjaan) return toast("Nama pekerjaan wajib diisi!");

  if (id) {
    await sb.from("manajemen_tugas").update({ nama_pekerjaan, divisi, tahapan, deadline, status, waktu_update }).eq("id_tugas", id);
    toast("Tugas diperbarui!");
  } else {
    const newId = "TGS-" + Math.floor(100000 + Math.random() * 900000);
    await sb.from("manajemen_tugas").insert([{ id_tugas: newId, nama_pekerjaan, divisi, tahapan, pic: "PAN-ADMIN", deadline, status, waktu_update }]);
    toast("Tugas baru ditambahkan!");
  }
  closeTaskModal();
  await loadAllDatabase(false);
}
