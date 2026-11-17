// js/keuangan.js
// Mengelola data keuangan, validasi pembayaran, dan modal informasi kas K3S
import { sb, toast } from './supabase.js';

export const TARIF_KONTRIBUSI_DEFAULT = 2000000;
const SUBRAYON_LIST = ["Maulafa", "Alak", "Kota Raja", "Oebobo", "Kelapa Lima", "Kota Lama"];

export function formatRupiah(num) {
  return "Rp " + Number(num || 0).toLocaleString("id-ID");
}

export function canAccessInfoKeuangan(activeUser) {
  return Boolean(activeUser && activeUser.role === "panitia");
}

export function canEditPaymentAndParticipation(activeUser, targetSubrayon) {
  if (!activeUser || activeUser.role !== "panitia" || !activeUser.profile) return false;
  const p = activeUser.profile;
  // Bendahara, Ketua, Sekretaris, dan Penanggung Jawab punya akses penuh
  if (["Bendahara", "Ketua Panitia", "Sekretaris", "Penanggung Jawab"].includes(p.divisi)) return true;
  // Ketua Sub Rayon hanya berhak mengedit rayonnya sendiri
  if (p.tugas_subrayon && String(p.tugas_subrayon).trim() === String(targetSubrayon).trim()) return true;
  return false;
}

export function renderInfoKeuanganWidget(activeUser, sekolahList, panitiaList, tarif, reloadCallback) {
  // Fungsi dipanggil oleh app.js untuk merender widget mini (jika ada di beranda)
}

export function openInfoKeuanganModal(activeUser, sekolahList, panitiaList, tarif, reloadCallback) {
  const modal = document.getElementById("serviceModal");
  const titleEl = document.getElementById("serviceModalTitle");
  const bodyEl = document.getElementById("serviceModalBody");
  if (!modal || !titleEl || !bodyEl) return;

  modal.classList.remove("hidden");
  titleEl.innerHTML = `<i class="fa-solid fa-sack-dollar text-emerald-700 mr-1.5"></i> Informasi Keuangan & Kontribusi`;

  const targetSekolah = (sekolahList || []).filter(s => s.status_ikut !== "Tidak Ikut");
  const totalSekolah = targetSekolah.length || 158;
  const lunasList = targetSekolah.filter(s => s.status_bayar === "Lunas");
  const prosesList = targetSekolah.filter(s => s.status_bayar === "Dalam Proses");
  const belumList = targetSekolah.filter(s => !s.status_bayar || s.status_bayar === "Belum Bayar");
  
  const totalKasMasuk = lunasList.length * TARIF_KONTRIBUSI_DEFAULT;
  const potensiKas = (totalSekolah - lunasList.length) * TARIF_KONTRIBUSI_DEFAULT;

  let html = `
    <div class="p-4 rounded-3xl bg-gradient-to-br from-slate-900 via-emerald-950 to-slate-900 text-white space-y-3 shadow-lg border border-emerald-400/40">
      <div class="flex items-center justify-between">
        <span class="text-[9px] font-extrabold uppercase bg-amber-400 text-slate-950 px-2.5 py-0.5 rounded-full">
          Rekapitulasi Kas Kontribusi BOSP
        </span>
        <span class="text-xs font-extrabold text-emerald-300">${lunasList.length}/${totalSekolah} Lunas</span>
      </div>
      <div>
        <h4 class="text-sm font-extrabold text-white">Total Kas Masuk: ${formatRupiah(totalKasMasuk)}</h4>
        <p class="text-[10px] text-emerald-200 mt-0.5">Kontribusi peserta Rakor K3S 2026 sebesar Rp 2.000.000 per satuan pendidikan.</p>
      </div>
      <div class="grid grid-cols-3 gap-2 text-center pt-1 border-t border-white/10">
        <div class="bg-emerald-500/20 rounded-2xl p-2 border border-emerald-400/30">
          <div class="text-sm font-extrabold text-emerald-300">${lunasList.length}</div>
          <div class="text-[9px] text-emerald-100 uppercase">Lunas</div>
        </div>
        <div class="bg-amber-500/20 rounded-2xl p-2 border border-amber-400/30">
          <div class="text-sm font-extrabold text-amber-300">${prosesList.length}</div>
          <div class="text-[9px] text-amber-100 uppercase">Proses</div>
        </div>
        <div class="bg-rose-500/20 rounded-2xl p-2 border border-rose-400/30">
          <div class="text-sm font-extrabold text-rose-300">${belumList.length}</div>
          <div class="text-[9px] text-rose-100 uppercase">Belum Bayar</div>
        </div>
      </div>
    </div>
    
    <div class="space-y-2 mt-3">
      <h5 class="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider px-1">Rincian Kas Per Sub Rayon</h5>
  `;

  SUBRAYON_LIST.forEach(sr => {
    const srSchools = targetSekolah.filter(s => s.subrayon === sr);
    const srLunas = srSchools.filter(s => s.status_bayar === "Lunas").length;
    const srProses = srSchools.filter(s => s.status_bayar === "Dalam Proses").length;
    const srBelum = srSchools.length - srLunas - srProses;
    
    html += `
      <div class="p-3 rounded-2xl bg-slate-50 border border-slate-200 shadow-2xs space-y-1.5">
        <div class="flex items-center justify-between border-b border-slate-200/70 pb-1.5">
          <span class="font-extrabold text-xs text-slate-800">Sub Rayon ${sr}</span>
          <span class="text-[11px] font-bold text-emerald-700">${formatRupiah(srLunas * TARIF_KONTRIBUSI_DEFAULT)}</span>
        </div>
        <div class="flex gap-2 text-[10px] font-extrabold">
          <span class="px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-800">Lunas: ${srLunas}</span>
          <span class="px-2 py-0.5 rounded-lg bg-amber-100 text-amber-800">Proses: ${srProses}</span>
          <span class="px-2 py-0.5 rounded-lg bg-rose-100 text-rose-800">Belum: ${srBelum}</span>
        </div>
      </div>
    `;
  });

  html += `</div>`;
  bodyEl.innerHTML = html;
}
