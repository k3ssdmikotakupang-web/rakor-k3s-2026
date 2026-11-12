// js/login.js
import { sb, toast } from './supabase.js';

let activeRole = 'peserta';
let scanner = null;

export function initLogin(onSuccess) {
  const btnRolePeserta = document.getElementById("btnRolePeserta");
  const btnRolePanitia = document.getElementById("btnRolePanitia");
  const loginFormPeserta = document.getElementById("loginFormPeserta");
  const loginFormPanitia = document.getElementById("loginFormPanitia");
  const subrayonSelect = document.getElementById("loginSubrayonSelect");
  const schoolSelect = document.getElementById("loginSchoolSelect");
  const pinInput = document.getElementById("loginPinInput");

  btnRolePeserta.addEventListener("click", () => setRole('peserta'));
  btnRolePanitia.addEventListener("click", () => setRole('panitia'));

  function setRole(role) {
    activeRole = role;
    const isPeserta = role === 'peserta';
    loginFormPeserta.classList.toggle("hidden", !isPeserta);
    loginFormPanitia.classList.toggle("hidden", isPeserta);
    btnRolePeserta.className = isPeserta ? "py-2.5 rounded-xl text-xs font-extrabold bg-amber-400 text-slate-950 shadow" : "py-2.5 rounded-xl text-xs font-bold text-slate-300";
    btnRolePanitia.className = !isPeserta ? "py-2.5 rounded-xl text-xs font-extrabold bg-blue-500 text-white shadow" : "py-2.5 rounded-xl text-xs font-bold text-slate-300";
  }

  // Chain Dropdown Sub-Rayon ke Nama Sekolah
  subrayonSelect.addEventListener("change", async () => {
    const sr = subrayonSelect.value;
    if (!sr) {
      schoolSelect.disabled = true;
      schoolSelect.innerHTML = `<option value="">-- Pilih Sub Rayon Terlebih Dahulu --</option>`;
      return;
    }
    const { data: schools } = await sb.from("db_sekolah").select("*").eq("subrayon", sr).order("nama_sekolah");
    schoolSelect.disabled = false;
    schoolSelect.innerHTML = `<option value="">-- Pilih Nama Sekolah (${schools.length}) --</option>`;
    schools.forEach(s => {
      schoolSelect.innerHTML += `<option value="${s.id_sekolah}">${s.nama_sekolah}</option>`;
    });
  });

  // Login Manual Peserta
  document.getElementById("btnSubmitPeserta").addEventListener("click", async () => {
    const idSek = schoolSelect.value;
    const npsnInput = document.getElementById("loginNpsnPassword").value.trim();
    if (!idSek || !npsnInput) return toast("Lengkapi pilihan sekolah & NPSN!");
    
    const { data: school } = await sb.from("db_sekolah").select("*").eq("id_sekolah", idSek).single();
    if (school && String(school.npsn) === npsnInput) {
      onSuccess({ role: 'peserta', profile: school });
    } else {
      toast("Password NPSN salah!");
    }
  });

  // Login Manual Panitia
  document.getElementById("btnSubmitPanitia").addEventListener("click", async () => {
    const idPan = document.getElementById("loginPanitiaSelect").value;
    const pin = pinInput.value;
    if (!idPan || pin !== '2026') return toast("PIN salah atau data belum dipilih!");
    const { data: panitia } = await sb.from("panitia_rakor").select("*").eq("id_panitia", idPan).single();
    onSuccess({ role: 'panitia', profile: panitia });
  });

  // Toggle visible password
  document.getElementById("togglePswdBtn").addEventListener("click", () => {
    const inp = document.getElementById("loginNpsnPassword");
    inp.type = inp.type === "password" ? "text" : "password";
  });

  // Scan Barcode
  document.getElementById("btnOpenScanner").addEventListener("click", () => {
    document.getElementById("qrScannerModal").classList.remove("hidden");
    scanner = new Html5Qrcode("qrReader");
    scanner.start({ facingMode: "environment" }, { fps: 10, qrbox: 210 }, onScanComplete);
  });

  document.getElementById("btnCancelScan").addEventListener("click", closeScan);
  document.getElementById("btnCloseScanner").addEventListener("click", closeScan);

  function closeScan() {
    document.getElementById("qrScannerModal").classList.add("hidden");
    if (scanner) { scanner.stop(); scanner = null; }
  }

  async function onScanComplete(text) {
    const match = text.split("|");
    if (match[0] === "PESERTA") {
      const { data } = await sb.from("db_sekolah").select("*").eq("npsn", match[1]).single();
      if (data) onSuccess({ role: 'peserta', profile: data }); closeScan();
    } else if (match[0] === "PANITIA") {
      const { data } = await sb.from("panitia_rakor").select("*").eq("id_panitia", match[1]).single();
      if (data) onSuccess({ role: 'panitia', profile: data }); closeScan();
    }
  }
}
