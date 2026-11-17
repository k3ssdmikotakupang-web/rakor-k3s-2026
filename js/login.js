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

  // 1. Kosongkan PIN Panitia secara mutlak (hapus value="2026" bawaan HTML) & pasang ikon mata
  if (pinInput) {
    pinInput.value = "";
    pinInput.removeAttribute("value");
    pinInput.setAttribute("autocomplete", "new-password");
    pinInput.placeholder = "Ketik PIN Panitia (123321)";
    pinInput.classList.remove("pr-4");
    pinInput.classList.add("pr-10");

    const parentWrap = pinInput.parentElement;
    if (parentWrap && !document.getElementById("togglePanitiaPinBtn")) {
      parentWrap.classList.add("relative");
      const eyeBtn = document.createElement("button");
      eyeBtn.type = "button";
      eyeBtn.id = "togglePanitiaPinBtn";
      eyeBtn.className = "absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-amber-300 text-xs p-1 transition";
      eyeBtn.title = "Lihat / Sembunyikan PIN";
      eyeBtn.innerHTML = `<i class="fa-solid fa-eye"></i>`;
      eyeBtn.addEventListener("click", () => {
        const isPass = pinInput.type === "password";
        pinInput.type = isPass ? "text" : "password";
        eyeBtn.innerHTML = `<i class="fa-solid ${isPass ? 'fa-eye-slash text-amber-300' : 'fa-eye'}"></i>`;
      });
      parentWrap.appendChild(eyeBtn);
    }
  }

  btnRolePeserta?.addEventListener("click", () => setRole('peserta'));
  btnRolePanitia?.addEventListener("click", () => setRole('panitia'));

  function setRole(role) {
    const isPeserta = role === 'peserta';
    loginFormPeserta?.classList.toggle("hidden", !isPeserta);
    loginFormPanitia?.classList.toggle("hidden", isPeserta);

    if (!isPeserta && pinInput) {
      pinInput.value = "";
      pinInput.type = "password";
      const eyeIcon = document.querySelector("#togglePanitiaPinBtn i");
      if (eyeIcon) eyeIcon.className = "fa-solid fa-eye";
    }

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
      if (schoolSelect) {
        schoolSelect.disabled = true;
        schoolSelect.innerHTML = `<option value="">Pilih Sekolah</option>`;
      }
      return;
    }

    const { data: schools, error } = await sb
      .from("db_sekolah")
      .select("*")
      .eq("subrayon", sr)
      .order("nama_sekolah");

    if (error) {
      console.error("Error memuat daftar sekolah:", error);
      return toast("Gagal memuat data sekolah.");
    }

    if (schoolSelect) {
      schoolSelect.disabled = false;
      schoolSelect.innerHTML = `<option value="">Pilih Sekolah (${(schools || []).length} SD/MI)</option>`;
      (schools || []).forEach(s => {
        schoolSelect.innerHTML += `<option value="${s.id_sekolah}">${s.nama_sekolah}</option>`;
      });
    }
  });

  // Login Peserta
  document.getElementById("btnSubmitPeserta")?.addEventListener("click", async () => {
    const idSek = schoolSelect?.value;
    const passInput = document.getElementById("loginNpsnPassword")?.value.trim();

    if (!idSek || !passInput) {
      return toast("Pilih sekolah & masukkan password/NPSN!");
    }

    const { data: school, error } = await sb
      .from("db_sekolah")
      .select("*")
      .eq("id_sekolah", idSek)
      .single();

    if (error || !school) {
      return toast("Data sekolah tidak ditemukan.");
    }

    const activePassword = (school.password_custom && String(school.password_custom).trim() !== "")
      ? String(school.password_custom).trim()
      : String(school.npsn).trim();

    if (passInput === activePassword) {
      toast(`Selamat datang, ${school.nama_kepsek || school.nama_sekolah}!`);
      onSuccess({ role: 'peserta', profile: school });
    } else {
      toast(school.password_custom ? "Password salah! Gunakan password baru Anda." : "Password NPSN salah!");
    }
  });

  // Login Panitia: Wajib ketik manual, mendukung pin_custom atau default 123321
  document.getElementById("btnSubmitPanitia")?.addEventListener("click", async () => {
    const idPan = document.getElementById("loginPanitiaSelect")?.value;
    const pin = pinInput?.value.trim();

    if (!idPan) return toast("Pilih nama panitia terlebih dahulu!");
    if (!pin) return toast("Ketik PIN Panitia secara manual!");

    const { data: panitia, error } = await sb
      .from("panitia_rakor")
      .select("*")
      .eq("id_panitia", idPan)
      .single();

    if (error || !panitia) {
      return toast("Data panitia tidak ditemukan.");
    }

    const customPin = (panitia.pin_custom && String(panitia.pin_custom).trim() !== "" && String(panitia.pin_custom).trim() !== "2026")
      ? String(panitia.pin_custom).trim()
      : "123321";

    if (pin === customPin || pin === "123321") {
      pinInput.value = "";
      toast(`Selamat bertugas, ${panitia.nama_panitia}!`);
      onSuccess({ role: 'panitia', profile: panitia });
    } else {
      toast("PIN Akses Panitia salah!");
    }
  });

  document.getElementById("togglePswdBtn")?.addEventListener("click", () => {
    const inp = document.getElementById("loginNpsnPassword");
    const icon = document.querySelector("#togglePswdBtn i");
    if (inp) {
      const isPass = inp.type === "password";
      inp.type = isPass ? "text" : "password";
      if (icon) icon.className = `fa-solid ${isPass ? 'fa-eye-slash text-amber-300' : 'fa-eye'}`;
    }
  });

  document.getElementById("btnOpenScanner")?.addEventListener("click", async () => {
    if (typeof Html5Qrcode === "undefined") {
      return toast("Library QR Scanner belum dimuat!");
    }

    document.getElementById("qrScannerModal")?.classList.remove("hidden");

    if (scanner) {
      try {
        await scanner.stop();
        scanner.clear();
      } catch (e) {}
      scanner = null;
    }

    scanner = new Html5Qrcode("qrReader");
    scanner
      .start({ facingMode: "environment" }, { fps: 10, qrbox: 210 }, onScanComplete)
      .catch(err => {
        console.error("Gagal membuka kamera:", err);
        toast("Gagal mengakses kamera. Pastikan izin kamera aktif.");
        closeScan();
      });
  });

  document.getElementById("btnCancelScan")?.addEventListener("click", closeScan);
  document.getElementById("btnCloseScanner")?.addEventListener("click", closeScan);

  async function closeScan() {
    document.getElementById("qrScannerModal")?.classList.add("hidden");
    if (scanner) {
      try {
        await scanner.stop();
        scanner.clear();
      } catch (e) {}
      scanner = null;
    }
  }

  async function onScanComplete(text) {
    const match = String(text || "").trim().split("|");
    if (match[0] === "PESERTA" && match[1]) {
      const { data } = await sb
        .from("db_sekolah")
        .select("*")
        .eq("npsn", match[1].trim())
        .single();

      if (data) {
        await closeScan();
        toast(`Login QR berhasil: ${data.nama_sekolah}`);
        onSuccess({ role: 'peserta', profile: data });
      }
    } else if (match[0] === "PANITIA" && match[1]) {
      const { data } = await sb
        .from("panitia_rakor")
        .select("*")
        .eq("id_panitia", match[1].trim())
        .single();

      if (data) {
        await closeScan();
        toast(`Login QR berhasil: ${data.nama_panitia}`);
        onSuccess({ role: 'panitia', profile: data });
      }
    }
  }
}
