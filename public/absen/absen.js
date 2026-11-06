// Halaman absen karyawan (gaya 5). Data disimpan di Supabase.
const SUPABASE_URL = 'https://oaxrqjbqtiibiqhsnvlt.supabase.co';
const SUPABASE_KEY = 'sb_publishable_OXzFWfF0lhf866nnu_9Z-Q_-WfZzDG8';
const JAM_MASUK = '08:00'; // lewat jam ini dianggap telat

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, '0');
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const nowHM = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const hm = (t) => (t ? String(t).slice(0, 5) : '--:--');
const HARI = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

let employee = null;
let todayRow = null;

function show(view) {
  ['login-view', 'app-view', 'nolink-view'].forEach((v) => $(v).classList.toggle('hidden', v !== view));
}

function tick() {
  const d = new Date();
  $('time').textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  $('date').textContent = d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
}
setInterval(tick, 1000);
tick();

$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  $('login-msg').textContent = 'Memeriksa...';
  const { error } = await sb.auth.signInWithPassword({ email: f.get('email'), password: f.get('password') });
  $('login-msg').textContent = error ? 'Email atau password salah.' : '';
});
$('logout').addEventListener('click', () => sb.auth.signOut());
$('logout2').addEventListener('click', () => sb.auth.signOut());

sb.auth.onAuthStateChange((_e, session) => {
  if (!session) { employee = null; show('login-view'); return; }
  setTimeout(() => loadEmployee(session.user.email), 0);
});

async function loadEmployee(email) {
  const { data, error } = await sb.from('employees').select('*').ilike('email', email).eq('active', true).maybeSingle();
  if (error || !data) { $('nolink-email').textContent = email; show('nolink-view'); return; }
  employee = data;
  $('emp-name').textContent = data.name.split(' ')[0];
  show('app-view');
  refresh();
}

async function refresh() {
  const { data, error } = await sb.from('attendance').select('*')
    .eq('employee_id', employee.id).order('date', { ascending: false }).limit(8);
  if (error) { $('msg').textContent = 'Gagal memuat: ' + error.message; return; }
  todayRow = (data || []).find((r) => r.date === today()) || null;
  $('in').textContent = hm(todayRow?.check_in);
  $('out').textContent = hm(todayRow?.check_out);

  const btn = $('action');
  btn.classList.remove('pulang');
  if (!todayRow) { btn.textContent = 'ABSEN MASUK'; btn.disabled = false; }
  else if (!todayRow.check_in) { btn.textContent = `SUDAH TERCATAT: ${todayRow.status.toUpperCase()}`; btn.disabled = true; }
  else if (!todayRow.check_out) { btn.textContent = 'ABSEN PULANG'; btn.disabled = false; btn.classList.add('pulang'); }
  else { btn.textContent = 'SELESAI HARI INI'; btn.disabled = true; }

  const hist = $('history');
  hist.replaceChildren();
  const past = (data || []).filter((r) => r.date !== today()).slice(0, 5);
  if (!past.length) { const p = document.createElement('div'); p.className = 'row'; p.textContent = 'Belum ada riwayat.'; hist.append(p); }
  past.forEach((r) => {
    const d = new Date(r.date + 'T00:00:00');
    const row = document.createElement('div'); row.className = 'row';
    const left = document.createElement('b'); left.textContent = `${HARI[d.getDay()]} ${d.getDate()} ${BULAN[d.getMonth()]}`;
    const right = document.createElement('span');
    right.textContent = r.check_in ? `${hm(r.check_in)} – ${hm(r.check_out)}` : r.status;
    if (r.status !== 'hadir') right.className = 'tag';
    row.append(left, right); hist.append(row);
  });
}

$('action').addEventListener('click', async () => {
  const btn = $('action');
  btn.disabled = true;
  $('msg').textContent = 'Menyimpan...';
  const t = nowHM();
  let res;
  if (!todayRow) {
    res = await sb.from('attendance').insert({ employee_id: employee.id, date: today(), check_in: t, status: t > JAM_MASUK ? 'telat' : 'hadir' });
  } else {
    res = await sb.from('attendance').update({ check_out: t }).eq('id', todayRow.id);
  }
  $('msg').textContent = res.error ? 'Gagal: ' + res.error.message : (todayRow ? `Pulang tercatat ${t}. Hati-hati di jalan!` : `Masuk tercatat ${t}. Semangat!`);
  refresh();
});
