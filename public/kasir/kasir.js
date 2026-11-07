// Halaman kasir / penjualan (gaya Grid Tombol). Data disimpan di Supabase.
const SUPABASE_URL = 'https://oaxrqjbqtiibiqhsnvlt.supabase.co';
const SUPABASE_KEY = 'sb_publishable_OXzFWfF0lhf866nnu_9Z-Q_-WfZzDG8';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, '0');
const rp = (n) => 'Rp' + Math.round(Number(n) || 0).toLocaleString('id-ID');
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

let employee = null;
let outlet = null;
let products = [];
let cart = {};          // product id -> qty
let pay = 'tunai';

function show(view) {
  ['login-view', 'app-view', 'done-view', 'nolink-view'].forEach((v) => $(v).classList.toggle('hidden', v !== view));
}

// ---------- Login ----------
$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  $('login-msg').textContent = 'Memeriksa...';
  const { error } = await sb.auth.signInWithPassword({ email: f.get('email'), password: f.get('password') });
  $('login-msg').textContent = error ? 'Email atau password salah.' : '';
});
$('logout2').addEventListener('click', () => sb.auth.signOut());

sb.auth.onAuthStateChange((_e, session) => {
  if (!session) { location.href = '/karyawan/'; return; }
  setTimeout(() => start(session.user.email), 0);
});

async function start(email) {
  const { data, error } = await sb.from('employees').select('*').ilike('email', email).eq('active', true).maybeSingle();
  if (error || !data) { $('nolink-email').textContent = email; show('nolink-view'); return; }
  employee = data;
  $('emp-name').textContent = data.name;
  // Outlet: dari data karyawan, atau dari link (?outlet=) untuk pemilik.
  const oid = data.outlet_id || Number(new URLSearchParams(location.search).get('outlet'));
  const res = oid ? await sb.from('outlets').select('*').eq('id', oid).maybeSingle() : { data: null };
  if (!res.data) { location.href = '/karyawan/'; return; }
  outlet = res.data;
  $('outlet-name').textContent = outlet.name;
  show('app-view');
  loadProducts();
}

async function loadProducts() {
  const outletId = outlet.id;
  const { data, error } = await sb.from('products').select('*').eq('active', true)
    .or(`outlet_id.eq.${outletId},outlet_id.is.null`).order('sort').order('name');
  if (error) { $('msg').textContent = 'Gagal memuat harga: ' + error.message; return; }
  products = data || [];
  render();
  loadToday();
}

async function loadToday() {
  const { data } = await sb.from('sales').select('invoice_no,total').eq('date', today()).eq('outlet_id', outlet.id);
  const rows = data || [];
  const n = new Set(rows.map((r) => r.invoice_no)).size;
  const sum = rows.reduce((a, r) => a + Number(r.total || 0), 0);
  $('today').textContent = `${n} transaksi · ${rp(sum)}`;
}

// ---------- Keranjang ----------
const stepOf = (p) => (p.unit === 'kg' ? 0.5 : 1);
// Harga malam berlaku jam 23:00 - 05:59
const isNight = () => { const h = new Date().getHours(); return h >= 23 || h < 6; };
const priceOf = (p) => Number(isNight() && p.price_night != null ? p.price_night : p.price);
function add(p, dir) {
  const q = Math.max(0, Math.round(((cart[p.id] || 0) + dir * stepOf(p)) * 10) / 10);
  if (q) cart[p.id] = q; else delete cart[p.id];
  render();
}
const fmtQty = (q) => String(q).replace('.', ',');

function total() {
  return products.reduce((a, p) => a + (cart[p.id] || 0) * priceOf(p), 0);
}

function render() {
  const grid = $('grid');
  grid.replaceChildren();
  products.forEach((p) => {
    const q = cart[p.id] || 0;
    const b = el('button', 'tile' + (q ? ' on' : ''));
    b.type = 'button';
    b.append(el('b', null, p.name), el('span', null, `${rp(priceOf(p))}${p.unit === 'kg' ? '/kg' : ''}`));
    if (p.note) b.append(el('small', 'note', p.note));
    if (q) b.append(el('span', 'badge', fmtQty(q)));
    b.addEventListener('click', () => add(p, 1));
    grid.append(b);
  });
  if (!products.length) grid.append(el('p', 'msg', 'Belum ada daftar harga. Isi di Panel Laporan, menu Harga.'));

  const chosen = products.filter((p) => cart[p.id]);
  $('cart-card').classList.toggle('hidden', !chosen.length);
  const list = $('cart');
  list.replaceChildren();
  chosen.forEach((p) => {
    const row = el('div', 'line');
    const nm = el('div', 'nm');
    nm.append(el('b', null, p.name), el('span', null, rp(cart[p.id] * priceOf(p))));
    const st = el('div', 'step');
    const minus = el('button', null, '−'); minus.type = 'button'; minus.setAttribute('aria-label', 'Kurangi ' + p.name);
    const plus = el('button', 'plus', '+'); plus.type = 'button'; plus.setAttribute('aria-label', 'Tambah ' + p.name);
    minus.addEventListener('click', () => add(p, -1));
    plus.addEventListener('click', () => add(p, 1));
    st.append(minus, el('b', null, fmtQty(cart[p.id]) + (p.unit === 'kg' ? ' kg' : '')), plus);
    row.append(nm, st);
    list.append(row);
  });

  const items = chosen.reduce((a, p) => a + (p.unit === 'kg' ? 1 : cart[p.id]), 0);
  $('count').textContent = `${items} ITEM`;
  $('total').textContent = rp(total());
  $('pay-btn').disabled = !chosen.length;
  $('cash-box').classList.toggle('hidden', pay !== 'tunai');
  updateChange();
}

function updateChange() {
  const cash = Number($('cash').value || 0);
  $('change').textContent = cash ? rp(Math.max(0, cash - total())) : 'Rp0';
}
$('cash').addEventListener('input', updateChange);

$('pays').addEventListener('click', (e) => {
  const b = e.target.closest('[data-pay]');
  if (!b) return;
  pay = b.dataset.pay;
  document.querySelectorAll('.pay').forEach((x) => x.classList.toggle('on', x === b));
  render();
});

// ---------- Bayar ----------
$('pay-btn').addEventListener('click', async () => {
  const t = total();
  const cash = Number($('cash').value || 0);
  if (pay === 'tunai' && cash && cash < t) { $('msg').textContent = 'Uang diterima kurang dari total.'; return; }
  const btn = $('pay-btn');
  btn.disabled = true;
  $('msg').textContent = 'Menyimpan...';
  const d = new Date();
  const no = `GW${outlet ? outlet.id : ''}-${String(d.getFullYear()).slice(2)}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const customer = $('customer').value.trim() || null;
  const chosen = products.filter((p) => cart[p.id]);
  const rows = chosen.map((p) => ({
    date: today(), invoice_no: no, customer, item: p.name, qty: cart[p.id], price: priceOf(p),
    outlet_id: outlet ? outlet.id : null, payment_method: pay, cashier: employee.name,
  }));
  const { error } = await sb.from('sales').insert(rows);
  btn.disabled = false;
  if (error) { $('msg').textContent = 'Gagal menyimpan: ' + error.message; return; }
  $('msg').textContent = '';

  $('r-no').textContent = no;
  $('r-time').textContent = `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const ri = $('r-items');
  ri.replaceChildren(...chosen.map((p) => {
    const r = el('div', 'rrow');
    r.append(el('span', null, `${p.name} × ${fmtQty(cart[p.id])}${p.unit === 'kg' ? ' kg' : ''}`), el('b', null, rp(cart[p.id] * priceOf(p))));
    return r;
  }));
  $('r-total').textContent = rp(t);
  $('r-pay').textContent = pay === 'tunai' ? (cash ? `Tunai ${rp(cash)}` : 'Tunai') : pay.toUpperCase();
  $('r-change-row').classList.toggle('hidden', !(pay === 'tunai' && cash));
  $('r-change').textContent = rp(Math.max(0, cash - t));
  show('done-view');
});

$('new-btn').addEventListener('click', () => {
  cart = {};
  $('customer').value = '';
  $('cash').value = '';
  show('app-view');
  render();
  loadToday();
  window.scrollTo(0, 0);
});
