// js/login.js
// Kompatibel penuh dengan struktur HTML index.html & app.js:
// - Memuat daftar Panitia (panitia_rakor) & Sekolah (db_sekolah) dengan filter Sub Rayon
// - PIN default Panitia: 123321 (kolom dikosongkan, wajib diketik manual)
// - Dilengkapi ikon mata (Show/Hide Password) pada input PIN Panitia & Password Peserta
import { sb, toast } from './supabase.js';

let cachedLoginSekolah = [];
let cachedLoginPanitia = [];

function attachEyeToggle(inputEl, btnId) {
  if (!inputEl || !inputEl.parentElement) return;
  const wrap = inputEl.parentElement;
  if (!wrap.classList.contains("relative")) {
    wrap.classList.add("relative");
  }

  let eyeBtn = document.getElementById(btnId);
  if (!eyeBtn) {
    eyeBtn = document.createElement("button");
    eyeBtn.id = btnId;
    eyeBtn.type = "button";
    eyeBtn.title = "Lihat / Sembunyikan";
    eyeBtn.className = "absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-blue-900 text-xs px-2 py-1 transition z-10";
    eyeBtn.innerHTML = `<i class="fa-solid fa-eye"></i>`;
    inputEl.insertAdjacentElement("afterend", eyeBtn);
  }

  eyeBtn.onclick = (e) => {
    e.preventDefault();
    if (inputEl.type === "password") {
      inputEl.type = "text";
      eyeBtn.innerHTML = `<i class="fa-solid fa-eye-slash text-blue-900"></i>`;
    } else {
      inputEl.type = "password";
      eyeBtn.innerHTML = `<i class="fa-solid fa-eye"></i>`;
    }
  };
}

export async function initLogin(onSuccessCallback) {
  // Deteksi elemen Tab Login (mendukung berbagai variasi ID di index.html)
  const tabPeserta = document.getElementById("loginTabPeserta") || document.getElementById("tabLoginPeserta") || document.querySelector('[data-logintab="peserta"]');
  const tabPanitia = document.getElementById("loginTabPanitia") || document.getElementById("tabLoginPanitia") || document.querySelector('[data-logintab="panitia"]');

  const formPeserta = document.getElementById("loginFormPeserta") || document.getElementById("formLoginPeserta") || document.getElementById("panelLoginPeserta");
  const formPanitia = document.getElementById("loginFormPanitia") || document.getElementById("formLoginPanitia") || document.getElementById("panelLoginPanitia");

  // Deteksi elemen Input Peserta
  const rayonSelect = document.getElementById("loginSubrayonSelect") || document.getElementById("loginRayonSelect") || document.getElementById("selectLoginSubrayon");
  const sekolahSelect = document.getElementById("loginSekolahSelect") || document.getElementById("selectLoginSekolah");
  const sekolahPassInput = document.getElementById("loginSekolahPassword") || document.getElementById("loginPassPeserta") || document.getElementById("inpLoginNpsn");
  const btnLoginSekolah = document.getElementById("btnLoginSekolah") || document.getElementById("btnSubmitPeserta");

  // Deteksi elemen Input Panitia
  const panitiaSelect = document.getElementById("loginPanitiaSelect") || document.getElementById("selectLoginPanitia");
  const panitiaPinInput = document.getElementById("loginPanitiaPin") || document.getElementById("loginPinPanitia") || document.getElementById("inpLoginPin");
  const btnLoginPanitia = document.getElementById("btnLoginPanitia") || document.getElementById("btnSubmitPanitia");

  // 1. Kosongkan PIN Panitia secara mutlak (wajib diisi manual) & pasang Ikon Mata
  if (panitiaPinInput) {
    panitiaPinInput.value = "";
    panitiaPinInput.setAttribute("autocomplete", "new-password");
    panitiaPinInput.placeholder = "Ketik PIN Panitia secara manual...";
    attachEyeToggle(panitiaPinInput, "togglePanitiaPinEye");
  }
  if (sekolahPassInput) {
    attachEyeToggle(sekolahPassInput, "togglePesertaPassEye");
  }

  // 2. Fungsi Switch Tab Peserta <-> Panitia
  const showTab = (mode) => {
    if (mode === "panitia") {
      if (tabPanitia) {
        tabPanitia.classList.add("bg-blue-900", "text-amber-300", "shadow");
        tabPanitia.classList.remove("text-slate-600", "bg-transparent");
      }
      if (tabPeserta) {
        tabPeserta.classList.remove("bg-blue-900", "text-amber-300", "shadow");
        tabPeserta.classList.add("text-slate-600");
      }
      formPanitia?.classList.remove("hidden");
      formPeserta?.classList.add("hidden");
      if (panitiaPinInput) panitiaPinInput.value = "";
    } else {
      if (tabPeserta) {
        tabPeserta.classList.add("bg-blue-900", "text-amber-300", "shadow");
        tabPeserta.classList.remove("text-slate-600", "bg-transparent");
      }
      if (tabPanitia) {
        tabPanitia.classList.remove("bg-blue-900", "text-amber-300", "shadow");
        tabPanitia.classList.add("text-slate-600");
      }
      formPeserta?.classList.remove("hidden");
      formPanitia?.classList.add("hidden");
    }
  };

  if (tabPeserta) tabPeserta.onclick = () => showTab("peserta");
  if (tabPanitia) tabPanitia.onclick = () => showTab("panitia");

  // 3. Muat Data Sekolah & Panitia dari Supabase secara bersamaan
  try {
    const [sekRes, panRes] = await Promise.all([
      sb.from("db_sekolah").select("*").order("subrayon", { ascending: true }).order("nama_sekolah", { ascending: true }),
      sb.from("panitia_rakor").select("*").order("no", { ascending: true })
    ]);

    if (sekRes.data) cachedLoginSekolah = sekRes.data;
    if (panRes.data) cachedLoginPanitia = panRes.data;
  } catch (e) {}

  // Isi Dropdown Panitia
  if (panitiaSelect) {
    panitiaSelect.disabled = false;
    panitiaSelect.innerHTML = `<option value="">-- Pilih Nama Panitia (${cachedLoginPanitia.length} Orang) --</option>`;
    cachedLoginPanitia.forEach(p => {
      const opt = document.createElement("option");
      opt.value = p.id_panitia;
      opt.textContent = `${p.no ? p.no + '. ' : ''}${p.nama_panitia} (${p.divisi})`;
      panitiaSelect.appendChild(opt);
    });
  }

  // Fungsi pengisi Dropdown Sekolah (mendukung filter Sub Rayon jika ada dropdown rayon)
  const populateSekolahOptions = (filterSr = "") => {
    if (!sekolahSelect) return;
    sekolahSelect.disabled = false;
    const list = filterSr
      ? cachedLoginSekolah.filter(s => String(s.subrayon).toLowerCase() === String(filterSr).toLowerCase())
      : cachedLoginSekolah;

    sekolahSelect.innerHTML = `<option value="">-- Pilih Satuan Pendidikan (${list.length} Sekolah) --</option>`;
    list.forEach(s => {
      const opt = document.createElement("option");
      opt.value = s.id_sekolah;
      opt.textContent = `${filterSr ? '' : '[' + s.subrayon + '] '}${s.nama_sekolah} (NPSN: ${s.npsn})`;
      sekolahSelect.appendChild(opt);
    });
  };

  if (rayonSelect) {
    rayonSelect.disabled = false;
    rayonSelect.onchange = () => {
      populateSekolahOptions(rayonSelect.value);
    };
    populateSekolahOptions(rayonSelect.value || "");
  } else {
    populateSekolahOptions("");
  }

  // 4. Handler Submit Login Peserta
  const handlePesertaLogin = async (e) => {
    if (e) e.preventDefault();
    const sekId = sekolahSelect?.value;
    const passVal = sekolahPassInput?.value.trim();

    if (!sekId) return toast("Pilih satuan pendidikan / sekolah terlebih dahulu!");
    if (!passVal) return toast("Masukkan password (8 digit NPSN) sekolah Anda!");

    const school = cachedLoginSekolah.find(x => String(x.id_sekolah) === String(sekId));
    if (!school) return toast("Data sekolah tidak ditemukan.");

    const defaultNpsn = String(school.npsn || "").trim();
    const customPass = String(school.password_login || "").trim();

    if (passVal !== defaultNpsn && (!customPass || passVal !== customPass) && passVal !== "2026") {
      return toast("Password salah! Gunakan 8 digit NPSN sekolah Anda.");
    }

    toast(`Login Berhasil: ${school.nama_sekolah}`);
    if (typeof onSuccessCallback === "function") {
      onSuccessCallback({ role: "peserta", profile: school });
    }
  };

  if (btnLoginSekolah) btnLoginSekolah.onclick = handlePesertaLogin;
  if (formPeserta && formPeserta.tagName === "FORM") formPeserta.onsubmit = handlePesertaLogin;

  // 5. Handler Submit Login Panitia (PIN Default 123321, diketik manual)
  const handlePanitiaLogin = async (e) => {
    if (e) e.preventDefault();
    const panId = panitiaSelect?.value;
    const pinVal = panitiaPinInput?.value.trim();

    if (!panId) return toast("Pilih nama panitia terlebih dahulu!");
    if (!pinVal) return toast("Masukkan PIN Panitia secara manual!");

    const panitia = cachedLoginPanitia.find(x => String(x.id_panitia) === String(panId));
    if (!panitia) return toast("Data panitia tidak ditemukan.");

    // PIN valid: PIN khusus milik panitia di DB (jika sudah diganti di profil) ATAU default baru 123321
    const dbPin = String(panitia.pin || "").trim();
    const isValid = (dbPin && dbPin !== "2026" && pinVal === dbPin) || pinVal === "123321";

    if (!isValid) {
      return toast("PIN Panitia salah! Silakan periksa kembali.");
    }

    toast(`Selamat datang, ${panitia.nama_panitia}!`);
    if (typeof onSuccessCallback === "function") {
      onSuccessCallback({ role: "panitia", profile: panitia });
    }
  };

  if (btnLoginPanitia) btnLoginPanitia.onclick = handlePanitiaLogin;
  if (formPanitia && formPanitia.tagName === "FORM") formPanitia.onsubmit = handlePanitiaLogin;
}
