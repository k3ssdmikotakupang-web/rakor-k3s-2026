// js/jadwal.js
import { sb, toast } from './supabase.js';

export let isSekretaris = false;
let currentDay = 1;

export async function checkSecretaryPrivilege(userSession) {
  isSekretaris = userSession && userSession.role === 'panitia' && userSession.profile.divisi === 'Sekretaris';
}

export function initJadwal() {
  document.getElementById("btnDay1").addEventListener("click", () => filterDay(1));
  document.getElementById("btnDay2").addEventListener("click", () => filterDay(2));
  document.getElementById("btnDay3").addEventListener("click", () => filterDay(3));

  document.getElementById("btnAddSchedule").addEventListener("click", () => openModal());
  document.getElementById("btnSaveSchedule").addEventListener("click", saveSesi);
  document.getElementById("btnCancelSchedule").addEventListener("click", closeModal);
  document.getElementById("btnDismissSchedule").addEventListener("click", closeModal);
}

function filterDay(day) {
  currentDay = day;
  [1, 2, 3].forEach(d => {
    const btn = document.getElementById(`btnDay${d}`);
    if (d === day) {
      btn.className = "py-2 rounded-xl text-xs font-extrabold bg-blue-900 text-white shadow";
    } else {
      btn.className = "py-2 rounded-xl text-xs font-bold text-slate-600";
    }
  });
  renderLiveJadwal();
}

export async function renderLiveJadwal() {
  // Urutkan berdasarkan "hari" lalu "urutan_waktu" ASC agar terurut rapi
  const { data: Sched } = await sb.from("jadwal_rakor")
                                 .select("*")
                                 .order("hari")
                                 .order("urutan_waktu", { ascending: true });

  if (!Sched) return;

  // 1. CARI SESI YANG AKTIF
  const liveActive = Sched.find(j => j.status_aktif === true);
  const dashboardCard = document.getElementById("liveActiveSessionContainer");

  if (liveActive) {
    dashboardCard.classList.remove("hidden");
    document.getElementById("liveActiveTitle").textContent = liveActive.judul_sesi;
    document.getElementById("liveActiveDesc").textContent = liveActive.deskripsi || "Tidak ada deskripsi.";
    document.getElementById("liveActiveTime").textContent = `Hari ke-${liveActive.hari} (${liveActive.waktu})`;
    document.getElementById("liveActivePic").innerHTML = liveActive.pemateri_pic ? `<i class="fa-solid fa-user-tag mr-1"></i> ${liveActive.pemateri_pic}` : "PIC: -";
  } else {
    dashboardCard.classList.add("hidden");
  }

  // 2. TAMPILKAN TAB RUNDOWN HARIAN (Sesuai Hari yang dipilih)
  const rundownContainer = document.getElementById("scheduleListContainer");
  const filtered = Sched.filter(j => Number(j.hari) === Number(currentDay));

  if (filtered.length === 0) {
    rundownContainer.innerHTML = `<div class="p-6 text-center text-xs text-slate-400">Belum ada jadwal.</div>`;
    return;
  }

  // Tampilkan Mode Editor bagi Sekretaris
  document.getElementById("btnAddSchedule").classList.toggle("hidden", !isSekretaris);
  document.getElementById("secretaryScheduleBanner").classList.toggle("hidden", !isSekretaris);

  rundownContainer.innerHTML = "";
  filtered.forEach(session => {
    const borderStyle = session.status_aktif ? "border-emerald-500 bg-emerald-500/5" : "border-slate-200 bg-slate-50";
    const labelStyle = session.warna_label === "emas" ? "bg-amber-500 text-slate-950" : session.warna_label === "hijau" ? "bg-emerald-600 text-white" : "bg-blue-900 text-white";

    // Tombol Saklar Sesi Aktif
    const saklarAktif = isSekretaris ? `
      <button class="toggle-active-session w-7 h-7 rounded-lg bg-white border flex items-center justify-center shadow-sm ${session.status_aktif ? 'text-emerald-500 border-emerald-500 bg-emerald-50' : 'text-slate-400'}" data-id="${session.id_jadwal}" data-active="${session.status_aktif}" title="Aktifkan Live">
        <i class="fa-solid fa-signal text-xs ${session.status_aktif ? 'animate-pulse' : ''}"></i>
      </button>
    ` : "";

    const editHapusButtons = isSekretaris ? `
      <div class="flex gap-1">
        <button class="edit-schedule w-7 h-7 rounded-lg bg-white border flex items-center justify-center" data-id="${session.id_jadwal}"><i class="fa-solid fa-pen text-blue-700 text-xs"></i></button>
        <button class="del-schedule w-7 h-7 rounded-lg bg-white border flex items-center justify-center" data-id="${session.id_jadwal}"><i class="fa-solid fa-trash text-rose-500 text-xs"></i></button>
      </div>
    ` : "";

    rundownContainer.innerHTML += `
      <div class="flex gap-3 items-start p-3.5 rounded-2xl border ${borderStyle}">
        <div class="px-2.5 py-1.5 rounded-xl ${labelStyle} font-extrabold text-[9px] shrink-0 text-center">
          ${session.waktu}
        </div>
        <div class="flex-1 min-w-0">
          <div class="font-extrabold text-xs text-slate-900 leading-snug flex items-center gap-1.5">
            ${session.judul_sesi}
            ${session.status_aktif ? '<span class="inline-block text-[8px] font-extrabold bg-red-500 text-white px-1.5 py-0.2 rounded-full uppercase tracking-wider animate-pulse">Live</span>' : ''}
          </div>
          <p class="text-[11px] text-slate-500 mt-0.5">${session.deskripsi || ""}</p>
          ${session.pemateri_pic ? `<div class="text-[9px] font-extrabold text-blue-900 mt-1"><i class="fa-solid fa-user-tag mr-1"></i>${session.pemateri_pic}</div>` : ""}
        </div>
        <div class="flex flex-col gap-1.5 shrink-0 items-end">
          ${saklarAktif}
          ${editHapusButtons}
        </div>
      </div>
    `;
  });

  // Berikan event listener pada tombol-tombol milik Sekretaris
  if (isSekretaris) {
    document.querySelectorAll(".toggle-active-session").forEach(btn => btn.addEventListener("click", async (e) => {
      const id = btn.dataset.id;
      const isCurrentlyActive = btn.dataset.active === "true";
      
      // Matikan semua sesi lain yang aktif terlebih dahulu, lalu nyalakan sesi ini saja
      await sb.from("jadwal_rakor").update({ status_aktif: false }).neq("id_jadwal", id);
      await sb.from("jadwal_rakor").update({ status_aktif: !isCurrentlyActive }).eq("id_jadwal", id);

      toast(!isCurrentlyActive ? "Sesi Live diaktifkan ke Beranda Peserta!" : "Sesi Live diakhiri.");
      renderLiveJadwal();
    }));

    document.querySelectorAll(".edit-schedule").forEach(btn => btn.addEventListener("click", () => openModal(btn.dataset.id)));
    document.querySelectorAll(".del-schedule").forEach(btn => btn.addEventListener("click", (e) => deleteSesi(btn.dataset.id)));
  }
}

function openModal(id = null) {
  document.getElementById("scheduleModal").classList.remove("hidden");
  if (id) {
    const j = SchedDataCache.find(x => x.id_jadwal == id); // cache as global / query local
    // Set default value...
  }
}

function closeModal() {
  document.getElementById("scheduleModal").classList.add("hidden");
}

async function saveSesi() {
  // logic insert/update...
}

async function deleteSesi(id) {
  if (confirm("Hapus sesi ini?")) {
    await sb.from("jadwal_rakor").delete().eq("id_jadwal", id);
    renderLiveJadwal();
  }
}
