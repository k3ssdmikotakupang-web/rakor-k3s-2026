// js/kamar.js
// Daftar Kamar seluruh sekolah HANYA dapat dilihat oleh Panitia Inti (Penanggung Jawab, Ketua Panitia, Sekretaris, dan Bendahara).
// Peserta hanya melihat informasi kamar miliknya sendiri.
import { sb, toast } from './supabase.js';

const SUBRAYON_LIST = ["Maulafa", "Alak", "Kota Raja", "Oebobo", "Kelapa Lima", "Kota Lama"];
let selectedRoomRayon = "ALL";
let selectedRoomStatus = "ALL";

// Cek apakah pengguna adalah Panitia Inti (Penanggung Jawab, Ketua Panitia, Sekretaris, Bendahara)
export function canViewAllRoomsList(activeUser) {
  return Boolean(
    activeUser &&
    activeUser.role === "panitia" &&
    activeUser.profile &&
    ["Penanggung Jawab", "Ketua Panitia", "Sekretaris", "Bendahara"].includes(activeUser.profile.divisi)
  );
}

// Hak edit nomor kamar (Sekretaris & Panitia Inti)
export function canEditRoomAssignment(activeUser) {
  return canViewAllRoomsList(activeUser);
}

export function openRoomManagerModal(activeUser, sekolahList, reloadCallback) {
  const modal = document.getElementById("serviceModal");
  const titleEl = document.getElementById("serviceModalTitle");
  const bodyEl = document.getElementById("serviceModalBody");
  if (!modal || !titleEl || !bodyEl) return;

  modal.classList.remove("hidden");
  titleEl.innerHTML = `<i class="fa-solid fa-bed text-violet-700 mr-1.5"></i> Informasi Kamar Penginapan Rakor`;

  // 1. JIKA LOGIN PESERTA -> TAMPILKAN HANYA KAMAR MILIK SEKOLAHNYA SENDIRI
  if (activeUser && activeUser.role === "peserta") {
    renderPersonalParticipantRoomCard(activeUser, sekolahList, bodyEl);
    return;
  }

  // 2. JIKA LOGIN PANITIA BIASA (BUKAN PANITIA INTI) -> KUNCI DAFTAR KAMAR
  if (!canViewAllRoomsList(activeUser)) {
    renderRestrictedPanitiaRoomNotice(activeUser, sekolahList, bodyEl);
    return;
  }

  // 3. JIKA LOGIN PANITIA INTI (PJ, KETUA, SEKRETARIS, BENDAHARA) -> TAMPILKAN DAFTAR KAMAR LENGKAP
  renderCoreCommitteeRoomManager(activeUser, sekolahList, bodyEl, reloadCallback);
}

function renderPersonalParticipantRoomCard(activeUser, sekolahList, bodyEl) {
  const s = sekolahList.find(x => x.id_sekolah === activeUser.profile?.id_sekolah) || activeUser.profile || {};
  const hasRoom = Boolean(s.nomor_kamar && s.nomor_kamar !== "Belum Ditentukan");

  // Cari teman sekamar (jika ada nomor kamar yang sama)
  const roommates = hasRoom
    ? sekolahList.filter(x => x.nomor_kamar === s.nomor_kamar && x.id_sekolah !== s.id_sekolah)
    : [];

  bodyEl.innerHTML = `
    <div class="p-5 rounded-3xl bg-gradient-to-br from-slate-900 via-violet-950 to-slate-900 text-white text-center space-y-3 shadow-lg border border-violet-400/30">
      <div class="w-14 h-14 rounded-2xl bg-amber-400 text-slate-950 flex items-center justify-center text-2xl font-extrabold mx-auto shadow">
        <i class="fa-solid fa-key"></i>
      </div>
      <div>
        <span class="text-[9px] font-extrabold uppercase tracking-wider bg-white/15 text-amber-300 px-2.5 py-0.5 rounded-full">
          Kamar Hotel Peserta • Sub Rayon ${s.subrayon || '-'}
        </span>
        <h4 class="text-sm font-extrabold mt-1.5">${s.nama_sekolah}</h4>
        <p class="text-[11px] text-violet-200">${s.nama_kepsek || 'Kepala Sekolah'}</p>
      </div>

      <div class="p-3.5 rounded-2xl bg-white/10 border border-white/15">
        <div class="text-[10px] uppercase tracking-wider text-violet-200 font-bold">Nomor Kamar Anda</div>
        <div class="text-2xl font-extrabold ${hasRoom ? 'text-amber-300' : 'text-slate-300'} mt-0.5">
          ${s.nomor_kamar || 'Belum Ditentukan'}
        </div>
      </div>

      ${roommates.length > 0 ? `
        <div class="p-3 rounded-2xl bg-emerald-500/20 border border-emerald-400/30 text-left space-y-1">
          <div class="text-[10px] font-extrabold uppercase text-emerald-300">
            <i class="fa-solid fa-user-group mr-1"></i> Rekan Sekamar Anda:
          </div>
          ${roommates.map(r => `
            <div class="text-xs font-bold text-white">${r.nama_kepsek || 'Kepala Sekolah'} <span class="text-[10px] font-normal text-emerald-200">(${r.nama_sekolah})</span></div>
          `).join('')}
        </div>
      ` : ''}
    </div>

    <div class="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600 text-center font-semibold">
      <i class="fa-solid fa-shield-halved text-violet-700 mr-1"></i>
      Demi privasi peserta, daftar seluruh kamar hotel hanya dapat diakses oleh <b>Panitia Inti (Penanggung Jawab, Ketua, Sekretaris, dan Bendahara)</b>.
    </div>
  `;
}

function renderRestrictedPanitiaRoomNotice(activeUser, sekolahList, bodyEl) {
  const totalSek = sekolahList.length || 160;
  const sudahKamar = sekolahList.filter(s => s.nomor_kamar && s.nomor_kamar !== "Belum Ditentukan").length;

  bodyEl.innerHTML = `
    <div class="p-5 rounded-3xl bg-slate-900 text-white text-center space-y-3 border border-violet-500/30 shadow">
      <div class="w-12 h-12 rounded-2xl bg-rose-500/20 border border-rose-400/40 text-rose-300 flex items-center justify-center text-xl mx-auto">
        <i class="fa-solid fa-user-lock"></i>
      </div>
      <div>
        <span class="text-[9px] font-extrabold uppercase bg-amber-400 text-slate-950 px-2.5 py-0.5 rounded-full">
          Akses Terbatas Panitia Inti
        </span>
        <h4 class="text-sm font-extrabold mt-1.5">Daftar Kamar Dikecualikan</h4>
        <p class="text-[11px] text-slate-300 leading-relaxed mt-1">
          Sesuai kebijakan kepanitiaan, rincian daftar kamar seluruh peserta hanya dapat dilihat dan dikelola oleh <b>Pananggung Jawab, Ketua Panitia, Sekretaris, dan Bendahara</b>.
        </p>
      </div>
      <div class="p-2.5 rounded-xl bg-white/10 text-[11px] font-bold text-amber-300">
        Progres Penempatan Kamar Saat Ini: ${sudahKamar} / ${totalSek} Sekolah
      </div>
    </div>
  `;
}

function renderCoreCommitteeRoomManager(activeUser, sekolahList, bodyEl, reloadCallback) {
  const totalSek = sekolahList.length || 160;
  const sudahCount = sekolahList.filter(s => s.nomor_kamar && s.nomor_kamar !== "Belum Ditentukan").length;
  const belumCount = totalSek - sudahCount;
  const pct = totalSek > 0 ? Math.round((sudahCount / totalSek) * 100) : 0;

  bodyEl.innerHTML = `
    <div class="p-4 rounded-3xl bg-gradient-to-br from-slate-900 via-violet-950 to-slate-900 text-white space-y-2.5 shadow-lg border border-violet-400/30">
      <div class="flex items-center justify-between">
        <span class="text-[9px] font-extrabold uppercase bg-amber-400 text-slate-950 px-2.5 py-0.5 rounded-full">
          Otoritas Panitia Inti (${activeUser.profile?.divisi})
        </span>
        <span class="text-xs font-extrabold text-emerald-300">${pct}% Terisi</span>
      </div>

      <div class="grid grid-cols-3 gap-2 text-center pt-1">
        <div class="bg-white/10 rounded-2xl p-2 border border-white/10">
          <div class="text-sm font-extrabold text-white">${totalSek}</div>
          <div class="text-[9px] text-violet-200">Total Sekolah</div>
        </div>
        <div class="bg-emerald-500/20 rounded-2xl p-2 border border-emerald-400/30">
          <div class="text-sm font-extrabold text-emerald-300">${sudahCount}</div>
          <div class="text-[9px] text-emerald-100">Sudah Ada Kamar</div>
        </div>
        <div class="bg-rose-500/20 rounded-2xl p-2 border border-rose-400/30">
          <div class="text-sm font-extrabold text-rose-300">${belumCount}</div>
          <div class="text-[9px] text-rose-100">Belum Ditentukan</div>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-2 gap-2">
      <select id="roomFilterRayon" class="rounded-xl border border-slate-300 bg-slate-50 px-2.5 py-2 text-xs font-extrabold text-violet-950">
        <option value="ALL" ${selectedRoomRayon === 'ALL' ? 'selected' : ''}>Semua Sub Rayon (${totalSek})</option>
        ${SUBRAYON_LIST.map(sr => `<option value="${sr}" ${selectedRoomRayon === sr ? 'selected' : ''}>Sub Rayon ${sr}</option>`).join('')}
      </select>

      <select id="roomFilterStatus" class="rounded-xl border border-slate-300 bg-slate-50 px-2.5 py-2 text-xs font-bold text-slate-800">
        <option value="ALL" ${selectedRoomStatus === 'ALL' ? 'selected' : ''}>Semua Status Kamar</option>
        <option value="SUDAH" ${selectedRoomStatus === 'SUDAH' ? 'selected' : ''}>✓ Sudah Ada Kamar</option>
        <option value="BELUM" ${selectedRoomStatus === 'BELUM' ? 'selected' : ''}>⏳ Belum Ada Kamar</option>
      </select>
    </div>

    <input id="roomSearchKeyword" type="text" placeholder="Cari nomor kamar, nama sekolah, atau Kepsek..." class="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-semibold" />

    <div id="roomSchoolListBox" class="space-y-2 max-h-80 overflow-y-auto pr-0.5"></div>
  `;

  const renderRows = () => {
    const box = document.getElementById("roomSchoolListBox");
    if (!box) return;
    const kw = (document.getElementById("roomSearchKeyword")?.value || "").toLowerCase().trim();

    let list = sekolahList;
    if (selectedRoomRayon !== "ALL") {
      list = list.filter(s => s.subrayon === selectedRoomRayon);
    }
    if (selectedRoomStatus === "SUDAH") {
      list = list.filter(s => s.nomor_kamar && s.nomor_kamar !== "Belum Ditentukan");
    } else if (selectedRoomStatus === "BELUM") {
      list = list.filter(s => !s.nomor_kamar || s.nomor_kamar === "Belum Ditentukan");
    }
    if (kw) {
      list = list.filter(s =>
        (s.nama_sekolah || "").toLowerCase().includes(kw) ||
        (s.nama_kepsek || "").toLowerCase().includes(kw) ||
        (s.nomor_kamar || "").toLowerCase().includes(kw) ||
        String(s.npsn || "").includes(kw)
      );
    }

    if (list.length === 0) {
      box.innerHTML = `<div class="p-5 text-center text-xs text-slate-400 bg-slate-50 rounded-2xl border">Tidak ada sekolah pada filter ini.</div>`;
      return;
    }

    box.innerHTML = "";
    list.slice(0, 200).forEach((s, idx) => {
      const currentRoom = (s.nomor_kamar && s.nomor_kamar !== "Belum Ditentukan") ? s.nomor_kamar : "";
      const row = document.createElement("div");
      row.className = `p-3 rounded-2xl bg-white border ${currentRoom ? 'border-violet-300' : 'border-slate-200'} flex items-center justify-between gap-2 shadow-2xs`;
      row.innerHTML = `
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-1.5">
            <span class="text-[9px] font-extrabold text-slate-400">#${idx + 1}</span>
            <span class="text-[9px] font-bold bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">Rayon ${s.subrayon}</span>
            <span class="text-[9px] font-extrabold ${s.status_bayar === 'Lunas' ? 'text-emerald-700' : 'text-amber-700'}">${s.status_bayar || 'Belum Bayar'}</span>
          </div>
          <h4 class="font-extrabold text-xs text-slate-900 truncate mt-0.5">${s.nama_sekolah}</h4>
          <p class="text-[10px] text-slate-500 truncate">Kepsek: <b>${s.nama_kepsek || '-'}</b></p>
        </div>
        <div class="flex items-center gap-1 shrink-0">
          <input type="text" value="${currentRoom}" placeholder="No. Kamar" class="inp-room-num w-24 rounded-xl border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-xs font-extrabold text-violet-950 text-center" />
          <button type="button" class="btn-save-room px-2.5 py-1.5 rounded-xl bg-violet-700 hover:bg-violet-800 text-amber-300 font-extrabold text-xs shadow">
            <i class="fa-solid fa-check"></i>
          </button>
        </div>
      `;

      row.querySelector(".btn-save-room")?.addEventListener("click", async () => {
        const val = row.querySelector(".inp-room-num")?.value.trim() || "Belum Ditentukan";
        await sb.from("db_sekolah").update({ nomor_kamar: val }).eq("id_sekolah", s.id_sekolah);
        s.nomor_kamar = val;
        toast(`Kamar ${s.nama_sekolah}: ${val}`);
        if (reloadCallback) await reloadCallback();
        renderCoreCommitteeRoomManager(activeUser, sekolahList, bodyEl, reloadCallback);
      });

      box.appendChild(row);
    });
  };

  renderRows();
  document.getElementById("roomFilterRayon")?.addEventListener("change", (e) => {
    selectedRoomRayon = e.target.value;
    renderRows();
  });
  document.getElementById("roomFilterStatus")?.addEventListener("change", (e) => {
    selectedRoomStatus = e.target.value;
    renderRows();
  });
  document.getElementById("roomSearchKeyword")?.addEventListener("input", renderRows);
}
