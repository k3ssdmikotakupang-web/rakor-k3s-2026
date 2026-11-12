// js/profil.js
import { sb, toast } from './supabase.js';

let headerScrollBound = false;

// Sapaan otomatis mengikuti jam WITA (Kota Kupang)
function getWitaGreeting() {
  const hour = new Date().getHours();
  if (hour >= 4 && hour < 11) return { text: "Selamat Pagi", icon: "fa-sun text-amber-300" };
  if (hour >= 11 && hour < 15) return { text: "Selamat Siang", icon: "fa-cloud-sun text-amber-300" };
  if (hour >= 15 && hour < 19) return { text: "Selamat Sore", icon: "fa-cloud-sun text-orange-300" };
  return { text: "Selamat Malam", icon: "fa-moon text-indigo-200" };
}

export function bindUserProfileTrigger(activeUser, reloadCallback) {
  const avatarEl = document.getElementById("topUserAvatar");
  const nameEl = document.getElementById("topUserName");
  if (!avatarEl || !activeUser) return;

  const headerEl = avatarEl.closest("header");
  const p = activeUser.profile || {};
  const fotoUrl = p.foto_profil || "";
  const isPeserta = activeUser.role === "peserta";

  // 1. Poles Elemen Header menjadi Curved Super-App Android Header (Tanpa merusak ID bawaan)
  if (headerEl) {
    headerEl.className = "bg-gradient-to-br from-slate-950 via-blue-950 to-indigo-950 text-white px-4 pt-4 pb-5 sticky top-0 z-30 rounded-b-3xl shadow-xl border-b border-white/10 transition-all duration-200 flex items-center justify-between";
  }

  // 2. Tambahkan baris Sapaan Waktu WITA di atas Nama Pengguna jika belum ada
  if (nameEl && nameEl.parentElement) {
    const infoWrap = nameEl.parentElement;
    infoWrap.className = "min-w-0 cursor-pointer select-none";
    infoWrap.onclick = () => openUserProfileModal(activeUser, reloadCallback);

    let greetEl = document.getElementById("topAndroidGreeting");
    if (!greetEl) {
      greetEl = document.createElement("div");
      greetEl.id = "topAndroidGreeting";
      infoWrap.insertBefore(greetEl, infoWrap.firstChild);
    }
    const greet = getWitaGreeting();
    const subName = isPeserta && p.nama_kepsek ? ` • ${p.nama_kepsek.split(',')[0]}` : "";
    greetEl.className = "text-[10px] font-semibold text-blue-200/90 flex items-center gap-1 mb-0.5 truncate";
    greetEl.innerHTML = `<i class="fa-solid ${greet.icon} text-[10px]"></i> <span>${greet.text}${subName}</span>`;

    nameEl.className = "font-extrabold text-xs text-white truncate mt-0.5 tracking-tight";

    // Tambahkan pill kamar kecil di barisan badge jika login sebagai peserta
    const srBadge = document.getElementById("topUserSubrayonBadge");
    if (srBadge && srBadge.parentElement) {
      let roomMiniBadge = document.getElementById("topUserRoomMiniBadge");
      if (!roomMiniBadge) {
        roomMiniBadge = document.createElement("span");
        roomMiniBadge.id = "topUserRoomMiniBadge";
        srBadge.parentElement.appendChild(roomMiniBadge);
      }
      if (isPeserta && p.nomor_kamar && p.nomor_kamar !== "Belum Ditentukan") {
        roomMiniBadge.className = "text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-md bg-amber-400/20 text-amber-300 border border-amber-400/30";
        roomMiniBadge.innerHTML = `<i class="fa-solid fa-bed mr-0.5"></i>${p.nomor_kamar}`;
      } else {
        roomMiniBadge.className = "hidden";
      }
    }
  }

  // 3. Percantik Avatar Pojok Kiri Atas dengan Cincin Emas + Indikator Online Hijau
  avatarEl.className = "w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-400 to-yellow-300 text-slate-950 font-extrabold flex items-center justify-center text-sm shrink-0 shadow-lg border-2 border-amber-300/80 cursor-pointer hover:scale-105 active:scale-95 transition relative";
  avatarEl.title = "Ketuk untuk Edit Profil & Password";

  const initial = !isPeserta ? (p.nama_panitia || "P").charAt(0) : "K3S";
  avatarEl.innerHTML = `
    <div class="w-full h-full rounded-[14px] overflow-hidden flex items-center justify-center bg-gradient-to-br from-amber-400 to-amber-500">
      ${fotoUrl
        ? `<img src="${fotoUrl}" alt="Profil" class="w-full h-full object-cover" />`
        : `<span>${initial}</span>`
      }
    </div>
    <span class="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-400 border-2 border-slate-950 flex items-center justify-center" title="Online"></span>
  `;
  avatarEl.onclick = () => openUserProfileModal(activeUser, reloadCallback);

  // 4. Tambahkan Tombol Lonceng Notifikasi di Sebelah Kiri Tombol Refresh (Sudut Kanan Atas)
  const refreshBtn = document.getElementById("btnRefreshApp");
  const logoutBtn = document.getElementById("btnLogout");
  if (refreshBtn && refreshBtn.parentElement) {
    const actionWrap = refreshBtn.parentElement;
    actionWrap.className = "flex items-center gap-1.5 shrink-0";

    refreshBtn.className = "w-9 h-9 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/10 flex items-center justify-center text-xs text-slate-200 active:scale-95 transition";
    if (logoutBtn) {
      logoutBtn.className = "w-9 h-9 rounded-2xl bg-rose-500/20 hover:bg-rose-500/35 border border-rose-400/25 flex items-center justify-center text-xs text-rose-300 active:scale-95 transition";
    }

    let bellBtn = document.getElementById("btnHeaderNotifBell");
    if (!bellBtn) {
      bellBtn = document.createElement("button");
      bellBtn.id = "btnHeaderNotifBell";
      bellBtn.type = "button";
      bellBtn.title = "Pusat Info & Notifikasi";
      actionWrap.insertBefore(bellBtn, refreshBtn);
    }
    bellBtn.className = "w-9 h-9 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/10 flex items-center justify-center text-xs text-amber-300 relative active:scale-95 transition";
    bellBtn.innerHTML = `
      <i class="fa-solid fa-bell"></i>
      <span class="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500 animate-ping"></span>
      <span class="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500"></span>
    `;
    bellBtn.onclick = () => openNotificationQuickModal(activeUser, reloadCallback);
  }

  // 5. Efek Smart Compact Header saat layar di-scroll ke bawah
  if (!headerScrollBound && headerEl) {
    headerScrollBound = true;
    window.addEventListener("scroll", () => {
      const greetEl = document.getElementById("topAndroidGreeting");
      if (window.scrollY > 30) {
        headerEl.classList.remove("pt-4", "pb-5");
        headerEl.classList.add("py-2.5", "shadow-2xl");
        if (greetEl) greetEl.classList.add("hidden");
      } else {
        headerEl.classList.add("pt-4", "pb-5");
        headerEl.classList.remove("py-2.5", "shadow-2xl");
        if (greetEl) greetEl.classList.remove("hidden");
      }
    }, { passive: true });
  }
}

// Modal Ringkas saat Lonceng Notifikasi di Header Diklik
async function openNotificationQuickModal(activeUser, reloadCallback) {
  const modal = document.getElementById("serviceModal");
  const titleEl = document.getElementById("serviceModalTitle");
  const bodyEl = document.getElementById("serviceModalBody");
  if (!modal || !titleEl || !bodyEl) return;

  modal.classList.remove("hidden");
  titleEl.innerHTML = `<i class="fa-solid fa-bell text-amber-500 mr-1.5"></i> Pusat Notifikasi SIM-RAKOR`;

  const isPeserta = activeUser.role === "peserta";
  const p = activeUser.profile || {};

  const { data: liveSched } = await sb.from("jadwal_rakor").select("*").eq("status_aktif", true).maybeSingle();

  bodyEl.innerHTML = `
    <div class="space-y-2.5">
      ${liveSched ? `
        <div class="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-300 flex items-start gap-3">
          <div class="w-9 h-9 rounded-xl bg-red-600 text-white flex items-center justify-center shrink-0 animate-pulse">
            <i class="fa-solid fa-tower-broadcast"></i>
          </div>
          <div>
            <span class="text-[9px] font-extrabold uppercase bg-red-100 text-red-700 px-2 py-0.5 rounded">Sedang Berlangsung</span>
            <h4 class="font-extrabold text-xs text-slate-900 mt-1">${liveSched.judul_sesi}</h4>
            <p class="text-[11px] text-slate-600">Hari Ke-${liveSched.hari} (${liveSched.waktu}) • ${liveSched.pemateri_pic || 'Panitia'}</p>
          </div>
        </div>
      ` : ''}

      <div class="p-3.5 rounded-2xl bg-blue-50 border border-blue-200 flex items-start gap-3">
        <div class="w-9 h-9 rounded-xl bg-blue-900 text-amber-300 flex items-center justify-center shrink-0">
          <i class="fa-solid fa-calendar-day"></i>
        </div>
        <div>
          <span class="text-[9px] font-extrabold uppercase bg-blue-200 text-blue-900 px-2 py-0.5 rounded">Jadwal Resmi</span>
          <h4 class="font-extrabold text-xs text-slate-900 mt-1">Pelaksanaan Rakor: 19–21 November 2026</h4>
          <p class="text-[11px] text-slate-600">Pastikan kartu QR Code Anda siap untuk pemindaian registrasi, pengambilan Rakor Kit, dan presensi harian.</p>
        </div>
      </div>

      ${isPeserta ? `
        <div class="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 flex items-start gap-3">
          <div class="w-9 h-9 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center shrink-0">
            <i class="fa-solid fa-id-card"></i>
          </div>
          <div>
            <span class="text-[9px] font-extrabold uppercase bg-amber-200 text-amber-900 px-2 py-0.5 rounded">Status Sekolah Anda</span>
            <h4 class="font-extrabold text-xs text-slate-900 mt-1">${p.nama_sekolah}</h4>
            <p class="text-[11px] text-slate-700">
              Kamar: <b>${p.nomor_kamar || 'Belum Ditentukan'}</b> • Kontribusi: <b>${p.status_bayar || 'Belum Bayar'}</b>
            </p>
          </div>
        </div>
      ` : ''}

      <button id="btnGoProfileFromNotif" class="w-full py-3 rounded-2xl bg-slate-900 text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow">
        <i class="fa-solid fa-user-gear text-amber-300"></i>
        <span>Buka Pengaturan Profil & Password</span>
      </button>
    </div>
  `;

  document.getElementById("btnGoProfileFromNotif")?.addEventListener("click", () => {
    openUserProfileModal(activeUser, reloadCallback);
  });
}

// =========================================================================
// MODAL PENGATURAN PROFIL, UPLOAD FOTO PROFIL & UBAH PASSWORD / PIN
// =========================================================================
export function openUserProfileModal(activeUser, reloadCallback) {
  if (!activeUser || !activeUser.profile) return;

  const modal = document.getElementById("serviceModal");
  const titleEl = document.getElementById("serviceModalTitle");
  const bodyEl = document.getElementById("serviceModalBody");
  if (!modal || !titleEl || !bodyEl) return;

  modal.classList.remove("hidden");
  titleEl.innerHTML = `<i class="fa-solid fa-user-gear text-blue-700 mr-1.5"></i> Profil Pengguna & Keamanan Akun`;

  renderProfileModalBody(activeUser, bodyEl, reloadCallback);
}

function renderProfileModalBody(activeUser, bodyEl, reloadCallback) {
  const isPeserta = activeUser.role === "peserta";
  const p = activeUser.profile;
  const fotoUrl = p.foto_profil || "";

  const displayName = isPeserta ? (p.nama_kepsek || "") : (p.nama_panitia || "");
  const unitLabel = isPeserta
    ? `${p.nama_sekolah} (NPSN: ${p.npsn} • Rayon ${p.subrayon})`
    : `${p.divisi} (${p.jabatan})`;

  const hasCustomPass = isPeserta
    ? Boolean(p.password_custom && p.password_custom.trim() !== "")
    : Boolean(p.pin_custom && p.pin_custom.trim() !== "");

  bodyEl.innerHTML = `
    <div class="p-4 rounded-3xl bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 text-white text-center space-y-3 relative overflow-hidden shadow-md">
      <div class="relative w-24 h-24 mx-auto">
        ${fotoUrl ? `
          <img src="${fotoUrl}" alt="Foto Profil" class="w-24 h-24 rounded-3xl object-cover border-4 border-amber-400 shadow-lg mx-auto" />
        ` : `
          <div class="w-24 h-24 rounded-3xl bg-gradient-to-tr from-amber-400 to-yellow-300 text-slate-950 font-extrabold text-2xl flex items-center justify-center border-4 border-white/20 shadow-lg mx-auto">
            ${isPeserta ? 'K3S' : (p.nama_panitia || 'P').charAt(0)}
          </div>
        `}
        <label class="absolute -bottom-1 -right-1 w-9 h-9 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center justify-center shadow-lg cursor-pointer border-2 border-slate-900 transition" title="Ganti Foto Profil">
          <i class="fa-solid fa-camera text-sm"></i>
          <input id="inputProfilePhotoFile" type="file" accept="image/*" class="hidden" />
        </label>
      </div>

      <div>
        <span class="text-[9px] font-extrabold uppercase tracking-wider bg-amber-400 text-slate-950 px-2.5 py-0.5 rounded-full">
          ${isPeserta ? 'Profil Kepala Sekolah' : 'Profil Panitia Rakor'}
        </span>
        <h4 class="text-sm font-extrabold mt-1.5">${displayName || (isPeserta ? 'Nama Kepsek Belum Diisi' : p.nama_panitia)}</h4>
        <p class="text-[11px] text-blue-200 mt-0.5">${unitLabel}</p>
      </div>

      <div id="uploadPhotoStatusText" class="hidden text-[10px] font-bold text-amber-300">
        <i class="fa-solid fa-spinner animate-spin mr-1"></i> Mengunggah foto profil...
      </div>
    </div>

    <div class="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
      <div class="font-extrabold text-xs text-slate-900 uppercase flex items-center gap-1.5">
        <i class="fa-solid fa-id-card-clip text-blue-800"></i>
        <span>1. Biodata & Kontak Aktif</span>
      </div>

      <div>
        <label class="block text-[10px] font-bold text-slate-700 mb-1">
          ${isPeserta ? 'Nama Lengkap & Gelar Kepala Sekolah (Tercetak di E-Sertifikat):' : 'Nama Lengkap & Gelar Panitia:'}
        </label>
        <input id="profInputNama" type="text" value="${displayName}" placeholder="Contoh: Drs. Yohanes ..., S.Pd." class="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-900" />
      </div>

      ${isPeserta ? `
        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="block text-[10px] font-bold text-slate-700 mb-1">NIP Kepala Sekolah:</label>
            <input id="profInputNip" type="text" inputmode="numeric" value="${p.nip_kepsek || ''}" placeholder="19xxxxxxxxxxxxxx" class="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold" />
          </div>
          <div>
            <label class="block text-[10px] font-bold text-slate-700 mb-1">No. WhatsApp / HP:</label>
            <input id="profInputHp" type="tel" inputmode="tel" value="${p.no_hp || ''}" placeholder="08xxxxxxxxxx" class="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold" />
          </div>
        </div>
      ` : `
        <div>
          <label class="block text-[10px] font-bold text-slate-700 mb-1">No. WhatsApp / HP Aktif:</label>
          <input id="profInputHp" type="tel" inputmode="tel" value="${p.no_hp || ''}" placeholder="08xxxxxxxxxx" class="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold" />
        </div>
      `}

      <button id="btnSaveBiodataProfile" class="w-full py-2.5 rounded-xl bg-blue-900 hover:bg-blue-800 text-white font-extrabold text-xs shadow flex items-center justify-center gap-2">
        <i class="fa-solid fa-floppy-disk"></i>
        <span>Simpan Perubahan Biodata</span>
      </button>
    </div>

    <div class="p-4 rounded-2xl bg-amber-50/70 border border-amber-200 space-y-3">
      <div class="flex items-center justify-between">
        <div class="font-extrabold text-xs text-amber-950 uppercase flex items-center gap-1.5">
          <i class="fa-solid fa-key text-amber-600"></i>
          <span>2. Ubah ${isPeserta ? 'Password Login' : 'PIN Akses Panitia'}</span>
        </div>
        <span class="text-[9px] font-extrabold px-2 py-0.5 rounded ${hasCustomPass ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'}">
          ${hasCustomPass ? 'Password Kustom Aktif' : (isPeserta ? 'Default: NPSN' : 'Default: 2026')}
        </span>
      </div>

      <div class="grid grid-cols-2 gap-2">
        <div>
          <label class="block text-[10px] font-bold text-slate-700 mb-1">${isPeserta ? 'Password Baru:' : 'PIN Baru:'}</label>
          <input id="profInputNewPass" type="password" placeholder="Minimal 4 karakter" class="w-full rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs font-extrabold text-slate-900" />
        </div>
        <div>
          <label class="block text-[10px] font-bold text-slate-700 mb-1">Ulangi ${isPeserta ? 'Password:' : 'PIN:'}</label>
          <input id="profInputConfirmPass" type="password" placeholder="Ketik ulang" class="w-full rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs font-extrabold text-slate-900" />
        </div>
      </div>

      <div class="flex gap-2">
        <button id="btnUpdatePasswordNow" class="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold text-xs shadow">
          <i class="fa-solid fa-lock mr-1"></i> Simpan ${isPeserta ? 'Password Baru' : 'PIN Baru'}
        </button>
        ${hasCustomPass ? `
          <button id="btnResetDefaultPass" class="px-3 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-600 hover:text-rose-600 font-bold text-[11px]">
            Reset Default
          </button>
        ` : ''}
      </div>
    </div>
  `;

  document.getElementById("inputProfilePhotoFile")?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const statusEl = document.getElementById("uploadPhotoStatusText");
    statusEl?.classList.remove("hidden");

    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const ownerId = isPeserta ? p.id_sekolah : p.id_panitia;
    const fileName = `avatar_${ownerId}_${Date.now()}.${ext}`;

    const { error: upErr } = await sb.storage
      .from("dokumen_rakor")
      .upload(fileName, file, { upsert: true });

    if (upErr) {
      statusEl?.classList.add("hidden");
      return toast("Gagal mengunggah foto profil.");
    }

    const { data: pubData } = sb.storage.from("dokumen_rakor").getPublicUrl(fileName);
    const publicPhotoUrl = pubData?.publicUrl || "";

    const tableName = isPeserta ? "db_sekolah" : "panitia_rakor";
    const idCol = isPeserta ? "id_sekolah" : "id_panitia";

    const { error: dbErr } = await sb
      .from(tableName)
      .update({ foto_profil: publicPhotoUrl })
      .eq(idCol, ownerId);

    statusEl?.classList.add("hidden");
    if (dbErr) {
      return toast("Pastikan kolom foto_profil sudah ditambahkan di SQL Supabase!");
    }

    p.foto_profil = publicPhotoUrl;
    bindUserProfileTrigger(activeUser, reloadCallback);
    if (reloadCallback) await reloadCallback();
    toast("Foto profil berhasil diperbarui!");
    renderProfileModalBody(activeUser, bodyEl, reloadCallback);
  });

  document.getElementById("btnSaveBiodataProfile")?.addEventListener("click", async () => {
    const namaBaru = document.getElementById("profInputNama")?.value.trim() || "";
    const hpBaru = document.getElementById("profInputHp")?.value.trim() || "";

    if (isPeserta) {
      const nipBaru = document.getElementById("profInputNip")?.value.trim() || "";
      const { error } = await sb.from("db_sekolah").update({
        nama_kepsek: namaBaru,
        nip_kepsek: nipBaru,
        no_hp: hpBaru
      }).eq("id_sekolah", p.id_sekolah);

      if (error) return toast("Pastikan SQL kolom profil sudah dijalankan di Supabase!");
      p.nama_kepsek = namaBaru;
      p.nip_kepsek = nipBaru;
      p.no_hp = hpBaru;
    } else {
      if (!namaBaru) return toast("Nama panitia tidak boleh kosong!");
      const { error } = await sb.from("panitia_rakor").update({
        nama_panitia: namaBaru,
        no_hp: hpBaru
      }).eq("id_panitia", p.id_panitia);

      if (error) return toast("Pastikan SQL kolom profil sudah dijalankan di Supabase!");
      p.nama_panitia = namaBaru;
      p.no_hp = hpBaru;
      const topName = document.getElementById("topUserName");
      if (topName) topName.textContent = namaBaru;
    }

    bindUserProfileTrigger(activeUser, reloadCallback);
    if (reloadCallback) await reloadCallback();
    toast("Biodata profil berhasil disimpan!");
    renderProfileModalBody(activeUser, bodyEl, reloadCallback);
  });

  document.getElementById("btnUpdatePasswordNow")?.addEventListener("click", async () => {
    const pass1 = document.getElementById("profInputNewPass")?.value.trim() || "";
    const pass2 = document.getElementById("profInputConfirmPass")?.value.trim() || "";

    if (!pass1) return toast("Masukkan password/PIN baru terlebih dahulu!");
    if (pass1.length < 4) return toast("Password/PIN minimal 4 karakter!");
    if (pass1 !== pass2) return toast("Konfirmasi password/PIN tidak cocok!");

    if (isPeserta) {
      const { error } = await sb.from("db_sekolah")
        .update({ password_custom: pass1 })
        .eq("id_sekolah", p.id_sekolah);
      if (error) return toast("Pastikan SQL kolom password_custom sudah dijalankan di Supabase!");
      p.password_custom = pass1;
      toast("Password baru berhasil diaktifkan!");
    } else {
      const { error } = await sb.from("panitia_rakor")
        .update({ pin_custom: pass1 })
        .eq("id_panitia", p.id_panitia);
      if (error) return toast("Pastikan SQL kolom pin_custom sudah dijalankan di Supabase!");
      p.pin_custom = pass1;
      toast("PIN pribadi berhasil diaktifkan!");
    }

    if (reloadCallback) await reloadCallback();
    renderProfileModalBody(activeUser, bodyEl, reloadCallback);
  });

  document.getElementById("btnResetDefaultPass")?.addEventListener("click", async () => {
    if (!confirm("Kembalikan password/PIN ke pengaturan awal (NPSN / 2026)?")) return;
    if (isPeserta) {
      await sb.from("db_sekolah").update({ password_custom: "" }).eq("id_sekolah", p.id_sekolah);
      p.password_custom = "";
    } else {
      await sb.from("panitia_rakor").update({ pin_custom: "" }).eq("id_panitia", p.id_panitia);
      p.pin_custom = "";
    }
    if (reloadCallback) await reloadCallback();
    toast("Password/PIN dikembalikan ke default!");
    renderProfileModalBody(activeUser, bodyEl, reloadCallback);
  });
}
