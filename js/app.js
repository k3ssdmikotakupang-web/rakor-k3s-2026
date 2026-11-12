// js/app.js
import { sb, toast } from './supabase.js';
import { initLogin } from './login.js';
import { initJadwal, renderLiveJadwal, checkSecretaryPrivilege, filterDay } from './jadwal.js';
import { openRoomManagerModal } from './kamar.js';
import { openLayananDocumentModal, DEFAULT_LAYANAN } from './layanan.js';
import { openDokumentasiModal } from './dokumentasi.js';
import { openSertifikatModal, checkCertificateVerificationUrl } from './sertifikat.js';
import { renderPosScannerWidgets } from './scanner_pos.js';

// Hilangkan error favicon.ico 404 di Console secara otomatis
if (!document.querySelector("link[rel*='icon']")) {
  const link = document.createElement("link");
  link.rel = "icon";
  link.href = "data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🎓</text></svg>";
  document.head.appendChild(link);
}

let activeUser = null;
let panitiaList = [];
let sekolahList = [];
let tugasList = [];
let layananList = [];

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

    const pSelect = document.getElementById("loginPanitiaSelect");
    if (pSelect) {
      const prev = pSelect.value;
      pSelect.innerHTML = `<option value="">Pilih Nama Panitia (${panitiaList.length} Orang)</option>`;
      panitiaList.forEach(p => {
        const srTag = p.tugas_subrayon ? ` ★ Ketua Rayon ${p.tugas_subrayon}` : "";
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
      btn.className = "flex flex-col items-center justify-center py-1 text-blue-900 font-extrabold scale-105 transition-all";
    } else {
      btn.className = "flex flex-col items-center justify-center py-1 text-slate-400 font-semibold hover:text-slate-600 transition-all";
    }
  });

  const qrBtn = document.getElementById("footerBtnQr");
  if (qrBtn) {
    if (name === "qr") {
      qrBtn.className = "-mt-6 w-14 h-14 rounded-2xl bg-gradient-to-tr from-amber-400 to-yellow-300 text-slate-950 shadow-xl shadow-amber-500/40 border-4 border-white flex flex-col items-center justify-center scale-105 transition-all";
      const span = qrBtn.querySelector("span");
      if (span) span.className = "text-[9px] font-extrabold text-slate-950 leading-none mt-0.5";
    } else {
      qrBtn.className = "-mt-6 w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-900 to-indigo-700 text-amber-300 shadow-lg shadow-blue-900/40 border-4 border-white flex flex-col items-center justify-center transition-all";
      const span = qrBtn.querySelector("span");
      if (span) span.className = "text-[9px] font-extrabold text-white leading-none mt-0.5";
    }
  }

  renderAllViews();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderAllViews() {
  renderBerandaView();
  renderLiveJadwal();
  renderQrView();
  renderSubrayonView();
  renderAbsensiPesertaView();
  renderPosScannerWidgets(activeUser, sekolahList, () => loadAllDatabase(false));
  if (activeUser && activeUser.role === "panitia") {
    renderKinerjaView();
  }
}

function renderBerandaView() {
  const totalSek = sekolahList.length || 158;
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
    const hadirCount = [s.hadir_h1, s.hadir_h2, s.hadir_h3].filter(Boolean).length;
    if (thirdVal) thirdVal.textContent = `${hadirCount}/3 Hari`;
    if (thirdLbl) thirdLbl.textContent = "Kehadiran Anda";
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
        <span class="text-slate-800">Sub Rayon ${sr} <span class="text-[10px] font-normal text-slate-500">(${ketua ? ketua.nama_panitia.split(',')[0] : ''})</span></span>
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
  if (subEl) subEl.textContent = `${s.nama_sekolah} • Sub Rayon ${s.subrayon}`;

  const days = [
    { key: "hadir_h1", label: "Hari Ke-1 • Kamis, 24 Sept 2026", desc: "Registrasi, Pembukaan & Materi Kebijakan Dinas P&K" },
    { key: "hadir_h2", label: "Hari Ke-2 • Jumat, 25 Sept 2026", desc: "Sidang Komisi & Penyusunan Program Kerja K3S" },
    { key: "hadir_h3", label: "Hari Ke-3 • Sabtu, 26 Sept 2026", desc: "Perumusan Hasil Rakor & Penutupan Resmi" }
  ];

  const box = document.getElementById("absensiDaysContainer");
  if (box) {
    box.innerHTML = "";
    days.forEach((d, idx) => {
      const isHadir = Boolean(s[d.key]);
      const card = document.createElement("div");
      card.className = `p-3.5 rounded-2xl border ${isHadir ? 'bg-emerald-50/50 border-emerald-300' : 'bg-slate-50 border-slate-200'} flex items-center justify-between gap-3`;
      card.innerHTML = `
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-1.5">
            <span class="text-[10px] font-extrabold px-2 py-0.5 rounded-md ${isHadir ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700'}">
              ${isHadir ? '✓ HADIR' : 'BELUM PRESENSI'}
            </span>
          </div>
          <h4 class="font-extrabold text-xs text-slate-900 mt-1">${d.label}</h4>
          <p class="text-[10px] text-slate-500 mt-0.5">${d.desc}</p>
        </div>
        <button class="btn-checkin px-3.5 py-2.5 rounded-xl text-xs font-extrabold shrink-0 transition ${
          isHadir
            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
            : 'bg-blue-900 text-white shadow'
        }">
          ${isHadir ? 'Tercatat' : 'Konfirmasi Hadir'}
        </button>
      `;

      card.querySelector(".btn-checkin").addEventListener("click", async () => {
        const nextVal = !isHadir;
        const updateObj = { [d.key]: nextVal };
        if (nextVal) updateObj.status_ikut = "Ikut";
        await sb.from("db_sekolah").update(updateObj).eq("id_sekolah", s.id_sekolah);
        toast(nextVal ? `Presensi Hari Ke-${idx + 1} berhasil dicatat!` : `Presensi Hari Ke-${idx + 1} dibatalkan.`);
        await loadAllDatabase(false);
      });

      box.appendChild(card);
    });
  }

  const izinBanner = document.getElementById("currentIzinStatusBanner");
  if (s.status_izin && s.status_izin !== "Hadir Penuh (Tanpa Izin)") {
    izinBanner?.classList.remove("hidden");
    document.getElementById("badgeCurrentIzinType").textContent = s.status_izin;
    document.getElementById("textCurrentIzinReason").textContent = s.alasan_izin || "-";
    document.getElementById("textCurrentIzinTime").textContent = `Diperbarui: ${s.waktu_izin || '-'}`;
    document.getElementById("selectJenisIzin").value = s.status_izin;
    document.getElementById("inputAlasanIzin").value = s.alasan_izin || "";
  } else {
    izinBanner?.classList.add("hidden");
  }
}

async function submitPerijinanPeserta() {
  if (!activeUser || activeUser.role !== "peserta") return;
  const s = activeUser.profile;
  const status_izin = document.getElementById("selectJenisIzin").value;
  const alasan_izin = document.getElementById("inputAlasanIzin").value.trim();
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
  qrBox.innerHTML = "";

  let qrPayloadText = "";
  const roomPill = document.getElementById("qrRoomPill");

  if (activeUser.role === "peserta") {
    const s = sekolahList.find(x => x.id_sekolah === activeUser.profile.id_sekolah) || activeUser.profile;
    document.getElementById("qrCardTitle").textContent = s.nama_sekolah;
    document.getElementById("qrCardSubtitle").textContent = `NPSN: ${s.npsn} • Sub Rayon ${s.subrayon}`;
    document.getElementById("qrKepsekFormBox")?.classList.remove("hidden");
    const inpKepsek = document.getElementById("qrInputNamaKepsek");
    if (inpKepsek) inpKepsek.value = s.nama_kepsek || "";

    if (roomPill) {
      roomPill.classList.remove("hidden");
      roomPill.innerHTML = `<i class="fa-solid fa-bed mr-1"></i>Kamar: ${s.nomor_kamar || 'Belum Ditentukan'}`;
    }

    const pill = document.getElementById("qrStatusPill");
    if (pill) {
      if (s.status_ikut === "Ikut") {
        pill.className = "inline-block text-xs font-extrabold px-3.5 py-1 rounded-full bg-emerald-100 text-emerald-800";
        pill.textContent = "✓ Terdaftar Ikut Rakor";
      } else if (s.status_ikut === "Tidak Ikut") {
        pill.className = "inline-block text-xs font-extrabold px-3.5 py-1 rounded-full bg-rose-100 text-rose-800";
        pill.textContent = "✕ Tidak Ikut";
      } else {
        pill.className = "inline-block text-xs font-extrabold px-3.5 py-1 rounded-full bg-amber-100 text-amber-800";
        pill.textContent = "Menunggu Checklist Rayon";
      }
    }

    qrPayloadText = `PESERTA|${s.npsn}|${s.nama_sekolah}|${s.subrayon}`;
  } else {
    const p = activeUser.profile;
    document.getElementById("qrCardTitle").textContent = p.nama_panitia;
    document.getElementById("qrCardSubtitle").textContent = `${p.divisi} (${p.jabatan})`;
    document.getElementById("qrKepsekFormBox")?.classList.add("hidden");
    roomPill?.classList.add("hidden");

    const pill = document.getElementById("qrStatusPill");
    if (pill) {
      pill.className = "inline-block text-xs font-extrabold px-3.5 py-1 rounded-full bg-blue-100 text-blue-900";
      pill.textContent = p.tugas_subrayon ? `Panitia & Ketua Rayon ${p.tugas_subrayon}` : "Panitia Resmi Rakor K3S 2026";
    }

    qrPayloadText = `PANITIA|${p.id_panitia}|${p.nama_panitia}|${p.divisi}`;
  }

  try {
    if (typeof window.QRCode === "function") {
      new window.QRCode(qrBox, {
        text: qrPayloadText,
        width: 170,
        height: 170,
        colorDark: "#0f172a",
        colorLight: "#ffffff"
      });
    } else {
      throw new Error("QRCode fallback");
    }
  } catch (e) {
    const encoded = encodeURIComponent(qrPayloadText);
    qrBox.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=170x170&data=${encoded}" alt="QR Code" class="w-[170px] h-[170px] mx-auto rounded-lg" />`;
  }
}

async function saveNamaKepsek() {
  if (!activeUser || activeUser.role !== "peserta") return;
  const val = document.getElementById("qrInputNamaKepsek")?.value.trim() || "";
  await sb.from("db_sekolah").update({ nama_kepsek: val }).eq("id_sekolah", activeUser.profile.id_sekolah);
  toast("Nama Kepala Sekolah berhasil disimpan!");
  await loadAllDatabase(false);
}

function renderSubrayonView() {
  const srSelect = document.getElementById("srSelectFilter");
  const sr = srSelect?.value || "Maulafa";
  const kw = (document.getElementById("srSearchInput")?.value || "").toLowerCase().trim();
  const ketua = panitiaList.find(p => p.tugas_subrayon === sr);
  const isPanitia = activeUser && activeUser.role === "panitia";

  const coordLabel = document.getElementById("srCoordinatorLabel");
  if (coordLabel) {
    coordLabel.textContent = ketua
      ? `Ketua Sub Rayon ${sr}: ${ketua.nama_panitia}`
      : `Wilayah Sub Rayon ${sr}`;
  }

  document.getElementById("btnMarkAllSr")?.classList.toggle("hidden", !isPanitia);

  const allSr = sekolahList.filter(s => s.subrayon === sr);
  const ikutSr = allSr.filter(s => s.status_ikut === "Ikut").length;
  const pct = allSr.length > 0 ? Math.round((ikutSr / allSr.length) * 100) : 0;

  document.getElementById("srProgressTitle").textContent = `Sub Rayon ${sr}`;
  document.getElementById("srProgressNumbers").textContent = `${ikutSr} / ${allSr.length} Ikut (${pct}%)`;
  document.getElementById("srProgressBar").style.width = pct + "%";

  const filtered = allSr.filter(
    s => s.nama_sekolah.toLowerCase().includes(kw) || String(s.npsn).includes(kw)
  );

  const box = document.getElementById("srSchoolCardsContainer");
  if (!box) return;
  box.innerHTML = "";

  filtered.forEach((s, i) => {
    const isIkut = s.status_ikut === "Ikut";
    const isTidak = s.status_ikut === "Tidak Ikut";

    const card = document.createElement("div");
    card.className = `bg-white rounded-2xl p-3.5 border ${isIkut ? 'border-emerald-300' : isTidak ? 'border-rose-200' : 'border-slate-200'} shadow-xs flex items-center justify-between gap-2`;
    card.innerHTML = `
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-1.5 flex-wrap">
          <span class="text-[10px] font-extrabold text-slate-400">#${i + 1}</span>
          <span class="text-[10px] font-mono bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">${s.npsn}</span>
          ${s.nomor_kamar && s.nomor_kamar !== 'Belum Ditentukan' ? `<span class="text-[10px] font-bold bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded"><i class="fa-solid fa-bed mr-0.5"></i>${s.nomor_kamar}</span>` : ''}
        </div>
        <h4 class="font-extrabold text-xs text-slate-900 truncate mt-0.5">${s.nama_sekolah}</h4>
        <p class="text-[10px] text-slate-500 truncate">${s.kelurahan} • ${s.alamat}</p>
      </div>
      ${isPanitia ? `
        <div class="flex items-center gap-1.5 shrink-0">
          <button class="btn-ikut px-3 py-2 rounded-xl text-xs font-extrabold ${isIkut ? 'bg-emerald-600 text-white shadow' : 'bg-slate-100 text-slate-600'}">Ikut</button>
          <button class="btn-tidak px-2.5 py-2 rounded-xl text-xs font-bold ${isTidak ? 'bg-rose-600 text-white shadow' : 'bg-slate-100 text-slate-500'}">Tidak</button>
        </div>
      ` : `
        <span class="text-[11px] font-extrabold px-2.5 py-1 rounded-xl shrink-0 ${isIkut ? 'bg-emerald-100 text-emerald-800' : isTidak ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-500'}">${s.status_ikut}</span>
      `}
    `;

    if (isPanitia) {
      card.querySelector(".btn-ikut")?.addEventListener("click", () => setSchoolStatus(s.id_sekolah, "Ikut"));
      card.querySelector(".btn-tidak")?.addEventListener("click", () => setSchoolStatus(s.id_sekolah, "Tidak Ikut"));
    }
    box.appendChild(card);
  });
}

async function setSchoolStatus(idSekolah, statusBaru) {
  await sb.from("db_sekolah").update({
    status_ikut: statusBaru,
    waktu_registrasi: new Date().toLocaleString("id-ID")
  }).eq("id_sekolah", idSekolah);
  toast(`Status sekolah: ${statusBaru}`);
  await loadAllDatabase(false);
}

async function markAllSubrayonIkut() {
  const sr = document.getElementById("srSelectFilter")?.value || "Maulafa";
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

  document.getElementById("kinerjaBigPercent").textContent = pct + "%";
  document.getElementById("kinerjaSubtitleCount").textContent = `${done} dari ${total} Tugas Selesai`;
  document.getElementById("kinerjaBigBar").style.width = pct + "%";

  const h1Count = sekolahList.filter(s => s.hadir_h1).length;
  const h2Count = sekolahList.filter(s => s.hadir_h2).length;
  const h3Count = sekolahList.filter(s => s.hadir_h3).length;
  const izinSchools = sekolahList.filter(s => s.status_izin && s.status_izin !== "Hadir Penuh (Tanpa Izin)");

  document.getElementById("rekapHadirH1").textContent = `${h1Count} Kepsek`;
  document.getElementById("rekapHadirH2").textContent = `${h2Count} Kepsek`;
  document.getElementById("rekapHadirH3").textContent = `${h3Count} Kepsek`;
  document.getElementById("badgePanitiaCountIzin").textContent = `${izinSchools.length} Pengajuan Izin`;

  const izinBox = document.getElementById("panitiaIzinListContainer");
  if (izinBox) {
    izinBox.innerHTML = izinSchools.length === 0
      ? `<div class="text-[11px] text-slate-400 text-center py-2">Belum ada peserta yang mengajukan izin.</div>`
      : izinSchools.map(s => `
          <div class="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-[11px]">
            <div class="font-extrabold text-amber-950">${s.nama_sekolah} (${s.subrayon})</div>
            <div class="font-bold text-amber-800">${s.status_izin}: <span class="font-normal">${s.alasan_izin || '-'}</span></div>
          </div>
        `).join("");
  }

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
        document.getElementById("taskFilterPhase").value = ph;
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
        document.getElementById("taskFilterDivisi").value = div;
        renderTaskListView();
      });
      dBars.appendChild(row);
    });
  }

  renderTaskListView();
}

function renderTaskListView() {
  const ph = document.getElementById("taskFilterPhase")?.value || "ALL";
  const div = document.getElementById("taskFilterDivisi")?.value || "ALL";
  const isPanitia = activeUser && activeUser.role === "panitia";

  let list = tugasList;
  if (ph !== "ALL") list = list.filter(t => t.tahapan === ph);
  if (div !== "ALL") list = list.filter(t => t.divisi === div);

  const box = document.getElementById("taskCardsContainer");
  if (!box) return;
  box.innerHTML = "";

  if (list.length === 0) {
    box.innerHTML = `<div class="bg-white rounded-3xl p-6 text-center border text-xs text-slate-500">Belum ada rincian tugas pada filter ini.</div>`;
    return;
  }

  list.forEach(t => {
    const isDone = t.status === "Selesai";
    const pillStyle = isDone
      ? "bg-emerald-100 text-emerald-800"
      : t.status === "Sedang Berjalan"
      ? "bg-amber-100 text-amber-800"
      : "bg-slate-100 text-slate-600";

    const card = document.createElement("div");
    card.className = `bg-white rounded-2xl p-3.5 border ${isDone ? 'border-emerald-300 bg-emerald-50/20' : 'border-slate-200'} shadow-xs flex items-start gap-3`;
    card.innerHTML = `
      <button class="btn-toggle-task mt-0.5 w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 ${isDone ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-300 text-transparent'}">
        <i class="fa-solid fa-check text-xs"></i>
      </button>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-1.5 flex-wrap">
          <span class="text-[10px] font-extrabold px-2 py-0.5 rounded-md ${pillStyle}">${t.status}</span>
          <span class="text-[10px] font-bold bg-blue-50 text-blue-800 px-2 py-0.5 rounded-md">${t.tahapan}</span>
        </div>
        <h4 class="font-extrabold text-xs text-slate-900 mt-1 ${isDone ? 'line-through text-slate-400' : ''}">${t.nama_pekerjaan}</h4>
        <p class="text-[10px] text-slate-500 mt-0.5">${t.divisi} • Deadline: ${t.deadline || '-'}</p>
      </div>
      ${isPanitia ? `
        <div class="flex flex-col gap-1 shrink-0">
          <button class="btn-edit-task w-7 h-7 rounded-lg bg-slate-100 hover:bg-blue-100 text-slate-600 text-xs flex items-center justify-center"><i class="fa-solid fa-pen"></i></button>
          <button class="btn-del-task w-7 h-7 rounded-lg bg-slate-100 hover:bg-rose-100 text-rose-600 text-xs flex items-center justify-center"><i class="fa-solid fa-trash"></i></button>
        </div>
      ` : ''}
    `;

    card.querySelector(".btn-toggle-task")?.addEventListener("click", async () => {
      if (!isPanitia) return;
      const next = isDone ? "Belum Mulai" : "Selesai";
      await sb.from("manajemen_tugas").update({ status: next, waktu_update: new Date().toLocaleString("id-ID") }).eq("id_tugas", t.id_tugas);
      toast(`Status tugas: ${next}`);
      await loadAllDatabase(false);
    });

    if (isPanitia) {
      card.querySelector(".btn-edit-task")?.addEventListener("click", () => openTaskModal(t.id_tugas));
      card.querySelector(".btn-del-task")?.addEventListener("click", async () => {
        if (!confirm("Hapus tugas ini?")) return;
        await sb.from("manajemen_tugas").delete().eq("id_tugas", t.id_tugas);
        toast("Tugas dihapus.");
        await loadAllDatabase(false);
      });
    }

    box.appendChild(card);
  });
}

function openTaskModal(idTugas = null) {
  document.getElementById("taskModal")?.classList.remove("hidden");
  if (idTugas) {
    const t = tugasList.find(x => x.id_tugas === idTugas);
    if (!t) return;
    document.getElementById("modalTaskHeader").textContent = "Edit Tugas Kepanitiaan";
    document.getElementById("modalTaskId").value = t.id_tugas;
    document.getElementById("modalTaskName").value = t.nama_pekerjaan;
    document.getElementById("modalTaskDivisi").value = t.divisi;
    document.getElementById("modalTaskPhase").value = t.tahapan;
    document.getElementById("modalTaskDeadline").value = t.deadline || "2026-09-23";
    document.getElementById("modalTaskStatus").value = t.status;
  } else {
    document.getElementById("modalTaskHeader").textContent = "Tambah Tugas Baru";
    document.getElementById("modalTaskId").value = "";
    document.getElementById("modalTaskName").value = "";
    document.getElementById("modalTaskDeadline").value = "2026-09-23";
    document.getElementById("modalTaskStatus").value = "Belum Mulai";
  }
}

function closeTaskModal() {
  document.getElementById("taskModal")?.classList.add("hidden");
}

async function saveTaskModal() {
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
