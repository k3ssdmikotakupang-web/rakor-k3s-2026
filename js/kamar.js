// js/kamar.js
import { sb, toast } from './supabase.js';

let roomsCache = [];
let activeSubtab = 'penempatan'; // 'penempatan' | 'master'

// Cek hak akses: Ketua Panitia (FULL) atau Ketua Sub Rayon (WILAYAHNYA SAJA)
export function getRoomAccessRole(activeUser) {
  if (!activeUser || activeUser.role !== 'panitia') {
    return { canManageMaster: false, canAssign: false, allowedSubrayon: null, label: 'Peserta' };
  }
  const p = activeUser.profile;
  const isKetuaPanitia = p.divisi === 'Ketua Panitia' || p.jabatan === 'Ketua Panitia';
  const subrayon = p.tugas_subrayon || null;

  if (isKetuaPanitia) {
    return { canManageMaster: true, canAssign: true, allowedSubrayon: 'ALL', label: 'Ketua Panitia (Akses Penuh)' };
  }
  if (subrayon) {
    return { canManageMaster: false, canAssign: true, allowedSubrayon: subrayon, label: `Ketua Sub Rayon ${subrayon}` };
  }
  return { canManageMaster: false, canAssign: false, allowedSubrayon: null, label: 'Anggota Panitia (Mode Lihat)' };
}

export async function openRoomManagerModal(activeUser, sekolahList, reloadCallback) {
  const modal = document.getElementById("serviceModal");
  const titleEl = document.getElementById("serviceModalTitle");
  const bodyEl = document.getElementById("serviceModalBody");
  if (!modal || !titleEl || !bodyEl) return;

  modal.classList.remove("hidden");
  titleEl.innerHTML = `<i class="fa-solid fa-bed text-indigo-600 mr-1.5"></i> Manajemen & Informasi Kamar Hotel`;
  bodyEl.innerHTML = `<div class="py-6 text-center text-xs text-slate-400">Memuat data kamar...</div>`;

  const { data: roomData } = await sb.from("kamar_hotel").select("*").order("nomor_kamar", { ascending: true });
  roomsCache = roomData || [];

  // JIKA YANG LOGIN ADALAH PESERTA (KEPALA SEKOLAH)
  if (!activeUser || activeUser.role === 'peserta') {
    renderPesertaRoomView(activeUser, sekolahList, bodyEl);
    return;
  }

  // JIKA YANG LOGIN ADALAH PANITIA
  renderPanitiaRoomView(activeUser, sekolahList, bodyEl, reloadCallback);
}

// =========================================================================
// TAMPILAN KHUSUS PESERTA (LIHAT KAMAR & TEMAN SEKAMAR)
// =========================================================================
function renderPesertaRoomView(activeUser, sekolahList, bodyEl) {
  const s = sekolahList.find(x => x.id_sekolah === activeUser?.profile?.id_sekolah) || activeUser?.profile;
  if (!s) return;

  const myRoomNo = s.nomor_kamar && s.nomor_kamar !== 'Belum Ditentukan' ? s.nomor_kamar : null;
  const roomObj = roomsCache.find(r => r.nomor_kamar === myRoomNo);
  const occupants = myRoomNo
    ? sekolahList.filter(x => x.nomor_kamar === myRoomNo)
    : [];

  bodyEl.innerHTML = `
    <div class="p-4 rounded-2xl bg-gradient-to-br from-indigo-900 to-blue-900 text-white text-center space-y-1.5 shadow">
      <span class="text-[10px] font-extrabold uppercase tracking-wider bg-white/15 px-2.5 py-0.5 rounded-full">
        ${roomObj ? `Kapasitas ${roomObj.kapasitas} Orang` : 'Status Kamar'}
      </span>
      <div class="text-2xl font-extrabold text-amber-300 mt-1">${myRoomNo || 'Belum Ditentukan'}</div>
      <div class="text-xs font-semibold text-blue-100">${s.nama_sekolah}</div>
      ${roomObj?.catatan ? `<div class="text-[10px] text-blue-200">${roomObj.catatan}</div>` : ''}
    </div>

    <div class="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
      <div class="flex items-center justify-between">
        <span class="font-extrabold text-xs text-slate-800">Daftar Penghuni Kamar Ini:</span>
        <span class="text-[10px] font-bold bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-md">
          ${occupants.length} / ${roomObj ? roomObj.kapasitas : '-'} Orang
        </span>
      </div>
      ${occupants.length > 0 ? `
        <div class="space-y-1.5 pt-1">
          ${occupants.map((occ, idx) => `
            <div class="p-2.5 rounded-xl bg-white border border-slate-200 flex items-center justify-between">
              <div>
                <div class="font-extrabold text-xs text-slate-900">${idx + 1}. ${occ.nama_sekolah}</div>
                <div class="text-[10px] text-slate-500">${occ.nama_kepsek || 'Kepala Sekolah'} • Rayon ${occ.subrayon}</div>
              </div>
              ${occ.id_sekolah === s.id_sekolah ? `<span class="text-[9px] font-extrabold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">Anda</span>` : ''}
            </div>
          `).join('')}
        </div>
      ` : `
        <p class="text-[11px] text-slate-500">Nomor kamar Anda sedang diatur oleh Ketua Panitia / Ketua Sub Rayon ${s.subrayon}.</p>
      `}
    </div>
  `;
}

// =========================================================================
// TAMPILAN KHUSUS PANITIA (KETUA PANITIA & 6 KETUA SUB RAYON)
// =========================================================================
function renderPanitiaRoomView(activeUser, sekolahList, bodyEl, reloadCallback) {
  const access = getRoomAccessRole(activeUser);

  // Hitung okupansi setiap kamar secara real-time (Anti-Double)
  const occupancyMap = {};
  roomsCache.forEach(r => { occupancyMap[r.nomor_kamar] = []; });
  sekolahList.forEach(s => {
    if (s.nomor_kamar && s.nomor_kamar !== 'Belum Ditentukan') {
      if (!occupancyMap[s.nomor_kamar]) occupancyMap[s.nomor_kamar] = [];
      occupancyMap[s.nomor_kamar].push(s);
    }
  });

  const totalBeds = roomsCache.reduce((acc, r) => acc + Number(r.kapasitas || 0), 0);
  const usedBeds = sekolahList.filter(s => s.nomor_kamar && s.nomor_kamar !== 'Belum Ditentukan').length;

  bodyEl.innerHTML = `
    <!-- Info Hak Akses & Ringkasan Kuota Bed -->
    <div class="p-3 rounded-2xl bg-indigo-50 border border-indigo-200 flex items-center justify-between">
      <div>
        <div class="text-[10px] font-bold uppercase text-indigo-600">Hak Akses Pembagian Kamar</div>
        <div class="text-xs font-extrabold text-indigo-950">${access.label}</div>
      </div>
      <div class="text-right">
        <div class="text-xs font-extrabold text-indigo-900">${usedBeds} / ${totalBeds} Bed</div>
        <div class="text-[10px] text-indigo-600">${roomsCache.length} Kamar Aktif</div>
      </div>
    </div>

    <!-- Sub-Tab: 1. Penempatan Peserta vs 2. Master Kamar -->
    <div class="grid grid-cols-2 gap-1.5 bg-slate-100 p-1 rounded-2xl">
      <button id="tabRoomAssign" class="py-2 rounded-xl text-xs font-extrabold ${activeSubtab === 'penempatan' ? 'bg-blue-900 text-white shadow' : 'text-slate-600'}">
        <i class="fa-solid fa-user-plus mr-1"></i> Penempatan Sekolah
      </button>
      <button id="tabRoomMaster" class="py-2 rounded-xl text-xs font-extrabold ${activeSubtab === 'master' ? 'bg-blue-900 text-white shadow' : 'text-slate-600'}">
        <i class="fa-solid fa-door-open mr-1"></i> Daftar Kamar (${roomsCache.length})
      </button>
    </div>

    <!-- KONTEN SUB-TAB -->
    <div id="roomSubtabContent" class="space-y-3 pt-1"></div>
  `;

  document.getElementById("tabRoomAssign")?.addEventListener("click", () => {
    activeSubtab = 'penempatan';
    renderPanitiaRoomView(activeUser, sekolahList, bodyEl, reloadCallback);
  });

  document.getElementById("tabRoomMaster")?.addEventListener("click", () => {
    activeSubtab = 'master';
    renderPanitiaRoomView(activeUser, sekolahList, bodyEl, reloadCallback);
  });

  const subContent = document.getElementById("roomSubtabContent");
  if (activeSubtab === 'penempatan') {
    renderSubtabPenempatan(access, sekolahList, occupancyMap, subContent, activeUser, bodyEl, reloadCallback);
  } else {
    renderSubtabMasterKamar(access, occupancyMap, subContent, activeUser, sekolahList, bodyEl, reloadCallback);
  }
}

// SUB-TAB 1: PENEMPATAN SEKOLAH KE KAMAR (DENGAN KUNCI KUOTA OTOMATIS)
function renderSubtabPenempatan(access, sekolahList, occupancyMap, container, activeUser, bodyEl, reloadCallback) {
  const defaultRayon = access.allowedSubrayon && access.allowedSubrayon !== 'ALL' ? access.allowedSubrayon : 'Maulafa';

  container.innerHTML = `
    <div class="grid grid-cols-2 gap-2">
      <select id="roomFilterSubrayon" ${access.allowedSubrayon !== 'ALL' ? 'disabled' : ''} class="w-full rounded-xl border border-slate-300 bg-slate-50 px-2.5 py-2 text-xs font-extrabold text-blue-950 disabled:opacity-75">
        <option value="Maulafa" ${defaultRayon === 'Maulafa' ? 'selected' : ''}>Rayon Maulafa (34)</option>
        <option value="Alak" ${defaultRayon === 'Alak' ? 'selected' : ''}>Rayon Alak (31)</option>
        <option value="Kota Raja" ${defaultRayon === 'Kota Raja' ? 'selected' : ''}>Rayon Kota Raja (29)</option>
        <option value="Oebobo" ${defaultRayon === 'Oebobo' ? 'selected' : ''}>Rayon Oebobo (27)</option>
        <option value="Kelapa Lima" ${defaultRayon === 'Kelapa Lima' ? 'selected' : ''}>Rayon Kelapa Lima (19)</option>
        <option value="Kota Lama" ${defaultRayon === 'Kota Lama' ? 'selected' : ''}>Rayon Kota Lama (18)</option>
      </select>
      <input id="roomSearchSchool" type="text" placeholder="Cari sekolah..." class="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-semibold" />
    </div>

    ${!access.canAssign ? `
      <div class="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900">
        Hanya <b>Ketua Panitia</b> dan <b>6 Ketua Sub Rayon</b> yang dapat mengubah penempatan kamar.
      </div>
    ` : ''}

    <div id="schoolRoomAssignList" class="space-y-2 max-h-72 overflow-y-auto pr-0.5"></div>
  `;

  const renderList = () => {
    const sr = document.getElementById("roomFilterSubrayon")?.value || defaultRayon;
    const kw = (document.getElementById("roomSearchSchool")?.value || "").toLowerCase().trim();
    const listBox = document.getElementById("schoolRoomAssignList");
    if (!listBox) return;

    const filteredSchools = sekolahList.filter(
      s => s.subrayon === sr && (s.nama_sekolah.toLowerCase().includes(kw) || String(s.npsn).includes(kw))
    );

    listBox.innerHTML = "";
    filteredSchools.forEach((s, idx) => {
      const currentRoom = s.nomor_kamar && s.nomor_kamar !== 'Belum Ditentukan' ? s.nomor_kamar : '';

      // Buat daftar opsi kamar: hanya tampilkan kamar yang BELUM PENUH atau kamar milik sekolah ini sendiri
      let optionsHtml = `<option value="Belum Ditentukan">-- Belum Ada Kamar --</option>`;
      roomsCache.forEach(r => {
        const occCount = (occupancyMap[r.nomor_kamar] || []).length;
        const cap = Number(r.kapasitas || 2);
        const isMyCurrentRoom = r.nomor_kamar === currentRoom;
        const isFull = occCount >= cap && !isMyCurrentRoom;

        if (isFull) {
          optionsHtml += `<option value="${r.nomor_kamar}" disabled>🔒 ${r.nomor_kamar} — PENUH (${occCount}/${cap})</option>`;
        } else {
          optionsHtml += `<option value="${r.nomor_kamar}" ${isMyCurrentRoom ? 'selected' : ''}>${r.nomor_kamar} (${occCount}/${cap} Org)</option>`;
        }
      });

      const row = document.createElement("div");
      row.className = `p-2.5 rounded-xl border ${currentRoom ? 'bg-indigo-50/40 border-indigo-200' : 'bg-white border-slate-200'} flex items-center justify-between gap-2`;
      row.innerHTML = `
        <div class="min-w-0 flex-1">
          <div class="font-extrabold text-xs text-slate-900 truncate">${idx + 1}. ${s.nama_sekolah}</div>
          <div class="text-[10px] text-slate-500">Status: <b>${s.status_ikut}</b> ${currentRoom ? `• <span class="text-indigo-700 font-bold">${currentRoom}</span>` : ''}</div>
        </div>
        ${access.canAssign ? `
          <select class="select-assign-room w-36 rounded-xl border border-slate-300 bg-white px-2 py-1.5 text-[11px] font-bold text-slate-800 shrink-0">
            ${optionsHtml}
          </select>
        ` : `
          <span class="text-[11px] font-extrabold px-2.5 py-1 rounded-lg ${currentRoom ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-100 text-slate-500'}">
            ${currentRoom || 'Belum Ada'}
          </span>
        `}
      `;

      if (access.canAssign) {
        row.querySelector(".select-assign-room")?.addEventListener("change", async (e) => {
          const targetRoom = e.target.value;

          // Validasi ganda di database sebelum simpan agar 100% bebas bentrok
          if (targetRoom !== "Belum Ditentukan") {
            const roomMeta = roomsCache.find(r => r.nomor_kamar === targetRoom);
            const { data: latestOccupants } = await sb
              .from("db_sekolah")
              .select("id_sekolah, nama_sekolah")
              .eq("nomor_kamar", targetRoom);

            const otherOccupants = (latestOccupants || []).filter(x => x.id_sekolah !== s.id_sekolah);
            if (roomMeta && otherOccupants.length >= Number(roomMeta.kapasitas)) {
              toast(`Gagal! ${targetRoom} sudah penuh (${roomMeta.kapasitas} orang).`);
              if (reloadCallback) await reloadCallback();
              openRoomManagerModal(activeUser, sekolahList, reloadCallback);
              return;
            }
          }

          await sb.from("db_sekolah").update({ nomor_kamar: targetRoom }).eq("id_sekolah", s.id_sekolah);
          toast(`${s.nama_sekolah} -> ${targetRoom}`);
          if (reloadCallback) await reloadCallback();
          // Perbarui tampilan lokal
          s.nomor_kamar = targetRoom;
          renderPanitiaRoomView(activeUser, sekolahList, bodyEl, reloadCallback);
        });
      }

      listBox.appendChild(row);
    });
  };

  document.getElementById("roomFilterSubrayon")?.addEventListener("change", renderList);
  document.getElementById("roomSearchSchool")?.addEventListener("input", renderList);
  renderList();
}

// SUB-TAB 2: MASTER KAMAR HOTEL (TAMBAH KAMAR KAPASITAS 2, 3, 4 ORANG - KHUSUS KETUA PANITIA)
function renderSubtabMasterKamar(access, occupancyMap, container, activeUser, sekolahList, bodyEl, reloadCallback) {
  container.innerHTML = `
    ${access.canManageMaster ? `
      <div class="p-3 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
        <div class="font-extrabold text-xs text-slate-800">+ Tambah / Update Kamar Hotel (Ketua Panitia)</div>
        <div class="grid grid-cols-3 gap-1.5">
          <input id="newRoomNumber" type="text" placeholder="No. (Mis: Kamar 105)" class="col-span-2 rounded-xl border bg-white px-2.5 py-2 text-xs font-bold" />
          <select id="newRoomCap" class="rounded-xl border bg-white px-2 py-2 text-xs font-extrabold text-indigo-900">
            <option value="2">2 Orang</option>
            <option value="3">3 Orang</option>
            <option value="4">4 Orang</option>
          </select>
        </div>
        <div class="flex gap-1.5">
          <input id="newRoomNote" type="text" placeholder="Keterangan (Mis: Lantai 2 - Twin Bed)" class="flex-1 rounded-xl border bg-white px-2.5 py-2 text-xs" />
          <button id="btnAddMasterRoom" class="bg-blue-900 text-white font-extrabold px-3.5 py-2 rounded-xl text-xs shrink-0">
            Simpan
          </button>
        </div>
      </div>
    ` : `
      <div class="p-2.5 rounded-xl bg-blue-50 border border-blue-200 text-[11px] text-blue-900">
        Penambahan nomor kamar & kapasitas (2/3/4 orang) dikelola oleh <b>Ketua Panitia</b>.
      </div>
    `}

    <div id="masterRoomCards" class="space-y-2 max-h-72 overflow-y-auto pr-0.5"></div>
  `;

  document.getElementById("btnAddMasterRoom")?.addEventListener("click", async () => {
    const nomor_kamar = document.getElementById("newRoomNumber").value.trim();
    const kapasitas = Number(document.getElementById("newRoomCap").value || 2);
    const catatan = document.getElementById("newRoomNote").value.trim();

    if (!nomor_kamar) return toast("Masukkan Nomor/Nama Kamar!");

    const { error } = await sb.from("kamar_hotel").upsert([{ nomor_kamar, kapasitas, catatan }]);
    if (error) return toast("Pastikan tabel kamar_hotel sudah di-Run di SQL Supabase!");

    toast(`${nomor_kamar} (Kapasitas ${kapasitas} Orang) disimpan!`);
    openRoomManagerModal(activeUser, sekolahList, reloadCallback);
  });

  const box = document.getElementById("masterRoomCards");
  if (!box) return;
  box.innerHTML = "";

  roomsCache.forEach(r => {
    const occList = occupancyMap[r.nomor_kamar] || [];
    const cap = Number(r.kapasitas || 2);
    const isFull = occList.length >= cap;

    const card = document.createElement("div");
    card.className = `p-3 rounded-2xl border ${isFull ? 'bg-emerald-50/40 border-emerald-300' : 'bg-white border-slate-200'} space-y-1.5`;
    card.innerHTML = `
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="font-extrabold text-xs text-slate-900">${r.nomor_kamar}</span>
          <span class="text-[10px] font-bold px-2 py-0.5 rounded-md ${isFull ? 'bg-rose-100 text-rose-800' : 'bg-indigo-100 text-indigo-800'}">
            Terisi ${occList.length} / ${cap} Org ${isFull ? '(PENUH)' : ''}
          </span>
        </div>
        ${access.canManageMaster ? `
          <button class="btn-del-room text-rose-500 hover:text-rose-700 text-xs px-1.5" title="Hapus Kamar">
            <i class="fa-solid fa-trash"></i>
          </button>
        ` : ''}
      </div>
      ${r.catatan ? `<div class="text-[10px] text-slate-500">${r.catatan}</div>` : ''}
      ${occList.length > 0 ? `
        <div class="pt-1 border-t border-slate-100 space-y-1">
          ${occList.map(o => `
            <div class="flex items-center justify-between text-[11px] bg-slate-50 px-2 py-1 rounded-lg">
              <span class="font-semibold text-slate-700 truncate">${o.nama_sekolah} <span class="text-[10px] text-slate-400">(${o.subrayon})</span></span>
              ${(access.canManageMaster || access.allowedSubrayon === o.subrayon) ? `
                <button class="btn-kick-occ text-[10px] font-bold text-rose-600 hover:underline ml-2 shrink-0" data-id="${o.id_sekolah}">Keluarkan</button>
              ` : ''}
            </div>
          `).join('')}
        </div>
      ` : `<div class="text-[10px] text-slate-400 italic">Kamar masih kosong (tersedia ${cap} bed)</div>`}
    `;

    card.querySelector(".btn-del-room")?.addEventListener("click", async () => {
      if (occList.length > 0) return toast("Kosongkan penghuni kamar ini terlebih dahulu sebelum menghapus!");
      if (!confirm(`Hapus ${r.nomor_kamar}?`)) return;
      await sb.from("kamar_hotel").delete().eq("nomor_kamar", r.nomor_kamar);
      toast("Kamar dihapus.");
      openRoomManagerModal(activeUser, sekolahList, reloadCallback);
    });

    card.querySelectorAll(".btn-kick-occ").forEach(btn => {
      btn.addEventListener("click", async () => {
        const idSek = btn.dataset.id;
        await sb.from("db_sekolah").update({ nomor_kamar: "Belum Ditentukan" }).eq("id_sekolah", idSek);
        toast("Peserta dikeluarkan dari kamar.");
        const target = sekolahList.find(x => x.id_sekolah === idSek);
        if (target) target.nomor_kamar = "Belum Ditentukan";
        if (reloadCallback) await reloadCallback();
        renderPanitiaRoomView(activeUser, sekolahList, bodyEl, reloadCallback);
      });
    });

    box.appendChild(card);
  });
}
