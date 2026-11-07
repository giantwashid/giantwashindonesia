// Dashboard outlet: ringkasan penjualan, biaya, stok listrik/gas, absensi dan mesin.
// Pemilik melihat semua outlet. Karyawan/PIC/supervisor yang punya outlet hanya melihat outlet itu.
const HARI = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const fmtD = (s) => { const d = new Date(s + 'T00:00:00'); return `${d.getDate()} ${BULAN[d.getMonth()]}`; };
const num = (n) => Math.round(Number(n) || 0).toLocaleString('id-ID');
const short = (n) => { n = Number(n) || 0; return n >= 1e6 ? (n / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' jt' : n >= 1e3 ? Math.round(n / 1e3) + ' rb' : String(Math.round(n)); };

let me = null, outlets = [], outlet = null, period = 'month', locked = false, emps = [];

(async () => {
  me = await requireEmployee();
  if (!me) return;
  const role = me.position || '';
  const owner = /owner|pemilik/i.test(role);
  const seesAll = owner || (!me.outlet_id && /accounting|akuntan|supervisor|spv/i.test(role));
  const { data } = await sb.from('outlets').select('*').eq('active', true).order('id');
  outlets = data || [];
  if (!seesAll && !me.outlet_id) { $('noaccess').classList.remove('hidden'); return; }
  locked = !seesAll;
  const shown = locked ? outlets.filter((o) => o.id === me.outlet_id) : outlets;
  const tabs = shown.map((o) => ({ id: o.id, name: o.name }));
  if (!locked) tabs.push({ id: null, name: 'Semua outlet' });
  $('otabs').replaceChildren(...tabs.map((t) => { const b = el('button', '', t.name); b.type = 'button'; b.dataset.o = t.id ?? ''; return b; }));
  let saved = null;
  try { saved = localStorage.getItem('gw-dash-outlet'); } catch (_) {}
  outlet = locked ? me.outlet_id : (saved === '' ? null : tabs.some((t) => String(t.id) === saved) ? Number(saved) : tabs[0].id);
  $('otabs').addEventListener('click', (e) => {
    const o = e.target.dataset.o; if (o === undefined || locked) return;
    outlet = o === '' ? null : Number(o);
    try { localStorage.setItem('gw-dash-outlet', o); } catch (_) {}
    load();
  });
  $('ptabs').addEventListener('click', (e) => { const p = e.target.dataset.p; if (!p) return; period = p; load(); });
  const { data: em } = await sb.from('employees').select('id,name,outlet_id,active');
  emps = em || [];
  $('board').classList.remove('hidden');
  load();
})();

function range() {
  const now = new Date(); const t = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let from, to = addDays(t, 1);
  if (period === 'today') from = t;
  else if (period === '7') from = addDays(t, -6);
  else if (period === '90') from = addDays(t, -89);
  else if (period === 'last') { from = new Date(t.getFullYear(), t.getMonth() - 1, 1); to = new Date(t.getFullYear(), t.getMonth(), 1); }
  else from = new Date(t.getFullYear(), t.getMonth(), 1);
  const len = Math.round((to - from) / 864e5);
  return { from, to, len, pfrom: addDays(from, -len), pto: from };
}

const scope = (q) => (outlet === null ? q : q.eq('outlet_id', outlet));
// Supabase mengirim maks 1000 baris sekali minta, jadi ambil per halaman.
async function all(make) {
  const out = [];
  for (let i = 0; i < 50000; i += 1000) {
    const { data, error } = await make().range(i, i + 999);
    if (error) return { data: out, error };
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return { data: out, error: null };
}

async function load() {
  document.querySelectorAll('#otabs button').forEach((b) => b.classList.toggle('on', b.dataset.o === String(outlet ?? '')));
  document.querySelectorAll('#ptabs button').forEach((b) => b.classList.toggle('on', b.dataset.p === period));
  const r = range();
  const F = iso(r.from), T = iso(r.to), PF = iso(r.pfrom), PT = iso(r.pto);
  $('range').textContent = `${fmtD(F)} – ${fmtD(iso(addDays(r.to, -1)))} ${r.from.getFullYear()} · dibanding ${r.len} hari sebelumnya`;
  $('status').textContent = 'Memuat...';
  const empIds = emps.filter((e) => outlet === null || e.outlet_id === outlet).map((e) => e.id);
  const [s, ps, p, pp, a, m, met] = await Promise.all([
    all(() => scope(sb.from('sales').select('date,invoice_no,item,qty,total,payment_method,note,created_at').gte('date', F).lt('date', T)).order('id')),
    all(() => scope(sb.from('sales').select('invoice_no,total').gte('date', PF).lt('date', PT)).order('id')),
    all(() => scope(sb.from('purchases').select('date,item,total,expense_type').gte('date', F).lt('date', T)).order('id')),
    all(() => scope(sb.from('purchases').select('total').gte('date', PF).lt('date', PT)).order('id')),
    sb.from('attendance').select('employee_id,date,status').gte('date', F).lt('date', T).in('employee_id', empIds.length ? empIds : [-1]),
    scope(sb.from('maintenance').select('*').neq('status', 'selesai')).order('date', { ascending: false }).limit(20),
    sb.from('attendance').select('employee_id,date,check_out,electric_kwh,gas_bar').not('electric_kwh', 'is', null).in('employee_id', empIds.length ? empIds : [-1]).order('date', { ascending: false }).limit(60),
  ]);
  const err = [s, ps, p, pp, a, m, met].find((x) => x.error);
  $('status').textContent = err ? 'Sebagian data gagal dimuat: ' + err.error.message : '';
  const sales = s.data || [], purch = p.data || [];
  kpis(sales, ps.data || [], purch, pp.data || [], m.data || []);
  daily(sales, r);
  payments(sales);
  products(sales);
  hours(sales);
  costs(purch);
  meters(met.data || []);
  attend(a.data || []);
  machines(m.data || []);
}

const sum = (rows) => rows.reduce((t, x) => t + Number(x.total || 0), 0);
const inv = (rows) => new Set(rows.map((x) => x.invoice_no)).size;
function delta(now, before) {
  if (!before) return now ? 'baru ada data' : '–';
  const pct = Math.round(((now - before) / before) * 100);
  return `${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct)}% vs periode lalu`;
}

function kpis(sales, psales, purch, ppurch, mach) {
  const S = sum(sales), PS = sum(psales), N = inv(sales), PN = inv(psales), C = sum(purch), PC = sum(ppurch);
  const items = [
    ['Penjualan', rp(S), delta(S, PS)],
    ['Jumlah nota', num(N), delta(N, PN)],
    ['Rata-rata per nota', rp(N ? S / N : 0), N ? 'per transaksi' : '–'],
    ['Biaya / pembelian', rp(C), delta(C, PC)],
    ['Penjualan − biaya', (S - C < 0 ? '−' : '') + rp(Math.abs(S - C)), 'sebelum gaji'],
    ['Mesin belum beres', num(mach.length), mach.length ? 'cek daftar di bawah' : 'semua aman'],
  ];
  $('kpis').replaceChildren(...items.map(([k, v, d]) => { const c = el('div', 'kpi'); c.append(el('span', 'k', k), el('span', 'v', v), el('span', 'd', d)); return c; }));
}

// Batang vertikal + tooltip saat disentuh / diarahkan.
function bars(box, list, fmt, axis) {
  const max = Math.max(1, ...list.map((x) => x.v));
  box.replaceChildren(...list.map((x) => {
    const b = el('div', 'b'); b.tabIndex = 0; b.dataset.tip = `${x.label}: ${fmt(x.v)}`;
    const i = el('i'); i.style.height = (x.v / max) * 100 + '%'; b.append(i); return b;
  }));
  const ax = box.nextElementSibling && box.nextElementSibling.classList.contains('axis') ? box.nextElementSibling : el('div', 'axis');
  ax.replaceChildren(...axis.map((t) => el('span', '', t)));
  if (!ax.isConnected) box.after(ax);
}

function daily(sales, r) {
  const by = {};
  sales.forEach((x) => { by[x.date] = (by[x.date] || 0) + Number(x.total || 0); });
  const list = [];
  for (let d = new Date(r.from); d < r.to; d = addDays(d, 1)) { const k = iso(d); list.push({ label: `${HARI[d.getDay()]} ${fmtD(k)}`, v: by[k] || 0 }); }
  const mid = list[Math.floor(list.length / 2)];
  bars($('daily'), list, rp, list.length > 1 ? [list[0].label, mid.label, list[list.length - 1].label] : [list[0].label]);
}

function hbars(box, list, fmt, empty) {
  if (!list.length) { box.replaceChildren(el('p', 'empty', empty)); return; }
  const max = Math.max(1, ...list.map((x) => x.v));
  box.replaceChildren(...list.map((x) => {
    const r = el('div', 'hb'); const t = el('div', 't'); const i = el('i'); i.style.width = (x.v / max) * 100 + '%'; t.append(i);
    r.append(el('span', 'n', x.label), t, el('span', 'v', fmt(x))); r.title = x.label; return r;
  }));
}

function payments(sales) {
  const by = {}; sales.forEach((x) => { const k = x.payment_method || 'lainnya'; by[k] = (by[k] || 0) + Number(x.total || 0); });
  const tot = Object.values(by).reduce((a, b) => a + b, 0);
  const name = { tunai: 'Tunai', qris: 'QRIS', transfer: 'Transfer' };
  hbars($('pay'), Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: name[k] || k, v })),
    (x) => `${rp(x.v)} · ${tot ? Math.round((x.v / tot) * 100) : 0}%`, 'Belum ada penjualan.');
}

function products(sales) {
  const by = {}; sales.forEach((x) => { const k = x.item; by[k] = by[k] || { v: 0, q: 0 }; by[k].v += Number(x.total || 0); by[k].q += Number(x.qty || 0); });
  hbars($('products'), Object.entries(by).sort((a, b) => b[1].v - a[1].v).slice(0, 8).map(([k, o]) => ({ label: k, v: o.v, q: o.q })),
    (x) => `${short(x.v)} · ${num(x.q)}x`, 'Belum ada penjualan.');
}

// Jam transaksi: dari catatan "Jam hh:mm", nomor nota (…-hhmmss), atau waktu input.
function hourOf(x) {
  const m = /Jam (\d{1,2})[:.]/.exec(x.note || ''); if (m) return Number(m[1]);
  const n = /-\d{6}-(\d{2})\d{4}$/.exec(x.invoice_no || ''); if (n) return Number(n[1]);
  return x.created_at ? new Date(x.created_at).getHours() : null;
}
function hours(sales) {
  const seen = new Set(), c = Array(24).fill(0);
  sales.forEach((x) => { if (seen.has(x.invoice_no)) return; seen.add(x.invoice_no); const h = hourOf(x); if (h != null && h >= 0 && h < 24) c[h]++; });
  bars($('hours'), c.map((v, h) => ({ label: `Jam ${pad(h)}:00`, v })), (v) => `${v} nota`, ['00', '06', '12', '18', '23']);
}

function costs(purch) {
  const by = {}; purch.forEach((x) => { const k = x.expense_type || 'Lainnya'; by[k] = (by[k] || 0) + Number(x.total || 0); });
  hbars($('costs'), Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => ({ label: k, v })), (x) => short(x.v), 'Belum ada biaya di periode ini.');
}

function meters(rows) {
  const box = $('meters');
  if (!rows.length) { box.replaceChildren(el('p', 'empty', 'Belum ada isian. Akan muncul setelah karyawan absen pulang.')); return; }
  const last = rows[0];
  const nm = emps.find((e) => e.id === last.employee_id)?.name || '';
  const prevGas = rows.slice(1).find((r) => r.gas_bar != null);
  const line = (k, v) => { const r = el('div', 'row2'); r.append(el('span', '', k), el('b', '', v)); return r; };
  const gas = el('b', last.gas_bar <= 1 ? 'warn' : '', `${num(last.gas_bar)} bar${last.gas_bar <= 1 ? ' · segera isi' : ''}`);
  const g = el('div', 'row2'); g.append(el('span', '', 'Sisa gas'), gas);
  box.replaceChildren(line('Sisa listrik', `${Number(last.electric_kwh).toLocaleString('id-ID')} kWh`), g,
    line('Dicatat', `${fmtD(last.date)} ${String(last.check_out || '').slice(0, 5)} · ${nm.split(' ')[0]}`),
    ...(prevGas ? [line('Sebelumnya', `${Number(rows[1].electric_kwh).toLocaleString('id-ID')} kWh · ${num(prevGas.gas_bar)} bar`)] : []));
}

function attend(rows) {
  const box = $('attend');
  if (!rows.length) { box.replaceChildren(el('p', 'empty', 'Belum ada absensi di periode ini.')); return; }
  const c = {}; rows.forEach((r) => (c[r.status] = (c[r.status] || 0) + 1));
  const late = {}; rows.filter((r) => r.status === 'telat').forEach((r) => (late[r.employee_id] = (late[r.employee_id] || 0) + 1));
  const line = (k, v) => { const r = el('div', 'row2'); r.append(el('span', '', k), el('b', '', v)); return r; };
  const out = [line('Hadir tepat waktu', num(c.hadir || 0)), line('Telat', num(c.telat || 0))];
  ['izin', 'sakit', 'cuti', 'alpha'].forEach((k) => { if (c[k]) out.push(line(k[0].toUpperCase() + k.slice(1), num(c[k]))); });
  Object.entries(late).sort((a, b) => b[1] - a[1]).slice(0, 3).forEach(([id, n]) => {
    const nm = emps.find((e) => e.id === Number(id))?.name || 'Karyawan';
    out.push(line(`Telat: ${nm}`, `${n}x`));
  });
  box.replaceChildren(...out);
}

function machines(rows) {
  const box = $('machines');
  if (!rows.length) { box.replaceChildren(el('p', 'empty', 'Semua mesin aman.')); return; }
  box.replaceChildren(...rows.map((r) => {
    const x = el('div', 'row2');
    x.append(el('span', '', `${r.machine || 'Mesin'}${r.description ? ' – ' + r.description : ''}`), el('b', '', fmtD(r.date)));
    return x;
  }));
}

// Tooltip untuk batang grafik (mouse dan sentuh).
const tip = $('tip');
function showTip(e) {
  const b = e.target.closest && e.target.closest('.b'); if (!b) { tip.classList.add('hidden'); return; }
  tip.textContent = b.dataset.tip; tip.classList.remove('hidden');
  const r = b.getBoundingClientRect();
  const x = Math.min(window.innerWidth - tip.offsetWidth - 8, Math.max(8, r.left + r.width / 2 - tip.offsetWidth / 2));
  tip.style.left = x + 'px'; tip.style.top = Math.max(8, r.top - tip.offsetHeight - 8) + 'px';
}
document.addEventListener('mouseover', showTip);
document.addEventListener('focusin', showTip);
document.addEventListener('touchstart', showTip, { passive: true });
document.addEventListener('scroll', () => tip.classList.add('hidden'), { passive: true });
