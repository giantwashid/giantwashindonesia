const SUPABASE_URL = 'https://oaxrqjbqtiibiqhsnvlt.supabase.co';
const SUPABASE_KEY = 'sb_publishable_OXzFWfF0lhf866nnu_9Z-Q_-WfZzDG8';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const $ = (s) => document.querySelector(s);
const rupiah = (n) => 'Rp ' + Number(n || 0).toLocaleString('id-ID');
const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const COLS = {
  attendance: [['date', 'Tanggal'], ['employee', 'Karyawan'], ['check_in', 'Masuk'], ['check_out', 'Pulang'], ['status', 'Status'], ['photo_in', 'Foto masuk'], ['loc_in', 'Lokasi masuk'], ['photo_out', 'Foto pulang'], ['loc_out', 'Lokasi pulang'], ['note', 'Catatan']],
  sales: [['date', 'Tanggal'], ['invoice_no', 'No. Nota'], ['customer', 'Pelanggan'], ['item', 'Layanan/Barang'], ['qty', 'Qty'], ['price', 'Harga'], ['total', 'Total'], ['payment_method', 'Bayar'], ['cashier', 'Kasir'], ['note', 'Catatan']],
  purchases: [['date', 'Tanggal'], ['po_no', 'No. PO'], ['supplier', 'Supplier'], ['item', 'Barang'], ['qty', 'Qty'], ['price', 'Harga'], ['total', 'Total'], ['created_by', 'Dicatat oleh'], ['note', 'Catatan']],
  products: [['sort', 'Urutan'], ['name', 'Nama'], ['price', 'Harga 06:00-22:59'], ['price_night', 'Harga 23:00-05:59'], ['unit', 'Satuan'], ['note', 'Catatan']],
  maintenance: [['date', 'Tanggal'], ['machine', 'Mesin'], ['kind', 'Jenis'], ['description', 'Keterangan'], ['status', 'Status'], ['photo', 'Foto'], ['reported_by', 'Pelapor'], ['fixed_by', 'Dibereskan oleh']],
  employees: [['name', 'Nama'], ['position', 'Jabatan'], ['email', 'Email login'], ['outlet_id', 'Outlet'], ['base_salary', 'Gaji pokok'], ['diligence_bonus', 'Uang kerajinan']],
  payroll: [['name', 'Karyawan'], ['present', 'Masuk (hari)'], ['late', 'Telat (x)'], ['base_salary', 'Gaji pokok'], ['bonus_got', 'Uang kerajinan'], ['fine', 'Denda telat'], ['pay_total', 'Perkiraan gaji']],
  contacts: [['created_at', 'Waktu'], ['name', 'Nama'], ['email', 'Email'], ['phone', 'HP'], ['message', 'Pesan']],
};
const MONEY = ['price', 'price_night', 'total', 'base_salary', 'diligence_bonus', 'bonus_got', 'fine', 'pay_total'];
// Aturan KPI (sama dengan halaman absen): denda per telat, uang kerajinan hangus kalau telat > BATAS_TELAT.
const DENDA_TELAT = 10000;
const BATAS_TELAT = 3;
let current = 'attendance';
let outlets = [];
let adminOutlet = null; // null = semua outlet
let employees = [];
let lastRows = [];

// ---------- Auth ----------
$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  $('#login-status').textContent = 'Memeriksa...';
  const { error } = await sb.auth.signInWithPassword({ email: f.get('email'), password: f.get('password') });
  $('#login-status').textContent = error ? 'Login gagal: email atau password salah.' : '';
});
$('#logout').addEventListener('click', () => sb.auth.signOut());

sb.auth.onAuthStateChange((_evt, session) => {
  const loggedIn = !!session;
  $('#login-view').classList.toggle('hidden', loggedIn);
  $('#app-view').classList.toggle('hidden', !loggedIn);
  $('#userbox').classList.toggle('hidden', !loggedIn);
  $('#user-email').textContent = session?.user?.email || '';
  if (loggedIn) init();
});

// ---------- App ----------
let started = false;
async function init() {
  if (started) return;
  started = true;
  const now = new Date();
  $('#month').value = now.toISOString().slice(0, 7);
  document.querySelectorAll('input[type=date]').forEach((i) => (i.value = now.toISOString().slice(0, 10)));
  const { data: o } = await sb.from('outlets').select('*').eq('active', true).order('id');
  outlets = o || [];
  const ot = $('#otabs');
  ot.innerHTML = outlets.map((x) => `<button data-outlet="${x.id}">${esc(x.name)}</button>`).join('') + '<button data-outlet="">Semua outlet</button>';
  let saved = null;
  try { saved = localStorage.getItem('gw-admin-outlet'); } catch (_) {}
  setOutlet(saved !== null && (saved === '' || outlets.some((x) => String(x.id) === saved)) ? saved : String(outlets[0]?.id ?? ''));
  await loadEmployees();
  load();
}

function setOutlet(v) {
  adminOutlet = v ? Number(v) : null;
  document.querySelectorAll('#otabs button').forEach((b) => b.classList.toggle('active', b.dataset.outlet === (v || '')));
  try { localStorage.setItem('gw-admin-outlet', v || ''); } catch (_) {}
}
$('#otabs').addEventListener('click', (e) => {
  if (e.target.dataset.outlet === undefined) return;
  setOutlet(e.target.dataset.outlet);
  load();
});
// Karyawan yang masuk filter outlet yang sedang dibuka (tanpa outlet = pemilik, hanya di "Semua").
const empInOutlet = (e) => adminOutlet === null || e.outlet_id === adminOutlet;

$('#tabs').addEventListener('click', (e) => {
  const t = e.target.dataset.tab;
  if (!t) return;
  current = t;
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === t));
  document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('hidden', p.dataset.panel !== t));
  load();
});
$('#month').addEventListener('change', load);

async function loadEmployees() {
  const { data } = await sb.from('employees').select('*').order('name');
  employees = data || [];
  document.querySelectorAll('.emp-select').forEach((s) => {
    s.innerHTML = '<option value="">Pilih karyawan</option>' +
      employees.filter((e) => e.active).map((e) => `<option value="${e.id}">${esc(e.name)}</option>`).join('');
  });
}

function monthRange() {
  const m = $('#month').value;
  const [y, mo] = m.split('-').map(Number);
  const end = new Date(y, mo, 1);
  return [m + '-01', end.getFullYear() + '-' + String(end.getMonth() + 1).padStart(2, '0') + '-01'];
}

async function loadPayroll() {
  const [from, to] = monthRange();
  const { data, error } = await sb.from('attendance').select('employee_id,status').gte('date', from).lt('date', to);
  if (error) { $('#app-status').textContent = 'Gagal memuat: ' + error.message; return; }
  $('#app-status').textContent = '';
  lastRows = employees.filter((e) => e.active && empInOutlet(e)).map((e) => {
    const mine = (data || []).filter((r) => r.employee_id === e.id);
    const late = mine.filter((r) => r.status === 'telat').length;
    const present = mine.filter((r) => r.status === 'hadir' || r.status === 'telat').length;
    const base = Number(e.base_salary || 0);
    const bonusGot = late > BATAS_TELAT ? 0 : Number(e.diligence_bonus || 0);
    const fine = late * DENDA_TELAT;
    return { name: e.name, present, late, base_salary: base, bonus_got: bonusGot, fine, pay_total: base + bonusGot - fine };
  });
  render();
}

async function load() {
  const status = $('#app-status');
  status.textContent = 'Memuat...';
  if (current === 'payroll') { await loadEmployees(); return loadPayroll(); }
  let q = sb.from(current).select('*');
  const [from, to] = monthRange();
  if (['attendance', 'sales', 'purchases', 'maintenance'].includes(current)) q = q.gte('date', from).lt('date', to).order('date', { ascending: false });
  if (adminOutlet !== null && ['sales', 'purchases', 'maintenance'].includes(current)) q = q.eq('outlet_id', adminOutlet);
  if (adminOutlet !== null && current === 'products') q = q.or(`outlet_id.eq.${adminOutlet},outlet_id.is.null`);
  else if (current === 'contacts') q = q.gte('created_at', from).lt('created_at', to).order('created_at', { ascending: false });
  else if (current === 'products') q = q.order('sort').order('name');
  else q = q.order('name');
  const { data, error } = await q;
  if (error) { status.textContent = 'Gagal memuat: ' + error.message; return; }
  status.textContent = '';
  const empName = Object.fromEntries(employees.map((e) => [e.id, e.name]));
  let rows = data || [];
  if (current === 'attendance') { const ok = new Set(employees.filter(empInOutlet).map((e) => e.id)); rows = rows.filter((r) => ok.has(r.employee_id)); }
  if (current === 'employees') rows = rows.filter(empInOutlet);
  lastRows = rows.map((r) => ({
    ...r,
    employee: empName[r.employee_id] || '',
    loc_in: r.lat_in != null ? `${r.lat_in},${r.lng_in}` : '',
    loc_out: r.lat_out != null ? `${r.lat_out},${r.lng_out}` : '',
  }));
  if (current === 'attendance') {
    const paths = lastRows.flatMap((r) => [r.photo_in, r.photo_out]).filter(Boolean);
    if (paths.length) {
      const { data: urls } = await sb.storage.from('absen-foto').createSignedUrls(paths, 3600);
      const map = Object.fromEntries((urls || []).map((u) => [u.path, u.signedUrl]));
      lastRows.forEach((r) => { r.photo_in_url = map[r.photo_in]; r.photo_out_url = map[r.photo_out]; });
    }
  }
  if (current === 'maintenance') {
    const paths = lastRows.map((r) => r.photo).filter(Boolean);
    if (paths.length) {
      const { data: urls } = await sb.storage.from('maintenance-foto').createSignedUrls(paths, 3600);
      const map = Object.fromEntries((urls || []).map((u) => [u.path, u.signedUrl]));
      lastRows.forEach((r) => { r.photo_url = map[r.photo]; });
    }
  }
  render();
}

function render() {
  const cols = COLS[current];
  const head = '<tr>' + cols.map(([, l]) => `<th>${l}</th>`).join('') + '<th></th></tr>';
  const body = lastRows.map((r) => '<tr>' + cols.map(([k]) => {
    let v = r[k];
    if (k === 'created_at') v = new Date(v).toLocaleString('id-ID');
    if (current === 'employees' && k === 'outlet_id') return `<td><select class="inline" data-id="${r.id}" data-k="outlet_id" aria-label="Outlet"><option value="">Semua (pemilik)</option>${outlets.map((o) => `<option value="${o.id}"${o.id === v ? ' selected' : ''}>${esc(o.name)}</option>`).join('')}</select></td>`;
    if (current === 'employees' && (k === 'base_salary' || k === 'diligence_bonus')) return `<td><input class="inline" type="number" step="any" data-id="${r.id}" data-k="${k}" value="${esc(v ?? '')}" aria-label="${k}"></td>`;
    if (MONEY.includes(k)) return `<td class="num">${rupiah(v)}</td>`;
    if (k === 'photo_in' || k === 'photo_out' || k === 'photo') {
      const url = r[k + '_url'];
      return url ? `<td><a href="${esc(url)}" target="_blank" rel="noopener"><img class="thumb" src="${esc(url)}" alt="Foto"></a></td>` : '<td>-</td>';
    }
    if ((k === 'loc_in' || k === 'loc_out') && v) return `<td><a href="https://www.google.com/maps?q=${esc(v)}" target="_blank" rel="noopener">Lihat peta</a></td>`;
    return `<td>${esc(v)}</td>`;
  }).join('') + (current === 'payroll' ? '<td></td>' : `<td><button class="del" title="Hapus" data-id="${r.id}">✕</button></td>`) + '</tr>').join('');
  $('#tbl-' + current).innerHTML = head + (body || `<tr><td colspan="${cols.length + 1}">Belum ada data di bulan ini.</td></tr>`);

  const sum = $('#sum-' + current);
  if (!sum) return;
  if (current === 'payroll') {
    const total = lastRows.reduce((a, r) => a + r.pay_total, 0);
    sum.innerHTML = `<div>Karyawan: <b>${lastRows.length}</b></div><div>Total perkiraan gaji: <b>${rupiah(total)}</b></div><div>Aturan: denda ${rupiah(DENDA_TELAT)}/telat, uang kerajinan hangus kalau telat lebih dari ${BATAS_TELAT}x</div>`;
  } else if (current === 'maintenance') {
    const open = lastRows.filter((r) => r.status !== 'selesai').length;
    sum.innerHTML = `<div>Laporan: <b>${lastRows.length}</b></div><div>Belum beres: <b>${open}</b></div>`;
  } else if (current === 'attendance') {
    const c = {};
    lastRows.forEach((r) => (c[r.status] = (c[r.status] || 0) + 1));
    sum.innerHTML = ['hadir', 'telat', 'izin', 'sakit', 'alpha', 'cuti'].map((s) => `<div>${s}: <b>${c[s] || 0}</b></div>`).join('');
  } else {
    const total = lastRows.reduce((a, r) => a + Number(r.total || 0), 0);
    sum.innerHTML = `<div>Jumlah transaksi: <b>${lastRows.length}</b></div><div>Total bulan ini: <b>${rupiah(total)}</b></div>`;
  }
}

document.addEventListener('click', async (e) => {
  const id = e.target.dataset?.id;
  if (!id || !e.target.classList.contains('del')) return;
  if (!confirm('Hapus data ini?')) return;
  const { error } = await sb.from(current).delete().eq('id', id);
  if (error) return ($('#app-status').textContent = 'Gagal menghapus: ' + error.message);
  if (current === 'employees') await loadEmployees();
  load();
});

document.querySelectorAll('form[data-table]').forEach((form) => {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const table = form.dataset.table;
    const row = {};
    new FormData(form).forEach((v, k) => { if (v !== '') row[k] = v; });
    if (adminOutlet !== null && ['sales', 'purchases', 'products', 'employees'].includes(table)) row.outlet_id = adminOutlet;
    const { error } = await sb.from(table).insert(row);
    if (error) return ($('#app-status').textContent = 'Gagal menyimpan: ' + error.message);
    const keepDate = form.querySelector('input[type=date]')?.value;
    form.reset();
    if (keepDate) form.querySelector('input[type=date]').value = keepDate;
    $('#app-status').textContent = 'Tersimpan.';
    if (table === 'employees') await loadEmployees();
    load();
  });
});

$('#export').addEventListener('click', () => {
  const cols = COLS[current];
  const lines = [cols.map(([, l]) => l).join(';')].concat(
    lastRows.map((r) => cols.map(([k]) => '"' + String(r[k] ?? '').replace(/"/g, '""') + '"').join(';'))
  );
  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `laporan-${current}-${$('#month').value}.csv`;
  a.click();
});

// Ubah gaji pokok / uang kerajinan langsung dari tabel Karyawan.
document.addEventListener('change', async (e) => {
  const inp = e.target;
  if (!inp.classList || !inp.classList.contains('inline')) return;
  const { error } = await sb.from('employees').update({ [inp.dataset.k]: inp.value === '' ? null : Number(inp.value) }).eq('id', inp.dataset.id);
  $('#app-status').textContent = error ? 'Gagal menyimpan: ' + error.message : 'Tersimpan.';
  if (!error) { await loadEmployees(); if (inp.dataset.k === 'outlet_id') load(); }
});
