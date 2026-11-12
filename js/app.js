// js/app.js
import { sb, toast } from './supabase.js';
import { initLogin } from './login.js';
import { initJadwal, renderLiveJadwal, checkSecretaryPrivilege, isSekretaris } from './jadwal.js';

let activeUser = null;

document.addEventListener("DOMContentLoaded", async () => {
  // Ambil Dropdown Panitia
  const { data: panitia } = await sb.from("panitia_rakor").select("*");
  const pSelect = document.getElementById("loginPanitiaSelect");
  pSelect.innerHTML = `<option value="">-- Pilih Anggota Panitia --</option>`;
  panitia.forEach(p => pSelect.innerHTML += `<option value="${p.id_panitia}">${p.nama_panitia}</option>`);

  document.getElementById("dbStatusBadge").textContent = "Terhubung ke Server K3S";

  // Inisialisasi Alur Login & Scanner QR
  initLogin(session => {
    activeUser = session;
    loginSuccess();
  });

  // Inisialisasi Jadwal
  initJadwal();

  // Tab Menu Router
  document.getElementById("footerBtnBeranda").addEventListener("click", () => showTab("beranda"));
  document.getElementById("footerBtnJadwal").addEventListener("click", () => showTab("jadwal"));
  document.getElementById("footerBtnQr").addEventListener("click", () => showTab("qr"));
  document.getElementById("footerBtnSubrayon").addEventListener("click", () => showTab("subrayon"));
  document.getElementById("footerBtnKinerja").addEventListener("click", () => showTab("kinerja"));

  document.getElementById("btnLogout").addEventListener("click", () => {
    activeUser = null;
    document.getElementById("mainAppScreen").classList.add("hidden");
    document.getElementById("loginScreen").classList.remove("hidden");
  });

  // Realtime Sync Perubahan Database
  sb.channel("live-schedule-changes").on("postgres_changes", { event: "*", schema: "public", table: "jadwal_rakor" }, () => {
    renderLiveJadwal();
  }).subscribe();
});

async function loginSuccess() {
  document.getElementById("loginScreen").classList.add("hidden");
  document.getElementById("mainAppScreen").classList.remove("hidden");
  
  // Set Identitas User di Header
  document.getElementById("topUserName").textContent = activeUser.profile.nama_panitia || activeUser.profile.nama_sekolah;
  document.getElementById("topUserRoleBadge").textContent = activeUser.role === 'panitia' ? activeUser.profile.divisi : "Kepsek";

  // Cek otorisasi Sekretaris
  await checkSecretaryPrivilege(activeUser);

  showTab("beranda");
}

function showTab(name) {
  const tabs = { beranda: "tabContentBeranda", jadwal: "tabContentJadwal", qr: "tabContentQr", subrayon: "tabContentSubrayon", kinerja: "tabContentKinerja" };
  Object.keys(tabs).forEach(k => document.getElementById(tabs[k]).classList.toggle("hidden", k !== name));

  if (name === "jadwal" || name === "beranda") {
    renderLiveJadwal();
  }
}
