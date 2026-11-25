// Employee home: sign in once, then pick a page.
// Order: dashboards (all outlets + one per outlet, owner/manager only), Attendance, Task Monitoring, Report Panel.
function show(view) {
  ['login-view', 'app-view', 'nolink-view'].forEach((v) => $(v).classList.toggle('hidden', v !== view));
}

$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  $('login-msg').textContent = 'Checking...';
  const id = String(f.get('email')).trim();
  let email = id;
  if (!id.includes('@')) {
    const { data } = await sb.rpc('login_email', { u: id });
    if (!data) { $('login-msg').textContent = 'Username not found.'; return; }
    email = data;
  }
  const { error } = await sb.auth.signInWithPassword({ email, password: f.get('password') });
  $('login-msg').textContent = error ? 'Wrong username/email or password.' : '';
});
document.querySelectorAll('[data-logout]').forEach((b) => b.addEventListener('click', () => sb.auth.signOut()));

sb.auth.onAuthStateChange((_e, session) => {
  if (!session) { show('login-view'); return; }
  setTimeout(() => load(session.user.email), 0);
});

async function load(email) {
  const { data } = await sb.from('employees').select('*').ilike('email', email).eq('active', true).maybeSingle();
  if (!data) { $('nolink-email').textContent = email; show('nolink-view'); return; }
  $('emp-name').textContent = data.name;
  const words = String(data.name || '').trim().split(/\s+/).filter(Boolean);
  $('avatar').textContent = ((words[0] || '?')[0] + (words.length > 1 ? words[words.length - 1][0] : '')).toUpperCase();
  const h = new Date().getHours();
  $('greet').textContent = h >= 4 && h < 11 ? 'Good morning,' : h >= 11 && h < 15 ? 'Good afternoon,' : h >= 15 && h < 18 ? 'Good evening,' : 'Good night,';

  const isAdmin = /owner|pemilik|accounting|akuntan|supervisor|spv/i.test(data.position || '');
  const isBoss = isAdmin || ['owner', 'manager'].includes(data.role);
  $('owner-tile').classList.toggle('hidden', !isAdmin);
  document.querySelectorAll('.boss').forEach((t) => t.classList.toggle('hidden', !isBoss));

  const { data: od } = await sb.from('outlets').select('*').eq('active', true).order('id');
  const outlets = od || [];
  // Dashboards: owner/manager only. A manager tied to one outlet sees only that outlet.
  const canAll = data.role === 'owner' || (data.role === 'manager' && !data.outlet_id);
  const dash = data.role === 'owner' || data.role === 'manager'
    ? [...(canAll ? [{ id: 'all', name: 'All Outlets', area: 'Combined view of every outlet' }] : []),
       ...outlets.filter((o) => canAll || o.id === data.outlet_id)]
    : [];
  $('dash-card').classList.toggle('hidden', !dash.length);
  $('dash-list').replaceChildren(...dash.map((o, i) => {
    const a = el('a', 'drow' + (i === 0 && o.id === 'all' ? ' main' : ''));
    a.href = '/dashboard/?outlet=' + o.id;
    const t = el('span', 'dtxt');
    t.append(el('b', null, 'Dashboard: ' + o.name), el('small', null, o.area || 'Outlet dashboard'));
    const go = el('span', 'arrow'); go.setAttribute('aria-hidden', 'true');
    go.innerHTML = '<svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"></path></svg>';
    a.append(t, go);
    return a;
  }));

  // Pages that need an outlet (Task Monitoring): the employee's outlet, else the last used, else the first.
  let saved = null;
  try { saved = Number(localStorage.getItem('gw-outlet')); } catch (_) {}
  const oid = data.outlet_id || (outlets.some((o) => o.id === saved) ? saved : outlets[0] && outlets[0].id);
  if (oid) document.querySelectorAll('[data-page]').forEach((a) => { a.href = a.dataset.page + '?outlet=' + oid; });
  show('app-view');
}
