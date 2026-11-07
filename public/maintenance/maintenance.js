// Karyawan melapor mesin rusak / servis. Masuk ke tabel maintenance (Panel Laporan, menu Maintenance).
let employee = null;
let outlet = null;
const form = $('form');

async function loadList() {
  const { data } = await sb.from('maintenance').select('*').eq('outlet_id', outlet.id)
    .order('created_at', { ascending: false }).limit(10);
  const rows = data || [];
  const paths = rows.map((r) => r.photo).filter(Boolean);
  let urls = {};
  if (paths.length) {
    const { data: s } = await sb.storage.from('maintenance-foto').createSignedUrls(paths, 3600);
    urls = Object.fromEntries((s || []).map((u) => [u.path, u.signedUrl]));
  }
  const list = $('list');
  list.replaceChildren();
  rows.forEach((r) => {
    const it = el('div', 'item');
    const top = el('div', 'row');
    top.append(el('b', null, r.machine), el('span', 'badge ' + (r.status === 'selesai' ? 'selesai' : 'rusak'), r.status === 'selesai' ? 'Sudah beres' : 'Belum beres'));
    const sub = el('div', 'row');
    sub.append(el('span', null, `${r.date} · ${r.kind || ''}`), el('span', null, r.reported_by || ''));
    it.append(top, sub, el('p', null, r.description || ''));
    if (urls[r.photo]) { const im = el('img', 'thumb'); im.src = urls[r.photo]; im.alt = 'Foto ' + r.machine; it.append(im); }
    if (r.status !== 'selesai') {
      const b = el('button', 'small-btn', 'Tandai sudah beres');
      b.type = 'button';
      b.addEventListener('click', async () => {
        b.disabled = true;
        const { error } = await sb.from('maintenance').update({ status: 'selesai', fixed_at: new Date().toISOString(), fixed_by: employee.name }).eq('id', r.id);
        if (error) { $('msg').textContent = 'Gagal: ' + error.message; b.disabled = false; return; }
        loadList();
      });
      it.append(b);
    }
    list.append(it);
  });
  if (!rows.length) list.append(el('p', 'msg', 'Belum ada laporan.'));
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const row = { reported_by: employee.name, date: today() };
  new FormData(form).forEach((v, k) => { if (v !== '' && !(v instanceof File)) row[k] = v; });
  row.outlet_id = outlet.id;
  if (row.status === 'selesai') { row.fixed_at = new Date().toISOString(); row.fixed_by = employee.name; }
  $('save').disabled = true;
  $('msg').textContent = 'Mengirim...';
  const file = $('photo').files[0];
  if (file) {
    try {
      const blob = await shrinkPhoto(file);
      const path = `${today()}/${employee.id}-${Date.now()}.jpg`;
      const up = await sb.storage.from('maintenance-foto').upload(path, blob, { contentType: 'image/jpeg' });
      if (up.error) throw up.error;
      row.photo = path;
    } catch (err) {
      $('save').disabled = false;
      $('msg').textContent = 'Foto gagal di-upload: ' + (err.message || err);
      return;
    }
  }
  const { error } = await sb.from('maintenance').insert(row);
  $('save').disabled = false;
  if (error) { $('msg').textContent = 'Gagal mengirim: ' + error.message; return; }
  form.reset();
  $('msg').textContent = 'Laporan terkirim ✓';
  loadList();
});

(async () => {
  employee = await requireEmployee();
  if (!employee) return;
  outlet = await currentOutlet(employee);
  if (!outlet) return;
  $('outlet-name').textContent = 'OUTLET: ' + outlet.name;
  loadList();
})();
