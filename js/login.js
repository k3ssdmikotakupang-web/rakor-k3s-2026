// js/login.js
// Disesuaikan 100% dengan ID elemen pada index.html[cite: 7]:
// - Dropdown sekolah hanya menampilkan Nama Sekolah (tanpa membocorkan NPSN)
// - PIN Panitia dikosongkan otomatis, default PIN 123321 + ikon mata
import { sb, toast } from './supabase.js';

let cachedSekolahList = [];
let cachedPanitiaList = [];
let html5QrScanner = null;

export async function initLogin(onSuccessCallback) {
  const btnRolePeserta = document.getElementById("btnRolePeserta");
  const btnRolePanitia = document.getElementById("btnRolePanitia");
  const formPeserta = document.getElementById("loginFormPeserta");
  const formPanitia = document.getElementById("loginFormPanitia");

  const subrayonSelect = document.getElementById("loginSubrayonSelect");
  const schoolSelect = document.getElementById("loginSchoolSelect");
  const npsnInput = document.getElementById("loginNpsnPassword");
  const togglePswdBtn = document.getElementById("togglePswdBtn");
  const btnSubmitPeserta = document.getElementById("btnSubmitPeserta");

  const panitiaSelect = document.getElementById("loginPanitiaSelect");
  const pinInput = document.getElementById("loginPinInput");
  const btnSubmitPanitia = document.getElementById("btnSubmitPanitia");

  const btnOpenScanner = document.getElementById("btnOpenScanner");
  const qrScannerModal = document.getElementById("qrScannerModal");
  const btnCancelScan = document.getElementById("btnCancelScan");
  const btnCloseScanner = document.getElementById("btnCloseScanner");
  const qrFileInput = document.getElementById("qrFileInput");

  // 1. Kosongkan PIN Panitia (hapus value="2026" bawaan HTML) & pasang tombol mata[cite: 7]
  if (pinInput) {
    pinInput.value = "";
    pinInput.removeAttribute("value");
    pinInput.placeholder = "Ketik PIN Panitia";
    pinInput.classList.remove("pr-4");
    pinInput.classList.add("pr-10");

    const parentWrap = pinInput.parentElement;
    if (parentWrap) {
      let togglePinBtn = document.getElementById("togglePanitiaPinBtn");
      if (!togglePinBtn) {
        togglePinBtn = document.createElement("button");
        togglePinBtn.type = "button";
        togglePinBtn.id = "togglePanitiaPinBtn";
        togglePinBtn.className = "absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-amber-300 text-xs p-1";
        togglePinBtn.innerHTML = `<i class="fa-solid fa-eye"></i>`;
        parentWrap.appendChild(togglePinBtn);
      }

      togglePinBtn.onclick = () => {
        const isPwd = pinInput.type === "password";
        pinInput.type = isPwd ? "text" : "password";
        togglePinBtn.innerHTML = `<i class="fa-solid ${isPwd ? 'fa-eye-slash text-amber-300' : 'fa-eye'}"></i>`;
      };
    }
  }

  // 2. Tombol mata pada input NPSN Peserta[cite: 7]
  if (togglePswdBtn && npsnInput) {
    togglePswdBtn.onclick = () => {
      const isPwd = npsnInput.type === "password";
      npsnInput.type = isPwd ? "text" : "password";
      togglePswdBtn.innerHTML = `<i class="fa-solid ${isPwd ? 'fa-eye-slash text-amber-300' : 'fa-eye'}"></i>`;
    };
  }

  // 3. Pindah Tab Peserta <-> Panitia[cite: 7]
  if (btnRolePeserta && btnRolePanitia) {
    btnRolePeserta.onclick = () => {
      btnRolePeserta.className = "py-2.5 rounded-xl text-xs font-extrabold bg-amber-400 text-slate-950 shadow transition";
      btnRolePanitia.className = "py-2.5 rounded-xl text-xs font-bold text-slate-400 hover:text-white transition";
      formPeserta?.classList.remove("hidden");
      formPanitia?.classList.add("hidden");
    };

    btnRolePanitia.onclick = () => {
      btnRolePanitia.className = "py-2.5 rounded-xl text-xs font-extrabold bg-blue-500 text-white shadow transition";
      btnRolePeserta.className = "py-2.5 rounded-xl text-xs font-bold text-slate-400 hover:text-white transition";
      formPanitia?.classList.remove("hidden");
      formPeserta?.classList.add("hidden");
      if (pinInput) pinInput.value = "";
    };
  }

  // 4. Ambil data Sekolah & Panitia dari Supabase[cite: 1, 5, 8]
  try {
    const [sekRes, panRes] = await Promise.all([
      sb.from("db_sekolah").select("*").order("nama_sekolah", { ascending: true }),
      sb.from("panitia_rakor").select("*").order("no", { ascending: true })
    ]);

    if (sekRes.data) cachedSekolahList = sekRes.data;
    if (panRes.data) cachedPanitiaList = panRes.data;
  } catch (err) {
    console.error("Gagal memuat data login:", err);
  }

  // 5. Isi Dropdown Panitia[cite: 1, 5, 8]
  if (panitiaSelect && cachedPanitiaList.length > 0) {
    panitiaSelect.innerHTML = `<option value="">Pilih Nama Panitia (${cachedPanitiaList.length} Orang)</option>`;
    cachedPanitiaList.forEach(p => {
      const srTag = p.tugas_subrayon ? ` [Ketua Rayon ${p.tugas_subrayon}]` : "";
      const opt = document.createElement("option");
      opt.value = p.id_panitia;
      opt.textContent = `${p.no}. ${p.nama_panitia} (${p.divisi}${srTag})`;
      panitiaSelect.appendChild(opt);
    });
  }

  // 6. Filter Sub Rayon -> Aktifkan Dropdown Sekolah (Tanpa Menampilkan NPSN)
  const renderSchoolDropdown = (selectedRayon) => {
    if (!schoolSelect) return;
    if (!selectedRayon) {
      schoolSelect.innerHTML = `<option value="">Pilih Sekolah</option>`;
      schoolSelect.disabled = true;
      return;
    }

    const filtered = cachedSekolahList.filter(
      s => String(s.subrayon || "").toLowerCase() === String(selectedRayon).toLowerCase()
    );

    schoolSelect.disabled = false;
    schoolSelect.innerHTML = `<option value="">Pilih Sekolah (${filtered.length} SD/MI)</option>`;
    filtered.forEach(s => {
      const opt = document.createElement("option");
      opt.value = s.id_sekolah;
      opt.textContent = s.nama_sekolah;
      schoolSelect.appendChild(opt);
    });
  };

  if (subrayonSelect) {
    subrayonSelect.onchange = () => {
      renderSchoolDropdown(subrayonSelect.value);
    };
    if (subrayonSelect.value) {
      renderSchoolDropdown(subrayonSelect.value);
    }
  }

  // 7. Submit Login Peserta
  if (btnSubmitPeserta) {
    btnSubmitPeserta.onclick = async () => {
      const sr = subrayonSelect?.value || "";
      const idSekolah = schoolSelect?.value || "";
      const pass = npsnInput?.value.trim() || "";

      if (!sr) return toast("Pilih Sub Rayon terlebih dahulu!");
      if (!idSekolah) return toast("Pilih nama sekolah Anda!");
      if (!pass) return toast("Masukkan NPSN / Password sekolah Anda!");

      let school = cachedSekolahList.find(s => String(s.id_sekolah) === String(idSekolah));
      if (!school) {
        const { data } = await sb.from("db_sekolah").select("*").eq("id_sekolah", idSekolah).maybeSingle();
        school = data;
      }
      if (!school) return toast("Data sekolah tidak ditemukan!");

      const validNpsn = String(school.npsn || "").trim();
      const customPass = String(school.password_login || "").trim();

      if (pass !== validNpsn && (!customPass || pass !== customPass)) {
        return toast("NPSN / Password tidak sesuai!");
      }

      toast(`Selamat datang, ${school.nama_sekolah}!`);
      onSuccessCallback({ role: "peserta", profile: school });
    };
  }

  // 8. Submit Login Panitia (Wajib isi manual, default PIN: 123321)
  if (btnSubmitPanitia) {
    btnSubmitPanitia.onclick = async () => {
      const idPanitia = panitiaSelect?.value || "";
      const pin = pinInput?.value.trim() || "";

      if (!idPanitia) return toast("Pilih nama panitia terlebih dahulu!");
      if (!pin) return toast("Masukkan PIN Akses Panitia secara manual!");

      let panitia = cachedPanitiaList.find(p => String(p.id_panitia) === String(idPanitia));
      if (!panitia) {
        const { data } = await sb.from("panitia_rakor").select("*").eq("id_panitia", idPanitia).maybeSingle();
        panitia = data;
      }
      if (!panitia) return toast("Data panitia tidak ditemukan!");

      const customPin = String(panitia.pin || "").trim();
      const isCustomPinValid = customPin && customPin !== "2026" && pin === customPin;
      const isDefaultPinValid = pin === "123321";

      if (!isCustomPinValid && !isDefaultPinValid) {
        return toast("PIN Akses Panitia salah!");
      }

      toast(`Selamat bertugas, ${panitia.nama_panitia}!`);
      onSuccessCallback({ role: "panitia", profile: panitia });
    };
  }

  // 9. Fitur Masuk dengan Scan QR[cite: 7]
  const stopScanner = async () => {
    if (html5QrScanner) {
      try {
        await html5QrScanner.stop();
        await html5QrScanner.clear();
      } catch (e) {}
      html5QrScanner = null;
    }
    qrScannerModal?.classList.add("hidden");
  };

  const handleQrTextLogin = async (decodedText) => {
    const raw = String(decodedText || "").trim();
    if (!raw) return;

    await stopScanner();

    if (raw.startsWith("PESERTA|")) {
      const parts = raw.split("|");
      const npsn = parts[1];
      const school = cachedSekolahList.find(s => String(s.npsn) === String(npsn));
      if (school) {
        toast(`Login QR Berhasil: ${school.nama_sekolah}`);
        onSuccessCallback({ role: "peserta", profile: school });
        return;
      }
    } else if (raw.startsWith("PANITIA|")) {
      const parts = raw.split("|");
      const idPan = parts[1];
      const panitia = cachedPanitiaList.find(p => String(p.id_panitia) === String(idPan));
      if (panitia) {
        toast(`Login QR Berhasil: ${panitia.nama_panitia}`);
        onSuccessCallback({ role: "panitia", profile: panitia });
        return;
      }
    }

    const byNpsn = cachedSekolahList.find(s => String(s.npsn) === raw || String(s.id_sekolah) === raw);
    if (byNpsn) {
      toast(`Login QR Berhasil: ${byNpsn.nama_sekolah}`);
      onSuccessCallback({ role: "peserta", profile: byNpsn });
      return;
    }

    toast("QR Code tidak dikenali sebagai kartu akses Rakor 2026.");
  };

  if (btnOpenScanner) {
    btnOpenScanner.onclick = async () => {
      qrScannerModal?.classList.remove("hidden");
      if (typeof window.Html5Qrcode === "function") {
        try {
          html5QrScanner = new window.Html5Qrcode("qrReader");
          await html5QrScanner.start(
            { facingMode: "environment" },
            { fps: 10, qrbox: { width: 220, height: 220 } },
            (decodedText) => handleQrTextLogin(decodedText),
            () => {}
          );
        } catch (err) {
          toast("Kamera tidak dapat diakses. Gunakan opsi Pilih dari Galeri.");
        }
      }
    };
  }

  if (btnCancelScan) btnCancelScan.onclick = stopScanner;
  if (btnCloseScanner) btnCloseScanner.onclick = stopScanner;

  if (qrFileInput) {
    qrFileInput.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file || typeof window.Html5Qrcode !== "function") return;
      try {
        const fileScanner = new window.Html5Qrcode("qrReader");
        const decodedText = await fileScanner.scanFile(file, true);
        await handleQrTextLogin(decodedText);
      } catch (err) {
        toast("Gagal membaca QR dari gambar tersebut.");
      }
    };
  }
}
