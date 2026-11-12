// js/scanner_pos.js
import { sb, toast } from './supabase.js';

let posScannerInstance = null;
let selectedPosMode = 'reg_kit'; // 'reg_kit' | 'absen_h1' | 'absen_h2' | 'absen_h3' | 'kit_only' | 'transport'
let isProcessingScan = false;
let lastScannedNpsn = '';
let lastScanTimestamp = 0;

// Daftar Pos Operasional & Divisi yang Berwenang
const POS_DEFINITIONS = [
  {
    id: 'reg_kit',
    label: '1. Pos Registrasi + Ambil Rakor Kit & H1',
    shortLabel: 'Registrasi & Kit',
    desc: '1x Scan otomatis mencatat: Terdaftar Ikut, Hadir Hari Ke-1, dan Terima Rakor Kit/ATK.',
    allowedDivisions: ['Seksi Perlengkapan, Dokumentasi, dan Publikasi', 'Seksi Kesekretariatan', 'Ketua Panitia', 'Sekretaris', 'Penanggung Jawab']
  },
  {
    id: 'absen_h1',
    label: '2. Pos Absensi Masuk — Hari Ke-1',
    shortLabel: 'Absensi Hari 1',
    desc: 'Mencatat kehadiran peserta pada sesi Hari Ke-1 (Kamis, 24 Sept 2026).',
    allowedDivisions: ['Seksi Perlengkapan, Dokumentasi, dan Publikasi', 'Seksi Kesekretariatan', 'Ketua Panitia', 'Sekretaris', 'Penanggung Jawab']
  },
  {
    id: 'absen_h2',
    label: '3. Pos Absensi Masuk — Hari Ke-2',
    shortLabel: 'Absensi Hari 2',
    desc: 'Mencatat kehadiran peserta pada sesi Hari Ke-2 (Jumat, 25 Sept 2026).',
    allowedDivisions: ['Seksi Perlengkapan, Dokumentasi, dan Publikasi', 'Seksi Kesekretariatan', 'Ketua Panitia', 'Sekretaris', 'Penanggung Jawab']
  },
  {
    id: 'absen_h3',
    label: '4. Pos Absensi Masuk — Hari Ke-3',
    shortLabel: 'Absensi Hari 3',
    desc: 'Mencatat kehadiran peserta pada sesi Hari Ke-3 (Sabtu, 26 Sept 2026).',
    allowedDivisions: ['Seksi Perlengkapan, Dokumentasi, dan Publikasi', 'Seksi Kesekretariatan', 'Ketua Panitia', 'Sekretaris', 'Penanggung Jawab']
  },
  {
    id: 'kit_only',
    label: '5. Pos Pengambilan Rakor Kit / ATK Saja',
    shortLabel: 'Rakor Kit / ATK',
    desc: 'Khusus serah terima tas Rakor Kit, ID Card & ATK (Dilengkapi Proteksi Anti-Double).',
    allowedDivisions: ['Seksi Perlengkapan, Dokumentasi, dan Publikasi', 'Seksi Kesekretariatan', 'Bendahara', 'Ketua Panitia', 'Sekretaris', 'Penanggung Jawab']
  },
  {
    id: 'transport',
    label: '6. Pos Terima Uang Transpor Peserta',
    shortLabel: 'Transpor Peserta',
    desc: 'Validasi serah terima transpor peserta & E-Kwitansi (Dilengkapi Proteksi Anti-Double).',
    allowedDivisions: ['Bendahara', 'Seksi Kesekretariatan', 'Ketua Panitia', 'Sekretaris', 'Penanggung Jawab']
  }
];

// Bunyi Beep Otomatis saat Scan Berhasil atau Gagal/Double (Tanpa File MP3 Eksternal)
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
      osc.frequency.setValueAtTime(1046.5, ctx.currentTime); // Nada tinggi bersih (C6)
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      osc.start();
      osc.stop(ctx.currentTime + 0.14);
    } else {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, ctx.currentTime); // Nada peringatan rendah
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

// Menyuntikkan Kartu Tombol Scanner Panitia (di Beranda & Kinerja) atau Kartu Bukti Layanan (di Layar Peserta)
export function renderPosScannerWidgets(activeUser, sekolahList, reloadCallback) {
  injectHomeScannerCard(activeUser, sekolahList, reloadCallback);
  injectPesertaAbsensiKitCard(activeUser, sekolahList);
}

function injectHomeScannerCard(activeUser, sekolahList, reloadCallback) {
  const tabBeranda = document.getElementById("tabContentBeranda");
  if (!tabBeranda) return;

  let container = document.getElementById("posScannerHomeWidget");
  if (!container) {
    container = document.createElement("div");
    container.id = "posScannerHomeWidget";
    // Tempatkan tepat di atas grid layanan
    const firstGrid = tabBeranda.children[2] || null;
    tabBeranda.insertBefore(container, firstGrid);
  }

  if (!activeUser) {
    container.innerHTML = "";
    return;
  }

  // JIKA YANG LOGIN ADALAH PANITIA: Tampilkan Tombol Besar "Buka Scanner Pos Meja Panitia"
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
                Meja Layanan Panitia
              </span>
              <h4 class="text-xs font-extrabold mt-0.5">Scanner QR Pos Registrasi, Kit & Transpor</h4>
            </div>
          </div>
        </div>

        <div class="grid grid-cols-3 gap-2 text-center bg-black/25 p-2 rounded-2xl border border-white/10">
          <div>
            <div class="text-xs font-extrabold text-emerald-300">${totalH1}/158</div>
            <div class="text-[9px] text-slate-300">Hadir H1</div>
          </div>
          <div>
            <div class="text-xs font-extrabold text-amber-300">${totalKit}/158</div>
            <div class="text-[9px] text-slate-300">Rakor Kit</div>
          </div>
          <div>
            <div class="text-xs font-extrabold text-sky-300">${totalTrans}/158</div>
            <div class="text-[9px] text-slate-300">Transpor</div>
          </div>
        </div>

        ${allowedPos.length > 0 ? `
          <button id="btnOpenPosScannerModal" class="w-full py-3 rounded-2xl bg-gradient-to-r from-amber-400 to-yellow-300 hover:from-amber-300 hover:to-yellow-200 text-slate-950 font-extrabold text-xs shadow-md flex items-center justify-center gap-2 active:scale-[0.99] transition">
            <i class="fa-solid fa-camera text-sm"></i>
            <span>BUKA KAMERA SCANNER POS PANITIA</span>
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
    // JIKA YANG LOGIN ADALAH PESERTA (KEPSEK): Tampilkan Ringkasan Status Hak Peserta (Kit, Transpor, Absensi)
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
  if (!activeUser || activeUser.role !== 'peserta') return;
  const subViewHadir = document.getElementById("subViewHadirBox");
  if (!subViewHadir) return;

  const s = sekolahList.find(x => x.id_sekolah === activeUser.profile.id_sekolah) || activeUser.profile;

  let kitBox = document.getElementById("pesertaKitTransportStatusBox");
  if (!kitBox) {
    kitBox = document.createElement("div");
    kitBox.id = "pesertaKitTransportStatusBox";
    subViewHadir.appendChild(kitBox);
  }

  kitBox.className = "space-y-2 pt-2 border-t border-slate-100";
  kitBox.innerHTML = `
    <div class="text-[11px] font-extrabold text-slate-800 uppercase">Bukti Penerimaan Rakor Kit & Transpor:</div>
    <div class="grid grid-cols-2 gap-2">
      <div class="p-3 rounded-2xl border ${s.ambil_kit ? 'bg-emerald-50 border-emerald-300' : 'bg-slate-50 border-slate-200'}">
        <div class="text-[10px] font-bold text-slate-500">Tas Rakor Kit & ATK</div>
        <div class="text-xs font-extrabold mt-0.5 ${s.ambil_kit ? 'text-emerald-800' : 'text-slate-700'}">
          ${s.ambil_kit ? '✓ SUDAH DITERIMA' : 'Belum Diambil'}
        </div>
        <div class="text-[9px] text-slate-400 mt-0.5">${s.waktu_ambil_kit || 'Tunjukkan QR di Meja Kit'}</div>
      </div>
      <div class="p-3 rounded-2xl border ${s.terima_transport ? 'bg-blue-50 border-blue-300' : 'bg-slate-50 border-slate-200'}">
        <div class="text-[10px] font-bold text-slate-500">Uang Transpor Peserta</div>
        <div class="text-xs font-extrabold mt-0.5 ${s.terima_transport ? 'text-blue-900' : 'text-slate-700'}">
          ${s.terima_transport ? '✓ SUDAH DITERIMA' : 'Belum Diterima'}
        </div>
        <div class="text-[9px] text-slate-400 mt-0.5">${s.waktu_terima_transport || 'Tunjukkan QR di Bendahara'}</div>
      </div>
    </div>
  `;
}

// =========================================================================
// MODAL SCANNER MEJA PANITIA (KAMERA LIVE + INPUT MANUAL NPSN + REKAP)
// =========================================================================
export async function openPosScannerModal(activeUser, sekolahList, reloadCallback) {
  const modal = document.getElementById("serviceModal");
  const titleEl = document.getElementById("serviceModalTitle");
  const bodyEl = document.getElementById("serviceModalBody");
  if (!modal || !titleEl || !bodyEl) return;

  await stopPosCamera();
  modal.classList.remove("hidden");

  const allowedPos = getAllowedPosForUser(activeUser);
  if (allowedPos.length > 0 && !allowedPos.some(p => p.id === selectedPosMode)) {
    selectedPosMode = allowedPos[0].id;
  }

  titleEl.innerHTML = `<i class="fa-solid fa-qrcode text-emerald-600 mr-1.5"></i> Scanner Meja Layanan Panitia`;

  renderPosScannerBody(activeUser, allowedPos, sekolahList, bodyEl, reloadCallback);
}

function renderPosScannerBody(activeUser, allowedPos, sekolahList, bodyEl, reloadCallback) {
  const currentPosObj = POS_DEFINITIONS.find(p => p.id === selectedPosMode) || POS_DEFINITIONS[0];

  const countReg = sekolahList.filter(s => s.status_ikut === 'Ikut').length;
  const countH1 = sekolahList.filter(s => s.hadir_h1).length;
  const countH2 = sekolahList.filter(s => s.hadir_h2).length;
  const countH3 = sekolahList.filter(s => s.hadir_h3).length;
  const countKit = sekolahList.filter(s => s.ambil_kit).length;
  const countTrans = sekolahList.filter(s => s.terima_transport).length;

  bodyEl.innerHTML = `
    <!-- Ringkasan Angka Real-time 5 Pos -->
    <div class="grid grid-cols-3 gap-1.5 text-center bg-slate-900 text-white p-2.5 rounded-2xl">
      <div class="bg-white/10 rounded-xl p-1.5">
        <div class="text-xs font-extrabold text-emerald-300">${countH1} / ${countH2} / ${countH3}</div>
        <div class="text-[9px] text-slate-300">Hadir H1 / H2 / H3</div>
      </div>
      <div class="bg-white/10 rounded-xl p-1.5">
        <div class="text-xs font-extrabold text-amber-300">${countKit} / 158</div>
        <div class="text-[9px] text-slate-300">Terima Rakor Kit</div>
      </div>
      <div class="bg-white/10 rounded-xl p-1.5">
        <div class="text-xs font-extrabold text-sky-300">${countTrans} / 158</div>
        <div class="text-[9px] text-slate-300">Terima Transpor</div>
      </div>
    </div>

    ${allowedPos.length > 0 ? `
      <!-- Pilihan Mode Pos Scanner Sesuai Wewenang Divisi -->
      <div class="space-y-1.5">
        <label class="block text-[11px] font-extrabold text-slate-800">Pilih Pos Layanan yang Sedang Anda Jaga:</label>
        <select id="selectPosScannerMode" class="w-full rounded-2xl border-2 border-blue-900 bg-blue-50/50 px-3 py-2.5 text-xs font-extrabold text-blue-950">
          ${allowedPos.map(p => `<option value="${p.id}" ${p.id === selectedPosMode ? 'selected' : ''}>${p.label}</option>`).join('')}
        </select>
        <p id="posModeDescText" class="text-[10px] text-slate-500 font-semibold px-1">${currentPosObj.desc}</p>
      </div>

      <!-- Layar Kamera Scanner Live -->
      <div class="relative rounded-2xl overflow-hidden bg-black border-2 border-slate-800 min-h-[230px] flex flex-col items-center justify-center">
        <div id="posQrReaderBox" class="w-full"></div>
        <button id="btnStartPosCamera" class="my-auto py-3 px-5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs shadow-lg flex items-center gap-2">
          <i class="fa-solid fa-camera"></i>
          <span>Aktifkan Kamera Scanner Pos</span>
        </button>
      </div>

      <!-- Hasil Scan Terakhir (Hijau = Sukses, Merah = Peringatan Double Claim!) -->
      <div id="posScanResultBanner" class="hidden p-3.5 rounded-2xl border text-xs space-y-1 transition-all"></div>

      <!-- Cadangan Input cepat tanpa kamera (Cari Nama Sekolah / NPSN) -->
      <div class="p-3 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
        <div class="text-[10px] font-extrabold uppercase text-slate-600">
          <i class="fa-solid fa-keyboard mr-1"></i> Input Cepat Tanpa Kamera (Pilih Sekolah / NPSN):
        </div>
        <div class="flex gap-1.5">
          <select id="selectManualPosSchool" class="flex-1 rounded-xl border bg-white px-2.5 py-2 text-xs font-semibold">
            <option value="">-- Pilih Sekolah (158 SD/MI) --</option>
            ${sekolahList.map(s => `<option value="${s.npsn}">${s.nama_sekolah} (${s.subrayon})</option>`).join('')}
          </select>
          <button id="btnExecManualPos" class="bg-blue-900 text-white font-extrabold px-3.5 py-2 rounded-xl text-xs shrink-0">
            Proses
          </button>
        </div>
      </div>
    ` : `
      <div class="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900 font-semibold text-center">
        Divisi Anda (<b>${activeUser.profile?.divisi}</b>) berada dalam mode pantauan rekapitulasi.
      </div>
    `}

    <!-- Tabel Rekapitulasi Cepat Status Kit, Absensi & Transpor 158 Sekolah -->
    <div class="space-y-2 pt-2 border-t border-slate-200">
      <div class="flex items-center justify-between">
        <span class="font-extrabold text-xs text-slate-800 uppercase">Daftar Status 158 Sekolah</span>
        <input id="searchRekapPosInput" type="text" placeholder="Cari sekolah/rayon..." class="w-40 rounded-xl border bg-slate-50 px-2.5 py-1 text-[11px] font-semibold" />
      </div>
      <div id="posRekapTableList" class="space-y-1.5 max-h-60 overflow-y-auto pr-0.5"></div>
    </div>
  `;

  // Render daftar rekapitulasi bawah
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

  // Ganti Mode Pos
  document.getElementById("selectPosScannerMode")?.addEventListener("change", (e) => {
    selectedPosMode = e.target.value;
    const posObj = POS_DEFINITIONS.find(p => p.id === selectedPosMode);
    const descEl = document.getElementById("posModeDescText");
    if (descEl && posObj) descEl.textContent = posObj.desc;
  });

  // Aktifkan Kamera Scanner Pos
  document.getElementById("btnStartPosCamera")?.addEventListener("click", () => {
    document.getElementById("btnStartPosCamera")?.classList.add("hidden");
    startPosCameraStream(activeUser, sekolahList, bodyEl, reloadCallback);
  });

  // Eksekusi Manual Tanpa Kamera
  document.getElementById("btnExecManualPos")?.addEventListener("click", async () => {
    const npsn = document.getElementById("selectManualPosSchool")?.value;
    if (!npsn) return toast("Pilih nama sekolah terlebih dahulu!");
    await executePosActionByNpsn(npsn, activeUser, sekolahList, bodyEl, reloadCallback);
  });

  // Pastikan kamera mati saat modal ditutup
  document.getElementById("btnCloseServiceModal")?.addEventListener("click", stopPosCamera, { once: true });
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

  // Ekstrak NPSN dari format QR Peserta ("PESERTA|50305048|..." atau "?verify_cert=SEK-50305048" atau langsung NPSN)
  let npsn = clean;
  if (clean.includes("|")) {
    const parts = clean.split("|");
    npsn = parts[1];
  } else if (clean.includes("SEK-")) {
    npsn = clean.split("SEK-")[1];
  }

  // Cegah scan berulang pada kartu yang sama dalam jeda 3 detik
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

// Logika Inti Pemrosesan Scan 5 Pos + Proteksi Anti-Double Claim
async function executePosActionByNpsn(npsn, activeUser, sekolahList, bodyEl, reloadCallback) {
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

  // 1. MODE POS PENGAMBILAN RAKOR KIT SAJA (CEK DOUBLE CLAIM!)
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
  }

  // 2. MODE POS REGISTRASI + RAKOR KIT + ABSEN H1
  else if (selectedPosMode === 'reg_kit') {
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
  }

  // 3. MODE POS SERAH TERIMA TRANSPOR PESERTA (PROTEKSI KETAT ANTI-DOUBLE!)
  else if (selectedPosMode === 'transport') {
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
  }

  // 4. MODE POS ABSENSI HARIAN (H1 / H2 / H3)
  else if (['absen_h1', 'absen_h2', 'absen_h3'].includes(selectedPosMode)) {
    const colKey = selectedPosMode.replace('absen_', 'hadir_'); // hadir_h1, hadir_h2, hadir_h3
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
