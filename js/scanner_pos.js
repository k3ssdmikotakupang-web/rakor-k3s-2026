// js/scanner_pos.js
// Mencakup:
// 1. Pemisahan Ketat: "Meja Layanan & Otorisasi Pos" (Khusus Panitia) vs "Status Layanan & Hak Peserta" (Data Pribadi Peserta)
// 2. Pemindahan Card "Pantauan Absensi & Izin Peserta" dari Tab Kinerja ke dalam Card Meja Layanan & Otorisasi Pos
// 3. Penambahan Jenis Perizinan "Lainnya" pada Form Izin Peserta
import { sb, toast } from './supabase.js';

export const POS_CONFIG = [
  { id: 'absen_h1', label: 'Absensi Hari Ke-1 (26 Nov)', field: 'hadir_h1', controller: 'Sekretaris', icon: 'fa-calendar-check' },
  { id: 'absen_h2', label: 'Absensi Hari Ke-2 (27 Nov)', field: 'hadir_h2', controller: 'Sekretaris', icon: 'fa-calendar-check' },
  { id: 'absen_h3', label: 'Absensi Hari Ke-3 (28 Nov)', field: 'hadir_h3', controller: 'Sekretaris', icon: 'fa-calendar-check' },
  { id: 'rakor_kit', label: 'Pengambilan Rakor Kit', field: 'ambil_kit', controller: 'Sekretaris', icon: 'fa-briefcase' },
  { id: 'uang_transport', label: 'Penerimaan Uang Transpor', field: 'terima_transport', controller: 'Bendahara', icon: 'fa-money-bill-wave' },
  { id: 'kamar_hotel', label: 'Check-In Kunci Kamar Hotel', field: 'checkin_kamar', controller: 'Sekretaris', icon: 'fa-key' }
];

let posStatusMap = {
  absen_h1: true,
  absen_h2: false,
  absen_h3: false,
  rakor_kit: true,
  uang_transport: false,
  kamar_hotel: true
};

let html5QrScanner = null;
let selectedPosId = 'absen_h1';

async function fetchPosSettings() {
  try {
    const { data } = await sb.from("pengaturan_pos").select("*");
    if (data && data.length > 0) {
      data.forEach(r => {
        if (r.id_pos in posStatusMap) {
          posStatusMap[r.id_pos] = Boolean(r.status_buka);
        }
      });
    }
  } catch (e) {}
}

function canTogglePosLock(activeUser, controllerRole) {
  if (!activeUser || activeUser.role !== 'panitia' || !activeUser.profile) return false;
  const div = activeUser.profile.divisi;
  if (controllerRole === 'Sekretaris' && div === 'Sekretaris') return true;
  if (controllerRole === 'Bendahara' && div === 'Bendahara') return true;
  return false;
}

// Fungsi Utama Pemanggil Widget Pos Layanan, Hak Peserta & Form Izin
export async function renderPosScannerWidgets(activeUser, sekolahList, reloadCallback) {
  await fetchPosSettings();
  removeOldKinerjaAttendanceCard();
  renderBerandaPosOrPesertaRightsCard(activeUser, sekolahList, reloadCallback);
  renderPesertaIzinFormInAbsensiTab(activeUser, sekolahList, reloadCallback);
}

// 1. HAPUS / TARIK KELUAR CARD "PANTAUAN ABSENSI & IZIN PESERTA" DARI MENU KINERJA
function removeOldKinerjaAttendanceCard() {
  const oldIds = [
    "kinerjaAbsensiIzinCard",
    "pantauanAbsensiIzinBox",
    "kinerjaPantauanIzinWidget",
    "kinerjaAttendanceMonitor"
  ];
  oldIds.forEach(id => document.getElementById(id)?.remove());

  const tabKinerja = document.getElementById("tabContentKinerja");
  if (!tabKinerja) return;

  tabKinerja.querySelectorAll(".bg-white, .rounded-3xl, .rounded-2xl").forEach(card => {
    const txt = (card.textContent || "").toUpperCase();
    if (
      txt.includes("PANTAUAN ABSENSI & IZIN PESERTA") ||
      txt.includes("PANTAUAN ABSENSI DAN IZIN") ||
      (txt.includes("PANTAUAN ABSENSI") && txt.includes("IZIN PESERTA"))
    ) {
      // Pastikan bukan kontainer utama daftar tugas
      if (!card.querySelector("#taskCardsContainer")) {
        card.remove();
      }
    }
  });
}

// =========================================================================
// 2. KARTU BERANDA: PISAHKAN TAMPILAN PANITIA VS PESERTA (DATA PRIBADI)
// =========================================================================
function renderBerandaPosOrPesertaRightsCard(activeUser, sekolahList, reloadCallback) {
  const tabBeranda = document.getElementById("tabContentBeranda");
  if (!tabBeranda || !activeUser) return;

  let container = document.getElementById("berandaPosLayananBox");
  if (!container) {
    // Cek apakah di index.html sudah ada kartu statis Meja Layanan / Status Layanan
    const cards = tabBeranda.querySelectorAll(".bg-white.rounded-3xl, .bg-white.rounded-2xl");
    for (const c of cards) {
      const t = (c.textContent || "").toUpperCase();
      if (
        t.includes("MEJA LAYANAN & OTORISASI POS") ||
        t.includes("STATUS LAYANAN & HAK PESERTA")
      ) {
        c.id = "berandaPosLayananBox";
        container = c;
        break;
      }
    }
  }

  if (!container) {
    container = document.createElement("div");
    container.id = "berandaPosLayananBox";
    const subrayonBarsEl = document.getElementById("homeSubrayonBars");
    const subrayonCard = subrayonBarsEl ? (subrayonBarsEl.closest(".bg-white") || subrayonBarsEl.parentElement) : null;
    if (subrayonCard && subrayonCard.parentElement === tabBeranda) {
      tabBeranda.insertBefore(container, subrayonCard);
    } else {
      tabBeranda.appendChild(container);
    }
  }

  // JIKA YANG LOGIN ADALAH PESERTA -> TAMPILKAN HANYA DATA MILIKNYA SENDIRI!
  if (activeUser.role === "peserta") {
    renderPesertaPersonalRightsView(container, activeUser, sekolahList);
  } else {
    // JIKA YANG LOGIN ADALAH PANITIA -> TAMPILKAN MEJA LAYANAN, OTORISASI POS & PANTAUAN IZIN PESERTA
    renderPanitiaMejaLayananAndIzinView(container, activeUser, sekolahList, reloadCallback);
  }
}

// A. TAMPILAN KHUSUS PESERTA: HANYA DATA MILIK SEKOLAHNYA SENDIRI
function renderPesertaPersonalRightsView(container, activeUser, sekolahList) {
  const s = sekolahList.find(x => x.id_sekolah === activeUser.profile?.id_sekolah) || activeUser.profile || {};

  const sudahH1 = Boolean(s.hadir_h1);
  const sudahH2 = Boolean(s.hadir_h2);
  const sudahH3 = Boolean(s.hadir_h3);
  const sudahKit = Boolean(s.ambil_kit);
  const sudahTrans = Boolean(s.terima_transport);
  const isLunas = s.status_bayar === "Lunas";
  const kamar = (s.nomor_kamar && s.nomor_kamar !== "Belum Ditentukan") ? s.nomor_kamar : "Belum Ditentukan";
  const hasIzin = Boolean(s.status_izin && String(s.status_izin).trim() !== "");

  container.className = "bg-white rounded-3xl p-4 border border-slate-200/90 shadow-xs space-y-3";
  container.innerHTML = `
    <div class="flex items-center justify-between border-b border-slate-100 pb-2.5">
      <div class="flex items-center gap-2">
        <div class="w-8 h-8 rounded-xl bg-blue-900 text-amber-300 flex items-center justify-center text-xs shadow-2xs">
          <i class="fa-solid fa-user-check"></i>
        </div>
        <div>
          <h3 class="font-extrabold text-xs text-slate-900 uppercase tracking-tight">Status Layanan & Hak Peserta</h3>
          <p class="text-[10px] text-slate-500 truncate max-w-[210px]">${s.nama_sekolah || 'Sekolah Peserta'}</p>
        </div>
      </div>
      <span class="text-[9px] font-extrabold uppercase px-2.5 py-0.5 rounded-full ${isLunas ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}">
        ${s.status_bayar || 'Belum Bayar'}
      </span>
    </div>

    <!-- Baris 1: Status Kehadiran Pribadi 3 Hari (26-28 Nov 2026) -->
    <div>
      <div class="text-[9px] font-extrabold uppercase text-slate-400 mb-1.5 tracking-wider">
        1. Status Presensi Kehadiran Anda (26–28 Nov 2026):
      </div>
      <div class="grid grid-cols-3 gap-2 text-center">
        <div class="p-2.5 rounded-2xl border ${sudahH1 ? 'bg-emerald-50 border-emerald-300 text-emerald-900' : 'bg-slate-50 border-slate-200 text-slate-500'}">
          <i class="fa-solid ${sudahH1 ? 'fa-circle-check text-emerald-600' : 'fa-clock text-slate-400'} text-sm"></i>
          <div class="text-[10px] font-extrabold mt-1">Hari Ke-1</div>
          <div class="text-[9px] font-bold ${sudahH1 ? 'text-emerald-700' : 'text-slate-400'}">${sudahH1 ? 'Hadir Sah' : 'Belum Scan'}</div>
        </div>
        <div class="p-2.5 rounded-2xl border ${sudahH2 ? 'bg-emerald-50 border-emerald-300 text-emerald-900' : 'bg-slate-50 border-slate-200 text-slate-500'}">
          <i class="fa-solid ${sudahH2 ? 'fa-circle-check text-emerald-600' : 'fa-clock text-slate-400'} text-sm"></i>
          <div class="text-[10px] font-extrabold mt-1">Hari Ke-2</div>
          <div class="text-[9px] font-bold ${sudahH2 ? 'text-emerald-700' : 'text-slate-400'}">${sudahH2 ? 'Hadir Sah' : 'Belum Scan'}</div>
        </div>
        <div class="p-2.5 rounded-2xl border ${sudahH3 ? 'bg-emerald-50 border-emerald-300 text-emerald-900' : 'bg-slate-50 border-slate-200 text-slate-500'}">
          <i class="fa-solid ${sudahH3 ? 'fa-circle-check text-emerald-600' : 'fa-clock text-slate-400'} text-sm"></i>
          <div class="text-[10px] font-extrabold mt-1">Hari Ke-3</div>
          <div class="text-[9px] font-bold ${sudahH3 ? 'text-emerald-700' : 'text-slate-400'}">${sudahH3 ? 'Hadir Sah' : 'Belum Scan'}</div>
        </div>
      </div>
    </div>

    <!-- Baris 2: Status Penerimaan Hak Peserta (Rakor Kit, Uang Transpor & Kamar) -->
    <div>
      <div class="text-[9px] font-extrabold uppercase text-slate-400 mb-1.5 tracking-wider">
        2. Status Penerimaan Fasilitas & Hak Peserta Anda:
      </div>
      <div class="grid grid-cols-2 gap-2">
        <div class="p-3 rounded-2xl border ${sudahKit ? 'bg-emerald-50 border-emerald-300' : 'bg-amber-50/60 border-amber-200'} flex items-center gap-2.5">
          <div class="w-9 h-9 rounded-xl ${sudahKit ? 'bg-emerald-600 text-white' : 'bg-amber-400 text-slate-950'} flex items-center justify-center text-sm shrink-0">
            <i class="fa-solid fa-briefcase"></i>
          </div>
          <div class="min-w-0">
            <div class="text-[10px] font-extrabold text-slate-900">Rakor Kit / ATK</div>
            <div class="text-[10px] font-bold ${sudahKit ? 'text-emerald-700' : 'text-amber-800'}">
              ${sudahKit ? '✓ Sudah Diterima' : '⏳ Belum Diambil'}
            </div>
          </div>
        </div>

        <div class="p-3 rounded-2xl border ${sudahTrans ? 'bg-emerald-50 border-emerald-300' : 'bg-blue-50/60 border-blue-200'} flex items-center gap-2.5">
          <div class="w-9 h-9 rounded-xl ${sudahTrans ? 'bg-emerald-600 text-white' : 'bg-blue-900 text-amber-300'} flex items-center justify-center text-sm shrink-0">
            <i class="fa-solid fa-money-bill-wave"></i>
          </div>
          <div class="min-w-0">
            <div class="text-[10px] font-extrabold text-slate-900">Uang Transpor</div>
            <div class="text-[10px] font-bold ${sudahTrans ? 'text-emerald-700' : 'text-blue-900'}">
              ${sudahTrans ? '✓ Sudah Diterima' : '⏳ Belum Diambil'}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Info Kamar & Status Izin Pribadi -->
    <div class="p-3 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
      <div class="flex items-center gap-2">
        <i class="fa-solid fa-bed text-indigo-700"></i>
        <span class="text-[11px] font-bold text-slate-700">Kamar Hotel Anda:</span>
      </div>
      <span class="text-[11px] font-extrabold text-indigo-950 bg-indigo-100 px-2.5 py-0.5 rounded-lg">${kamar}</span>
    </div>

    ${hasIzin ? `
      <div class="p-2.5 rounded-xl bg-amber-50 border border-amber-300 flex items-center justify-between text-[11px]">
        <span class="font-bold text-amber-950"><i class="fa-solid fa-envelope-open-text mr-1 text-amber-700"></i>Status Izin Anda: <b>${s.status_izin}</b></span>
        <span class="text-[10px] text-amber-800 truncate max-w-[140px]">${s.alasan_izin || ''}</span>
      </div>
    ` : ''}

    <button type="button" id="btnShowMyQrFromRights" class="w-full py-2.5 rounded-2xl bg-slate-900 hover:bg-slate-800 text-amber-300 font-extrabold text-xs flex items-center justify-center gap-2 shadow transition active:scale-95">
      <i class="fa-solid fa-qrcode"></i>
      <span>Tampilkan QR Code Saya untuk Scan Layanan</span>
    </button>
  `;

  document.getElementById("btnShowMyQrFromRights")?.addEventListener("click", () => {
    document.querySelector('.bottom-nav-btn[data-tab="qr"]')?.click();
  });
}

// B. TAMPILAN KHUSUS PANITIA: MEJA LAYANAN, OTORISASI POS & PANTAUAN ABSENSI/IZIN PESERTA
function renderPanitiaMejaLayananAndIzinView(container, activeUser, sekolahList, reloadCallback) {
  const totalSek = sekolahList.length || 160;
  const h1Count = sekolahList.filter(s => s.hadir_h1).length;
  const h2Count = sekolahList.filter(s => s.hadir_h2).length;
  const h3Count = sekolahList.filter(s => s.hadir_h3).length;
  const kitCount = sekolahList.filter(s => s.ambil_kit).length;
  const transCount = sekolahList.filter(s => s.terima_transport).length;

  const izinList = sekolahList.filter(s => s.status_izin && String(s.status_izin).trim() !== "");
  const isSekretaris = activeUser.profile?.divisi === "Sekretaris";
  const isBendahara = activeUser.profile?.divisi === "Bendahara";

  container.className = "bg-white rounded-3xl p-4 border border-slate-200/90 shadow-xs space-y-3.5";
  container.innerHTML = `
    <div class="flex items-center justify-between border-b border-slate-100 pb-2.5">
      <div class="flex items-center gap-2">
        <div class="w-8 h-8 rounded-xl bg-blue-900 text-amber-300 flex items-center justify-center text-xs shadow-2xs">
          <i class="fa-solid fa-qrcode"></i>
        </div>
        <div>
          <h3 class="font-extrabold text-xs text-slate-900 uppercase tracking-tight">Meja Layanan & Otorisasi Pos</h3>
          <p class="text-[10px] text-slate-500">Pantauan Absensi, Izin Peserta, Rakor Kit & Transpor</p>
        </div>
      </div>
      <button type="button" id="btnOpenPosScannerModal" class="px-3 py-1.5 rounded-xl bg-blue-900 hover:bg-blue-800 text-amber-300 font-extrabold text-[11px] shadow flex items-center gap-1.5 active:scale-95 transition">
        <i class="fa-solid fa-camera"></i>
        <span>Scan Pos</span>
      </button>
    </div>

    <!-- Container Statistik 5 Indikator (Terintegrasi dengan Pelacak spj_bosp.js) -->
    <div id="upgradedMejaLayananStatsGrid" class="space-y-2">
      <div class="grid grid-cols-3 gap-2 text-center">
        <div class="bg-blue-50 rounded-2xl p-2 border border-blue-200">
          <div class="text-sm font-extrabold text-blue-900">${h1Count}<span class="text-[10px] font-semibold text-slate-400">/${totalSek}</span></div>
          <div class="text-[9px] font-extrabold text-blue-800 uppercase">Hadir H1 (26/11)</div>
          <div class="text-[8px] font-bold text-rose-600 mt-0.5">Belum: ${totalSek - h1Count}</div>
        </div>
        <div class="bg-indigo-50 rounded-2xl p-2 border border-indigo-200">
          <div class="text-sm font-extrabold text-indigo-900">${h2Count}<span class="text-[10px] font-semibold text-slate-400">/${totalSek}</span></div>
          <div class="text-[9px] font-extrabold text-indigo-800 uppercase">Hadir H2 (27/11)</div>
          <div class="text-[8px] font-bold text-rose-600 mt-0.5">Belum: ${totalSek - h2Count}</div>
        </div>
        <div class="bg-violet-50 rounded-2xl p-2 border border-violet-200">
          <div class="text-sm font-extrabold text-violet-900">${h3Count}<span class="text-[10px] font-semibold text-slate-400">/${totalSek}</span></div>
          <div class="text-[9px] font-extrabold text-violet-800 uppercase">Hadir H3 (28/11)</div>
          <div class="text-[8px] font-bold text-rose-600 mt-0.5">Belum: ${totalSek - h3Count}</div>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-2 text-center">
        <div class="bg-amber-50 rounded-2xl p-2 border border-amber-200 flex items-center justify-between px-3">
          <div class="text-left">
            <div class="text-[9px] font-extrabold text-amber-900 uppercase">Ambil Rakor Kit</div>
            <div class="text-[8px] font-bold text-rose-600">Belum: ${totalSek - kitCount} Sekolah</div>
          </div>
          <div class="text-sm font-extrabold text-amber-800">${kitCount}<span class="text-[10px] font-normal text-slate-400">/${totalSek}</span></div>
        </div>
        <div class="bg-emerald-50 rounded-2xl p-2 border border-emerald-200 flex items-center justify-between px-3">
          <div class="text-left">
            <div class="text-[9px] font-extrabold text-emerald-900 uppercase">Terima Transpor</div>
            <div class="text-[8px] font-bold text-rose-600">Belum: ${totalSek - transCount} Sekolah</div>
          </div>
          <div class="text-sm font-extrabold text-emerald-800">${transCount}<span class="text-[10px] font-normal text-slate-400">/${totalSek}</span></div>
        </div>
      </div>
    </div>

    <!-- BAGIAN PINDAHAN DARI MENU KINERJA: PANTAUAN ABSENSI & IZIN PESERTA -->
    <div class="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200 space-y-2.5">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-1.5">
          <i class="fa-solid fa-envelope-open-text text-amber-700 text-xs"></i>
          <span class="text-[11px] font-extrabold text-slate-900 uppercase">Pantauan Absensi & Izin Peserta</span>
        </div>
        <span class="text-[10px] font-extrabold px-2 py-0.5 rounded-full ${izinList.length > 0 ? 'bg-amber-400 text-slate-950' : 'bg-slate-200 text-slate-600'}">
          ${izinList.length} Pengajuan Izin
        </span>
      </div>

      ${izinList.length === 0 ? `
        <div class="text-[10px] text-slate-500 bg-white/80 rounded-xl p-2.5 text-center border border-amber-200/60 font-semibold">
          Belum ada peserta yang mengajukan izin ketidakhadiran.
        </div>
      ` : `
        <div class="space-y-1.5 max-h-44 overflow-y-auto pr-0.5">
          ${izinList.map(iz => `
            <div class="p-2.5 rounded-xl bg-white border border-amber-200 flex items-start justify-between gap-2 text-[10px]">
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-1.5 flex-wrap">
                  <span class="font-extrabold bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded">${iz.status_izin}</span>
                  <span class="font-bold text-slate-500">Rayon ${iz.subrayon}</span>
                </div>
                <div class="font-extrabold text-slate-900 truncate mt-1">${iz.nama_sekolah}</div>
                <div class="text-slate-600">Kepsek: <b>${iz.nama_kepsek || '-'}</b></div>
                <div class="text-slate-500 italic mt-0.5">"${iz.alasan_izin || '-'}"</div>
              </div>
              <div class="flex flex-col items-end gap-1 shrink-0">
                ${iz.surat_izin_url ? `
                  <a href="${iz.surat_izin_url}" target="_blank" rel="noopener noreferrer" class="px-2 py-1 rounded-lg bg-blue-100 hover:bg-blue-200 text-blue-900 font-extrabold text-[9px] flex items-center gap-1">
                    <i class="fa-solid fa-file-lines"></i> Bukti
                  </a>
                ` : ''}
                ${(isSekretaris || activeUser.profile?.divisi === 'Seksi Kesekretariatan') ? `
                  <button type="button" data-sch="${iz.id_sekolah}" class="btn-clear-izin-row text-[9px] font-bold text-rose-600 hover:underline">
                    Reset Izin
                  </button>
                ` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      `}
    </div>

    <!-- Status Buka/Tutup 6 Pos Layanan (Khusus Sekretaris & Bendahara Bisa Klik Saklar) -->
    <div class="space-y-1.5 pt-1 border-t border-slate-100">
      <div class="flex items-center justify-between text-[10px] font-bold text-slate-500">
        <span>Status Otorisasi 6 Pos Layanan:</span>
        <span>${(isSekretaris || isBendahara) ? 'Ketuk pos untuk Buka/Kunci' : 'Dikendalikan Sekretaris & Bendahara'}</span>
      </div>
      <div class="grid grid-cols-2 gap-1.5">
        ${POS_CONFIG.map(pos => {
          const isOpen = Boolean(posStatusMap[pos.id]);
          const canToggle = canTogglePosLock(activeUser, pos.controller);
          return `
            <div data-posid="${pos.id}" data-ctrl="${pos.controller}" class="pos-lock-item p-2 rounded-xl border flex items-center justify-between gap-1.5 ${
              isOpen ? 'bg-emerald-50/70 border-emerald-200' : 'bg-slate-50 border-slate-200'
            } ${canToggle ? 'cursor-pointer hover:border-blue-500 active:scale-95 transition' : ''}">
              <div class="min-w-0">
                <div class="text-[10px] font-extrabold text-slate-800 truncate">${pos.label}</div>
                <div class="text-[8px] font-bold text-slate-400">Otoritas: ${pos.controller}</div>
              </div>
              <span class="text-[9px] font-extrabold px-1.5 py-0.5 rounded shrink-0 ${
                isOpen ? 'bg-emerald-600 text-white' : 'bg-slate-300 text-slate-700'
              }">
                <i class="fa-solid ${isOpen ? 'fa-lock-open' : 'fa-lock'}"></i>
              </span>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;

  document.getElementById("btnOpenPosScannerModal")?.addEventListener("click", () => {
    openPosScannerModal(activeUser, sekolahList, reloadCallback);
  });

  container.querySelectorAll(".btn-clear-izin-row").forEach(btn => {
    btn.addEventListener("click", async () => {
      const schId = btn.dataset.sch;
      if (!confirm("Batalkan/reset status izin sekolah ini?")) return;
      await sb.from("db_sekolah").update({
        status_izin: "",
        alasan_izin: "",
        surat_izin_url: ""
      }).eq("id_sekolah", schId);
      toast("Status izin peserta direset.");
      if (reloadCallback) await reloadCallback();
    });
  });

  container.querySelectorAll(".pos-lock-item").forEach(item => {
    item.addEventListener("click", async () => {
      const posId = item.dataset.posid;
      const ctrl = item.dataset.ctrl;
      if (!canTogglePosLock(activeUser, ctrl)) {
        return toast(`Pos ini hanya dapat dibuka/dikunci oleh ${ctrl}!`);
      }
      const nextState = !posStatusMap[posId];
      posStatusMap[posId] = nextState;
      const posObj = POS_CONFIG.find(p => p.id === posId);

      await sb.from("pengaturan_pos").upsert([{
        id_pos: posId,
        nama_pos: posObj ? posObj.label : posId,
        status_buka: nextState,
        diupdate_oleh: activeUser.profile?.nama_panitia || ctrl,
        waktu_update: new Date().toLocaleString("id-ID")
      }]);

      toast(`${posObj ? posObj.label : posId}: ${nextState ? 'DIBUKA' : 'DIKUNCI'}`);
      if (reloadCallback) await reloadCallback();
    });
  });
}

// =========================================================================
// 3. FORM PENGAJUAN IZIN PESERTA DI TAB ABSENSI (+ OPSI JENIS IZIN "LAINNYA")
// =========================================================================
function renderPesertaIzinFormInAbsensiTab(activeUser, sekolahList, reloadCallback) {
  if (!activeUser || activeUser.role !== "peserta") return;
  const absensiContainer = document.getElementById("absensiDaysContainer");
  if (!absensiContainer) return;

  let izinBox = document.getElementById("pesertaIzinFormCard");
  if (!izinBox) {
    izinBox = document.createElement("div");
    izinBox.id = "pesertaIzinFormCard";
    absensiContainer.appendChild(izinBox);
  }

  const s = sekolahList.find(x => x.id_sekolah === activeUser.profile?.id_sekolah) || activeUser.profile || {};
  const currentJenis = s.status_izin || "";
  const standardTypes = ["", "Sakit", "Tugas Kedinasan", "Kedukaan Keluarga"];
  const isCustomType = Boolean(currentJenis && !standardTypes.includes(currentJenis));
  const selectedDropdownVal = isCustomType ? "Lainnya" : currentJenis;

  izinBox.className = "p-4 rounded-2xl bg-amber-50/70 border border-amber-200 space-y-3 mt-3";
  izinBox.innerHTML = `
    <div class="flex items-center justify-between border-b border-amber-200/80 pb-2">
      <div>
        <span class="text-[9px] font-extrabold uppercase bg-amber-400 text-slate-950 px-2 py-0.5 rounded">
          Form Perizinan Peserta
        </span>
        <h4 class="font-extrabold text-xs text-slate-900 mt-1">Pengajuan Izin Ketidakhadiran / Terlambat</h4>
      </div>
      <i class="fa-solid fa-envelope-open-text text-amber-700 text-base"></i>
    </div>

    <div class="space-y-2.5 text-xs">
      <div>
        <label class="block text-[10px] font-bold text-slate-700 mb-1">Pilih Jenis Perizinan:</label>
        <select id="inpPesertaJenisIzin" class="w-full rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs font-extrabold text-slate-900">
          <option value="" ${selectedDropdownVal === '' ? 'selected' : ''}>-- Hadir Normal (Tidak Mengajukan Izin) --</option>
          <option value="Sakit" ${selectedDropdownVal === 'Sakit' ? 'selected' : ''}>Izin Sakit</option>
          <option value="Tugas Kedinasan" ${selectedDropdownVal === 'Tugas Kedinasan' ? 'selected' : ''}>Izin Tugas Kedinasan / Dinas Luar</option>
          <option value="Kedukaan Keluarga" ${selectedDropdownVal === 'Kedukaan Keluarga' ? 'selected' : ''}>Izin Kedukaan Keluarga</option>
          <option value="Lainnya" ${selectedDropdownVal === 'Lainnya' ? 'selected' : ''}>Lainnya (Tuliskan Jenis Perizinan)</option>
        </select>
      </div>

      <!-- Input Jenis Perizinan Lainnya (Muncul otomatis jika memilih "Lainnya") -->
      <div id="boxInputJenisIzinLainnya" class="${selectedDropdownVal === 'Lainnya' ? '' : 'hidden'}">
        <label class="block text-[10px] font-bold text-amber-950 mb-1">Tuliskan Jenis Perizinan Lainnya:</label>
        <input id="inpPesertaJenisIzinCustom" type="text" value="${isCustomType ? currentJenis.replace(/^Izin\s+/i, '') : ''}" placeholder="Contoh: Urusan Keluarga Mendesak / Cuti / Studi..." class="w-full rounded-xl border-2 border-amber-400 bg-white px-3 py-2 text-xs font-bold text-slate-900" />
      </div>

      <div>
        <label class="block text-[10px] font-bold text-slate-700 mb-1">Keterangan / Alasan Lengkap:</label>
        <textarea id="inpPesertaAlasanIzin" rows="2" placeholder="Jelaskan alasan izin atau hari yang tidak dapat diikuti..." class="w-full rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs font-semibold">${s.alasan_izin || ''}</textarea>
      </div>

      <div>
        <label class="block text-[10px] font-bold text-slate-700 mb-1">Unggah Surat Izin / Bukti Pendukung (Opsional - PDF/Foto):</label>
        <input id="inpPesertaFileIzin" type="file" accept=".pdf,image/*" class="w-full rounded-xl border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:bg-amber-500 file:text-slate-950 file:text-[10px] file:font-extrabold" />
        ${s.surat_izin_url ? `
          <a href="${s.surat_izin_url}" target="_blank" rel="noopener noreferrer" class="inline-block text-[10px] font-extrabold text-blue-800 hover:underline mt-1">
            <i class="fa-solid fa-paperclip mr-1"></i>Lihat Bukti Surat Izin yang Sudah Diunggah
          </a>
        ` : ''}
      </div>

      <button type="button" id="btnSubmitIzinPeserta" class="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs shadow flex items-center justify-center gap-1.5 transition">
        <i class="fa-solid fa-paper-plane"></i>
        <span>Simpan Status Perizinan</span>
      </button>
    </div>
  `;

  const selEl = document.getElementById("inpPesertaJenisIzin");
  const customBox = document.getElementById("boxInputJenisIzinLainnya");
  selEl?.addEventListener("change", () => {
    if (selEl.value === "Lainnya") {
      customBox?.classList.remove("hidden");
      document.getElementById("inpPesertaJenisIzinCustom")?.focus();
    } else {
      customBox?.classList.add("hidden");
    }
  });

  document.getElementById("btnSubmitIzinPeserta")?.addEventListener("click", async () => {
    const rawSelect = document.getElementById("inpPesertaJenisIzin")?.value || "";
    const customText = document.getElementById("inpPesertaJenisIzinCustom")?.value.trim() || "";
    const alasan = document.getElementById("inpPesertaAlasanIzin")?.value.trim() || "";
    const file = document.getElementById("inpPesertaFileIzin")?.files?.[0];

    let finalStatusIzin = rawSelect;
    if (rawSelect === "Lainnya") {
      if (!customText) return toast("Mohon tuliskan jenis perizinan pada kolom Jenis Perizinan Lainnya!");
      finalStatusIzin = customText.toLowerCase().startsWith("izin") ? customText : `Izin: ${customText}`;
    }

    const btn = document.getElementById("btnSubmitIzinPeserta");
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner animate-spin"></i> Menyimpan...`;

    let suratUrl = s.surat_izin_url || "";
    if (file) {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'pdf';
      const fileName = `surat_izin_${s.npsn}_${Date.now()}.${ext}`;
      const { error: upErr } = await sb.storage.from("dokumen_rakor").upload(fileName, file, { upsert: true });
      if (!upErr) {
        const { data: pub } = sb.storage.from("dokumen_rakor").getPublicUrl(fileName);
        suratUrl = pub?.publicUrl || "";
      }
    }

    await sb.from("db_sekolah").update({
      status_izin: finalStatusIzin,
      alasan_izin: finalStatusIzin ? alasan : "",
      surat_izin_url: finalStatusIzin ? suratUrl : ""
    }).eq("id_sekolah", s.id_sekolah);

    s.status_izin = finalStatusIzin;
    s.alasan_izin = finalStatusIzin ? alasan : "";
    s.surat_izin_url = finalStatusIzin ? suratUrl : "";

    toast(finalStatusIzin ? `Perizinan (${finalStatusIzin}) berhasil dikirim ke Panitia!` : "Status dikembalikan ke Hadir Normal.");
    if (reloadCallback) await reloadCallback();
  });
}

// =========================================================================
// 4. MODAL PEMINDAI QR MULTI-POS (KHUSUS PANITIA)
// =========================================================================
export function openPosScannerModal(activeUser, sekolahList, reloadCallback) {
  if (!activeUser || activeUser.role !== "panitia") return;

  const modal = document.getElementById("serviceModal");
  const titleEl = document.getElementById("serviceModalTitle");
  const bodyEl = document.getElementById("serviceModalBody");
  if (!modal || !titleEl || !bodyEl) return;

  modal.classList.remove("hidden");
  titleEl.innerHTML = `<i class="fa-solid fa-qrcode text-blue-700 mr-1.5"></i> Scanner Meja Layanan Pos Rakor`;

  bodyEl.innerHTML = `
    <div class="space-y-3">
      <div>
        <label class="block text-[10px] font-extrabold uppercase text-slate-600 mb-1">Pilih Pos Layanan Aktif:</label>
        <select id="scannerSelectPos" class="w-full rounded-2xl border-2 border-blue-900 bg-blue-50/50 px-3 py-2.5 text-xs font-extrabold text-blue-950">
          ${POS_CONFIG.map(p => {
            const open = posStatusMap[p.id];
            return `<option value="${p.id}" ${selectedPosId === p.id ? 'selected' : ''}>${open ? '🟢 [BUKA]' : '🔒 [TERKUNCI]'} ${p.label}</option>`;
          }).join('')}
        </select>
      </div>

      <div id="posCameraReaderBox" class="w-full rounded-3xl overflow-hidden bg-slate-950 border-2 border-slate-800 min-h-[240px] flex items-center justify-center text-white text-xs">
        <span>Memuat kamera pemindai QR...</span>
      </div>

      <div class="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
        <div class="text-[10px] font-extrabold text-slate-700 uppercase">Input Manual NPSN (Jika Kamera Sulit Fokus):</div>
        <div class="flex gap-2">
          <input id="inpManualScanNpsn" type="text" placeholder="Ketik 8 digit NPSN sekolah..." class="flex-1 rounded-xl border bg-white px-3 py-2 text-xs font-bold" />
          <button type="button" id="btnSubmitManualScan" class="px-4 py-2 rounded-xl bg-blue-900 text-amber-300 font-extrabold text-xs shadow">
            Proses
          </button>
        </div>
      </div>

      <div id="scanPosResultBanner" class="hidden p-3.5 rounded-2xl border text-xs font-bold"></div>
    </div>
  `;

  document.getElementById("scannerSelectPos")?.addEventListener("change", (e) => {
    selectedPosId = e.target.value;
  });

  document.getElementById("btnSubmitManualScan")?.addEventListener("click", () => {
    const npsn = document.getElementById("inpManualScanNpsn")?.value.trim();
    if (!npsn) return toast("Masukkan NPSN terlebih dahulu!");
    processPosScanPayload(`PESERTA|${npsn}`, activeUser, sekolahList, reloadCallback);
  });

  startCameraPosScanner(activeUser, sekolahList, reloadCallback);
}

async function startCameraPosScanner(activeUser, sekolahList, reloadCallback) {
  try {
    if (html5QrScanner) {
      await html5QrScanner.stop().catch(() => {});
    }
    if (typeof window.Html5Qrcode !== "function") return;
    html5QrScanner = new window.Html5Qrcode("posCameraReaderBox");
    await html5QrScanner.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 210, height: 210 } },
      async (decodedText) => {
        await processPosScanPayload(decodedText, activeUser, sekolahList, reloadCallback);
      },
      () => {}
    );
  } catch (e) {
    const box = document.getElementById("posCameraReaderBox");
    if (box) {
      box.innerHTML = `<div class="p-6 text-center text-slate-300 text-xs">Kamera belum diizinkan atau perangkat tidak memiliki kamera. Gunakan kolom Input Manual NPSN di bawah.</div>`;
    }
  }
}

async function processPosScanPayload(rawText, activeUser, sekolahList, reloadCallback) {
  const posObj = POS_CONFIG.find(p => p.id === selectedPosId);
  if (!posObj) return;

  if (!posStatusMap[selectedPosId]) {
    return toast(`Pos ${posObj.label} masih DIKUNCI oleh ${posObj.controller}!`);
  }

  const parts = String(rawText).split("|");
  const npsn = parts.length >= 2 ? parts[1].trim() : String(rawText).trim();
  const school = sekolahList.find(s => String(s.npsn) === npsn);

  const resBanner = document.getElementById("scanPosResultBanner");
  if (!school) {
    if (resBanner) {
      resBanner.className = "p-3.5 rounded-2xl bg-rose-50 border border-rose-300 text-rose-900 text-xs font-bold";
      resBanner.textContent = `NPSN "${npsn}" tidak ditemukan dalam database 160 sekolah!`;
    }
    return toast("Data sekolah tidak ditemukan!");
  }

  const updatePayload = {};
  updatePayload[posObj.field] = true;
  if (selectedPosId.startsWith("absen_")) {
    updatePayload.status_ikut = "Ikut";
  }

  await sb.from("db_sekolah").update(updatePayload).eq("id_sekolah", school.id_sekolah);
  school[posObj.field] = true;

  if (resBanner) {
    resBanner.className = "p-3.5 rounded-2xl bg-emerald-50 border-2 border-emerald-400 text-emerald-950 text-xs font-extrabold";
    resBanner.innerHTML = `<i class="fa-solid fa-circle-check text-emerald-600 mr-1"></i> BERHASIL: ${school.nama_sekolah} (${school.nama_kepsek || 'Kepsek'}) tercatat pada <u>${posObj.label}</u>!`;
  }

  toast(`Berhasil: ${school.nama_sekolah}`);
  if (reloadCallback) await reloadCallback();
}
