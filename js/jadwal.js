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

// Ambil jam mulai & jam selesai dalam satuan menit (00:00 = 0, 13.00 = 780)
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
    if (endMin < startMin) endMin += 24 * 60; // Lewat tengah malam (misal 21.00 - 05.00)
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

  // Set tampilan awal tombol Hari Ke-1 aktif
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

  // URUTKAN BERDASARKAN:
  // 1. Sesi yang sedang diaktifkan LIVE oleh Sekretaris tampil PALING ATAS!
  // 2. Urutan jam mulai dari pagi ke malam (startMin)
  // 3. ID Jadwal
  scheduleCache = [...data].sort((a, b) => {
    const dayDiff = Number(a.hari || 1) - Number(b.hari || 1);
    if (dayDiff !== 0) return dayDiff;

    // Prioritaskan sesi yang berstatus LIVE agar selalu di paling atas pada harinya
    if (Boolean(a.status_aktif) !== Boolean(b.status_aktif)) {
      return a.status_aktif ? -1 : 1;
    }

    const rangeA = parseSessionTimeRange(a.waktu, a.urutan_waktu);
    const rangeB = parseSessionTimeRange(b.waktu, b.urutan_waktu);
    if (rangeA.startMin !== rangeB.startMin) return rangeA.startMin - rangeB.startMin;

    return Number(a.id_jadwal || 0) - Number(b.id_jadwal || 0);
  });

  // 1. TAMPILKAN KARTU SESI LIVE DI BERANDA SELURUH PESERTA & PANITIA
  const liveActive = scheduleCache.find(j => j.status_aktif === true);
  const dashboardCard = document.getElementById("liveActiveSessionContainer");

  if (dashboardCard) {
    if (liveActive) {
      dashboardCard.classList.remove("hidden");
      document.getElementById("liveActiveTitle").textContent = liveActive.judul_sesi;
      document.getElementById("liveActiveDesc").textContent = liveActive.deskripsi || "Sesi sedang berlangsung.";
      document.getElementById("liveActiveTime").textContent = `Hari Ke-${liveActive.hari} • ${liveActive.waktu} WITA`;
      document.getElementById("liveActivePic").innerHTML = liveActive.pemateri_pic
        ? `<i class="fa-solid fa-user-tag mr-1"></i> ${liveActive.pemateri_pic}`
        : "PIC: Panitia Rakor";
    } else {
      dashboardCard.classList.add("hidden");
    }
  }

  // 2. TAMPILKAN DAFTAR JADWAL PADA TAB JADWAL
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

    const borderStyle = isLive
      ? "border-emerald-500 bg-gradient-to-r from-emerald-50 via-teal-50/60 to-white ring-2 ring-emerald-500/30 shadow-md"
      : "border-slate-200 bg-slate-50";

    const labelStyle = isLive
      ? "bg-red-600 text-white shadow-xs"
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
                <span class="w-1.5 h-1.5 bg-white rounded-full"></span> Sedang Berlangsung Sekarang
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

        toast(!currentlyActive ? "Sesi Live diaktifkan & tampil di Beranda Peserta!" : "Status Live dimatikan.");
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

function openModal(id = null) {
  if (!isSekretaris) return toast("Hanya Sekretaris Panitia yang dapat mengubah jadwal!");
  document.getElementById("scheduleModal")?.classList.remove("hidden");

  if (id) {
    const item = scheduleCache.find(x => Number(x.id_jadwal) === Number(id));
    if (!item) return;
    document.getElementById("modalScheduleHeader").textContent = "Edit Sesi Jadwal Kegiatan";
    document.getElementById("modalScheduleId").value = item.id_jadwal;
    document.getElementById("modalScheduleDay").value = item.hari;
    document.getElementById("modalScheduleTime").value = item.waktu;
    document.getElementById("modalScheduleTitle").value = item.judul_sesi;
    document.getElementById("modalScheduleDesc").value = item.deskripsi || "";
    document.getElementById("modalSchedulePic").value = item.pemateri_pic || "";
    document.getElementById("modalScheduleColor").value = item.warna_label || "biru";
  } else {
    document.getElementById("modalScheduleHeader").textContent = "Tambah Sesi Jadwal Baru";
    document.getElementById("modalScheduleId").value = "";
    document.getElementById("modalScheduleDay").value = currentDay;
    document.getElementById("modalScheduleTime").value = "";
    document.getElementById("modalScheduleTitle").value = "";
    document.getElementById("modalScheduleDesc").value = "";
    document.getElementById("modalSchedulePic").value = "";
    document.getElementById("modalScheduleColor").value = "biru";
  }
}

function closeModal() {
  document.getElementById("scheduleModal")?.classList.add("hidden");
}

async function saveSesi() {
  if (!isSekretaris) return;

  const id = document.getElementById("modalScheduleId").value;
  const hari = Number(document.getElementById("modalScheduleDay").value);
  const waktu = document.getElementById("modalScheduleTime").value.trim();
  const judul_sesi = document.getElementById("modalScheduleTitle").value.trim();
  const deskripsi = document.getElementById("modalScheduleDesc").value.trim();
  const pemateri_pic = document.getElementById("modalSchedulePic").value.trim();
  const warna_label = document.getElementById("modalScheduleColor").value;
  const urutan_waktu = extractSqlTime(waktu);

  if (!waktu || !judul_sesi) {
    return toast("Jam Sesi dan Judul Acara wajib diisi!");
  }

  const payload = { hari, waktu, judul_sesi, deskripsi, pemateri_pic, warna_label, urutan_waktu };

  if (id) {
    const { error } = await sb.from("jadwal_rakor").update(payload).eq("id_jadwal", Number(id));
    if (error) {
      delete payload.urutan_waktu;
      await sb.from("jadwal_rakor").update(payload).eq("id_jadwal", Number(id));
    }
    toast("Jadwal diperbarui!");
  } else {
    const { error } = await sb.from("jadwal_rakor").insert([payload]);
    if (error) {
      delete payload.urutan_waktu;
      await sb.from("jadwal_rakor").insert([payload]);
    }
    toast("Sesi baru ditambahkan!");
  }

  closeModal();
  filterDay(hari);
}

async function deleteSesi(id) {
  if (!isSekretaris) return;
  if (!confirm("Hapus sesi kegiatan ini dari jadwal Rakor?")) return;
  await sb.from("jadwal_rakor").delete().eq("id_jadwal", Number(id));
  toast("Sesi jadwal dihapus.");
  renderLiveJadwal();
}
