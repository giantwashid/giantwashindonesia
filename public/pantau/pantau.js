// Pantau Tugas: owner & supervisor melihat tugas dikerjakan atau tidak, foto, catatan, kinerja per karyawan,
// dan mengatur PIC, interval, serta batas pertama tiap tugas.
let me = null, outlet = null, tasks = [], logs = [], emps = [], canEdit = false, selected = null;
const empName = (id) => (emps.find((e) => e.id === id) || {}).name || '';
const first = (s) => String(s || '').split(' ')[0];

(async () => {
  me = await requireEmployee();
  if (!me) return;
  const pos = me.position || '';
  const canView = ['owner', 'manager'].includes(me.role) || /owner|pemilik|supervisor|spv|accounting|akuntan/i.test(pos);
  canEdit = me.role === 'owner' || /owner|pemilik|supervisor|spv/i.test(pos);
  if (!canView) { $('noaccess').classList.remove('hidden'); return; }
  outlet = await currentOutlet(me);
  if (!outlet) return;
  $('outlet-name').textContent = 'OUTLET: ' + outlet.name;
  $('settings-card').classList.toggle('hidden', !canEdit);
  $('board').classList.remove('hidden');
  load();
})();

async function load() {
  const from = plusDays(today(), -30);
  const [a, b, c] = await Promise.all([
    sb.from('maint_tasks').select('*').eq('outlet_id', outlet.id).eq('active', true).order('sort').order('id'),
    sb.from('maint_done').select('*').eq('outlet_id', outlet.id).gte('done_date', from).order('done_at', { ascending: false }).limit(1000),
    sb.from('employees').select('id,name,outlet_id,active'),
  ]);
  if (a.error) { $('msg').textContent = 'Gagal memuat: ' + a.error.message; return; }
  tasks = a.data || []; logs = b.data || []; emps = c.data || [];
  render();
}

// Kelompok: tugas mesin dengan nama sama jadi satu baris (mis. Drain pump 10 washer).
function groups() {
  const m = new Map();
  tasks.forEach((t) => { const k = t.machine ? 'g:' + t.name : 'id' + t.id; if (!m.has(k)) m.set(k, { key: k, name: t.name, items: [] }); m.get(k).items.push(t); });
  return [...m.values()];
}
const lastLog = (t) => logs.find((l) => l.task_id === t.id);
function scheduled(t, day) {
  if (day < String(t.created_at).slice(0, 10)) return false;
  if (t.weekdays && t.weekdays.length) return t.weekdays.includes(parseD(day).getDay());
  return t.interval_days === 1;
}
function cell(t, day, d) {
  if (logs.some((l) => l.task_id === t.id && l.done_date === day)) return 'd';
  const overdue = t.next_due && day >= t.next_due && day <= d;
  if (day === d && (overdue || scheduled(t, day))) return 't';
  if (day < d && (overdue || scheduled(t, day))) return 'l';
  return scheduled(t, day) ? 'e' : 'n';
}
function statusText(t, d) {
  const s = taskStatus(t, d);
  if (s === 'late') return ['late', `terlambat ${diffDays(t.next_due, d)} hari`];
  if (s === 'due') return ['due', 'batas hari ini'];
  if (s === 'unset') return ['unset', 'batas belum diatur'];
  return ['later', 'berikut ' + tgl(t.next_due)];
}

function render() {
  const d = today();
  const st = tasks.map((t) => taskStatus(t, d));
  const k = (cls, n, label) => { const x = el('div', 'kpi ' + cls); x.append(el('b', null, String(n)), el('span', null, label)); return x; };
  $('kpis').replaceChildren(
    k(st.includes('late') ? 'alert' : '', st.filter((s) => s === 'late').length, 'terlambat sekarang'),
    k('hi', st.filter((s) => s === 'due').length, 'batas hari ini, belum'),
    k('', logs.filter((l) => l.done_date === d).length, 'selesai hari ini'),
    k('', st.filter((s) => s === 'unset').length, 'batas belum diatur'),
  );
  renderWeek(d); renderPics(d); if (canEdit) renderSettings();
  if (selected) showDetail(selected);
}

function renderWeek(d) {
  const days = [...Array(7)].map((_, i) => plusDays(d, i - 6));
  const tbl = $('week');
  tbl.replaceChildren();
  const hr = el('tr');
  hr.append(el('th', null, 'Tugas'), el('th', null, 'PIC'), ...days.map((x) => { const th = el('th', 'c', HARI[parseD(x).getDay()]); th.title = tgl(x); return th; }), el('th', null, 'Status'), el('th', null, 'Terakhir'));
  tbl.append(hr);
  groups().forEach((g) => {
    const tr = el('tr', 'click' + (selected === g.key ? ' sel' : ''));
    tr.tabIndex = 0;
    const pics = [...new Set(g.items.map((t) => first(empName(t.pic_id)) || '-'))];
    tr.append(el('td', null, g.items[0].machine ? `${g.name} (${g.items.length} mesin)` : g.name), el('td', null, pics.length > 2 ? pics.slice(0, 2).join(', ') + '…' : pics.join(', ')));
    days.forEach((day) => {
      const td = el('td', 'c');
      if (g.items[0].machine) {
        const n = logs.filter((l) => l.done_date === day && g.items.some((t) => t.id === l.task_id)).length;
        const cs = g.items.map((t) => cell(t, day, d));
        if (n) td.append(el('b', 'dotn', String(n)));
        else td.append(el('i', 'dot ' + (cs.includes('l') ? 'l' : cs.includes('t') ? 't' : 'e')));
      } else td.append(el('i', 'dot ' + cell(g.items[0], day, d)));
      tr.append(td);
    });
    const stc = el('td');
    if (g.items[0].machine) {
      const s = g.items.map((t) => taskStatus(t, d));
      const parts = [];
      const nl = s.filter((x) => x === 'late').length, nd = s.filter((x) => x === 'due').length, nu = s.filter((x) => x === 'unset').length;
      if (nl) parts.push(['late', nl + ' terlambat']);
      if (nd) parts.push(['due', nd + ' hari ini']);
      if (nu) parts.push(['unset', nu + ' belum diatur']);
      if (!parts.length) { const nx = g.items.map((t) => t.next_due).sort()[0]; parts.push(['later', 'beres · berikut ' + tgl(nx)]); }
      parts.forEach(([c, txt]) => { stc.append(el('span', 'pill-s ' + c, txt), ' '); });
    } else { const [c, txt] = statusText(g.items[0], d); stc.append(el('span', 'pill-s ' + c, txt)); }
    tr.append(stc);
    const ll = logs.find((l) => g.items.some((t) => t.id === l.task_id));
    tr.append(el('td', null, ll ? `${tgl(ll.done_date)} ${jam(ll.done_at)} · ${first(ll.done_by)}` : '-'));
    const open = () => { selected = selected === g.key ? null : g.key; renderWeek(d); if (selected) showDetail(g.key); else $('detail').classList.add('hidden'); };
    tr.addEventListener('click', open);
    tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });
    tbl.append(tr);
  });
}

async function showDetail(key) {
  const g = groups().find((x) => x.key === key);
  const box = $('detail');
  if (!g) { box.classList.add('hidden'); return; }
  const d = today();
  box.replaceChildren(el('span', 'h', g.items[0].machine ? `${g.name} · per mesin` : g.name));
  if (g.items[0].machine) {
    const t = el('table', 'grid');
    const hr = el('tr'); ['Mesin', 'PIC', 'Terakhir', 'Oleh', 'Batas', 'Status'].forEach((h) => hr.append(el('th', null, h))); t.append(hr);
    g.items.forEach((x) => {
      const l = lastLog(x); const [c, txt] = statusText(x, d);
      const tr = el('tr');
      const s = el('td'); s.append(el('span', 'pill-s ' + c, txt));
      tr.append(el('td', null, x.machine), el('td', null, first(empName(x.pic_id)) || '-'), el('td', null, l ? tgl(l.done_date) : '-'), el('td', null, l ? first(l.done_by) : '-'), el('td', null, tgl(x.next_due)), s);
      t.append(tr);
    });
    const w = el('div', 'tw'); w.append(t); box.append(w);
  }
  const ls = logs.filter((l) => g.items.some((t) => t.id === l.task_id)).slice(0, 12);
  const grid = el('div', 'logs');
  if (!ls.length) box.append(el('p', 'msg', 'Belum ada foto dalam 30 hari terakhir.'));
  else {
    const { data: s } = await sb.storage.from('maintenance-foto').createSignedUrls(ls.map((l) => l.photo), 3600);
    const urls = Object.fromEntries((s || []).map((u) => [u.path, u.signedUrl]));
    ls.forEach((l) => {
      const t = tasks.find((x) => x.id === l.task_id);
      const c = el('div', 'log');
      const a = el('a'); a.href = urls[l.photo] || '#'; a.target = '_blank'; a.rel = 'noopener';
      const im = el('img'); im.src = urls[l.photo] || ''; im.alt = 'Foto ' + taskLabel(t); a.append(im);
      c.append(a, el('b', null, (t.machine || t.name) + (l.late ? ' · telat' : '')), el('span', null, `${tgl(l.done_date)} ${jam(l.done_at)} · ${first(l.done_by)}`));
      if (l.note) c.append(el('span', null, '"' + l.note + '"'));
      grid.append(c);
    });
    box.append(grid);
  }
  box.classList.remove('hidden');
}

function renderPics(d) {
  const ids = new Set([...logs.map((l) => l.done_by_id), ...tasks.map((t) => t.pic_id)].filter(Boolean));
  const rows = [...ids].map((id) => {
    const mine = logs.filter((l) => l.done_by_id === id);
    const ontime = mine.filter((l) => !l.late).length;
    const lateNow = tasks.filter((t) => t.pic_id === id && taskStatus(t, d) === 'late').length;
    const base = mine.length + lateNow;
    return { id, name: empName(id) || (mine[0] && mine[0].done_by) || '?', done: mine.length, late: mine.length - ontime, lateNow, pct: base ? Math.round(ontime / base * 100) : null };
  }).sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1));
  const box = $('pics');
  box.replaceChildren();
  if (!rows.length) { box.append(el('p', 'msg', 'Belum ada data. Atur PIC di bagian Pengaturan.')); return; }
  rows.forEach((r) => {
    const row = el('div', 'picrow');
    const n = el('div', null, first(r.name));
    n.append(el('small', null, `${r.done} selesai · ${r.late} telat${r.lateNow ? ' · ' + r.lateNow + ' tertunda' : ''}`));
    const bar = el('div', 'bar'); const i = el('i'); i.style.width = (r.pct ?? 0) + '%'; bar.append(i);
    row.append(n, bar, el('b', null, r.pct == null ? '-' : r.pct + '%'));
    box.append(row);
  });
}

// ---------- Pengaturan ----------
const openGroups = new Set(); // grup mesin yang sedang dibuka, tetap terbuka setelah simpan
function picSelect(value, onChange) {
  const s = el('select');
  const opts = [{ id: '', name: '— belum ada PIC —' }, ...emps.filter((e) => e.active && (!e.outlet_id || e.outlet_id === outlet.id))];
  opts.forEach((e) => { const o = el('option', null, e.name); o.value = e.id; s.append(o); });
  s.value = value ?? '';
  s.setAttribute('aria-label', 'PIC');
  s.addEventListener('change', () => onChange(s.value === '' ? null : Number(s.value)));
  return s;
}
function dateInput(value, onChange) {
  const i = el('input'); i.type = 'date'; i.value = value || ''; i.setAttribute('aria-label', 'Batas berikutnya');
  i.addEventListener('change', () => onChange(i.value || null));
  return i;
}
function ivInput(t, onChange) {
  if (t.weekdays && t.weekdays.length) return el('span', null, freqText(t));
  const i = el('input'); i.type = 'number'; i.min = 1; i.value = t.interval_days || 1; i.style.width = '70px';
  i.setAttribute('aria-label', 'Interval (hari)');
  i.addEventListener('change', () => { const v = Math.max(1, Number(i.value) || 1); onChange(v); });
  const w = el('span'); w.append(i, ' hari'); return w;
}
async function save(ids, patch, note) {
  const { error } = await sb.from('maint_tasks').update(patch).in('id', ids);
  if (error) { $('msg').textContent = 'Gagal menyimpan: ' + error.message; return; }
  tasks.forEach((t) => { if (ids.includes(t.id)) Object.assign(t, patch); });
  $('msg').textContent = (note || 'Tersimpan') + ' ✓';
  render();
}

function renderSettings() {
  const box = $('settings');
  const openKeys = openGroups;
  box.replaceChildren();
  const t = el('table', 'grid');
  const hr = el('tr'); ['Tugas', 'PIC', 'Interval', 'Batas berikutnya'].forEach((h) => hr.append(el('th', null, h))); t.append(hr);
  const row = (label, a, b, c, cls) => { const tr = el('tr', cls); const td = el('td'); td.append(label); tr.append(td); [a, b, c].forEach((x) => { const z = el('td'); z.append(x); tr.append(z); }); return tr; };
  groups().forEach((g) => {
    const ids = g.items.map((x) => x.id);
    const one = g.items[0];
    if (!one.machine) {
      t.append(row(g.name, picSelect(one.pic_id, (v) => save(ids, { pic_id: v })), ivInput(one, (v) => save(ids, { interval_days: v })), dateInput(one.next_due, (v) => save(ids, { next_due: v }))));
      return;
    }
    const same = (k) => g.items.every((x) => x[k] === one[k]) ? one[k] : undefined;
    const lbl = el('span');
    const tog = el('button', 'small-btn', openKeys.has(g.key) ? '▲ tutup' : `▼ ${g.items.length} mesin`); tog.type = 'button';
    lbl.append(el('b', null, g.name + ' '), tog);
    const head = row(lbl,
      picSelect(same('pic_id') ?? '', (v) => save(ids, { pic_id: v }, `PIC ${g.name} semua mesin`)),
      ivInput(one, (v) => save(ids, { interval_days: v }, `Interval ${g.name} semua mesin`)),
      dateInput(same('next_due') ?? '', (v) => save(ids, { next_due: v }, `Batas ${g.name} semua mesin`)), 'head');
    if (same('pic_id') === undefined) head.children[1].append(el('div', 'saved', 'berbeda per mesin'));
    if (same('next_due') === undefined) head.children[3].append(el('div', 'saved', 'berbeda per mesin'));
    t.append(head);
    const sub = g.items.map((x) => row('   ' + x.machine, picSelect(x.pic_id, (v) => save([x.id], { pic_id: v })), el('span', null, ''), dateInput(x.next_due, (v) => save([x.id], { next_due: v }))));
    sub.forEach((r) => { r.dataset.grp = g.key; r.classList.toggle('hidden', !openKeys.has(g.key)); t.append(r); });
    tog.addEventListener('click', () => {
      const open = !openKeys.has(g.key);
      if (open) openKeys.add(g.key); else openKeys.delete(g.key);
      sub.forEach((r) => r.classList.toggle('hidden', !open));
      tog.textContent = open ? '▲ tutup' : `▼ ${g.items.length} mesin`;
    });
  });
  const w = el('div', 'tw'); w.append(t); box.append(w);
}
