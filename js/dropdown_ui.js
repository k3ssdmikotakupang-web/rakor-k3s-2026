// js/dropdown_ui.js
// Mengubah seluruh <select> bawaan HP menjadi Modern Android Bottom-Sheet Picker secara otomatis

let activeSelectEl = null;

export function initModernDropdowns() {
  if (document.getElementById("modernSelectOverlay")) return;

  // 1. Suntikkan CSS Animasi & Tampilan Elegan untuk Semua <select>
  const style = document.createElement("style");
  style.textContent = `
    select {
      cursor: pointer !important;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2364748b'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2.5' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 0.75rem center;
      background-size: 0.95rem;
      padding-right: 2.2rem !important;
      transition: all 0.18s ease;
    }
    #loginScreen select {
      background-image: none !important;
    }
    select:active:not(:disabled) {
      transform: scale(0.98);
    }
    @keyframes sheetSlideUp {
      from { transform: translateY(100%); opacity: 0.5; }
      to { transform: translateY(0); opacity: 1; }
    }
    .sheet-animate-up {
      animation: sheetSlideUp 0.24s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }
  `;
  document.head.appendChild(style);

  // 2. Buat Kontainer Modal Bottom-Sheet di Body
  const overlay = document.createElement("div");
  overlay.id = "modernSelectOverlay";
  overlay.className = "hidden fixed inset-0 bg-slate-950/75 backdrop-blur-xs z-[90] flex items-end sm:items-center justify-center p-0 sm:p-4 select-none";
  overlay.innerHTML = `
    <div id="modernSelectSheet" class="bg-white w-full max-w-[430px] rounded-t-3xl sm:rounded-3xl shadow-2xl border-t border-slate-200 overflow-hidden flex flex-col max-h-[82dvh] sheet-animate-up">
      <!-- Handle Bar Atas khas Android -->
      <div class="pt-3 pb-1 flex justify-center">
        <div class="w-12 h-1.5 rounded-full bg-slate-300"></div>
      </div>

      <!-- Header Judul Pilihan -->
      <div class="px-5 py-2.5 border-b border-slate-100 flex items-center justify-between gap-2">
        <div class="min-w-0">
          <span class="text-[9px] font-extrabold uppercase tracking-wider text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md">Pilihan Data</span>
          <h3 id="modernSelectTitle" class="font-extrabold text-sm text-slate-900 truncate mt-0.5">Pilih Opsi</h3>
        </div>
        <button type="button" id="btnCloseModernSelect" class="w-8 h-8 rounded-full bg-slate-100 hover:bg-rose-100 text-slate-600 hover:text-rose-600 font-extrabold text-base flex items-center justify-center shrink-0 transition">
          &times;
        </button>
      </div>

      <!-- Kotak Pencarian Cepat (Muncul otomatis jika opsi > 5) -->
      <div id="modernSelectSearchWrap" class="px-4 pt-3 pb-1 hidden">
        <div class="relative">
          <i class="fa-solid fa-magnifying-glass absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
          <input id="modernSelectSearchInput" type="text" placeholder="Ketik untuk mencari..." class="w-full rounded-2xl border border-slate-300 bg-slate-50 pl-9 pr-4 py-2.5 text-xs font-bold text-slate-800 focus:outline-none focus:border-blue-900 focus:bg-white transition" />
        </div>
      </div>

      <!-- Daftar Item Pilihan -->
      <div id="modernSelectOptionsList" class="p-4 space-y-1.5 overflow-y-auto flex-1"></div>
    </div>
  `;
  document.body.appendChild(overlay);

  // 3. Event Tutup Bottom-Sheet
  document.getElementById("btnCloseModernSelect")?.addEventListener("click", closeModernPicker);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeModernPicker();
  });

  // 4. Event Pencarian Cepat
  document.getElementById("modernSelectSearchInput")?.addEventListener("input", (e) => {
    renderPickerOptions(e.target.value);
  });

  // 5. Cegat Semua Klik/Sentuhan pada Elemen <select> di Seluruh Aplikasi
  const interceptEvent = (e) => {
    const sel = e.target.closest("select");
    if (!sel) return;

    // Jika select sedang disabled, biarkan tidak terbuka
    if (sel.disabled) return;

    // Cegah dropdown kaku bawaan HP muncul
    e.preventDefault();
    e.stopPropagation();
    sel.blur();

    openModernPickerFor(sel);
  };

  document.addEventListener("mousedown", interceptEvent, { passive: false });
  document.addEventListener("touchstart", (e) => {
    const sel = e.target.closest("select");
    if (!sel || sel.disabled) return;
    // Tandai posisi sentuh awal agar tidak terpicu saat pengguna sedang scroll layar
    sel.dataset.touchStartY = e.touches[0].clientY;
  }, { passive: true });

  document.addEventListener("touchend", (e) => {
    const sel = e.target.closest("select");
    if (!sel || sel.disabled) return;
    const startY = parseFloat(sel.dataset.touchStartY || "0");
    const endY = e.changedTouches[0].clientY;
    if (Math.abs(endY - startY) < 10) {
      e.preventDefault();
      e.stopPropagation();
      sel.blur();
      openModernPickerFor(sel);
    }
  }, { passive: false });

  document.addEventListener("keydown", (e) => {
    const sel = e.target.closest("select");
    if (sel && !sel.disabled && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      openModernPickerFor(sel);
    }
  });
}

function openModernPickerFor(selectEl) {
  activeSelectEl = selectEl;
  const overlay = document.getElementById("modernSelectOverlay");
  const titleEl = document.getElementById("modernSelectTitle");
  const searchWrap = document.getElementById("modernSelectSearchWrap");
  const searchInput = document.getElementById("modernSelectSearchInput");

  if (!overlay || !titleEl) return;

  // Tentukan judul modal secara cerdas dari label terdekat atau opsi pertama
  let titleText = "Pilih Opsi";
  const prevLabel = selectEl.previousElementSibling;
  if (prevLabel && prevLabel.tagName === "LABEL") {
    titleText = prevLabel.textContent.replace(":", "").trim();
  } else if (selectEl.options.length > 0 && selectEl.options[0].value === "") {
    titleText = selectEl.options[0].text.replace(/--/g, "").trim();
  } else if (selectEl.id === "srSelectFilter") {
    titleText = "Pilih Wilayah Sub Rayon";
  } else if (selectEl.classList.contains("select-status-bayar") || selectEl.classList.contains("keu-row-select")) {
    titleText = "Status Kontribusi (Rp 2.000.000)";
  } else if (selectEl.classList.contains("select-assign-room")) {
    titleText = "Pilih Kamar Hotel Peserta";
  }

  titleEl.textContent = titleText;

  // Tampilkan kotak pencarian jika jumlah pilihan lebih dari 5 item
  const totalOpts = selectEl.options.length;
  if (totalOpts > 5) {
    searchWrap?.classList.remove("hidden");
    if (searchInput) {
      searchInput.value = "";
      setTimeout(() => searchInput.focus(), 80);
    }
  } else {
    searchWrap?.classList.add("hidden");
  }

  overlay.classList.remove("hidden");
  renderPickerOptions("");
}

function renderPickerOptions(keyword = "") {
  const listBox = document.getElementById("modernSelectOptionsList");
  if (!listBox || !activeSelectEl) return;

  const kw = String(keyword || "").toLowerCase().trim();
  const options = Array.from(activeSelectEl.options);
  const currentVal = activeSelectEl.value;

  const filtered = options.filter((opt, idx) => {
    // Sembunyikan placeholder kosong di daftar jika bukan satu-satunya opsi
    if (opt.value === "" && idx === 0 && options.length > 1) return false;
    return opt.text.toLowerCase().includes(kw);
  });

  if (filtered.length === 0) {
    listBox.innerHTML = `
      <div class="py-8 text-center text-xs text-slate-400 font-semibold">
        <i class="fa-solid fa-magnifying-glass mb-1.5 text-base block text-slate-300"></i>
        Data "${keyword}" tidak ditemukan.
      </div>
    `;
    return;
  }

  listBox.innerHTML = "";
  filtered.forEach((opt) => {
    const isSelected = String(opt.value) === String(currentVal) && opt.value !== "";
    const isDisabled = opt.disabled;

    // Deteksi lencana warna khusus (misal kamar penuh, lunas, dll.)
    const isLockedFull = opt.text.includes("PENUH") || opt.text.includes("🔒");
    const isLunas = opt.value === "Lunas";
    const isProses = opt.value === "Dalam Proses";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.disabled = isDisabled;

    btn.className = `w-full p-3.5 rounded-2xl border text-left flex items-center justify-between gap-3 transition ${
      isSelected
        ? "bg-blue-950 text-white border-blue-900 shadow-md"
        : isDisabled
        ? "bg-slate-100 text-slate-400 border-slate-200 opacity-60 cursor-not-allowed"
        : "bg-slate-50 hover:bg-blue-50/70 text-slate-800 border-slate-200/90 active:scale-[0.99]"
    }`;

    // Buat ikon samping yang relevan
    let leftIcon = "fa-circle-dot";
    let iconColor = isSelected ? "text-amber-300" : "text-slate-400";

    if (isLockedFull) {
      leftIcon = "fa-lock";
      iconColor = "text-rose-500";
    } else if (isLunas) {
      leftIcon = "fa-circle-check";
      iconColor = isSelected ? "text-emerald-300" : "text-emerald-600";
    } else if (isProses) {
      leftIcon = "fa-clock";
      iconColor = isSelected ? "text-amber-300" : "text-amber-500";
    } else if (activeSelectEl.id === "loginSchoolSelect" || activeSelectEl.id === "selectManualPosSchool") {
      leftIcon = "fa-school";
      iconColor = isSelected ? "text-amber-300" : "text-blue-700";
    } else if (activeSelectEl.id === "loginPanitiaSelect") {
      leftIcon = "fa-user-tie";
      iconColor = isSelected ? "text-amber-300" : "text-indigo-700";
    } else if (activeSelectEl.id.toLowerCase().includes("subrayon") || activeSelectEl.id.toLowerCase().includes("rayon")) {
      leftIcon = "fa-location-dot";
      iconColor = isSelected ? "text-amber-300" : "text-emerald-600";
    }

    const cleanLabel = opt.text.replace("🔒", "").replace("✓", "").trim();

    btn.innerHTML = `
      <div class="flex items-center gap-3 min-w-0 flex-1">
        <div class="w-8 h-8 rounded-xl ${isSelected ? 'bg-white/15' : 'bg-white border border-slate-200/80'} flex items-center justify-center shrink-0">
          <i class="fa-solid ${leftIcon} ${iconColor} text-xs"></i>
        </div>
        <span class="text-xs ${isSelected ? 'font-extrabold text-white' : 'font-bold text-slate-800'} leading-snug break-words">
          ${cleanLabel}
        </span>
      </div>
      <div class="shrink-0">
        ${isSelected ? `
          <span class="w-6 h-6 rounded-full bg-amber-400 text-slate-950 flex items-center justify-center text-xs font-extrabold shadow">
            <i class="fa-solid fa-check"></i>
          </span>
        ` : isDisabled ? `
          <span class="text-[9px] font-extrabold uppercase bg-rose-100 text-rose-700 px-2 py-0.5 rounded-md">Penuh</span>
        ` : `
          <span class="w-5 h-5 rounded-full border-2 border-slate-300 block"></span>
        `}
      </div>
    `;

    if (!isDisabled) {
      btn.addEventListener("click", () => {
        activeSelectEl.value = opt.value;
        // Picu event change asli agar seluruh logika aplikasi tetap berjalan otomatis
        activeSelectEl.dispatchEvent(new Event("change", { bubbles: true }));
        closeModernPicker();
      });
    }

    listBox.appendChild(btn);
  });
}

function closeModernPicker() {
  const overlay = document.getElementById("modernSelectOverlay");
  overlay?.classList.add("hidden");
  activeSelectEl = null;
}
