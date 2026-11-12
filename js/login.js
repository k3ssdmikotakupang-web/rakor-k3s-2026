// js/login.js
import { sb, toast } from './supabase.js';

let scanner = null;

export function initLogin(onSuccess) {
  const btnRolePeserta = document.getElementById("btnRolePeserta");
  const btnRolePanitia = document.getElementById("btnRolePanitia");
  const loginFormPeserta = document.getElementById("loginFormPeserta");
  const loginFormPanitia = document.getElementById("loginFormPanitia");
  const subrayonSelect = document.getElementById("loginSubrayonSelect");
  const schoolSelect = document.getElementById("loginSchoolSelect");
  const pinInput = document.getElementById("loginPinInput");

  btnRolePeserta?.addEventListener("click", () => setRole('peserta'));
  btnRolePanitia?.addEventListener("click", () => setRole('panitia'));

  function setRole(role) {
    const isPeserta = role === 'peserta';
    loginFormPeserta?.classList.toggle("hidden", !isPeserta);
    loginFormPanitia?.classList.toggle("hidden", isPeserta);
    if (btnRolePeserta) {
      btnRolePeserta.className = isPeserta
        ? "py-2.5 rounded-xl text-xs font-extrabold bg-amber-400 text-slate-950 shadow transition"
        : "py-2.5 rounded-xl text-xs font-bold text-slate-400 hover:text-white transition";
    }
    if (btnRolePanitia) {
      btnRolePanitia.className = !isPeserta
        ? "py-2.5 rounded-xl text-xs font-extrabold bg-blue-500 text-white shadow transition"
        : "py-2.5 rounded-xl text-xs font-bold text-slate-400 hover:text-white transition";
    }
  }

  subrayonSelect?.addEventListener("change", async () => {
    const sr = subrayonSelect.value;
    if (!sr) {
      schoolSelect.disabled = true;
      schoolSelect.innerHTML = `<option value="">Pilih Sekolah</option>`;
      return;
    }
    const { data: schools } = await sb.from("db_sekolah").select("*").eq("subrayon", sr).order("nama_sekolah");
    schoolSelect.disabled = false;
    schoolSelect.innerHTML = `<option value="">Pilih Sekolah (${(schools || []).length} SD/MI)</option>`;
    (schools || []).forEach(s => {
      schoolSelect.innerHTML += `<option value="${s.id_sekolah}">${s.nama_sekolah}</option>`;
    });
  });

  // Login Peserta: Cek password_custom jika sudah pernah diubah, jika belum gunakan NPSN
  document.getElementById("btnSubmitPeserta")?.addEventListener("click", async () => {
    const idSek = schoolSelect?.value;
    const passInput = document.getElementById("loginNpsnPassword")?.value.trim();
    if (!idSek || !passInput) return toast("Pilih sekolah & masukkan password/NPSN!");

    const { data: school } = await sb.from("db_sekolah").select("*").eq("id_sekolah", idSek).single();
    if (!school) return toast("Data sekolah tidak ditemukan.");

    const activePassword = (school.password_custom && school.password_custom.trim() !== "")
      ? String(school.password_custom).trim()
      : String(school.npsn).trim();

    if (passInput === activePassword) {
      toast(`Selamat datang, ${school.nama_kepsek || school.nama_sekolah}!`);
      onSuccess({ role: 'peserta', profile: school });
    } else {
      toast(school.password_custom ? "Password salah! Gunakan password baru Anda." : "Password NPSN salah!");
    }
  });

  // Login Panitia: Cek pin_custom jika sudah pernah diubah, jika belum gunakan PIN default 2026
  document.getElementById("btnSubmitPanitia")?.addEventListener("click", async () => {
    const idPan = document.getElementById("loginPanitiaSelect")?.value;
    const pin = pinInput?.value.trim();
    if (!idPan || !pin) return toast("Pilih nama panitia & masukkan PIN!");

    const { data: panitia } = await sb.from("panitia_rakor").select("*").eq("id_panitia", idPan).single();
    if (!panitia) return toast("Data panitia tidak ditemukan.");

    const activePin = (panitia.pin_custom && panitia.pin_custom.trim() !== "")
      ? String(panitia.pin_custom).trim()
      : "2026";

    if (pin === activePin) {
      toast(`Selamat bertugas, ${panitia.nama_panitia}!`);
      onSuccess({ role: 'panitia', profile: panitia });
    } else {
      toast("PIN Akses salah!");
    }
  });

  document.getElementById("togglePswdBtn")?.addEventListener("click", () => {
    const inp = document.getElementById("loginNpsnPassword");
    if (inp) inp.type = inp.type === "password" ? "text" : "password";
  });

  document.getElementById("btnOpenScanner")?.addEventListener("click", () => {
    document.getElementById("qrScannerModal")?.classList.remove("hidden");
    scanner = new Html5Qrcode("qrReader");
    scanner.start({ facingMode: "environment" }, { fps: 10, qrbox: 210 }, onScanComplete).catch(() => {});
  });

  document.getElementById("btnCancelScan")?.addEventListener("click", closeScan);
  document.getElementById("btnCloseScanner")?.addEventListener("click", closeScan);

  function closeScan() {
    document.getElementById("qrScannerModal")?.classList.add("hidden");
    if (scanner) {
      try { scanner.stop(); } catch (e) {}
      scanner = null;
    }
  }

  async function onScanComplete(text) {
    const match = String(text || "").trim().split("|");
    if (match[0] === "PESERTA") {
      const { data } = await sb.from("db_sekolah").select("*").eq("npsn", match[1]).single();
      if (data) {
        closeScan();
        onSuccess({ role: 'peserta', profile: data });
      }
    } else if (match[0] === "PANITIA") {
      const { data } = await sb.from("panitia_rakor").select("*").eq("id_panitia", match[1]).single();
      if (data) {
        closeScan();
        onSuccess({ role: 'panitia', profile: data });
      }
    }
  }
}
