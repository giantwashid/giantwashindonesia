// Dipakai halaman Tugas Hari Ini (/tugas/) dan Pantau Tugas (/pantau/).
// Tabel maint_tasks = daftar tugas rutin per outlet (PIC, interval, batas berikutnya).
// Tabel maint_done = riwayat tugas selesai (foto wajib, catatan, terlambat atau tidak).
const HARI = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const parseD = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const isoD = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const plusDays = (s, n) => { const d = parseD(s); d.setDate(d.getDate() + n); return isoD(d); };
const diffDays = (a, b) => Math.round((parseD(b) - parseD(a)) / 864e5); // b dikurangi a
const tgl = (s) => { if (!s) return '-'; const d = parseD(s); return `${d.getDate()} ${BULAN[d.getMonth()]}`; };
const jam = (ts) => { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const taskLabel = (t) => t.machine ? `${t.name} – ${t.machine}` : t.name;

// Batas berikutnya setelah dikerjakan: tanggal selesai + interval, atau hari terjadwal berikutnya (mis. Senin & Jumat).
function nextDue(t, doneDate) {
  if (t.weekdays && t.weekdays.length) {
    for (let i = 1; i <= 7; i++) { const s = plusDays(doneDate, i); if (t.weekdays.includes(parseD(s).getDay())) return s; }
  }
  return plusDays(doneDate, t.interval_days || 1);
}
function freqText(t) {
  if (t.weekdays && t.weekdays.length) return 'tiap ' + t.weekdays.map((w) => HARI[w]).join(' & ');
  return ({ 1: 'harian', 7: 'mingguan', 30: 'bulanan', 90: '3 bulanan' })[t.interval_days] || `tiap ${t.interval_days} hari`;
}
// late = lewat batas, due = batas hari ini, later = belum waktunya, unset = batas pertama belum diatur
function taskStatus(t, d) {
  if (!t.next_due) return 'unset';
  const n = diffDays(t.next_due, d);
  return n > 0 ? 'late' : n === 0 ? 'due' : 'later';
}
const isDaily = (t) => !t.machine && t.interval_days === 1 && !(t.weekdays && t.weekdays.length);

// Cek foto: tolak kalau terlalu gelap, terlalu terang, atau buram.
async function checkPhoto(file) {
  const img = await createImageBitmap(file);
  const W = 320, H = Math.max(1, Math.round(img.height * W / img.width));
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d'); x.drawImage(img, 0, 0, W, H);
  const p = x.getImageData(0, 0, W, H).data;
  const g = new Float32Array(W * H); let sum = 0;
  for (let i = 0; i < W * H; i++) { const v = 0.299 * p[i * 4] + 0.587 * p[i * 4 + 1] + 0.114 * p[i * 4 + 2]; g[i] = v; sum += v; }
  const mean = sum / (W * H);
  let n = 0, m = 0, m2 = 0;
  for (let y = 1; y < H - 1; y++) for (let k = 1; k < W - 1; k++) {
    const i = y * W + k; const l = 4 * g[i] - g[i - 1] - g[i + 1] - g[i - W] - g[i + W];
    n++; m += l; m2 += l * l;
  }
  const sharp = n ? m2 / n - (m / n) ** 2 : 0;
  if (mean < 45) return { ok: false, why: 'Foto terlalu gelap. Nyalakan lampu lalu foto ulang.' };
  if (mean > 235) return { ok: false, why: 'Foto terlalu terang. Foto ulang.' };
  if (sharp < 20) return { ok: false, why: 'Foto buram. Pegang HP diam lalu foto ulang.' };
  return { ok: true };
}
