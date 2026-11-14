// js/scanner_pos.js
import { sb, toast } from './supabase.js';

let posScannerInstance = null;
let selectedPosMode = 'reg_kit';
let isProcessingScan = false;
let lastScannedNpsn = '';
let lastScanTimestamp = 0;

// Status kunci pos dari database (Default: semua terkunci sampai diaktifkan)
let posLockStatusMap = {
  reg_kit: { status_buka: false, diupdate_oleh: '' },
  absen_h1: { status_buka: false, diupdate_oleh: '' },
  absen_h2: { status_buka: false, diupdate_oleh: '' },
  absen_h3: { status_buka: false, diupdate_oleh: '' },
  kit_only: { status_buka: false, diupdate_oleh: '' },
  transport: { status_buka: false, diupdate_oleh: '' }
};

const POS_DEFINITIONS = [
  {
    id: 'reg_kit',
    label: 'Pos 1: Registrasi + Rakor Kit & Hadir H1',
    shortLabel: 'Pos 1: Registrasi & Kit',
    desc: '1x Scan mencatat: Terdaftar Ikut, Hadir Hari Ke-1, dan Terima Rakor Kit/ATK.',
    lockAuthority: 'sekretariat', // Dibuka oleh Sekretaris atau Seksi Kesekretariatan
    allowedDivisions: ['Seksi Perlengkapan, Dokumentasi, dan Publikasi', 'Seksi Kesekretariatan', 'Ketua Panitia', 'Sekretaris', 'Penanggung Jawab']
  },
  {
    id: 'absen_h1',
    label: 'Pos 2: Absensi Masuk — Hari Ke-1',
    shortLabel: 'Pos 2: Absensi H1',
    desc: 'Mencatat kehadiran peserta pada sesi Hari Ke-1 (Kamis, 19 Nov 2026).',
    lockAuthority: 'sekretariat',
    allowedDivisions: ['Seksi Perlengkapan, Dokumentasi, dan Publikasi', 'Seksi Kesekretariatan', 'Ketua Panitia', 'Sekretaris', 'Penanggung Jawab']
  },
  {
    id: 'absen_h2',
    label: 'Pos 3: Absensi Masuk — Hari Ke-2',
    shortLabel: 'Pos 3: Absensi H2',
    desc: 'Mencatat kehadiran peserta pada sesi Hari Ke-2 (Jumat, 20 Nov 2026).',
    lockAuthority: 'sekretariat',
    allowedDivisions: ['Seksi Perlengkapan, Dokumentasi, dan Publikasi', 'Seksi Kesekretariatan', 'Ketua Panitia', 'Sekretaris', 'Penanggung Jawab']
  },
  {
    id: 'absen_h3',
    label: 'Pos 4: Absensi Masuk — Hari Ke-3',
    shortLabel: 'Pos 4: Absensi H3',
    desc: 'Mencatat kehadiran peserta pada sesi Hari Ke-3 (Sabtu, 21 Nov 2026).',
    lockAuthority: 'sekretariat',
    allowedDivisions: ['Seksi Perlengkapan, Dokumentasi, dan Publikasi', 'Seksi Kesekretariatan', 'Ketua Panitia', 'Sekretaris', 'Penanggung Jawab']
  },
  {
    id: 'kit_only',
    label: 'Pos 5: Pengambilan Rakor Kit / ATK Saja',
    shortLabel: 'Pos 5: Rakor Kit',
    desc: 'Khusus serah terima tas Rakor Kit & ATK (Dilengkapi Proteksi Anti-Double).',
    lockAuthority: 'sekretariat',
    allowedDivisions: ['Seksi Perlengkapan, Dokumentasi, dan Publikasi', 'Seksi Kesekretariatan', 'Bendahara', 'Ketua Panitia', 'Sekretaris', 'Penanggung Jawab']
  },
  {
    id: 'transport',
    label: 'Pos 6: Terima Uang Transpor Peserta',
    shortLabel: 'Pos 6: Transpor Peserta',
    desc: 'Validasi pencairan uang transpor peserta (Wajib Diaktifkan oleh Bendahara).',
    lockAuthority: 'bendahara', // Khusus dibuka oleh Bendahara
    allowedDivisions: ['Bendahara', 'Seksi Kesekretariatan', 'Ketua Panitia', 'Sekretaris', 'Penanggung Jawab']
  }
];

// Cek apakah pengguna berwenang membuka kunci Pos 1 s.d. 5 (Sekretaris atau Seksi Kesekretariatan)
function canTogglePos1To5(activeUser) {
  return Boolean(
    activeUser &&
    activeUser.role === 'panitia' &&
    ['Sekretaris', 'Seksi Kesekretariatan'].includes(activeUser.profile?.divisi)
  );
}

// Cek apakah pengguna berwenang membuka kunci Pos 6 Transpor (Khusus Bendahara)
function canTogglePos6Transport(activeUser) {
  return Boolean(
    activeUser &&
    activeUser.role === 'panitia' &&
    activeUser.profile?.divisi === 'Bendahara'
  );
}

function canUserToggleThisPos(posObj, activeUser) {
  if (!posObj) return false;
  if (posObj.lockAuthority === 'bendahara') return canTogglePos6Transport(activeUser);
  return canTogglePos1To5(activeUser);
}

async function fetchPosLockSettings() {
  try {
    const { data } = await sb.from("pengaturan_pos").select("*");
    if (data && data.length > 0) {
      data.forEach(row => {
        posLockStatusMap[row.id_pos] = {
          status_buka: Boolean(row.status_buka),
          diupdate_oleh: row.diupdate_oleh || ''
        };
      });
    }
  } catch (e) {}
}

function playScannerBeep(type = 'success') {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'success') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1046.5, ctx.currentTime);
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      osc.start();
      osc.stop(ctx.currentTime + 0.14);
    } else {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, ctx.currentTime);
      gain.gain.setValueAtTime(0.35, ctx.currentTime);
      osc.start();
      osc.stop(ctx.currentTime + 0.38);
    }
  } catch (e) {}
}

export function getAllowedPosForUser(activeUser) {
  if (!activeUser || activeUser.role !== 'panitia') return [];
  const userDiv = activeUser.profile?.divisi || '';
  return POS_DEFINITIONS.filter(p => p.allowedDivisions.includes(userDiv));
}

// Dipanggil otomatis setiap kali aplikasi me-render halaman
export function renderPosScannerWidgets(activeUser, sekolahList, reloadCallback) {
  injectHomeScannerCard(activeUser, sekolahList, reloadCallback);
  injectPesertaAbsensiKitCard(activeUser, sekolahList);
  enhanceQrCodeZoomFeature(activeUser, sekolahList);
}

// =========================================================================
// FITUR ZOOM / PERBESAR QR CODE (UNTUK PESERTA & PANITIA DI TAB ID & QR)
// =========================================================================
function enhanceQrCodeZoomFeature(activeUser, sekolahList) {
  const qrBox = document.getElementById("qrCodeCanvas");
  if (!qrBox || !activeUser) return;

  // Buat kotak QR terasa interaktif saat disentuh
  qrBox.className = "p-4 bg-white rounded-3xl border-2 border-dashed border-blue-400 shadow-inner inline-block cursor-pointer hover:scale-105 active:scale-95 transition-transform duration-200 relative group";
  qrBox.title = "Klik untuk memperbesar QR Code";

  // Tambahkan tombol petunjuk "Klik untuk Perbesar QR" tepat di bawah QR jika belum ada
  let zoomHintBtn = document.getElementById("btnZoomQrTrigger");
  if (!zoomHintBtn && qrBox.parentElement) {
    zoomHintBtn = document.createElement("div");
    zoomHintBtn.id = "btnZoomQrTrigger";
    zoomHintBtn.className = "mt-1 mb-2 flex justify-center";
    zoomHintBtn.innerHTML = `
      <button type="button" class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-200 text-[11px] font-extrabold shadow-2xs active:scale-95 transition">
        <i class="fa-solid fa-magnifying-glass-plus text-blue-700"></i>
        <span>Ketuk QR untuk Perbesar (Mode Scan Cepat)</span>
      </button>
    `;
    qrBox.parentElement.insertAdjacentElement("afterend", zoomHintBtn);
  }

  const openZoomHandler = () => openQrFullscreenZoomModal(activeUser, sekolahList);
  qrBox.onclick = openZoomHandler;
  if (zoomHintBtn) zoomHintBtn.onclick = openZoomHandler;
}

function openQrFullscreenZoomModal(activeUser, sekolahList) {
  if (!activeUser) return;

  let existingModal = document.getElementById("qrZoomFullscreenModal");
  if (!existingModal) {
    existingModal = document.createElement("div");
    existingModal.id = "qrZoomFullscreenModal";
    document.body.appendChild(existingModal);
  }

  let title = "";
  let subtitle = "";
  let badge = "";
  let qrPayload = "";

  if (activeUser.role === 'peserta') {
    const s = sekolahList.find(x => x.id_sekolah === activeUser.profile.id_sekolah) || activeUser.profile;
    title = s.nama_sekolah;
    subtitle = `${s.nama_kepsek || 'Kepala Sekolah'} • NPSN: ${s.npsn}`;
    badge = `PESERTA • SUB RAYON ${s.subrayon.toUpperCase()}`;
    qrPayload = `PESERTA|${s.npsn}|${s.nama_sekolah}|${s.subrayon}`;
  } else {
    const p = activeUser.profile;
    title = p.nama_panitia;
    subtitle = `${p.divisi} (${p.jabatan})`;
    badge = p.tugas_subrayon ? `PANITIA • KETUA RAYON ${p.tugas_subrayon.toUpperCase()}` : `PANITIA RESMI RAKOR 2026`;
    qrPayload = `PANITIA|${p.id_panitia}|${p.nama_panitia}|${p.divisi}`;
  }

  existingModal.className = "fixed inset-0 bg-slate-950/90 backdrop-blur-md z-50 flex items-center justify-center p-5 animate-view";
  existingModal.innerHTML = `
    <div class="bg-white w-full max-w-sm rounded-3xl p-6 text-center shadow-2xl space-y-4 relative border-4 border-amber-400">
      <button id="btnCloseQrZoomModal" class="absolute top-3.5 right-3.5 w-9 h-9 rounded-full bg-slate-100 hover:bg-rose-100 text-slate-700 hover:text-rose-600 font-extrabold text-lg flex items-center justify-center">
        &times;
      </button>

      <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-900 text-amber-300 text-[10px] font-extrabold tracking-wider uppercase">
        <i class="fa-solid fa-expand"></i> ${badge}
      </div>

      <div>
        <h3 class="text-base font-extrabold text-slate-900 leading-snug">${title}</h3>
        <p class="text-xs font-semibold text-slate-500 mt-0.5">${subtitle}</p>
      </div>

      <!-- Kotak QR Ekstra Besar (High Contrast) untuk Memudahkan Kamera Scanner -->
      <div class="flex justify-center py-2">
        <div id="zoomedQrCanvasTarget" class="p-4 bg-white rounded-3xl border-2 border-slate-200 shadow-lg inline-block"></div>
      </div>

      <p class="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 py-2 px-3 rounded-2xl">
        <i class="fa-solid fa-camera mr-1"></i> Tunjukkan layar ini ke Kamera Scanner Panitia
      </p>

      <button id="btnDismissQrZoomBottom" class="w-full py-3 rounded-2xl bg-slate-900 text-white font-extrabold text-xs">
        Kembali / Kecilkan QR
      </button>
    </div>
  `;

  const target = document.getElementById("zoomedQrCanvasTarget");
  try {
    if (typeof window.QRCode === "function") {
      new window.QRCode(target, {
        text: qrPayload,
        width: 260,
        height: 260,
        colorDark: "#000000",
        colorLight: "#ffffff"
      });
    } else {
      throw new Error("Fallback QR");
    }
  } catch (e) {
    const encoded = encodeURIComponent(qrPayload);
    target.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encoded}" class="w-[260px] h-[260px] mx-auto" />`;
  }

  const closeZoom = () => existingModal.classList.add("hidden");
  document.getElementById("btnCloseQrZoomModal")?.addEventListener("click", closeZoom);
  document.getElementById("btnDismissQrZoomBottom")?.addEventListener("click", closeZoom);
  existingModal.addEventListener("click", (e) => {
    if (e.target === existingModal) closeZoom();
  });
}

// =========================================================================
// WIDGET BERANDA & BUKTI LAYANAN PESERTA
// =========================================================================
function injectHomeScannerCard(activeUser, sekolahList, reloadCallback) {
  const tabBeranda = document.getElementById("tabContentBeranda");
  if (!tabBeranda) return;

  let container = document.getElementById("posScannerHomeWidget");
  if (!container) {
    container = document.createElement("div");
    container.id = "posScannerHomeWidget";
    const firstGrid = tabBeranda.children[2] || null;
    tabBeranda.insertBefore(container, firstGrid);
  }

  if (!activeUser) {
    container.innerHTML = "";
    return;
  }

  if (activeUser.role === 'panitia') {
    const allowedPos = getAllowedPosForUser(activeUser);
    const totalKit = sekolahList.filter(s => s.ambil_kit).length;
    const totalTrans = sekolahList.filter(s => s.terima_transport).length;
    const totalH1 = sekolahList.filter(s => s.hadir_h1).length;

    container.innerHTML = `
      <div class="bg-gradient-to-r from-emerald-900 via-teal-900 to-slate-900 text-white rounded-3xl p-4 shadow-lg border border-emerald-500/30 space-y-3">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2.5">
            <div class="w-11 h-11 rounded-2xl bg-emerald-400 text-slate-950 flex items-center justify-center text-lg font-extrabold shadow">
              <i class="fa-solid fa-qrcode"></i>
            </div>
            <div>
              <span class="text-[9px] font-extrabold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-400/30">
                Meja Layanan & Otorisasi Pos
              </span>
              <h4 class="text-xs font-extrabold mt-0.5">Scanner QR Pos Registrasi, Kit & Transpor</h4>
            </div>
          </div>
        </div>

        <div class="grid grid-cols-3 gap-2 text-center bg-black/25 p-2 rounded-2xl border border-white/10">
          <div>
            <div class="text-xs font-extrabold text-emerald-300">${totalH1}/160</div>
            <div class="text-[9px] text-slate-300">Hadir H1</div>
          </div>
          <div>
            <div class="text-xs font-extrabold text-amber-300">${totalKit}/160</div>
            <div class="text-[9px] text-slate-300">Rakor Kit</div>
          </div>
          <div>
            <div class="text-xs font-extrabold text-sky-300">${totalTrans}/160</div>
            <div class="text-[9px] text-slate-300">Transpor</div>
          </div>
        </div>

        ${allowedPos.length > 0 ? `
          <button id="btnOpenPosScannerModal" class="w-full py-3 rounded-2xl bg-gradient-to-r from-amber-400 to-yellow-300 hover:from-amber-300 hover:to-yellow-200 text-slate-950 font-extrabold text-xs shadow-md flex items-center justify-center gap-2 active:scale-[0.99] transition">
            <i class="fa-solid fa-camera text-sm"></i>
            <span>BUKA POS SCANNER & PENGATURAN KUNCI POS</span>
          </button>
        ` : `
          <button id="btnOpenPosRekapOnly" class="w-full py-2.5 rounded-2xl bg-white/10 hover:bg-white/15 text-white font-bold text-xs flex items-center justify-center gap-2">
            <i class="fa-solid fa-table-list text-amber-300"></i>
            <span>Lihat Rekapitulasi Registrasi, Kit & Transpor</span>
          </button>
        `}
      </div>
    `;

    document.getElementById("btnOpenPosScannerModal")?.addEventListener("click", () => {
      openPosScannerModal(activeUser, sekolahList, reloadCallback);
    });
    document.getElementById("btnOpenPosRekapOnly")?.addEventListener("click", () => {
      openPosScannerModal(activeUser, sekolahList, reloadCallback);
    });
  } else {
    const s = sekolahList.find(x => x.id_sekolah === activeUser.profile.id_sekolah) || activeUser.profile;
    const hadirCount = [s.hadir_h1, s.hadir_h2, s.hadir_h3].filter(Boolean).length;

    container.innerHTML = `
      <div class="bg-white rounded-3xl p-4 border border-slate-200 shadow-2xs space-y-2.5">
        <div class="flex items-center justify-between">
          <h4 class="text-xs font-extrabold uppercase tracking-wider text-slate-800">
            <i class="fa-solid fa-shield-check text-emerald-600 mr-1"></i> Status Layanan & Hak Peserta
          </h4>
          <span class="text-[10px] font-bold text-slate-400">Scan via ID & QR</span>
        </div>
        <div class="grid grid-cols-3 gap-2 text-center">
          <div class="p-2.5 rounded-2xl border ${hadirCount > 0 ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-slate-50 border-slate-200 text-slate-500'}">
            <i class="fa-solid fa-user-check text-sm ${hadirCount > 0 ? 'text-emerald-600' : 'text-slate-400'}"></i>
            <div class="text-[11px] font-extrabold mt-1">${hadirCount}/3 Hari</div>
            <div class="text-[9px]">Presensi</div>
          </div>
          <div class="p-2.5 rounded-2xl border ${s.ambil_kit ? 'bg-amber-50 border-amber-300 text-amber-950' : 'bg-slate-50 border-slate-200 text-slate-500'}">
            <i class="fa-solid fa-briefcase text-sm ${s.ambil_kit ? 'text-amber-600' : 'text-slate-400'}"></i>
            <div class="text-[11px] font-extrabold mt-1">${s.ambil_kit ? 'Diterima' : 'Belum'}</div>
            <div class="text-[9px]">Rakor Kit</div>
          </div>
          <div class="p-2.5 rounded-2xl border ${s.terima_transport ? 'bg-blue-50 border-blue-300 text-blue-950' : 'bg-slate-50 border-slate-200 text-slate-500'}">
            <i class="fa-solid fa-wallet text-sm ${s.terima_transport ? 'text-blue-700' : 'text-slate-400'}"></i>
            <div class="text-[11px] font-extrabold mt-1">${s.terima_transport ? 'Diterima' : 'Belum'}</div>
            <div class="text-[9px]">Transpor</div>
          </div>
        </div>
      </div>
    `;
  }
}

function injectPesertaAbsensiKitCard(activeUser, sekolahList) {
  const existing = document.getElementById("pesertaKitTransportStatusBox");
  if (existing) existing.remove();
}

// =========================================================================
// MODAL SCANNER MEJA PANITIA (DENGAN PENGAMAN KUNCI POS 1-5 & POS 6)
// =========================================================================
export async function openPosScannerModal(activeUser, sekolahList, reloadCallback) {
  const modal = document.getElementById("serviceModal");
  const titleEl = document.getElementById("serviceModalTitle");
  const bodyEl = document.getElementById("serviceModalBody");
  if (!modal || !titleEl || !bodyEl) return;

  await stopPosCamera();
  modal.classList.remove("hidden");
  titleEl.innerHTML = `<i class="fa-solid fa-qrcode text-emerald-600 mr-1.5"></i> Pos Scanner & Otorisasi Layanan`;
  bodyEl.innerHTML = `<div class="py-6 text-center text-xs text-slate-400">Memeriksa status otorisasi pos...</div>`;

  await fetchPosLockSettings();

  const allowedPos = getAllowedPosForUser(activeUser);
  if (allowedPos.length > 0 && !allowedPos.some(p => p.id === selectedPosMode)) {
    selectedPosMode = allowedPos[0].id;
  }

  renderPosScannerBody(activeUser, allowedPos, sekolahList, bodyEl, reloadCallback);
}

function renderPosScannerBody(activeUser, allowedPos, sekolahList, bodyEl, reloadCallback) {
  const currentPosObj = POS_DEFINITIONS.find(p => p.id === selectedPosMode) || POS_DEFINITIONS[0];
  const lockState = posLockStatusMap[selectedPosMode] || { status_buka: false, diupdate_oleh: '' };
  const isPosOpen = Boolean(lockState.status_buka);

  const canManagePos1To5 = canTogglePos1To5(activeUser);
  const canManagePos6 = canTogglePos6Transport(activeUser);
  const canToggleCurrentPos = canUserToggleThisPos(currentPosObj, activeUser);

  const countH1 = sekolahList.filter(s => s.hadir_h1).length;
  const countH2 = sekolahList.filter(s => s.hadir_h2).length;
  const countH3 = sekolahList.filter(s => s.hadir_h3).length;
  const countKit = sekolahList.filter(s => s.ambil_kit).length;
  const countTrans = sekolahList.filter(s => s.terima_transport).length;

  bodyEl.innerHTML = `
    <!-- Ringkasan Angka Real-time -->
    <div class="grid grid-cols-3 gap-1.5 text-center bg-slate-900 text-white p-2.5 rounded-2xl">
      <div class="bg-white/10 rounded-xl p-1.5">
        <div class="text-xs font-extrabold text-emerald-300">${countH1} / ${countH2} / ${countH3}</div>
        <div class="text-[9px] text-slate-300">Hadir H1 / H2 / H3</div>
      </div>
      <div class="bg-white/10 rounded-xl p-1.5">
        <div class="text-xs font-extrabold text-amber-300">${countKit} / 160</div>
        <div class="text-[9px] text-slate-300">Terima Rakor Kit</div>
      </div>
      <div class="bg-white/10 rounded-xl p-1.5">
        <div class="text-xs font-extrabold text-sky-300">${countTrans} / 160</div>
        <div class="text-[9px] text-slate-300">Terima Transpor</div>
      </div>
    </div>

    <!-- PANEL KONTROL SAKLAR POS (KHUSUS SEKRETARIS, SEKSI KESEKRETARIATAN, ATAU BENDAHARA) -->
    ${(canManagePos1To5 || canManagePos6) ? `
      <div class="p-3.5 rounded-2xl bg-indigo-50/90 border border-indigo-200 space-y-2">
        <div class="flex items-center justify-between">
          <span class="font-extrabold text-xs text-indigo-950">
            <i class="fa-solid fa-key text-indigo-600 mr-1"></i> Panel Saklar Aktivasi Pos Scanner
          </span>
          <span class="text-[9px] font-extrabold uppercase bg-indigo-200 text-indigo-900 px-2 py-0.5 rounded">
            ${canManagePos6 ? 'Otoritas Bendahara' : 'Otoritas Sekretariat'}
          </span>
        </div>
        <p class="text-[10px] text-indigo-800 leading-relaxed">
          ${canManagePos6
            ? 'Sebagai <b>Bendahara</b>, Anda memegang wewenang penuh membuka/mengunci <b>Pos 6 (Terima Uang Transpor)</b>.'
            : 'Sebagai <b>Sekretaris / Seksi Kesekretariatan</b>, Anda memegang wewenang membuka/mengunci <b>Pos 1 s.d. Pos 5</b>.'}
        </p>
        <div class="grid grid-cols-2 gap-1.5 pt-1">
          ${POS_DEFINITIONS.map(p => {
            const open = Boolean(posLockStatusMap[p.id]?.status_buka);
            const hasAuth = canUserToggleThisPos(p, activeUser);
            return `
              <button type="button" data-posid="${p.id}" ${!hasAuth ? 'disabled' : ''} class="btn-quick-toggle-pos p-2 rounded-xl border text-left flex items-center justify-between gap-1 transition ${
                open
                  ? 'bg-emerald-600 text-white border-emerald-700 shadow-2xs'
                  : 'bg-white text-slate-600 border-slate-200'
              } ${!hasAuth ? 'opacity-45 cursor-not-allowed' : 'hover:scale-[0.99]'}">
                <span class="text-[10px] font-extrabold truncate">${p.shortLabel}</span>
                <span class="text-[9px] font-extrabold px-1.5 py-0.5 rounded ${open ? 'bg-black/20 text-white' : 'bg-slate-100 text-slate-500'}">
                  ${open ? 'ON' : 'OFF'}
                </span>
              </button>
            `;
          }).join('')}
        </div>
      </div>
    ` : ''}

    ${allowedPos.length > 0 ? `
      <!-- Pilihan Mode Pos Scanner -->
      <div class="space-y-1.5">
        <div class="flex items-center justify-between">
          <label class="text-[11px] font-extrabold text-slate-800">Pilih Pos Layanan Kamera:</label>
          <span class="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full ${isPosOpen ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}">
            ${isPosOpen ? '🔓 POS AKTIF (SIAP SCAN)' : '🔒 POS MASIH TERKUNCI'}
          </span>
        </div>
        <select id="selectPosScannerMode" class="w-full rounded-2xl border-2 border-blue-900 bg-blue-50/50 px-3 py-2.5 text-xs font-extrabold text-blue-950">
          ${allowedPos.map(p => {
            const isOpen = Boolean(posLockStatusMap[p.id]?.status_buka);
            return `<option value="${p.id}" ${p.id === selectedPosMode ? 'selected' : ''}>${isOpen ? '🟢' : '🔒'} ${p.label}</option>`;
          }).join('')}
        </select>
        <p class="text-[10px] text-slate-500 font-semibold px-1">${currentPosObj.desc}</p>
      </div>

      <!-- JIKA POS SUDAH DIBUKA OLEH PEJABAT BERWENANG -> TAMPILKAN KAMERA & INPUT -->
      ${isPosOpen ? `
        <div class="relative rounded-2xl overflow-hidden bg-black border-2 border-emerald-600 min-h-[230px] flex flex-col items-center justify-center">
          <div id="posQrReaderBox" class="w-full"></div>
          <button id="btnStartPosCamera" class="my-auto py-3 px-5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs shadow-lg flex items-center gap-2">
            <i class="fa-solid fa-camera"></i>
            <span>Aktifkan Kamera ${currentPosObj.shortLabel}</span>
          </button>
        </div>

        <div id="posScanResultBanner" class="hidden p-3.5 rounded-2xl border text-xs space-y-1 transition-all"></div>

        <div class="p-3 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
          <div class="text-[10px] font-extrabold uppercase text-slate-600">
            <i class="fa-solid fa-keyboard mr-1"></i> Input Cepat Tanpa Kamera (${currentPosObj.shortLabel}):
          </div>
          <div class="flex gap-1.5">
            <select id="selectManualPosSchool" class="flex-1 rounded-xl border bg-white px-2.5 py-2 text-xs font-semibold">
              <option value="">-- Pilih Sekolah (160 SD/MI) --</option>
              ${sekolahList.map(s => `<option value="${s.npsn}">${s.nama_sekolah} (${s.subrayon})</option>`).join('')}
            </select>
            <button id="btnExecManualPos" class="bg-blue-900 text-white font-extrabold px-3.5 py-2 rounded-xl text-xs shrink-0">
              Proses
            </button>
          </div>
        </div>
      ` : `
        <!-- JIKA POS MASIH TERKUNCI -> BLOKIR KAMERA AGAR TIDAK SALAH PAKAI -->
        <div class="p-5 rounded-2xl bg-rose-50 border-2 border-dashed border-rose-300 text-center space-y-2.5">
          <div class="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 mx-auto flex items-center justify-center text-xl">
            <i class="fa-solid fa-lock"></i>
          </div>
          <div>
            <h4 class="font-extrabold text-xs text-rose-950">${currentPosObj.label} Masih Dikunci</h4>
            <p class="text-[11px] text-rose-800 mt-1 leading-relaxed">
              Untuk mencegah kesalahan pemindaian di lapangan, kamera pada pos ini hanya dapat digunakan setelah diaktifkan oleh
              <b>${currentPosObj.lockAuthority === 'bendahara' ? 'Bendahara Panitia' : 'Sekretaris atau Seksi Kesekretariatan'}</b>.
            </p>
          </div>
          ${canToggleCurrentPos ? `
            <button id="btnUnlockCurrentPosNow" class="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow">
              <i class="fa-solid fa-lock-open mr-1"></i> Aktifkan ${currentPosObj.shortLabel} Sekarang
            </button>
          ` : ''}
        </div>
      `}
    ` : `
      <div class="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900 font-semibold text-center">
        Divisi Anda (<b>${activeUser.profile?.divisi}</b>) berada dalam mode pantauan rekapitulasi.
      </div>
    `}

    <!-- Tabel Rekapitulasi Status 160 Sekolah -->
    <div class="space-y-2 pt-2 border-t border-slate-200">
      <div class="flex items-center justify-between">
        <span class="font-extrabold text-xs text-slate-800 uppercase">Daftar Status 160 Sekolah</span>
        <input id="searchRekapPosInput" type="text" placeholder="Cari sekolah/rayon..." class="w-40 rounded-xl border bg-slate-50 px-2.5 py-1 text-[11px] font-semibold" />
      </div>
      <div id="posRekapTableList" class="space-y-1.5 max-h-56 overflow-y-auto pr-0.5"></div>
    </div>
  `;

  // Handler Saklar Buka/Kunci Pos (Sekretaris/Kesekretariatan untuk Pos 1-5, Bendahara untuk Pos 6)
  document.querySelectorAll(".btn-quick-toggle-pos").forEach(btn => {
    btn.addEventListener("click", async () => {
      const posId = btn.dataset.posid;
      await togglePosLockDatabase(posId, activeUser, allowedPos, sekolahList, bodyEl, reloadCallback);
    });
  });

  document.getElementById("btnUnlockCurrentPosNow")?.addEventListener("click", async () => {
    await togglePosLockDatabase(selectedPosMode, activeUser, allowedPos, sekolahList, bodyEl, reloadCallback);
  });

  // Render daftar rekapitulasi
  const renderRekapRows = () => {
    const kw = (document.getElementById("searchRekapPosInput")?.value || "").toLowerCase().trim();
    const listEl = document.getElementById("posRekapTableList");
    if (!listEl) return;

    const filtered = sekolahList.filter(
      s => s.nama_sekolah.toLowerCase().includes(kw) || s.subrayon.toLowerCase().includes(kw) || String(s.npsn).includes(kw)
    );

    listEl.innerHTML = filtered.slice(0, 60).map(s => `
      <div class="p-2.5 rounded-xl bg-white border border-slate-200 flex items-center justify-between gap-2 text-[11px]">
        <div class="min-w-0 flex-1">
          <div class="font-extrabold text-slate-900 truncate">${s.nama_sekolah}</div>
          <div class="text-[10px] text-slate-500">
            Rayon ${s.subrayon}
            ${s.status_izin && s.status_izin !== 'Hadir Penuh (Tanpa Izin)' ? `• <span class="text-rose-600 font-bold">${s.status_izin}</span>` : ''}
          </div>
        </div>
        <div class="flex items-center gap-1 shrink-0 text-[9px] font-extrabold">
          <span class="px-1.5 py-0.5 rounded ${s.hadir_h1 ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-400'}">H1</span>
          <span class="px-1.5 py-0.5 rounded ${s.hadir_h2 ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-400'}">H2</span>
          <span class="px-1.5 py-0.5 rounded ${s.hadir_h3 ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-400'}">H3</span>
          <span class="px-1.5 py-0.5 rounded ${s.ambil_kit ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-400'}">KIT</span>
          <span class="px-1.5 py-0.5 rounded ${s.terima_transport ? 'bg-blue-100 text-blue-900' : 'bg-slate-100 text-slate-400'}">TRP</span>
        </div>
      </div>
    `).join('');
  };

  renderRekapRows();
  document.getElementById("searchRekapPosInput")?.addEventListener("input", renderRekapRows);

  // Ganti pilihan Pos pada dropdown
  document.getElementById("selectPosScannerMode")?.addEventListener("change", async (e) => {
    selectedPosMode = e.target.value;
    await stopPosCamera();
    renderPosScannerBody(activeUser, allowedPos, sekolahList, bodyEl, reloadCallback);
  });

  // Aktifkan kamera jika pos terbuka
  document.getElementById("btnStartPosCamera")?.addEventListener("click", () => {
    document.getElementById("btnStartPosCamera")?.classList.add("hidden");
    startPosCameraStream(activeUser, sekolahList, bodyEl, reloadCallback);
  });

  document.getElementById("btnExecManualPos")?.addEventListener("click", async () => {
    const npsn = document.getElementById("selectManualPosSchool")?.value;
    if (!npsn) return toast("Pilih nama sekolah terlebih dahulu!");
    await executePosActionByNpsn(npsn, activeUser, sekolahList, bodyEl, reloadCallback);
  });

  document.getElementById("btnCloseServiceModal")?.addEventListener("click", stopPosCamera, { once: true });
}

async function togglePosLockDatabase(posId, activeUser, allowedPos, sekolahList, bodyEl, reloadCallback) {
  const posObj = POS_DEFINITIONS.find(p => p.id === posId);
  if (!posObj) return;

  if (!canUserToggleThisPos(posObj, activeUser)) {
    return toast(
      posObj.lockAuthority === 'bendahara'
        ? "Akses Ditolak: Hanya Bendahara yang dapat mengaktifkan Pos 6 Transpor!"
        : "Akses Ditolak: Hanya Sekretaris atau Seksi Kesekretariatan yang dapat mengaktifkan Pos 1 s.d. 5!"
    );
  }

  const currentOpen = Boolean(posLockStatusMap[posId]?.status_buka);
  const nextOpen = !currentOpen;
  const petugas = activeUser.profile?.nama_panitia || "Panitia";
  const waktu = new Date().toLocaleString("id-ID");

  posLockStatusMap[posId] = { status_buka: nextOpen, diupdate_oleh: petugas };

  const { error } = await sb.from("pengaturan_pos").upsert([{
    id_pos: posId,
    nama_pos: posObj.label,
    status_buka: nextOpen,
    diupdate_oleh: petugas,
    waktu_update: waktu
  }]);

  if (error) {
    toast("Pastikan tabel pengaturan_pos sudah di-Run di SQL Supabase!");
  } else {
    toast(nextOpen ? `🔓 ${posObj.shortLabel} DIAKTIFKAN!` : `🔒 ${posObj.shortLabel} DIKUNCI!`);
  }

  await stopPosCamera();
  selectedPosMode = posId;
  renderPosScannerBody(activeUser, allowedPos, sekolahList, bodyEl, reloadCallback);
}

function startPosCameraStream(activeUser, sekolahList, bodyEl, reloadCallback) {
  if (posScannerInstance) return;
  posScannerInstance = new Html5Qrcode("posQrReaderBox");
  posScannerInstance.start(
    { facingMode: "environment" },
    { fps: 10, qrbox: { width: 210, height: 210 } },
    async (decodedText) => {
      await handleRawPosQrScan(decodedText, activeUser, sekolahList, bodyEl, reloadCallback);
    },
    () => {}
  ).catch(() => {
    toast("Gagal membuka kamera, gunakan pilihan sekolah manual di bawah.");
  });
}

export async function stopPosCamera() {
  if (posScannerInstance) {
    try {
      await posScannerInstance.stop();
      posScannerInstance.clear();
    } catch (e) {}
    posScannerInstance = null;
  }
}

async function handleRawPosQrScan(rawText, activeUser, sekolahList, bodyEl, reloadCallback) {
  if (isProcessingScan) return;
  const clean = String(rawText || "").trim();
  if (!clean) return;

  let npsn = clean;
  if (clean.includes("|")) {
    const parts = clean.split("|");
    npsn = parts[1];
  } else if (clean.includes("SEK-")) {
    npsn = clean.split("SEK-")[1];
  }

  const now = Date.now();
  if (npsn === lastScannedNpsn && now - lastScanTimestamp < 3000) {
    return;
  }
  lastScannedNpsn = npsn;
  lastScanTimestamp = now;

  isProcessingScan = true;
  await executePosActionByNpsn(npsn, activeUser, sekolahList, bodyEl, reloadCallback);
  setTimeout(() => { isProcessingScan = false; }, 1200);
}

async function executePosActionByNpsn(npsn, activeUser, sekolahList, bodyEl, reloadCallback) {
  // Pastikan pos yang dipilih memang sedang berstatus BUKA
  if (!posLockStatusMap[selectedPosMode]?.status_buka) {
    playScannerBeep('error');
    return toast("Pos layanan ini masih dikunci!");
  }

  const school = sekolahList.find(s => String(s.npsn) === String(npsn) || s.id_sekolah === String(npsn));
  const resultBanner = document.getElementById("posScanResultBanner");

  if (!school) {
    playScannerBeep('error');
    if (resultBanner) {
      resultBanner.className = "p-3.5 rounded-2xl bg-rose-600 text-white font-bold text-xs shadow-md";
      resultBanner.innerHTML = `<i class="fa-solid fa-circle-xmark mr-1"></i> QR Code Tidak Dikenali! Pastikan yang dipindai adalah Kartu Peserta Kepala Sekolah.`;
      resultBanner.classList.remove("hidden");
    }
    return;
  }

  const nowStr = new Date().toLocaleString("id-ID");
  const petugasName = activeUser?.profile?.nama_panitia || "Panitia";
  const izinNote = (school.status_izin && school.status_izin !== "Hadir Penuh (Tanpa Izin)")
    ? `<div class="mt-1 p-1.5 rounded-lg bg-amber-400 text-slate-950 text-[10px] font-extrabold"><i class="fa-solid fa-triangle-exclamation mr-1"></i>Catatan Izin: ${school.status_izin} (${school.alasan_izin || '-'})</div>`
    : "";

  if (selectedPosMode === 'kit_only') {
    if (school.ambil_kit) {
      playScannerBeep('error');
      showScanBanner(resultBanner, 'error', `
        <div class="font-extrabold text-sm">⚠️ PERINGATAN: RAKOR KIT SUDAH DIAMBIL!</div>
        <div class="mt-0.5">${school.nama_sekolah} (Rayon ${school.subrayon})</div>
        <div class="text-[10px] opacity-90 mt-1">Tercatat sudah mengambil pada: <b>${school.waktu_ambil_kit || '-'}</b> oleh ${school.petugas_kit || 'Panitia'}</div>
      `);
      return;
    }

    await sb.from("db_sekolah").update({
      ambil_kit: true,
      waktu_ambil_kit: nowStr,
      petugas_kit: petugasName
    }).eq("id_sekolah", school.id_sekolah);

    school.ambil_kit = true;
    school.waktu_ambil_kit = nowStr;
    school.petugas_kit = petugasName;
    playScannerBeep('success');
    showScanBanner(resultBanner, 'success', `
      <div class="font-extrabold text-sm">✓ RAKOR KIT DISERAHKAN</div>
      <div class="mt-0.5">${school.nama_sekolah} • Kamar: ${school.nomor_kamar || 'Belum Ada'}</div>
      ${izinNote}
    `);
  } else if (selectedPosMode === 'reg_kit') {
    const alreadyKitWarning = school.ambil_kit
      ? `<div class="mt-1 p-1.5 rounded-lg bg-rose-700 text-white text-[10px] font-extrabold">⚠️ Perhatian: Sekolah ini sebelumnya sudah tercatat mengambil Rakor Kit pada ${school.waktu_ambil_kit}!</div>`
      : "";

    await sb.from("db_sekolah").update({
      status_ikut: "Ikut",
      hadir_h1: true,
      ambil_kit: true,
      waktu_registrasi: nowStr,
      waktu_ambil_kit: school.waktu_ambil_kit || nowStr,
      petugas_kit: school.petugas_kit || petugasName
    }).eq("id_sekolah", school.id_sekolah);

    playScannerBeep(school.ambil_kit ? 'error' : 'success');
    school.status_ikut = "Ikut";
    school.hadir_h1 = true;
    school.ambil_kit = true;
    school.waktu_ambil_kit = school.waktu_ambil_kit || nowStr;

    showScanBanner(resultBanner, school.ambil_kit ? 'warn' : 'success', `
      <div class="font-extrabold text-sm">✓ REGISTRASI, HADIR H1 & RAKOR KIT BERHASIL</div>
      <div class="mt-0.5">${school.nama_sekolah} (${school.nama_kepsek || 'Kepsek'}) • Kamar: <b>${school.nomor_kamar || '-'}</b></div>
      ${alreadyKitWarning}
      ${izinNote}
    `);
  } else if (selectedPosMode === 'transport') {
    if (school.terima_transport) {
      playScannerBeep('error');
      showScanBanner(resultBanner, 'error', `
        <div class="font-extrabold text-sm">⛔ DITOLAK: TRANSPOR SUDAH DITERIMA SEBELUMNYA!</div>
        <div class="mt-0.5">${school.nama_sekolah} (NPSN: ${school.npsn})</div>
        <div class="text-[10px] opacity-90 mt-1">Sudah dicairkan pada: <b>${school.waktu_terima_transport || '-'}</b> oleh ${school.petugas_transport || 'Bendahara'}</div>
      `);
      return;
    }

    await sb.from("db_sekolah").update({
      terima_transport: true,
      waktu_terima_transport: nowStr,
      petugas_transport: petugasName
    }).eq("id_sekolah", school.id_sekolah);

    school.terima_transport = true;
    school.waktu_terima_transport = nowStr;
    school.petugas_transport = petugasName;
    playScannerBeep('success');
    showScanBanner(resultBanner, 'success', `
      <div class="font-extrabold text-sm">✓ TRANSPOR PESERTA DISERAHKAN (LUNAS)</div>
      <div class="mt-0.5">${school.nama_sekolah} • Sub Rayon ${school.subrayon}</div>
      <div class="text-[10px] opacity-90">Kehadiran: ${[school.hadir_h1, school.hadir_h2, school.hadir_h3].filter(Boolean).length}/3 Hari • Petugas: ${petugasName}</div>
      ${izinNote}
    `);
  } else if (['absen_h1', 'absen_h2', 'absen_h3'].includes(selectedPosMode)) {
    const colKey = selectedPosMode.replace('absen_', 'hadir_');
    const dayNum = selectedPosMode.slice(-1);

    await sb.from("db_sekolah").update({
      [colKey]: true,
      status_ikut: "Ikut"
    }).eq("id_sekolah", school.id_sekolah);

    school[colKey] = true;
    school.status_ikut = "Ikut";
    playScannerBeep('success');
    showScanBanner(resultBanner, 'success', `
      <div class="font-extrabold text-sm">✓ PRESENSI HARI KE-${dayNum} TERCATAT</div>
      <div class="mt-0.5">${school.nama_sekolah} (Sub Rayon ${school.subrayon})</div>
      ${izinNote}
    `);
  }

  if (reloadCallback) await reloadCallback();
}

function showScanBanner(el, status, htmlContent) {
  if (!el) return;
  el.classList.remove("hidden");
  if (status === 'error') {
    el.className = "p-4 rounded-2xl bg-rose-600 text-white border-2 border-rose-300 shadow-lg";
  } else if (status === 'warn') {
    el.className = "p-4 rounded-2xl bg-amber-500 text-slate-950 border-2 border-amber-300 shadow-lg";
  } else {
    el.className = "p-4 rounded-2xl bg-emerald-600 text-white border-2 border-emerald-300 shadow-lg";
  }
  el.innerHTML = htmlContent;
}
