// Dashboard per outlet: penjualan, biaya, kanal, dan laba rugi (dari Google Sheet accounting).
// Hanya owner dan manager. Owner (atau manager tanpa outlet) memilih outlet; manager yang punya outlet hanya melihat outletnya.
// Baris yang ditandai batal (is_void) tidak dihitung.
const HARI = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const fmtD = (s) => { const d = new Date(s + 'T00:00:00'); return `${d.getDate()} ${BULAN[d.getMonth()]}`; };
const num = (n) => Math.round(Number(n) || 0).toLocaleString('id-ID');
const short = (n) => { n = Number(n) || 0; const a = Math.abs(n), s = n < 0 ? '−' : ''; return s + (a >= 1e6 ? (a / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' jt' : a >= 1e3 ? Math.round(a / 1e3) + ' rb' : String(Math.round(a))); };
const money = (n) => (n < 0 ? '(' + rp(-n) + ')' : rp(n));
// Akses memakai kolom peran (role), sama dengan aturan database. Jabatan (position) tidak dipakai.
const isOwner = (e) => e.role === 'owner';

let me = null, outlets = [], outlet = null, period = 'month', isRows = [], isPeriod = null;

(async () => {
  me = await requireEmployee();
  if (!me) return;
  if (!isOwner(me) && me.role !== 'manager') { $('noaccess').classList.remove('hidden'); return; }
  const { data } = await sb.from('outlets').select('*').eq('active', true).order('id');
  outlets = data || [];
  // Manager yang terdaftar di satu outlet hanya melihat outlet itu.
  const shown = !isOwner(me) && me.outlet_id ? outlets.filter((o) => o.id === me.outlet_id) : outlets;
  if (!shown.length) { $('noaccess').classList.remove('hidden'); return; }
  $('osel').replaceChildren(...shown.map((o) => { const x = el('option', '', o.name); x.value = o.id; return x; }));
  $('osel').disabled = shown.length < 2;
  let saved = null;
  try { saved = Number(localStorage.getItem('gw-dash-outlet')); } catch (_) {}
  outlet = shown.some((o) => o.id === saved) ? saved : shown[0].id;
  $('osel').addEventListener('change', (e) => {
    outlet = Number(e.target.value);
    try { localStorage.setItem('gw-dash-outlet', String(outlet)); } catch (_) {}
    isPeriod = null;
    load();
  });
  $('psel').addEventListener('change', (e) => { period = e.target.value; load(); });
  $('isel').addEventListener('change', (e) => { isPeriod = e.target.value; income(); });
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

const scope = (q) => q.eq('outlet_id', outlet).eq('is_void', false);
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
  $('osel').value = String(outlet);
  $('psel').value = period;
  const o = outlets.find((x) => x.id === outlet) || {};
  const r = range();
  const F = iso(r.from), T = iso(r.to), PF = iso(r.pfrom), PT = iso(r.pto);
  $('range').textContent = `${fmtD(F)} – ${fmtD(iso(addDays(r.to, -1)))} ${r.from.getFullYear()} · dibanding ${r.len} hari sebelumnya`;
  $('status').textContent = 'Memuat...';
  const [s, ps, p, pp, inc, lg] = await Promise.all([
    all(() => scope(sb.from('sales').select('date,invoice_no,item,qty,total,payment_method,note,created_at').gte('date', F).lt('date', T)).order('id')),
    all(() => scope(sb.from('sales').select('invoice_no,total').gte('date', PF).lt('date', PT)).order('id')),
    all(() => scope(sb.from('purchases').select('date,item,total,expense_type').gte('date', F).lt('date', T)).order('id')),
    all(() => scope(sb.from('purchases').select('total').gte('date', PF).lt('date', PT)).order('id')),
    sb.from('income_statement').select('period,line_item,amount,sort,updated_at').eq('outlet_id', outlet).order('sort'),
    o.input_source === 'sheet' ? sb.from('sync_log').select('ran_at,status').order('id', { ascending: false }).limit(1) : Promise.resolve({ data: [] }),
  ]);
  const err = [s, ps, p, pp, inc, lg].find((x) => x.error);
  $('status').textContent = err ? 'Sebagian data gagal dimuat: ' + err.error.message : '';
  syncLine(o, (lg.data || [])[0]);
  const sales = s.data || [], purch = p.data || [];
  isRows = inc.data || [];
  kpis(sales, ps.data || [], purch, pp.data || []);
  daily(sales, r);
  payments(sales);
  products(sales);
  hours(sales);
  costs(purch);
  channels(sales, o);
  incomePeriods();
  income();
}

function syncLine(o, last) {
  const box = $('sync');
  if (o.input_source !== 'sheet') { box.textContent = ''; return; }
  if (!last) { box.textContent = 'Data dari Google Sheet accounting · belum ada catatan sinkron.'; return; }
  const d = new Date(last.ran_at);
  const when = `${d.getDate()} ${BULAN[d.getMonth()]} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  box.textContent = `Data dari Google Sheet accounting · sinkron terakhir ${when}` + (last.status === 'ok' ? '' : ` (${last.status})`);
}

const sum = (rows) => rows.reduce((t, x) => t + Number(x.total || 0), 0);
const inv = (rows) => new Set(rows.map((x) => x.invoice_no)).size;
function delta(now, before) {
  if (!before) return now ? 'baru ada data' : '–';
  const pct = Math.round(((now - before) / before) * 100);
  return `${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct)}% vs periode lalu`;
}

// Laba bersih bulan berjalan dari laporan laba rugi accounting.
function netThisMonth() {
  const m = iso(new Date()).slice(0, 7);
  const row = isRows.find((x) => x.period === m && /^net profit/i.test(x.line_item));
  return row && row.amount != null ? Number(row.amount) : null;
}

function kpis(sales, psales, purch, ppurch) {
  const S = sum(sales), PS = sum(psales), N = inv(sales), PN = inv(psales), C = sum(purch), PC = sum(ppurch);
  const net = netThisMonth();
  const items = [
    ['Penjualan', rp(S), delta(S, PS)],
    ['Jumlah nota', num(N), delta(N, PN)],
    ['Rata-rata per nota', rp(N ? S / N : 0), N ? 'per transaksi' : '–'],
    ['Biaya / pembelian', rp(C), delta(C, PC)],
    ['Penjualan − biaya', (S - C < 0 ? '−' : '') + rp(Math.abs(S - C)), 'sebelum gaji'],
    ['Laba bersih bulan ini', net == null ? '–' : (net < 0 ? '−' : '') + rp(Math.abs(net)), net == null ? 'belum ada laporan laba rugi' : 'dari laporan accounting'],
  ];
  $('kpis').replaceChildren(...items.map(([k, v, d], i) => {
    const c = el('div', 'kpi' + (i === 0 ? ' hero' : '') + (i === 5 && net != null && net < 0 ? ' alert' : ''));
    c.append(el('span', 'k', k), el('span', 'v', v), el('span', 'd', d)); return c;
  }));
}

// Batang vertikal + tooltip saat disentuh / diarahkan.
function bars(box, list, fmt, axis) {
  const max = Math.max(1, ...list.map((x) => x.v));
  box.replaceChildren(...list.map((x) => {
    const b = el('div', x.v === max && x.v > 0 ? 'b peak' : 'b'); b.tabIndex = 0; b.dataset.tip = `${x.label}: ${fmt(x.v)}`;
    const i = el('i'); i.style.height = (Math.max(0, x.v) / max) * 100 + '%'; b.append(i); return b;
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
    const r = el('div', 'hb'); const t = el('div', 't'); const i = el('i'); i.style.width = (Math.max(0, x.v) / max) * 100 + '%'; t.append(i);
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

// Kanal dari awalan nomor nota: MXMG = mesin Maxpress, lainnya = kasir outlet.
function channels(sales, o) {
  const name = (pre) => (pre === 'MXMG' ? 'Mesin Maxpress' : pre === 'KLMG' || pre === '' ? `Kasir ${o.name || ''}`.trim() : pre);
  const by = {};
  sales.forEach((x) => { const pre = String(x.invoice_no || '').split('/')[0].toUpperCase(); const k = name(pre); by[k] = (by[k] || 0) + Number(x.total || 0); });
  const tot = Object.values(by).reduce((a, b) => a + b, 0);
  hbars($('channels'), Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: k, v })),
    (x) => `${short(x.v)} · ${tot ? Math.round((x.v / tot) * 100) : 0}%`, 'Belum ada penjualan.');
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

// ---------- Laba rugi (salinan tab Income Statement dari Google Sheet) ----------
const periodLabel = (p) => (/^\d{4}-\d{2}$/.test(p) ? `${BULAN[Number(p.slice(5)) - 1]} ${p.slice(0, 4)}` : `Total ${p}`);

function incomePeriods() {
  const sel = $('isel');
  const has = {};
  isRows.forEach((x) => { if (x.amount != null && Number(x.amount) !== 0) has[x.period] = true; });
  const months = Object.keys(has).filter((p) => /^\d{4}-\d{2}$/.test(p)).sort().reverse();
  const years = Object.keys(has).filter((p) => /^\d{4}$/.test(p)).sort().reverse();
  const list = [...months, ...years];
  if (!list.length) { sel.replaceChildren(); sel.disabled = true; isPeriod = null; return; }
  sel.disabled = false;
  sel.replaceChildren(...list.map((p) => { const x = el('option', '', periodLabel(p)); x.value = p; return x; }));
  const now = iso(new Date()).slice(0, 7);
  if (!isPeriod || !list.includes(isPeriod)) isPeriod = list.includes(now) ? now : list[0];
  sel.value = isPeriod;
}

function income() {
  const box = $('income');
  const rows = isRows.filter((x) => x.period === isPeriod).sort((a, b) => a.sort - b.sort);
  if (!rows.length) {
    box.replaceChildren(el('p', 'empty', 'Belum ada laporan laba rugi untuk outlet ini.'));
    $('income-note').textContent = '';
    return;
  }
  const t = el('table', 'is');
  rows.forEach((x) => {
    const label = x.line_item, a = x.amount == null ? null : Number(x.amount);
    let cls = '';
    if (a == null) cls = 'sec';
    else if (/^(total|gross profit|net profit)/i.test(label)) cls = 'tot';
    else if (/^of which/i.test(label)) cls = 'sub';
    if (/^net profit/i.test(label)) cls += ' key';
    const tr = el('tr', cls.trim());
    const v = a == null ? '' : /margin/i.test(label) ? (a * 100).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + '%' : money(a);
    const td = el('td', 'v' + (a != null && a < 0 ? ' neg' : ''), v);
    tr.append(el('td', 'n', label), td);
    t.append(tr);
  });
  const wrap = el('div', 'iswrap'); wrap.append(t);
  box.replaceChildren(wrap);
  const upd = rows.reduce((m, x) => (x.updated_at > m ? x.updated_at : m), '');
  const d = upd ? new Date(upd) : null;
  $('income-note').textContent = 'Angka jadi dari tab Income Statement di Google Sheet accounting (tidak dihitung ulang). Angka dalam kurung = rugi / minus.' +
    (d ? ` Diperbarui ${d.getDate()} ${BULAN[d.getMonth()]} ${pad(d.getHours())}:${pad(d.getMinutes())}.` : '');
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
