// Menu karyawan: login sekali, lalu pilih halaman kerja.
function show(view) {
  ['login-view', 'app-view', 'nolink-view'].forEach((v) => $(v).classList.toggle('hidden', v !== view));
}

$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  $('login-msg').textContent = 'Memeriksa...';
  const id = String(f.get('email')).trim();
  let email = id;
  if (!id.includes('@')) {
    const { data } = await sb.rpc('login_email', { u: id });
    if (!data) { $('login-msg').textContent = 'Username tidak ditemukan.'; return; }
    email = data;
  }
  const { error } = await sb.auth.signInWithPassword({ email, password: f.get('password') });
  $('login-msg').textContent = error ? 'Username/email atau password salah.' : '';
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
  const isOwner = /owner|pemilik|accounting|akuntan|supervisor|spv/i.test(data.position || '');
  $('owner-tile').classList.toggle('hidden', !isOwner);
  document.querySelectorAll('.boss').forEach((t) => t.classList.toggle('hidden', !isOwner && !['owner', 'manager'].includes(data.role)));
  await setupOutlets(data);
  show('app-view');
}

// Karyawan satu outlet: langsung ke outletnya. Pemilik / tanpa outlet: pilih lewat tab outlet.
async function setupOutlets(emp) {
  const { data } = await sb.from('outlets').select('*').eq('active', true).order('id');
  const outlets = data || [];
  const tabs = $('otabs');
  const pick = (id) => {
    const o = outlets.find((x) => x.id === id);
    $('outlet-label').textContent = o ? 'OUTLET: ' + o.name : '';
    document.querySelectorAll('[data-page]').forEach((a) => { a.href = a.dataset.page + '?outlet=' + id; });
    tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('on', Number(b.dataset.id) === id));
    try { localStorage.setItem('gw-outlet', String(id)); } catch (_) {}
  };
  if (emp.outlet_id) { tabs.classList.add('hidden'); pick(emp.outlet_id); return; }
  tabs.replaceChildren(...outlets.map((o) => {
    const b = el('button', 'otab', o.name); b.type = 'button'; b.dataset.id = o.id;
    b.addEventListener('click', () => pick(o.id));
    return b;
  }));
  tabs.classList.remove('hidden');
  let saved = null;
  try { saved = Number(localStorage.getItem('gw-outlet')); } catch (_) {}
  pick(outlets.some((o) => o.id === saved) ? saved : (outlets[0] && outlets[0].id));
}
