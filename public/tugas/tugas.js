// Tugas Hari Ini: karyawan melihat tugasnya (terlambat & batas hari ini), foto wajib, lalu tandai selesai.
// Tugas harian (kebersihan) boleh dikerjakan siapa saja di outlet, misalnya saat PIC libur.
let employee = null, outlet = null, tasks = [], doneToday = [], current = null, shot = null;
const isBoss = () => !employee.outlet_id;

function mine(t) {
  return isBoss() || t.pic_id === employee.id || t.pic_id == null || isDaily(t);
}

async function load() {
  const d = today();
  const [{ data: ts, error }, { data: dn }] = await Promise.all([
    sb.from('maint_tasks').select('*').eq('outlet_id', outlet.id).eq('active', true).order('sort').order('id'),
    sb.from('maint_done').select('*').eq('outlet_id', outlet.id).eq('done_date', d).order('done_at'),
  ]);
  if (error) { $('msg').textContent = 'Gagal memuat: ' + error.message; return; }
  tasks = (ts || []).filter(mine);
  doneToday = (dn || []).filter((r) => tasks.some((t) => t.id === r.task_id));
  render();
}

function taskRow(t, st) {
  const row = el('div', 'task');
  row.append(el('span', 'chk'));
  const info = el('div', 't');
  info.append(el('b', null, t.machine || t.name));
  const late = st === 'late' ? diffDays(t.next_due, today()) : 0;
  info.append(el('span', 'pill-s ' + st, st === 'late' ? `lewat ${late} hari` : 'batas hari ini'));
  if (t.pic_id && t.pic_id !== employee.id && !isBoss()) info.append(el('span', null, 'tugas teman, boleh dibantu'));
  const b = el('button', 'camb', 'FOTO'); b.type = 'button';
  b.setAttribute('aria-label', 'Foto ' + taskLabel(t));
  b.addEventListener('click', () => start(t));
  row.append(info, b);
  return row;
}

function render() {
  const d = today();
  const open = tasks.filter((t) => ['late', 'due'].includes(taskStatus(t, d)));
  const total = open.length + doneToday.length;
  $('progress-text').textContent = total ? `${doneToday.length} dari ${total} tugas selesai` : 'Tidak ada tugas hari ini';
  $('progress-bar').style.width = total ? `${Math.round(doneToday.length / total * 100)}%` : '100%';
  const list = $('list');
  list.replaceChildren();
  const section = (title, items) => {
    if (!items.length) return;
    list.append(el('div', 'grp', title));
    // Tugas mesin dengan nama sama digabung jadi satu baris yang bisa dibuka.
    const groups = new Map();
    items.forEach((t) => { const k = t.machine ? t.name : 'id' + t.id; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(t); });
    groups.forEach((g) => {
      const st = (t) => taskStatus(t, d);
      if (!g[0].machine) { list.append(taskRow(g[0], st(g[0]))); return; }
      const det = el('details', 'machines');
      const sum = el('summary', 'task');
      sum.append(el('span', 'chk'));
      const info = el('div', 't');
      info.append(el('b', null, `${g[0].name} (${g.length} mesin)`), el('span', null, g.map((t) => t.machine.replace(/^\D+/, '')).join(', ') + ' · ketuk untuk buka'));
      sum.append(info, el('span', 'pill-s ' + st(g[0]), '▼'));
      det.append(sum, ...g.map((t) => taskRow(t, st(t))));
      list.append(det);
    });
  };
  section('Terlambat', open.filter((t) => taskStatus(t, d) === 'late'));
  section('Batas hari ini', open.filter((t) => taskStatus(t, d) === 'due'));
  if (doneToday.length) {
    list.append(el('div', 'grp', 'Sudah selesai hari ini'));
    doneToday.forEach((r) => {
      const t = tasks.find((x) => x.id === r.task_id);
      const row = el('div', 'task');
      const c = el('span', 'chk on');
      const info = el('div', 't');
      info.append(el('b', null, taskLabel(t)), el('span', null, `${jam(r.done_at)} · ${r.done_by || ''}${r.note ? ' · "' + r.note + '"' : ''}`));
      row.append(c, info);
      list.append(row);
    });
  }
  const soon = tasks.filter((t) => taskStatus(t, d) === 'later' && diffDays(d, t.next_due) <= 7);
  if (soon.length) {
    list.append(el('div', 'grp', 'Minggu ini'));
    const names = new Map();
    soon.forEach((t) => { const k = t.name; const v = names.get(k) || { n: 0, due: t.next_due }; v.n++; if (t.next_due < v.due) v.due = t.next_due; names.set(k, v); });
    names.forEach((v, k) => {
      const row = el('div', 'task');
      const info = el('div', 't');
      info.append(el('b', null, v.n > 1 ? `${k} (${v.n} mesin)` : k), el('span', null, `mulai ${HARI[parseD(v.due).getDay()]}, ${tgl(v.due)}`));
      row.append(el('span', 'chk'), info);
      list.append(row);
    });
  }
  if (!list.children.length) list.append(el('p', 'msg', 'Belum ada tugas. Minta pemilik mengatur PIC & batas pertama di Pantau Tugas.'));
}

function start(t) { current = t; shot = null; $('photo').value = ''; $('photo').click(); }

$('photo').addEventListener('change', async () => {
  const file = $('photo').files[0];
  if (!file || !current) return;
  $('sheet-title').textContent = taskLabel(current);
  $('preview').src = URL.createObjectURL(file);
  $('note').value = $('note').value || '';
  $('sheet').classList.remove('hidden');
  $('save').disabled = true;
  $('photo-warn').classList.add('hidden');
  try {
    const q = await checkPhoto(file);
    if (!q.ok) { $('photo-warn').textContent = q.why; $('photo-warn').classList.remove('hidden'); return; }
  } catch (_) { /* kalau gagal dicek, tetap boleh disimpan */ }
  shot = file;
  $('save').disabled = false;
});
$('retake').addEventListener('click', () => { $('photo').value = ''; $('photo').click(); });
$('cancel').addEventListener('click', close);
function close() { $('sheet').classList.add('hidden'); $('note').value = ''; current = null; shot = null; }

$('save').addEventListener('click', async () => {
  if (!shot || !current) return;
  const t = current;
  $('save').disabled = true; $('save').textContent = 'MENYIMPAN...';
  try {
    const blob = await shrinkPhoto(shot);
    const path = `tugas/${today()}/${t.id}-${employee.id}-${Date.now()}.jpg`;
    const up = await sb.storage.from('maintenance-foto').upload(path, blob, { contentType: 'image/jpeg' });
    if (up.error) throw up.error;
    const d = today();
    const note = $('note').value.trim();
    const ins = await sb.from('maint_done').insert({
      task_id: t.id, outlet_id: outlet.id, due_date: t.next_due, done_date: d,
      done_by_id: employee.id, done_by: employee.name, photo: path, note: note || null,
      late: !!t.next_due && d > t.next_due,
    });
    if (ins.error) throw ins.error;
    const upd = await sb.from('maint_tasks').update({ next_due: nextDue(t, d) }).eq('id', t.id);
    if (upd.error) throw upd.error;
    close();
    $('msg').textContent = 'Tersimpan ✓';
    await load();
  } catch (err) {
    $('msg').textContent = 'Gagal menyimpan: ' + (err.message || err);
  } finally {
    $('save').textContent = 'SIMPAN';
    $('save').disabled = !shot;
  }
});

(async () => {
  employee = await requireEmployee();
  if (!employee) return;
  outlet = await currentOutlet(employee);
  if (!outlet) return;
  $('outlet-name').textContent = 'OUTLET: ' + outlet.name;
  load();
})();
