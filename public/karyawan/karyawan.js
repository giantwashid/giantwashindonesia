// Menu karyawan: login sekali, lalu pilih halaman kerja.
function show(view) {
  ['login-view', 'app-view', 'nolink-view'].forEach((v) => $(v).classList.toggle('hidden', v !== view));
}

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
  if (!session) { show('login-view'); return; }
  setTimeout(() => load(session.user.email), 0);
});

async function load(email) {
  const { data } = await sb.from('employees').select('*').ilike('email', email).eq('active', true).maybeSingle();
  if (!data) { $('nolink-email').textContent = email; show('nolink-view'); return; }
  $('emp-name').textContent = data.name.split(' ')[0];
  const isOwner = /owner|pemilik/i.test(data.position || '');
  $('owner-tile').classList.toggle('hidden', !isOwner);
  show('app-view');
}
