// js/keuangan.js
import { sb, toast } from './supabase.js';

export const TARIF_KONTRIBUSI_DEFAULT = 2000000;
const SUBRAYON_ORDER = ["Maulafa", "Alak", "Kota Raja", "Oebobo", "Kelapa Lima", "Kota Lama"];

let selectedDetailRayon = "ALL";
let selectedStatusFilter = "ALL";

export function formatRupiah(angka) {
  return "Rp " + Number(angka || 0).toLocaleString("id-ID");
}

export function canAccessInfoKeuangan(activeUser) {
  if (!activeUser || activeUser.role !== "panitia" || !activeUser.profile) return false;
  const p = activeUser.profile;
  const allowedCoreRoles = ["Penanggung Jawab", "Ketua Panitia", "Sekretaris", "Bendahara"];
  if (allowedCoreRoles.includes(p.divisi)) return true;
  if (p.tugas_subrayon && p.tugas_subrayon.trim() !== "") return true;
  return false;
}

export function canEditPaymentAndParticipation(activeUser, targetSubrayon) {
  if (!activeUser || activeUser.role !== "panitia" || !activeUser.profile) return false;
  const p = activeUser.profile;
  if (p.divisi === "Bendahara") return true;
  if (p.tugas_subrayon && p.tugas_subrayon === targetSubrayon) return true;
  return false;
}

export function renderInfoKeuanganWidget(activeUser, sekolahList, panitiaList, tarifAktif, reloadCallback) {
  const existingBtn = document.getElementById("btnServiceInfoKeuangan");

  if (!canAccessInfoKeuangan(activeUser)) {
    if (existingBtn) existingBtn.remove();
    return;
  }

  const firstServiceBtn = document.querySelector(".service-menu-btn");
  const gridContainer = firstServiceBtn ? firstServiceBtn.parentElement : null;
  if (!gridContainer) return;

  const totalSekolah = sekolahList.length || 160;
  const nominalPerSekolah = Number(tarifAktif || TARIF_KONTRIBUSI_DEFAULT);
  const totalLunas = sekolahList.filter(s => s.status_bayar === "Lunas").length;
  const totalKasMasuk = totalLunas * nominalPerSekolah;

  if (!existingBtn) {
    const btn = document.createElement("button");
    btn.id = "btnServiceInfoKeuangan";
    btn.type = "button";
    btn.className = "col-span-3 p-3.5 rounded-2xl bg-gradient-to-r from-emerald-900 via-teal-900 to-slate-900 text-white border border-emerald-500/40 flex items-center justify-between px-4 active:scale-[0.99] transition shadow-md";
    gridContainer.insertBefore(btn, firstServiceBtn);
  }

  const targetBtn = document.getElementById("btnServiceInfoKeuangan");
  if (targetBtn) {
    targetBtn.innerHTML = `
      <div class="flex items-center gap-3 text-left">
        <div class="w-11 h-11 rounded-2xl bg-amber-400 text-slate-950 flex items-center justify-center text-lg font-extrabold shadow shrink-0">
          <i class="fa-solid fa-sack-dollar"></i>
        </div>
        <div>
          <div class="flex items-center gap-1.5">
            <span class="text-xs font-extrabold text-white">Info Keuangan & Kontribusi</span>
            <span class="text-[9px] font-extrabold uppercase bg-emerald-400/20 text-emerald-300 border border-emerald-400/30 px-1.5 py-0.5 rounded">Akses Khusus</span>
          </div>
          <div class="text-[11px] font-extrabold text-amber-300 mt-0.5">
            Terkumpul: ${formatRupiah(totalKasMasuk)} <span class="text-[10px] font-normal text-emerald-200">(${totalLunas}/${totalSekolah} Lunas)</span>
          </div>
        </div>
      </div>
      <div class="text-[10px] font-extrabold bg-white/10 hover:bg-white/20 text-white px-2.5 py-1.5 rounded-xl shrink-0">
        Detail
      </div>
    `;
    targetBtn.onclick = () => openInfoKeuanganModal(activeUser, sekolahList, panitiaList, nominalPerSekolah, reloadCallback);
  }
}

export function openInfoKeuanganModal(activeUser, sekolahList, panitiaList, nominalPerSekolah = TARIF_KONTRIBUSI_DEFAULT, reloadCallback) {
  if (!canAccessInfoKeuangan(activeUser)) {
    return toast("Akses Ditolak: Menu Info Keuangan hanya untuk Pimpinan Inti, Bendahara & Ketua Sub Rayon!");
  }

  const modal = document.getElementById("serviceModal");
  const titleEl = document.getElementById("serviceModalTitle");
  const bodyEl = document.getElementById("serviceModalBody");
  if (!modal || !titleEl || !bodyEl) return;

  modal.classList.remove("hidden");
  titleEl.innerHTML = `<i class="fa-solid fa-sack-dollar text-emerald-600 mr-1.5"></i> Info Keuangan & Kontribusi Rakor`;

  if (activeUser.profile?.tugas_subrayon && selectedDetailRayon === "ALL") {
    selectedDetailRayon = activeUser.profile.tugas_subrayon;
  }

  renderKeuanganModalBody(activeUser, sekolahList, panitiaList, nominalPerSekolah, bodyEl, reloadCallback);
}

function renderKeuanganModalBody(activeUser, sekolahList, panitiaList, tarif, bodyEl, reloadCallback) {
  const totalSekolah = sekolahList.length || 160;
  const totalIkut = sekolahList.filter(s => s.status_ikut === "Ikut").length;
  const totalLunas = sekolahList.filter(s => s.status_bayar === "Lunas").length;
  const totalProses = sekolahList.filter(s => s.status_bayar === "Dalam Proses").length;
  const totalBelum = totalSekolah - totalLunas - totalProses;

  const kasTerkumpul = totalLunas * tarif;
  const potensiProses = totalProses * tarif;
  const targetPenuh = totalSekolah * tarif;
  const targetPesertaIkut = totalIkut * tarif;
  const pctTerkumpul = totalSekolah > 0 ? Math.round((totalLunas / totalSekolah) * 100) : 0;

  bodyEl.innerHTML = `
    <div class="p-4 rounded-3xl bg-gradient-to-br from-slate-900 via-emerald-950 to-slate-900 text-white shadow-lg space-y-3 border border-emerald-500/30">
      <div class="flex items-center justify-between">
        <span class="text-[9px] font-extrabold uppercase tracking-wider bg-amber-400 text-slate-950 px-2.5 py-0.5 rounded-full">
          Kontribusi: ${formatRupiah(tarif)} / Sekolah
        </span>
        <span class="text-[10px] font-bold text-emerald-300">${pctTerkumpul}% Lunas</span>
      </div>

      <div>
        <div class="text-[10px] uppercase tracking-wider text-slate-300 font-bold">Total Dana Terkumpul di Bendahara (Lunas)</div>
        <div class="text-2xl font-extrabold text-amber-300 mt-0.5">${formatRupiah(kasTerkumpul)}</div>
        <div class="text-[10px] text-emerald-200 mt-0.5">
          Target ${totalSekolah} Sekolah: <b>${formatRupiah(targetPenuh)}</b> | Target Ikut (${totalIkut}): <b>${formatRupiah(targetPesertaIkut)}</b>
        </div>
      </div>

      <div class="w-full bg-white/15 h-2.5 rounded-full overflow-hidden">
        <div class="bg-gradient-to-r from-amber-400 to-emerald-400 h-full rounded-full transition-all duration-300" style="width:${pctTerkumpul}%"></div>
      </div>

      <div class="grid grid-cols-3 gap-2 pt-1 text-center">
        <div class="bg-emerald-500/20 border border-emerald-400/30 rounded-2xl p-2">
          <div class="text-xs font-extrabold text-emerald-300">${totalLunas} Sekolah</div>
          <div class="text-[9px] text-emerald-100">Lunas</div>
          <div class="text-[9px] font-bold text-white mt-0.5">${formatRupiah(kasTerkumpul)}</div>
        </div>
        <div class="bg-amber-500/20 border border-amber-400/30 rounded-2xl p-2">
          <div class="text-xs font-extrabold text-amber-300">${totalProses} Sekolah</div>
          <div class="text-[9px] text-amber-100">Dalam Proses</div>
          <div class="text-[9px] font-bold text-white mt-0.5">${formatRupiah(potensiProses)}</div>
        </div>
        <div class="bg-rose-500/20 border border-rose-400/30 rounded-2xl p-2">
          <div class="text-xs font-extrabold text-rose-300">${totalBelum} Sekolah</div>
          <div class="text-[9px] text-rose-100">Belum Bayar</div>
          <div class="text-[9px] font-bold text-white mt-0.5">${formatRupiah(totalBelum * tarif)}</div>
        </div>
      </div>
    </div>

    <div class="space-y-2">
      <div class="flex items-center justify-between">
        <h4 class="font-extrabold text-xs text-slate-900 uppercase">
          <i class="fa-solid fa-chart-pie text-blue-800 mr-1"></i> Detail Keuangan Per Sub Rayon
        </h4>
        <span class="text-[10px] text-slate-400 font-semibold">Klik rayon untuk filter</span>
      </div>

      <div class="space-y-2">
        ${SUBRAYON_ORDER.map(sr => {
          const srSchools = sekolahList.filter(s => s.subrayon === sr);
          const srIkut = srSchools.filter(s => s.status_ikut === "Ikut").length;
          const srLunas = srSchools.filter(s => s.status_bayar === "Lunas").length;
          const srProses = srSchools.filter(s => s.status_bayar === "Dalam Proses").length;
          const srBelum = srSchools.length - srLunas - srProses;

          const srNominalLunas = srLunas * tarif;
          const srTargetMax = srSchools.length * tarif;
          const srPct = srSchools.length > 0 ? Math.round((srLunas / srSchools.length) * 100) : 0;
          const ketua = panitiaList.find(p => p.tugas_subrayon === sr);
          const isSelected = selectedDetailRayon === sr;

          return `
            <div data-sr="${sr}" class="sr-finance-card p-3 rounded-2xl border transition cursor-pointer ${
              isSelected ? 'bg-blue-50/70 border-blue-600 ring-2 ring-blue-500/20' : 'bg-slate-50 border-slate-200 hover:bg-white'
            }">
              <div class="flex items-start justify-between gap-2">
                <div>
                  <div class="font-extrabold text-xs text-slate-900 flex items-center gap-1.5">
                    <span>Sub Rayon ${sr}</span>
                    <span class="text-[10px] font-bold bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded">${srSchools.length} SD/MI</span>
                  </div>
                  <div class="text-[10px] text-slate-500 mt-0.5">
                    Ketua: <b>${ketua ? ketua.nama_panitia : '-'}</b> | Ikut: <b>${srIkut}</b>
                  </div>
                </div>
                <div class="text-right shrink-0">
                  <div class="text-xs font-extrabold text-emerald-700">${formatRupiah(srNominalLunas)}</div>
                  <div class="text-[9px] text-slate-400">Target: ${formatRupiah(srTargetMax)}</div>
                </div>
              </div>

              <div class="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden my-2">
                <div class="bg-emerald-500 h-full rounded-full" style="width:${srPct}%"></div>
              </div>

              <div class="flex items-center justify-between text-[10px] font-bold">
                <span class="text-emerald-700">Lunas: ${srLunas}</span>
                <span class="text-amber-700">Proses: ${srProses}</span>
                <span class="text-rose-600">Belum: ${srBelum}</span>
                <span class="text-blue-800 font-extrabold">${srPct}%</span>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>

    <div class="pt-2 border-t border-slate-200 space-y-2.5">
      <div class="flex items-center justify-between">
        <span class="font-extrabold text-xs text-slate-900 uppercase">Rincian Status Kontribusi Sekolah</span>
      </div>

      <div class="grid grid-cols-2 gap-2">
        <select id="keuFilterRayon" class="rounded-xl border border-slate-300 bg-slate-50 px-2.5 py-2 text-xs font-extrabold text-blue-950">
          <option value="ALL" ${selectedDetailRayon === 'ALL' ? 'selected' : ''}>Semua Sub Rayon (${totalSekolah})</option>
          ${SUBRAYON_ORDER.map(sr => `<option value="${sr}" ${selectedDetailRayon === sr ? 'selected' : ''}>Sub Rayon ${sr}</option>`).join('')}
        </select>

        <select id="keuFilterStatus" class="rounded-xl border border-slate-300 bg-slate-50 px-2.5 py-2 text-xs font-bold text-slate-800">
          <option value="ALL" ${selectedStatusFilter === 'ALL' ? 'selected' : ''}>Semua Status Bayar</option>
          <option value="Lunas" ${selectedStatusFilter === 'Lunas' ? 'selected' : ''}>Sudah Lunas</option>
          <option value="Dalam Proses" ${selectedStatusFilter === 'Dalam Proses' ? 'selected' : ''}>Dalam Proses</option>
          <option value="Belum Bayar" ${selectedStatusFilter === 'Belum Bayar' ? 'selected' : ''}>Belum Bayar</option>
        </select>
      </div>

      <input id="keuSearchSchool" type="text" placeholder="Cari nama sekolah atau NPSN..." class="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-semibold" />
      <div id="keuSchoolListBox" class="space-y-1.5 max-h-64 overflow-y-auto pr-0.5"></div>
    </div>
  `;

  document.querySelectorAll(".sr-finance-card").forEach(card => {
    card.addEventListener("click", () => {
      const clickedSr = card.dataset.sr;
      selectedDetailRayon = selectedDetailRayon === clickedSr ? "ALL" : clickedSr;
      renderKeuanganModalBody(activeUser, sekolahList, panitiaList, tarif, bodyEl, reloadCallback);
    });
  });

  document.getElementById("keuFilterRayon")?.addEventListener("change", (e) => {
    selectedDetailRayon = e.target.value;
    renderKeuanganModalBody(activeUser, sekolahList, panitiaList, tarif, bodyEl, reloadCallback);
  });

  document.getElementById("keuFilterStatus")?.addEventListener("change", (e) => {
    selectedStatusFilter = e.target.value;
    renderFilteredSchoolFinanceRows(activeUser, sekolahList, tarif, bodyEl, reloadCallback);
  });

  document.getElementById("keuSearchSchool")?.addEventListener("input", () => {
    renderFilteredSchoolFinanceRows(activeUser, sekolahList, tarif, bodyEl, reloadCallback);
  });

  renderFilteredSchoolFinanceRows(activeUser, sekolahList, tarif, bodyEl, reloadCallback);
}

function renderFilteredSchoolFinanceRows(activeUser, sekolahList, tarif, bodyEl, reloadCallback) {
  const box = document.getElementById("keuSchoolListBox");
  if (!box) return;

  const kw = (document.getElementById("keuSearchSchool")?.value || "").toLowerCase().trim();

  let list = sekolahList;
  if (selectedDetailRayon !== "ALL") {
    list = list.filter(s => s.subrayon === selectedDetailRayon);
  }
  if (selectedStatusFilter !== "ALL") {
    list = list.filter(s => (s.status_bayar || "Belum Bayar") === selectedStatusFilter);
  }
  if (kw) {
    list = list.filter(s => s.nama_sekolah.toLowerCase().includes(kw) || String(s.npsn).includes(kw));
  }

  if (list.length === 0) {
    box.innerHTML = `<div class="p-4 text-center text-xs text-slate-400 bg-slate-50 rounded-xl border">Tidak ada sekolah pada filter ini.</div>`;
    return;
  }

  box.innerHTML = "";
  list.slice(0, 165).forEach((s, idx) => {
    const statusBayar = s.status_bayar || "Belum Bayar";
    const canEdit = canEditPaymentAndParticipation(activeUser, s.subrayon);

    const badgeClass = statusBayar === "Lunas"
      ? "bg-emerald-100 text-emerald-800 border-emerald-300"
      : statusBayar === "Dalam Proses"
      ? "bg-amber-100 text-amber-800 border-amber-300"
      : "bg-rose-50 text-rose-700 border-rose-200";

    const row = document.createElement("div");
    row.className = "p-2.5 rounded-xl bg-white border border-slate-200 flex items-center justify-between gap-2";
    row.innerHTML = `
      <div class="min-w-0 flex-1">
        <div class="font-extrabold text-xs text-slate-900 truncate">${idx + 1}. ${s.nama_sekolah}</div>
        <div class="text-[10px] text-slate-500">
          Rayon ${s.subrayon} | Status: <b>${s.status_ikut}</b>
          ${statusBayar === 'Lunas' ? ' | <span class="text-emerald-700 font-bold">' + formatRupiah(tarif) + '</span>' : ''}
        </div>
      </div>
      ${canEdit ? `
        <select class="keu-row-select rounded-xl border border-slate-300 bg-slate-50 px-2 py-1.5 text-[11px] font-extrabold text-slate-800 shrink-0">
          <option value="Belum Bayar" ${statusBayar === 'Belum Bayar' ? 'selected' : ''}>Belum Bayar</option>
          <option value="Dalam Proses" ${statusBayar === 'Dalam Proses' ? 'selected' : ''}>Dalam Proses</option>
          <option value="Lunas" ${statusBayar === 'Lunas' ? 'selected' : ''}>Lunas (2 Jt)</option>
        </select>
      ` : `
        <span class="text-[10px] font-extrabold px-2.5 py-1 rounded-lg border shrink-0 ${badgeClass}">
          ${statusBayar}
        </span>
      `}
    `;

    if (canEdit) {
      row.querySelector(".keu-row-select")?.addEventListener("change", async (e) => {
        const nextStatus = e.target.value;
        const petugas = activeUser.profile?.nama_panitia || "Bendahara/Rayon";
        const waktu = new Date().toLocaleString("id-ID");

        const payload = {
          status_bayar: nextStatus,
          nominal_kontribusi: nextStatus === "Lunas" ? tarif : 0,
          waktu_bayar: waktu,
          petugas_bayar: petugas
        };
        if (nextStatus === "Lunas" || nextStatus === "Dalam Proses") {
          payload.status_ikut = "Ikut";
        }

        await sb.from("db_sekolah").update(payload).eq("id_sekolah", s.id_sekolah);
        s.status_bayar = nextStatus;
        s.nominal_kontribusi = payload.nominal_kontribusi;
        if (payload.status_ikut) s.status_ikut = payload.status_ikut;

        toast(`${s.nama_sekolah}: ${nextStatus}`);
        if (reloadCallback) await reloadCallback();
        renderKeuanganModalBody(activeUser, sekolahList, panitiaList, tarif, bodyEl, reloadCallback);
      });
    }

    box.appendChild(row);
  });
}
