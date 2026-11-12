// js/profil.js
import { sb, toast } from './supabase.js';

export function bindUserProfileTrigger(activeUser, reloadCallback) {
  const avatarEl = document.getElementById("topUserAvatar");
  const nameEl = document.getElementById("topUserName");
  if (!avatarEl || !activeUser) return;

  const p = activeUser.profile || {};
  const fotoUrl = p.foto_profil || "";

  // Jadikan area avatar & nama di pojok kiri atas dapat diklik
  avatarEl.classList.add("cursor-pointer", "hover:scale-105", "active:scale-95", "transition", "overflow-hidden", "border-2", "border-amber-300");
  avatarEl.title = "Klik untuk Edit Profil & Ubah Password";

  if (nameEl && nameEl.parentElement) {
    nameEl.parentElement.classList.add("cursor-pointer");
    nameEl.parentElement.onclick = () => openUserProfileModal(activeUser, reloadCallback);
  }

  // Tampilkan foto profil jika sudah diupload, atau tampilkan inisial + ikon kamera kecil
  if (fotoUrl) {
    avatarEl.innerHTML = `<img src="${fotoUrl}" alt="Profil" class="w-full h-full object-cover" />`;
  } else {
    const initial = activeUser.role === "panitia"
      ? (p.nama_panitia || "P").charAt(0)
      : "K3S";
    avatarEl.innerHTML = `
      <div class="relative w-full h-full flex items-center justify-center">
        <span>${initial}</span>
      </div>
    `;
  }

  avatarEl.onclick = () => openUserProfileModal(activeUser, reloadCallback);
}

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

  const displayName = isPeserta
    ? (p.nama_kepsek || "")
    : (p.nama_panitia || "");

  const unitLabel = isPeserta
    ? `${p.nama_sekolah} (NPSN: ${p.npsn} • Rayon ${p.subrayon})`
    : `${p.divisi} (${p.jabatan})`;

  const hasCustomPass = isPeserta
    ? Boolean(p.password_custom && p.password_custom.trim() !== "")
    : Boolean(p.pin_custom && p.pin_custom.trim() !== "");

  bodyEl.innerHTML = `
    <!-- KARTU HEADER FOTO PROFIL -->
    <div class="p-4 rounded-3xl bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 text-white text-center space-y-3 relative overflow-hidden shadow-md">
      <div class="relative w-24 h-24 mx-auto">
        ${fotoUrl ? `
          <img id="previewProfileImg" src="${fotoUrl}" alt="Foto Profil" class="w-24 h-24 rounded-3xl object-cover border-4 border-amber-400 shadow-lg mx-auto" />
        ` : `
          <div id="previewProfilePlaceholder" class="w-24 h-24 rounded-3xl bg-gradient-to-tr from-amber-400 to-yellow-300 text-slate-950 font-extrabold text-2xl flex items-center justify-center border-4 border-white/20 shadow-lg mx-auto">
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

    <!-- BAGIAN 1: FORM DATA DIRI -->
    <div class="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
      <div class="font-extrabold text-xs text-slate-900 uppercase flex items-center gap-1.5">
        <i class="fa-solid fa-id-card-clip text-blue-800"></i>
        <span>1. Biodata & Kontak Aktif</span>
      </div>

      <div>
        <label class="block text-[10px] font-bold text-slate-700 mb-1">
          ${isPeserta ? 'Nama Lengkap & Gelar Kepala Sekolah (Tercetak di E-Sertifikat):' : 'Nama Lengkap & Gelar Panitia:'}
        </label>
        <input id="profInputNama" type="text" value="${displayName}" placeholder="Contoh: Drs. Yohanes ..., S.Pd., M.M." class="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-900" />
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

    <!-- BAGIAN 2: UBAH PASSWORD / PIN LOGIN -->
    <div class="p-4 rounded-2xl bg-amber-50/70 border border-amber-200 space-y-3">
      <div class="flex items-center justify-between">
        <div class="font-extrabold text-xs text-amber-950 uppercase flex items-center gap-1.5">
          <i class="fa-solid fa-key text-amber-600"></i>
          <span>2. Ubah ${isPeserta ? 'Password Login' : 'PIN Akses Panitia'}</span>
        </div>
        <span class="text-[9px] font-extrabold px-2 py-0.5 rounded ${hasCustomPass ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'}">
          ${hasCustomPass ? '✓ Password Kustom Aktif' : (isPeserta ? 'Default: NPSN' : 'Default: 2026')}
        </span>
      </div>

      <p class="text-[10px] text-amber-900 leading-relaxed">
        ${isPeserta
          ? `Password bawaan sekolah Anda adalah NPSN (<b>${p.npsn}</b>). Anda dapat menggantinya dengan password pribadi di bawah ini.`
          : `PIN bawaan panitia adalah <b>2026</b>. Anda dapat menggantinya dengan PIN pribadi khusus untuk nama Anda.`}
      </p>

      <div class="grid grid-cols-2 gap-2">
        <div>
          <label class="block text-[10px] font-bold text-slate-700 mb-1">${isPeserta ? 'Password Baru:' : 'PIN Baru:'}</label>
          <input id="profInputNewPass" type="password" placeholder="${isPeserta ? 'Ketik password baru' : 'PIN baru'}" class="w-full rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs font-extrabold text-slate-900" />
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
          <button id="btnResetDefaultPass" class="px-3 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-600 hover:text-rose-600 font-bold text-[11px]" title="Kembalikan ke Default">
            Reset Default
          </button>
        ` : ''}
      </div>
    </div>
  `;

  // Handler Upload Foto Profil Langsung saat File Dipilih
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
      return toast("Pastikan SQL Langkah 1 (kolom foto_profil) sudah dijalankan di Supabase!");
    }

    p.foto_profil = publicPhotoUrl;
    bindUserProfileTrigger(activeUser, reloadCallback);
    if (reloadCallback) await reloadCallback();
    toast("Foto profil berhasil diperbarui!");
    renderProfileModalBody(activeUser, bodyEl, reloadCallback);
  });

  // Handler Simpan Biodata (Nama, NIP, No WA)
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

      if (error) return toast("Pastikan SQL Langkah 1 sudah dijalankan di Supabase!");
      p.nama_kepsek = namaBaru;
      p.nip_kepsek = nipBaru;
      p.no_hp = hpBaru;
    } else {
      if (!namaBaru) return toast("Nama panitia tidak boleh kosong!");
      const { error } = await sb.from("panitia_rakor").update({
        nama_panitia: namaBaru,
        no_hp: hpBaru
      }).eq("id_panitia", p.id_panitia);

      if (error) return toast("Pastikan SQL Langkah 1 sudah dijalankan di Supabase!");
      p.nama_panitia = namaBaru;
      p.no_hp = hpBaru;
      const topName = document.getElementById("topUserName");
      if (topName) topName.textContent = namaBaru;
    }

    if (reloadCallback) await reloadCallback();
    toast("Biodata profil berhasil disimpan!");
    renderProfileModalBody(activeUser, bodyEl, reloadCallback);
  });

  // Handler Ubah Password / PIN
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
      if (error) return toast("Pastikan SQL Langkah 1 sudah dijalankan di Supabase!");
      p.password_custom = pass1;
      toast("Password baru berhasil diaktifkan!");
    } else {
      const { error } = await sb.from("panitia_rakor")
        .update({ pin_custom: pass1 })
        .eq("id_panitia", p.id_panitia);
      if (error) return toast("Pastikan SQL Langkah 1 sudah dijalankan di Supabase!");
      p.pin_custom = pass1;
      toast("PIN pribadi berhasil diaktifkan!");
    }

    if (reloadCallback) await reloadCallback();
    renderProfileModalBody(activeUser, bodyEl, reloadCallback);
  });

  // Handler Reset ke Password Default (NPSN / 2026)
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
