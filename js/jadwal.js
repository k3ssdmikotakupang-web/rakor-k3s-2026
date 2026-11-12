// js/jadwal.js
import { sb, toast } from './supabase.js';

export let isSekretaris = false;
let currentDay = 1;
let scheduleCache = [];

export async function checkSecretaryPrivilege(userSession) {
  isSekretaris = Boolean(
    userSession &&
    userSession.role === 'panitia' &&
    userSession.profile &&
    userSession.profile.divisi === 'Sekretaris'
  );
}

// Ambil jam mulai & selesai dalam satuan menit sejak 00:00 (Contoh: "13.00 - 16.30" -> 780)
function parseSessionTimeRange(waktuStr, urutanWaktuStr) {
  const source = String(waktuStr || urutanWaktuStr || '').trim();
  const matches = [...source.matchAll(/(\d{1,2})[:.](\d{2})/g)];
  if (matches.length === 0) {
    return { startMin: 9999, endMin: 9999 };
  }
  const startMin = parseInt(matches[0][1], 10) * 60 + parseInt(matches[0][2], 10);
  let endMin = startMin + 60;
  if (matches.length > 1) {
    endMin = parseInt(matches[1][1], 10) * 60 + parseInt(matches[1][2], 10);
    if (endMin < startMin) endMin += 24 * 60;
  }
  return { startMin, endMin };
}

function extractSqlTime(waktuStr) {
  const match = String(waktuStr || '').trim().match(/(\d{1,2})[:.](\d{2})/);
  if (!match) return '23:59:00';
  const hh = String(match[1]).padStart(2, '0');
  const mm = String(match[2]).padStart(2, '0');
  return `${hh}:${mm}:00`;
}

export function initJadwal() {
  document.getElementById("btnDay1")?.addEventListener("click", () => filterDay(1));
  document.getElementById("btnDay2")?.addEventListener("click", () => filterDay(2));
  document.getElementById("btnDay3")?.addEventListener("click", () => filterDay(3));

  document.getElementById("btnAddSchedule")?.addEventListener("click", () => openModal(null));
  document.getElementById("btnSaveSchedule")?.addEventListener("click", saveSesi);
  document.getElementById("btnCancelSchedule")?.addEventListener("click", closeModal);
  document.getElementById("btnDismissSchedule")?.addEventListener("click", closeModal);

  updateDayButtonsUI();
}

function updateDayButtonsUI() {
  [1, 2, 3].forEach(d => {
    const btn = document.getElementById(`btnDay${d}`);
    if (!btn) return;
    btn.className =
      d === currentDay
        ? "py-2 rounded-xl text-xs font-extrabold bg-blue-900 text-white shadow transition"
        : "py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200/60 transition";
  });
}

export function filterDay(day) {
  currentDay = Number(day);
  updateDayButtonsUI();
  renderLiveJadwal();
}

export async function renderLiveJadwal() {
  updateDayButtonsUI();

  const { data, error } = await sb.from("jadwal_rakor").select("*");
  if (error || !data) return;

  // 1. Urutkan murni secara kronologis (Hari 1 -> Hari 3, Pagi -> Malam) untuk mencari pasangan "Now & Next"
  const chronologicalList = [...data].sort((a, b) => {
    const dayDiff = Number(a.hari || 1) - Number(b.hari || 1);
    if (dayDiff !== 0) return dayDiff;

    const rangeA = parseSessionTimeRange(a.waktu, a.urutan_waktu);
    const rangeB = parseSessionTimeRange(b.waktu, b.urutan_waktu);
    if (rangeA.startMin !== rangeB.startMin) return rangeA.startMin - rangeB.startMin;

    return Number(a.id_jadwal || 0) - Number(b.id_jadwal || 0);
  });

  // Cari sesi yang sedang diaktifkan LIVE oleh Sekretaris
  const liveIndex = chronologicalList.findIndex(j => j.status_aktif === true);
  const liveSession = liveIndex !== -1 ? chronologicalList[liveIndex] : null;

  // Cari sesi "COMING SOON (SEGERA BERLANGSUNG)":
  // Jika ada sesi LIVE, maka Coming Soon adalah tepat 1 sesi setelahnya.
  // Jika belum ada sesi LIVE yang diaktifkan, maka Coming Soon adalah sesi pertama di jadwal.
  let nextSession = null;
  if (liveIndex !== -1 && liveIndex + 1 < chronologicalList.length) {
    nextSession = chronologicalList[liveIndex + 1];
  } else if (liveIndex === -1 && chronologicalList.length > 0) {
    nextSession = chronologicalList[0];
  }

  // 2. RENDER WIDGET "NOW & NEXT (COMING SOON)" DI BERANDA PESERTA & PANITIA
  renderNowAndNextBanner(liveSession, nextSession);

  // 3. Untuk tampilan di Tab Jadwal: Sesi LIVE ditaruh paling atas pada harinya, sisanya urut jam mulai
  scheduleCache = [...chronologicalList].sort((a, b) => {
    const dayDiff = Number(a.hari || 1) - Number(b.hari || 1);
    if (dayDiff !== 0) return dayDiff;
    if (Boolean(a.status_aktif) !== Boolean(b.status_aktif)) {
      return a.status_aktif ? -1 : 1;
    }
    const rangeA = parseSessionTimeRange(a.waktu, a.urutan_waktu);
    const rangeB = parseSessionTimeRange(b.waktu, b.urutan_waktu);
    return rangeA.startMin - rangeB.startMin;
  });

  const rundownContainer = document.getElementById("scheduleListContainer");
  if (!rundownContainer) return;

  document.getElementById("btnAddSchedule")?.classList.toggle("hidden", !isSekretaris);
  document.getElementById("secretaryScheduleBanner")?.classList.toggle("hidden", !isSekretaris);

  const filtered = scheduleCache.filter(j => Number(j.hari) === Number(currentDay));

  if (filtered.length === 0) {
    rundownContainer.innerHTML = `
      <div class="p-6 text-center rounded-2xl bg-slate-50 border border-slate-200">
        <p class="text-xs text-slate-500 font-semibold">Belum ada jadwal untuk Hari Ke-${currentDay}.</p>
      </div>
    `;
    return;
  }

  rundownContainer.innerHTML = "";
  filtered.forEach((session, idx) => {
    const isLive = session.status_aktif === true;
    const isNextUp = nextSession && Number(nextSession.id_jadwal) === Number(session.id_jadwal);

    const borderStyle = isLive
      ? "border-emerald-500 bg-gradient-to-r from-emerald-50 via-teal-50/60 to-white ring-2 ring-emerald-500/30 shadow-md"
      : isNextUp
      ? "border-amber-400 bg-amber-50/40"
      : "border-slate-200 bg-slate-50";

    const labelStyle = isLive
      ? "bg-red-600 text-white shadow-xs"
      : isNextUp
      ? "bg-amber-500 text-slate-950"
      : session.warna_label === "emas"
      ? "bg-amber-500 text-slate-950"
      : session.warna_label === "hijau"
      ? "bg-emerald-600 text-white"
      : "bg-blue-900 text-white";

    const secretaryControls = isSekretaris
      ? `<div class="flex flex-col gap-1.5 shrink-0 items-end">
           <button class="toggle-active-session px-2.5 py-1 rounded-lg border text-[10px] font-extrabold flex items-center gap-1 shadow-2xs transition ${
             isLive
               ? 'bg-red-600 text-white border-red-600 animate-pulse'
               : 'bg-white text-slate-700 border-slate-300 hover:border-emerald-500'
           }" data-id="${session.id_jadwal}" data-active="${isLive}">
             <i class="fa-solid fa-tower-broadcast"></i> ${isLive ? 'LIVE AKTIF' : 'Aktifkan Live'}
           </button>
           <div class="flex gap-1">
             <button class="edit-schedule w-7 h-7 rounded-lg bg-white border border-slate-200 hover:bg-blue-50 flex items-center justify-center" data-id="${session.id_jadwal}">
               <i class="fa-solid fa-pen text-blue-800 text-[11px]"></i>
             </button>
             <button class="del-schedule w-7 h-7 rounded-lg bg-white border border-slate-200 hover:bg-rose-50 flex items-center justify-center" data-id="${session.id_jadwal}">
               <i class="fa-solid fa-trash text-rose-600 text-[11px]"></i>
             </button>
           </div>
         </div>`
      : "";

    rundownContainer.innerHTML += `
      <div class="flex gap-3 items-start p-3.5 rounded-2xl border ${borderStyle} transition">
        <div class="flex flex-col items-center gap-1 shrink-0">
          <div class="px-2.5 py-1.5 rounded-xl ${labelStyle} font-extrabold text-[10px] text-center min-w-[82px]">
            ${session.waktu}
          </div>
          <span class="text-[9px] font-bold text-slate-400">Sesi #${idx + 1}</span>
        </div>
        <div class="flex-1 min-w-0">
          ${isLive ? `
            <div class="mb-1">
              <span class="inline-flex items-center gap-1 text-[9px] font-extrabold bg-red-600 text-white px-2 py-0.5 rounded-full uppercase tracking-wider animate-pulse">
                <span class="w-1.5 h-1.5 bg-white rounded-full"></span> Sedang Berlangsung
              </span>
            </div>
          ` : isNextUp ? `
            <div class="mb-1">
              <span class="inline-flex items-center gap-1 text-[9px] font-extrabold bg-amber-400 text-slate-950 px-2 py-0.5 rounded-full uppercase tracking-wider">
                <i class="fa-solid fa-clock text-[8px]"></i> Segera Berlangsung (Coming Soon)
              </span>
            </div>
          ` : ''}
          <div class="font-extrabold text-xs text-slate-900 leading-snug">
            ${session.judul_sesi}
          </div>
          <p class="text-[11px] text-slate-600 mt-0.5 leading-relaxed">${session.deskripsi || ""}</p>
          ${session.pemateri_pic ? `<div class="text-[10px] font-bold text-blue-900 mt-1.5"><i class="fa-solid fa-user-tag mr-1"></i>${session.pemateri_pic}</div>` : ""}
        </div>
        ${secretaryControls}
      </div>
    `;
  });

  if (isSekretaris) {
    document.querySelectorAll(".toggle-active-session").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = Number(btn.dataset.id);
        const currentlyActive = btn.dataset.active === "true";

        await sb.from("jadwal_rakor").update({ status_aktif: false }).neq("id_jadwal", id);
        await sb.from("jadwal_rakor").update({ status_aktif: !currentlyActive }).eq("id_jadwal", id);

        toast(!currentlyActive ? "Sesi Live & Coming Soon diperbarui di Beranda Peserta!" : "Status Live dimatikan.");
        renderLiveJadwal();
      });
    });

    document.querySelectorAll(".edit-schedule").forEach(btn => {
      btn.addEventListener("click", () => openModal(Number(btn.dataset.id)));
    });

    document.querySelectorAll(".del-schedule").forEach(btn => {
      btn.addEventListener("click", () => deleteSesi(Number(btn.dataset.id)));
    });
  }
}

// Widget Gabungan "Sedang Berlangsung (LIVE)" & "Segera Berlangsung (COMING SOON)" di Beranda
function renderNowAndNextBanner(liveSession, nextSession) {
  const dashboardCard = document.getElementById("liveActiveSessionContainer");
  if (!dashboardCard) return;

  if (!liveSession && !nextSession) {
    dashboardCard.classList.add("hidden");
    return;
  }

  dashboardCard.classList.remove("hidden");
  dashboardCard.className = "rounded-3xl shadow-lg border border-slate-200 overflow-hidden bg-white";

  dashboardCard.innerHTML = `
    <!-- BAGIAN 1: SESI YANG SEDANG BERLANGSUNG (LIVE NOW) -->
    ${liveSession ? `
      <div class="bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 text-white p-4 relative overflow-hidden">
        <div class="absolute -right-6 -bottom-6 w-24 h-24 bg-white/10 rounded-full blur-xl pointer-events-none"></div>
        <div class="flex items-center justify-between">
          <span class="inline-flex items-center gap-1.5 text-[9px] font-extrabold bg-red-600 text-white px-2.5 py-0.5 rounded-full uppercase tracking-wider animate-pulse shadow-2xs">
            <span class="w-1.5 h-1.5 bg-white rounded-full"></span> Sedang Berlangsung
          </span>
          <span class="text-[10px] font-extrabold text-emerald-100 bg-black/20 px-2.5 py-0.5 rounded-full">
            Hari Ke-${liveSession.hari} •${liveSession.waktu}
          </span>
        </div>
        <h4 class="text-xs font-extrabold mt-2 leading-snug">${liveSession.judul_sesi}</h4>${liveSession.deskripsi ? `<p class="text-[11px] text-emerald-100 mt-0.5 line-clamp-2">${liveSession.deskripsi}</p>` : ''}
        <div class="text-[10px] font-bold text-amber-300 mt-1.5 flex items-center gap-1">
          <i class="fa-solid fa-user-tag"></i>
          <span>${liveSession.pemateri_pic || 'Panitia Pelaksana'}</span>
        </div>
      </div>
    ` : ''}

    <!-- BAGIAN 2: SESI YANG AKAN BERLANGSUNG (COMING SOON / SELANJUTNYA) -->
    ${nextSession ? `
      <div class="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white p-3.5 flex items-center justify-between gap-3 ${liveSession ? 'border-t border-
