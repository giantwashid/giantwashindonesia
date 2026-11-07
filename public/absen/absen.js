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
$('logout2').addEventListener('click', () => sb.auth.signOut());

sb.auth.onAuthStateChange((_e, session) => {
  if (!session) { location.href = '/karyawan/'; return; }
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

// ---------- Kamera selfie + lokasi ----------
let stream = null;
let shot = null;   // foto (Blob) yang sudah diambil
let pos = null;    // lokasi GPS

function stopCam() {
  if (stream) stream.getTracks().forEach((t) => t.stop());
  stream = null;
}

function closeCam() {
  stopCam();
  shot = null;
  $('cam').classList.add('hidden');
  $('action').classList.remove('hidden');
}

function findLocation() {
  pos = null;
  $('loc').textContent = 'Mencari lokasi...';
  if (!navigator.geolocation) { $('loc').textContent = 'HP ini tidak mendukung lokasi.'; return; }
  navigator.geolocation.getCurrentPosition(
    (p) => { pos = p.coords; $('loc').textContent = `Lokasi ditemukan (akurasi ±${Math.round(p.coords.accuracy)} m)`; },
    () => { $('loc').textContent = 'Lokasi tidak bisa dibaca. Nyalakan GPS/Lokasi dan izinkan browser, lalu tekan BATAL dan coba lagi.'; },
    { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
  );
}

async function startVideo() {
  shot = null;
  $('preview').classList.add('hidden');
  $('video').classList.remove('hidden');
  $('cam-shot').textContent = 'AMBIL FOTO';
  $('cam-cancel').textContent = 'BATAL';
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 720 } }, audio: false });
    $('video').srcObject = stream;
    $('cam-shot').disabled = false;
  } catch (err) {
    $('cam-shot').disabled = true;
    $('msg').textContent = 'Kamera tidak bisa dibuka. Izinkan akses kamera untuk browser ini, lalu coba lagi.';
  }
}

$('action').addEventListener('click', () => {
  $('msg').textContent = '';
  $('cam-title').textContent = todayRow ? 'SELFIE ABSEN PULANG' : 'SELFIE ABSEN MASUK';
  $('action').classList.add('hidden');
  $('cam').classList.remove('hidden');
  findLocation();
  startVideo();
});

$('cam-cancel').addEventListener('click', () => {
  if (shot) startVideo();   // ULANGI foto
  else closeCam();          // BATAL
});

$('cam-shot').addEventListener('click', async () => {
  if (!shot) {
    const v = $('video');
    if (!v.videoWidth) return;
    const w = 600, h = Math.round((v.videoHeight / v.videoWidth) * w);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.translate(w, 0); ctx.scale(-1, 1); // sama seperti yang terlihat di layar
    ctx.drawImage(v, 0, 0, w, h);
    shot = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.8));
    stopCam();
    $('preview').src = URL.createObjectURL(shot);
    $('preview').classList.remove('hidden');
    $('video').classList.add('hidden');
    $('cam-shot').textContent = 'KIRIM ABSEN';
    $('cam-cancel').textContent = 'ULANGI';
    return;
  }
  if (!pos) { $('msg').textContent = 'Lokasi belum ditemukan. Tunggu sebentar, atau nyalakan GPS/Lokasi.'; findLocation(); return; }
  submit();
});

async function submit() {
  const btn = $('cam-shot');
  btn.disabled = true;
  $('msg').textContent = 'Mengirim foto...';
  const kind = todayRow ? 'pulang' : 'masuk';
  const path = `${employee.id}/${today()}-${kind}-${Date.now()}.jpg`;
  const up = await sb.storage.from('absen-foto').upload(path, shot, { contentType: 'image/jpeg' });
  if (up.error) { $('msg').textContent = 'Gagal kirim foto: ' + up.error.message; btn.disabled = false; return; }
  const t = nowHM();
  let res;
  if (!todayRow) {
    res = await sb.from('attendance').insert({
      employee_id: employee.id, date: today(), check_in: t, status: t > JAM_MASUK ? 'telat' : 'hadir',
      photo_in: path, lat_in: pos.latitude, lng_in: pos.longitude,
    });
  } else {
    res = await sb.from('attendance').update({ check_out: t, photo_out: path, lat_out: pos.latitude, lng_out: pos.longitude }).eq('id', todayRow.id);
  }
  btn.disabled = false;
  if (res.error) { $('msg').textContent = 'Gagal: ' + res.error.message; return; }
  closeCam();
  $('msg').textContent = todayRow ? `Pulang tercatat ${t}. Hati-hati di jalan!` : `Masuk tercatat ${t}. Semangat!`;
  refresh();
}
