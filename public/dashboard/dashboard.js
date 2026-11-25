// Dashboard per outlet (desain 2 "Abu Hangat"): ringkasan, tren bulanan, biaya, laba rugi, produk, cara bayar, jam ramai.
// Hanya owner dan manager (kolom role, sama dengan aturan database). Owner memilih outlet; manager yang punya outlet hanya melihat outletnya.
// Baris yang ditandai batal (is_void) tidak dihitung. Laba rugi = salinan tab Income Statement dari Google Sheet accounting.
const HARI = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const BULAN_PANJANG = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const fmtD = (s) => { const d = new Date(s + 'T00:00:00'); return `${d.getDate()} ${BULAN[d.getMonth()]}`; };
const num = (n) => Math.round(Number(n) || 0).toLocaleString('id-ID');
const short = (n) => { n = Number(n) || 0; const a = Math.abs(n), s = n < 0 ? '−' : ''; return s + (a >= 1e6 ? (a / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 2 }) + ' jt' : a >= 1e3 ? Math.round(a / 1e3) + ' rb' : String(Math.round(a))); };
const money = (n) => (n < 0 ? '(' + rp(-n) + ')' : rp(n));
const signed = (n) => (n < 0 ? '−' : '') + rp(Math.abs(n));
const isOwner = (e) => e.role === 'owner';
const COST_COLORS = ['#A50034', '#8a8478', '#d6d0c4', '#ffffff', '#5a554d', '#b8b0a2'];

let me = null, outlets = [], outlet = null, period = 'month', isRows = [], isPeriod = null;

(async () => {
  me = await requireEmployee();
  if (!me) return;
  if (!isOwner(me) && me.role !== 'manager') { $('noaccess').classList.remove('hidden'); return; }
  const { data } = await sb.from('outlets').select('*').eq('active', true).order('id');
  outlets = data || [];
  const shown = !isOwner(me) && me.outlet_id ? outlets.filter((o) => o.id === me.outlet_id) : outlets;
  if (!shown.length) { $('noaccess').classList.remove('hidden'); return; }
  // "Semua outlet" untuk owner dan manager tanpa outlet.
  const canAll = isOwner(me) || !me.outlet_id;
  const opts = [...(canAll && shown.length > 1 ? [{ id: 'all', name: 'Semua outlet' }] : []), ...shown];
  $('osel').replaceChildren(...opts.map((o) => { const x = el('option', '', o.name); x.value = o.id; return x; }));
  $('osel').disabled = opts.length < 2;
  const parse = (v) => (v === 'all' ? 'all' : Number(v));
  const valid = (v) => opts.some((o) => String(o.id) === String(v));
  let saved = null;
  try { saved = localStorage.getItem('gw-dash-outlet'); } catch (_) {}
  const want = new URLSearchParams(location.search).get('outlet');
  outlet = valid(want) ? parse(want) : valid(saved) ? parse(saved) : opts[0].id;
  $('osel').addEventListener('change', (e) => {
    outlet = parse(e.target.value);
    try { localStorage.setItem('gw-dash-outlet', String(outlet)); } catch (_) {}
    try { history.replaceState(null, '', '?outlet=' + outlet); } catch (_) {}
    isPeriod = null;
    load();
  });
  $('psel').addEventListener('change', (e) => { period = e.target.value; load(); });
  $('isel').addEventListener('change', (e) => { isPeriod = e.target.value; income(); });
  $('filters').classList.remove('hidden');
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

const scope = (q) => (outlet === 'all' ? q : q.eq('outlet_id', outlet)).eq('is_void', false);

// Laba rugi gabungan untuk "Semua outlet": jumlahkan angka per periode dan pos.
function combineIncome(rows) {
  const by = {};
  rows.forEach((x) => {
    const k = x.period + '|' + x.line_item;
    const c = by[k] || (by[k] = { period: x.period, line_item: x.line_item, amount: null, sort: x.sort, updated_at: x.updated_at });
    if (x.amount != null) c.amount = (c.amount || 0) + Number(x.amount);
    if (x.sort < c.sort) c.sort = x.sort;
    if (x.updated_at > c.updated_at) c.updated_at = x.updated_at;
  });
  return Object.values(by).map((c) => (/margin/i.test(c.line_item) ? { ...c, amount: null } : c));
}
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
  const o = outlet === 'all'
    ? { name: 'Semua Outlet', input_source: outlets.some((x) => x.input_source === 'sheet') ? 'sheet' : 'website' }
    : outlets.find((x) => x.id === outlet) || {};
  $('oname').textContent = o.name || 'Dashboard';
  const r = range();
  const F = iso(r.from), T = iso(r.to), PF = iso(r.pfrom), PT = iso(r.pto);
  const now = new Date();
  const t0 = new Date(now.getFullYear(), now.getMonth() - 5, 1), t1 = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  $('range').textContent = `${fmtD(F)} – ${fmtD(iso(addDays(r.to, -1)))} ${r.from.getFullYear()} · dibanding ${r.len} hari sebelumnya`;
  $('status').textContent = 'Memuat...';
  const [s, ps, p, pp, tr, inc, lg] = await Promise.all([
    all(() => scope(sb.from('sales').select('date,invoice_no,item,qty,total,payment_method,note,created_at').gte('date', F).lt('date', T)).order('id')),
    all(() => scope(sb.from('sales').select('invoice_no,total').gte('date', PF).lt('date', PT)).order('id')),
    all(() => scope(sb.from('purchases').select('date,item,total,expense_type').gte('date', F).lt('date', T)).order('id')),
    all(() => scope(sb.from('purchases').select('total').gte('date', PF).lt('date', PT)).order('id')),
    all(() => scope(sb.from('sales').select('date,total').gte('date', iso(t0)).lt('date', iso(t1))).order('id')),
    (outlet === 'all' ? sb.from('income_statement').select('period,line_item,amount,sort,updated_at') : sb.from('income_statement').select('period,line_item,amount,sort,updated_at').eq('outlet_id', outlet)).order('sort'),
    o.input_source === 'sheet' ? sb.from('sync_log').select('ran_at,status').order('id', { ascending: false }).limit(1) : Promise.resolve({ data: [] }),
  ]);
  const err = [s, ps, p, pp, tr, inc, lg].find((x) => x.error);
  $('status').textContent = err ? 'Sebagian data gagal dimuat: ' + err.error.message : '';
  syncLine(o, (lg.data || [])[0]);
  const sales = s.data || [], purch = p.data || [];
  isRows = outlet === 'all' ? combineIncome(inc.data || []) : inc.data || [];
  kpis(sales, ps.data || [], purch, pp.data || []);
  trend(tr.data || [], t0);
  costs(purch, sales);
  incomePeriods();
  income();
  products(sales);
  payments(sales);
  hours(sales);
}

function syncLine(o, last) {
  const box = $('sync');
  if (o.input_source !== 'sheet') { box.textContent = ''; return; }
  if (!last) { box.textContent = 'Data dari Google Sheet accounting · belum ada catatan sinkron.'; return; }
  const d = new Date(last.ran_at);
  box.textContent = `Data dari Google Sheet accounting · sinkron terakhir ${d.getDate()} ${BULAN[d.getMonth()]} ${pad(d.getHours())}:${pad(d.getMinutes())}` + (last.status === 'ok' ? '' : ` (${last.status})`);
}

const sum = (rows) => rows.reduce((t, x) => t + Number(x.total || 0), 0);
const inv = (rows) => new Set(rows.map((x) => x.invoice_no)).size;
function delta(now, before) {
  if (!before) return now ? 'baru ada data' : '–';
  const pct = Math.round(((now - before) / before) * 100);
  return `${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct)}% vs periode lalu`;
}

function isLine(periodKey, re) {
  const row = isRows.find((x) => x.period === periodKey && re.test(x.line_item));
  return row && row.amount != null ? Number(row.amount) : null;
}

function kpis(sales, psales, purch, ppurch) {
  const S = sum(sales), PS = sum(psales), N = inv(sales), PN = inv(psales), C = sum(purch), PC = sum(ppurch);
  const net = isLine(iso(new Date()).slice(0, 7), /^net profit/i);
  const items = [
    { k: 'Penjualan', v: short(S), f: rp(S), d: delta(S, PS) },
    { k: 'Jumlah nota', v: num(N), f: N ? `rata-rata ${rp(S / N)} per nota` : '–', d: delta(N, PN) },
    { k: 'Biaya / pembelian', v: short(C), f: rp(C), d: delta(C, PC) },
    { k: 'Laba bersih bulan ini', v: net == null ? '–' : short(net), f: net == null ? 'belum ada laporan laba rugi' : signed(net), d: net == null ? '' : 'dari laporan accounting', key: true },
  ];
  $('kpis').replaceChildren(...items.map((x) => {
    const c = el('div', 'kpi' + (x.key ? ' key' : ''));
    c.append(el('span', 'k', x.k), el('span', 'v', x.v), el('span', 'f', x.f));
    if (x.d) c.append(el('span', 'd', x.d));
    return c;
  }));
}

// Tren 6 bulan terakhir dengan angka di atas tiap batang.
function trend(rows, t0) {
  const by = {};
  rows.forEach((x) => { const m = String(x.date).slice(0, 7); by[m] = (by[m] || 0) + Number(x.total || 0); });
  const months = [];
  for (let i = 0; i < 6; i++) { const d = new Date(t0.getFullYear(), t0.getMonth() + i, 1); months.push({ key: `${d.getFullYear()}-${pad(d.getMonth() + 1)}`, label: BULAN[d.getMonth()], d }); }
  const list = months.filter((m, i) => by[m.key] || months.slice(0, i).some((x) => by[x.key]) || i === months.length - 1);
  const max = Math.max(1, ...list.map((m) => by[m.key] || 0));
  $('trend').replaceChildren(...list.map((m, i) => {
    const v = by[m.key] || 0;
    const c = el('div', 'tb' + (i === list.length - 1 ? ' now' : ''));
    const bar = el('i'); bar.style.height = Math.max(2, (v / max) * 78) + '%';
    const lbl = el('b'); lbl.append(el('span', 'full', rp(v)), el('span', 'short', short(v))); lbl.title = rp(v);
    c.append(lbl, bar, el('span', '', m.label));
    return c;
  }));
  const first = list[0].d, last = list[list.length - 1].d;
  $('trend-range').textContent = `${BULAN[first.getMonth()]} – ${BULAN[last.getMonth()]} ${last.getFullYear()}`;
  const cur = by[list[list.length - 1].key] || 0, prev = list.length > 1 ? by[list[list.length - 2].key] || 0 : 0;
  const cm = BULAN_PANJANG[last.getMonth()], pm = list.length > 1 ? BULAN_PANJANG[list[list.length - 2].d.getMonth()] : '';
  if (prev) {
    const pct = ((cur - prev) / prev) * 100;
    $('trend-note').textContent = `${cm} ${pct >= 0 ? 'naik' : 'turun'} ${Math.abs(pct).toLocaleString('id-ID', { maximumFractionDigits: 1 })}% dibanding ${pm} (bulan berjalan).`;
  } else {
    $('trend-note').textContent = '';
  }
}

// Kartu gelap: biaya di periode terpilih per jenis.
function costs(purch, sales) {
  const box = $('costs');
  $('cost-title').textContent = period === 'month' ? 'Biaya bulan ini' : 'Biaya periode ini';
  $('cost-range').textContent = $('psel').selectedOptions[0] ? $('psel').selectedOptions[0].textContent : '';
  const by = {}; purch.forEach((x) => { const k = x.expense_type || 'Lainnya'; by[k] = (by[k] || 0) + Number(x.total || 0); });
  const list = Object.entries(by).sort((a, b) => b[1] - a[1]);
  const C = list.reduce((t, x) => t + x[1], 0), S = sum(sales);
  if (!list.length) { box.replaceChildren(el('p', 'empty', 'Belum ada biaya di periode ini.')); return; }
  const top = list.slice(0, 5);
  if (list.length > 5) top.push(['Lainnya', list.slice(5).reduce((t, x) => t + x[1], 0)]);
  const tot = el('div', 'ctotal');
  tot.append(el('span', 'muted', 'Total biaya'), el('span', 'v', rp(C)), el('span', 'muted', S ? `${Math.round((C / S) * 100)}% dari penjualan` : 'belum ada penjualan'));
  const stack = el('div', 'stack');
  stack.setAttribute('role', 'img');
  stack.setAttribute('aria-label', 'Pembagian biaya: ' + top.map(([k, v]) => `${k} ${C ? Math.round((v / C) * 100) : 0}%`).join(', '));
  top.forEach(([, v], i) => { if (v <= 0) return; const s = el('i'); s.style.width = (C ? (v / C) * 100 : 0) + '%'; s.style.background = COST_COLORS[i % COST_COLORS.length]; stack.append(s); });
  const ul = el('div', 'clist');
  top.forEach(([k, v], i) => {
    const r = el('div', 'crow'); const n = el('span'); const d = el('i', 'dot'); d.style.background = COST_COLORS[i % COST_COLORS.length];
    n.append(d, el('span', '', k)); r.append(n, el('b', '', money(v))); ul.append(r);
  });
  box.replaceChildren(tot, stack, ul);
}

// ---------- Laba rugi (salinan tab Income Statement dari Google Sheet) ----------
const periodLabel = (p) => (/^\d{4}-\d{2}$/.test(p) ? `${BULAN_PANJANG[Number(p.slice(5)) - 1]} ${p.slice(0, 4)}` : `Total ${p}`);

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
  const cur = iso(new Date()).slice(0, 7);
  if (!isPeriod || !list.includes(isPeriod)) isPeriod = list.includes(cur) ? cur : list[0];
  sel.value = isPeriod;
}

function income() {
  const box = $('income');
  const rows = isRows.filter((x) => x.period === isPeriod).sort((a, b) => a.sort - b.sort);
  if (!rows.length) { box.replaceChildren(el('p', 'empty', 'Belum ada laporan laba rugi untuk outlet ini.')); $('income-note').textContent = ''; return; }
  const get = (re) => { const r = rows.find((x) => re.test(x.line_item)); return r && r.amount != null ? Number(r.amount) : null; };
  const steps = [
    ['Pendapatan', get(/^total revenue/i)],
    ['− Biaya cuci', get(/^total washing cost/i)],
    ['= Laba kotor', get(/^gross profit/i)],
    ['− Operasional', get(/^total operating expenses/i)],
    ['= Laba bersih', get(/^net profit/i), true],
  ].filter((x) => x[1] != null);
  const flow = el('div', 'flow');
  steps.forEach(([k, v, key]) => {
    const c = el('div', 'step' + (key ? ' key' : ''));
    c.append(el('span', '', k), el('b', v < 0 ? 'neg' : '', money(v)));
    flow.append(c);
  });
  const t = el('table', 'is');
  rows.forEach((x) => {
    const label = x.line_item, a = x.amount == null ? null : Number(x.amount);
    let cls = a == null ? 'sec' : /^(total|gross profit|net profit)/i.test(label) ? 'tot' : /^of which/i.test(label) ? 'sub' : '';
    if (/^net profit/i.test(label)) cls += ' key';
    const tr = el('tr', cls.trim());
    const v = a == null ? '' : /margin/i.test(label) ? (a * 100).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + '%' : money(a);
    tr.append(el('td', 'n', label), el('td', 'v' + (a != null && a < 0 ? ' neg' : ''), v));
    t.append(tr);
  });
  const det = el('details', 'more'); const sm = el('summary', '', 'Lihat rincian lengkap'); const wrap = el('div', 'iswrap'); wrap.append(t); det.append(sm, wrap);
  box.replaceChildren(...(steps.length ? [flow] : []), det);
  const upd = rows.reduce((m, x) => (x.updated_at > m ? x.updated_at : m), '');
  const d = upd ? new Date(upd) : null;
  $('income-note').textContent = 'Angka jadi dari tab Income Statement di Google Sheet accounting. Angka dalam kurung = minus.' + (d ? ` Diperbarui ${d.getDate()} ${BULAN[d.getMonth()]} ${pad(d.getHours())}:${pad(d.getMinutes())}.` : '');
}

// ---------- Produk, cara bayar, jam ramai ----------
function hbars(box, list, fmt, empty) {
  if (!list.length) { box.replaceChildren(el('p', 'empty', empty)); return; }
  const max = Math.max(1, ...list.map((x) => x.v));
  box.replaceChildren(...list.map((x) => {
    const r = el('div', 'hb'); const t = el('div', 't'); const i = el('i'); i.style.width = (Math.max(0, x.v) / max) * 100 + '%'; t.append(i);
    r.append(el('span', 'n', x.label), t, el('span', 'v', fmt(x))); r.title = x.label; return r;
  }));
}

function products(sales) {
  const by = {}; sales.forEach((x) => { const k = x.item; by[k] = by[k] || { v: 0, q: 0 }; by[k].v += Number(x.total || 0); by[k].q += Number(x.qty || 0); });
  hbars($('products'), Object.entries(by).sort((a, b) => b[1].v - a[1].v).slice(0, 6).map(([k, o]) => ({ label: k, v: o.v, q: o.q })),
    (x) => `${short(x.v)} · ${num(x.q)}x`, 'Belum ada penjualan.');
}

function payments(sales) {
  const by = {}; sales.forEach((x) => { const k = x.payment_method || 'lainnya'; by[k] = (by[k] || 0) + Number(x.total || 0); });
  const tot = Object.values(by).reduce((a, b) => a + b, 0);
  const name = { tunai: 'Tunai', qris: 'QRIS', transfer: 'Transfer' };
  hbars($('pay'), Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: name[k] || k, v })),
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
  const box = $('hours'), max = Math.max(1, ...c);
  box.replaceChildren(...c.map((v, h) => {
    const b = el('div', v === max && v > 0 ? 'b peak' : 'b'); b.tabIndex = 0; b.dataset.tip = `Jam ${pad(h)}:00: ${v} nota`;
    const i = el('i'); i.style.height = (v / max) * 100 + '%'; b.append(i); return b;
  }));
  const ax = box.nextElementSibling && box.nextElementSibling.classList.contains('axis') ? box.nextElementSibling : el('div', 'axis');
  ax.replaceChildren(...['00', '06', '12', '18', '23'].map((t) => el('span', '', t)));
  if (!ax.isConnected) box.after(ax);
}

// Tooltip untuk batang grafik jam (mouse dan sentuh).
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
