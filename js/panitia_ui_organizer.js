// =========================================================================
// PENATAAN ULANG HEADER & KARTU KHUSUS PANITIA (6 MENU KOTAK SERAGAM)
// 1. Bersihkan Header dari ikon '?' (Panduan) & badge Nomor Kamar
// 2. Kumpulkan 6 Menu Kotak di Card "KHUSUS PANITIA & AKSES KHUSUS":
//    - SK Panitia, Job Deskripsi, Meeting Panitia
//    - Catatan & Evaluasi, Meja Layanan & Pos, Profil Panitia
// =========================================================================

function cleanUpHeaderClutter() {
  const header = document.querySelector("#mainAppScreen header");
  if (!header) return;

  // Hapus tombol '?' (Panduan Aplikasi) dan badge Nomor Kamar tambahan di area header
  header.querySelectorAll("button, span, div, a").forEach(el => {
    const id = String(el.id || "").toLowerCase();
    const title = String(el.title || "").toLowerCase();
    const txt = String(el.textContent || "").trim();

    // Jangan sentuh elemen asli header
    if (
      ["topuseravatar", "topuserrolebadge", "topusersubrayonbadge", "topusername", "btnrefreshapp", "btnlogout"].includes(id) ||
      el.contains(document.getElementById("topUserName")) ||
      el.contains(document.getElementById("btnLogout"))
    ) {
      return;
    }

    if (
      txt === "?" ||
      title.includes("panduan") ||
      title.includes("bantuan") ||
      id.includes("help") ||
      id.includes("guide") ||
      id.includes("headerkamar") ||
      id.includes("roombadge") ||
      el.querySelector(".fa-question, .fa-circle-question, .fa-bed")
    ) {
      el.remove();
    }
  });
}

function openProfilPanitiaDirectoryModal() {
  const modal = document.getElementById("serviceModal");
  const titleEl = document.getElementById("serviceModalTitle");
  const bodyEl = document.getElementById("serviceModalBody");
  if (!modal || !titleEl || !bodyEl) return;

  modal.classList.remove("hidden");
  titleEl.innerHTML = `<i class="fa-solid fa-id-card-clip text-indigo-700 mr-1.5"></i> Profil & Direktori Panitia Rakor 2026`;

  const myProfile = activeUser?.profile || {};
  const divisiOptions = ["ALL", ...new Set((panitiaList || []).map(p => p.divisi).filter(Boolean))];
  let selectedDiv = "ALL";

  const getPhoto = (p) => {
    const candidates = [p?.foto_url, p?.foto_profil, p?.foto, p?.avatar_url];
    for (const c of candidates) {
      if (c && typeof c === "string" && c.trim() !== "") return c.trim();
    }
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(p?.nama_panitia || "Panitia")}&background=1e1b4b&color=fcd34d&bold=true&size=250`;
  };

  const renderModalContent = () => {
    const kw = (document.getElementById("inpSearchDirPanitia")?.value || "").toLowerCase().trim();
    let list = panitiaList || [];
    if (selectedDiv !== "ALL") {
      list = list.filter(p => p.divisi === selectedDiv);
    }
    if (kw) {
      list = list.filter(p =>
        (p.nama_panitia || "").toLowerCase().includes(kw) ||
        (p.divisi || "").toLowerCase().includes(kw) ||
        (p.tugas_subrayon || "").toLowerCase().includes(kw)
      );
    }

    const myPhoto = getPhoto(myProfile);

    bodyEl.innerHTML = `
      <!-- Kartu Profil Saya (Panitia yang Sedang Login) -->
      <div class="p-4 rounded-3xl bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white space-y-3 shadow-lg border border-indigo-400/30">
        <div class="flex items-center gap-3">
          <img src="${myPhoto}" alt="${myProfile.nama_panitia || 'Panitia'}" class="w-14 h-14 rounded-2xl object-cover border-2 border-amber-400 shrink-0 bg-slate-800" />
          <div class="min-w-0 flex-1">
            <span class="text-[9px] font-extrabold uppercase bg-amber-400 text-slate-950 px-2 py-0.5 rounded-full">
              Profil Panitia Anda
            </span>
            <h4 class="text-xs font-extrabold text-white truncate mt-1">${myProfile.nama_panitia || '-'}</h4>
            <p class="text-[10px] text-indigo-200 truncate">
              ${myProfile.divisi || 'Panitia'} ${myProfile.tugas_subrayon ? '• Ketua Rayon ' + myProfile.tugas_subrayon : ''}
            </p>
            <p class="text-[9px] text-amber-300 font-bold mt-0.5">
              No. WA: ${myProfile.no_hp || 'Belum diisi'}
            </p>
          </div>
        </div>
        <button type="button" id="btnEditMyPanitiaProfileNow" class="w-full py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold text-[11px] flex items-center justify-center gap-1.5 shadow transition">
          <i class="fa-solid fa-user-pen"></i>
          <span>Ubah Foto Profil, Biodata & PIN Saya</span>
        </button>
      </div>

      <!-- Filter & Pencarian Direktori Panitia -->
      <div class="grid grid-cols-2 gap-2 pt-1">
        <select id="selFilterDirPanitia" class="rounded-xl border border-slate-300 bg-slate-50 px-2.5 py-2 text-xs font-extrabold text-slate-800">
          ${divisiOptions.map(d => `<option value="${d}" ${selectedDiv === d ? 'selected' : ''}>${d === 'ALL' ? `Semua Divisi (${panitiaList.length})` : d}</option>`).join('')}
        </select>
        <input id="inpSearchDirPanitia" type="text" value="${kw}" placeholder="Cari nama panitia..." class="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-900" />
      </div>

      <!-- Daftar Direktori Seluruh Panitia -->
      <div class="space-y-2 max-h-80 overflow-y-auto pr-0.5">
        ${list.map((p, idx) => {
          const pPhoto = getPhoto(p);
          const waClean = String(p.no_hp || "").replace(/\D/g, "").replace(/^0/, "62");
          const telClean = String(p.no_hp || "").replace(/\D/g, "");
          return `
            <div class="p-3 rounded-2xl bg-white border border-slate-200 flex items-center justify-between gap-2.5 shadow-2xs">
              <div class="flex items-center gap-2.5 min-w-0 flex-1">
                <img src="${pPhoto}" alt="${p.nama_panitia}" class="w-11 h-11 rounded-2xl object-cover border border-indigo-200 shrink-0 bg-slate-100" />
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-1 flex-wrap">
                    <span class="text-[9px] font-extrabold text-slate-400">#${p.no || (idx + 1)}</span>
                    <span class="text-[9px] font-extrabold bg-indigo-50 text-indigo-900 px-1.5 py-0.5 rounded">${p.divisi}</span>
                    ${p.tugas_subrayon ? `<span class="text-[9px] font-extrabold bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded">Rayon ${p.tugas_subrayon}</span>` : ''}
                  </div>
                  <h4 class="font-extrabold text-xs text-slate-900 truncate mt-1">${p.nama_panitia}</h4>
                  <div class="text-[10px] text-slate-500 mt-0.5">WA: ${p.no_hp || 'Belum diisi'}</div>
                </div>
              </div>
              <div class="flex items-center gap-1.5 shrink-0">
                ${p.no_hp ? `
                  <a href="tel:${telClean}" class="w-8 h-8 rounded-xl bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center text-xs shadow transition" title="Telepon">
                    <i class="fa-solid fa-phone"></i>
                  </a>
                  <a href="https://wa.me/${waClean}" target="_blank" rel="noopener noreferrer" class="w-8 h-8 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center text-xs shadow transition" title="WhatsApp">
                    <i class="fa-brands fa-whatsapp"></i>
                  </a>
                ` : ''}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    document.getElementById("btnEditMyPanitiaProfileNow")?.addEventListener("click", () => {
      modal.classList.add("hidden");
      document.getElementById("topUserAvatar")?.click();
    });

    document.getElementById("selFilterDirPanitia")?.addEventListener("change", (e) => {
      selectedDiv = e.target.value;
      renderModalContent();
    });

    document.getElementById("inpSearchDirPanitia")?.addEventListener("input", (e) => {
      const val = e.target.value;
      renderModalContent();
      const inp = document.getElementById("inpSearchDirPanitia");
      if (inp) {
        inp.focus();
        inp.setSelectionRange(val.length, val.length);
      }
    });
  };

  renderModalContent();
}

function reorganizePanitiaWorkspaceCards() {
  cleanUpHeaderClutter();

  const tabBeranda = document.getElementById("tabContentBeranda");
  if (!tabBeranda) return;

  // Jika bukan panitia (Peserta), sembunyikan kartu khusus panitia & menu panitia yang nyasar di kartu umum
  const generalServiceGrid = tabBeranda.querySelector(".service-menu-btn")?.parentElement;
  if (generalServiceGrid) {
    generalServiceGrid.querySelectorAll("button, a, div").forEach(btn => {
      if (btn.id === "btnToggleExtraMenu" || btn.closest("#panitiaUnifiedGrid6")) return;
      const txt = (btn.textContent || "").toLowerCase();
      if (txt.includes("sk panitia") || txt.includes("job deskripsi") || txt.includes("meeting panitia")) {
        btn.classList.add("hidden");
      }
    });
  }

  if (!activeUser || activeUser.role !== "panitia") {
    document.getElementById("panitiaUnifiedWorkspaceCard")?.classList.add("hidden");
    return;
  }

  // Temukan elemen asli Catatan Panitia & Meja Layanan yang dirender oleh modul masing-masing
  let originalCatatanCard = null;
  let originalMejaCard = null;
  let existingPanitiaSpecialCard = null;

  tabBeranda.querySelectorAll("div, section").forEach(el => {
    if (el.parentElement !== tabBeranda && el.parentElement?.id !== "panitiaSpecialCardsBox") return;
    const txt = (el.textContent || "").toLowerCase();

    if (
      txt.includes("khusus panitia & akses khusus") &&
      el.id !== "panitiaUnifiedWorkspaceCard"
    ) {
      existingPanitiaSpecialCard = el;
    }
    if (
      (txt.includes("catatan & evaluasi") || txt.includes("catatan panitia")) &&
      !txt.includes("khusus panitia & akses khusus") &&
      el.id !== "panitiaUnifiedWorkspaceCard"
    ) {
      originalCatatanCard = el;
    }
    if (
      txt.includes("meja layanan") &&
      txt.includes("otorisasi") &&
      el.id !== "panitiaUnifiedWorkspaceCard"
    ) {
      originalMejaCard = el;
    }
  });

  // Sembunyikan tampilan kartu besar Catatan & Meja Layanan dari Beranda utama (agar masuk jadi menu kotak)
  if (originalCatatanCard) originalCatatanCard.classList.add("hidden");
  if (originalMejaCard) originalMejaCard.classList.add("hidden");
  if (existingPanitiaSpecialCard) existingPanitiaSpecialCard.classList.add("hidden");

  // Buat atau perbarui Card Terpadu "KHUSUS PANITIA & AKSES KHUSUS" dengan 6 Menu Kotak
  let workspaceCard = document.getElementById("panitiaUnifiedWorkspaceCard");
  if (!workspaceCard) {
    workspaceCard = document.createElement("div");
    workspaceCard.id = "panitiaUnifiedWorkspaceCard";
    const serviceCardBox = generalServiceGrid?.closest(".bg-white");
    if (serviceCardBox && serviceCardBox.parentElement === tabBeranda) {
      serviceCardBox.insertAdjacentElement("afterend", workspaceCard);
    } else {
      tabBeranda.appendChild(workspaceCard);
    }
  }

  const ikutCount = (sekolahList || []).filter(s => s.status_ikut === "Ikut").length;

  workspaceCard.className = "bg-white rounded-3xl p-4 border-2 border-indigo-200/80 shadow-2xs space-y-3";
  workspaceCard.innerHTML = `
    <div class="flex items-center justify-between">
      <h4 class="text-xs font-extrabold uppercase tracking-wider text-indigo-950 flex items-center gap-1.5">
        <i class="fa-solid fa-user-shield text-indigo-700"></i>
        <span>Khusus Panitia & Akses Khusus</span>
      </h4>
      <span class="text-[9px] font-extrabold uppercase bg-indigo-100 text-indigo-900 px-2 py-0.5 rounded-full">
        Internal Panitia
      </span>
    </div>

    <div id="panitiaUnifiedGrid6" class="grid grid-cols-3 gap-2.5 text-center">
      <!-- 1. SK Panitia -->
      <button type="button" data-panmenu="sk" class="pan-box-btn p-3 rounded-2xl bg-slate-50 hover:bg-blue-50 border border-slate-200/80 flex flex-col items-center justify-center gap-1.5 active:scale-95 transition">
        <div class="w-11 h-11 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center text-base shadow-2xs">
          <i class="fa-solid fa-file-signature"></i>
        </div>
        <span class="text-[11px] font-extrabold text-slate-800 leading-tight">SK Panitia</span>
        <span class="text-[9px] font-semibold text-slate-500">Surat Keputusan</span>
      </button>

      <!-- 2. Job Deskripsi -->
      <button type="button" data-panmenu="jobdesk" class="pan-box-btn p-3 rounded-2xl bg-slate-50 hover:bg-emerald-50 border border-slate-200/80 flex flex-col items-center justify-center gap-1.5 active:scale-95 transition">
        <div class="w-11 h-11 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center text-base shadow-2xs">
          <i class="fa-solid fa-list-check"></i>
        </div>
        <span class="text-[11px] font-extrabold text-slate-800 leading-tight">Job Deskripsi</span>
        <span class="text-[9px] font-semibold text-slate-500">Rincian Tugas</span>
      </button>

      <!-- 3. Meeting Panitia -->
      <button type="button" data-panmenu="meeting" class="pan-box-btn p-3 rounded-2xl bg-slate-50 hover:bg-amber-50 border border-slate-200/80 flex flex-col items-center justify-center gap-1.5 active:scale-95 transition">
        <div class="w-11 h-11 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center text-base shadow-2xs">
          <i class="fa-solid fa-users-gear"></i>
        </div>
        <span class="text-[11px] font-extrabold text-slate-800 leading-tight">Meeting Panitia</span>
        <span class="text-[9px] font-semibold text-slate-500">Jadwal & Rapat</span>
      </button>

      <!-- 4. Catatan & Evaluasi Kegiatan -->
      <button type="button" data-panmenu="catatan" class="pan-box-btn p-3 rounded-2xl bg-slate-50 hover:bg-rose-50 border border-slate-200/80 flex flex-col items-center justify-center gap-1.5 active:scale-95 transition">
        <div class="w-11 h-11 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center text-base shadow-2xs">
          <i class="fa-solid fa-clipboard-list"></i>
        </div>
        <span class="text-[11px] font-extrabold text-slate-800 leading-tight">Catatan & Evaluasi</span>
        <span class="text-[9px] font-semibold text-slate-500">Evaluasi Rakor</span>
      </button>

      <!-- 5. Meja Layanan & Otorisasi Pos -->
      <button type="button" data-panmenu="meja_pos" class="pan-box-btn p-3 rounded-2xl bg-slate-50 hover:bg-violet-50 border border-slate-200/80 flex flex-col items-center justify-center gap-1.5 active:scale-95 transition">
        <div class="w-11 h-11 rounded-2xl bg-violet-100 text-violet-700 flex items-center justify-center text-base shadow-2xs">
          <i class="fa-solid fa-qrcode"></i>
        </div>
        <span class="text-[11px] font-extrabold text-slate-800 leading-tight">Meja Layanan</span>
        <span class="text-[9px] font-bold text-violet-700">Pos & Scan (${ikutCount})</span>
      </button>

      <!-- 6. Profil Panitia -->
      <button type="button" data-panmenu="profil_panitia" class="pan-box-btn p-3 rounded-2xl bg-slate-50 hover:bg-indigo-50 border border-slate-200/80 flex flex-col items-center justify-center gap-1.5 active:scale-95 transition">
        <div class="w-11 h-11 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center text-base shadow-2xs">
          <i class="fa-solid fa-id-card-clip"></i>
        </div>
        <span class="text-[11px] font-extrabold text-slate-800 leading-tight">Profil Panitia</span>
        <span class="text-[9px] font-semibold text-slate-500">${(panitiaList || []).length || 38} Anggota</span>
      </button>
    </div>
  `;

  // Hubungkan aksi klik ke-6 menu kotak khusus panitia
  workspaceCard.querySelectorAll(".pan-box-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const code = btn.dataset.panmenu;

      if (code === "profil_panitia") {
        openProfilPanitiaDirectoryModal();
        return;
      }

      if (code === "sk" || code === "jobdesk" || code === "meeting") {
        // Picu tombol asli yang dibuat oleh fitur_ekstra.js / layanan.js jika ada
        const keyword = code === "sk" ? "sk panitia" : code === "jobdesk" ? "job" : "meeting";
        let foundBtn = null;
        document.querySelectorAll("button, a, [data-service]").forEach(el => {
          if (el === btn || el.closest("#panitiaUnifiedGrid6")) return;
          const t = (el.textContent || "").toLowerCase();
          if (t.includes(keyword)) foundBtn = el;
        });
        if (foundBtn) {
          foundBtn.click();
        } else {
          openLayananDocumentModal(code === "sk" ? "sk_panitia" : code, activeUser, layananList, () => loadAllDatabase(false));
        }
        return;
      }

      if (code === "catatan") {
        if (originalCatatanCard) {
          const triggerBtn = originalCatatanCard.querySelector("button");
          if (triggerBtn && triggerBtn.textContent && !triggerBtn.textContent.toLowerCase().includes("hapus")) {
            triggerBtn.click();
            return;
          }
          // Jika kartu catatan berupa form langsung, tampilkan di dalam Service Modal
          const modal = document.getElementById("serviceModal");
          const titleEl = document.getElementById("serviceModalTitle");
          const bodyEl = document.getElementById("serviceModalBody");
          if (modal && titleEl && bodyEl) {
            modal.classList.remove("hidden");
            titleEl.innerHTML = `<i class="fa-solid fa-clipboard-list text-rose-600 mr-1.5"></i> Catatan & Evaluasi Kegiatan`;
            bodyEl.innerHTML = "";
            originalCatatanCard.classList.remove("hidden");
            bodyEl.appendChild(originalCatatanCard);
          }
        }
        return;
      }

      if (code === "meja_pos") {
        if (originalMejaCard) {
          const modal = document.getElementById("serviceModal");
          const titleEl = document.getElementById("serviceModalTitle");
          const bodyEl = document.getElementById("serviceModalBody");
          if (modal && titleEl && bodyEl) {
            modal.classList.remove("hidden");
            titleEl.innerHTML = `<i class="fa-solid fa-qrcode text-violet-700 mr-1.5"></i> Meja Layanan & Otorisasi Pos`;
            bodyEl.innerHTML = "";
            originalMejaCard.classList.remove("hidden");
            bodyEl.appendChild(originalMejaCard);
          }
        }
        return;
      }
    });
  });
}

// Jalankan penataan ulang secara otomatis setiap kali tampilan dirender
setInterval(reorganizePanitiaWorkspaceCards, 450);
