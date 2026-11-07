// Karyawan mencatat pembelian barang. Masuk ke tabel purchases (Panel Laporan, menu Pembelian).
let employee = null;
const form = $('form');

function updateTotal() {
  const f = new FormData(form);
  $('total').textContent = rp(Number(f.get('qty') || 0) * Number(f.get('price') || 0));
}
form.addEventListener('input', updateTotal);

async function loadList() {
  const { data } = await sb.from('purchases').select('*').eq('outlet_id', Number($('outlet').value))
    .order('date', { ascending: false }).order('id', { ascending: false }).limit(10);
  const list = $('list');
  list.replaceChildren();
  (data || []).forEach((r) => {
    const it = el('div', 'item');
    const top = el('div', 'row'); top.append(el('b', null, `${r.item} × ${r.qty}`), el('b', null, rp(r.qty * r.price)));
    const sub = el('div', 'row'); sub.append(el('span', null, `${r.date}${r.supplier ? ' · ' + r.supplier : ''}`), el('span', null, r.created_by || ''));
    it.append(top, sub);
    list.append(it);
  });
  if (!list.children.length) list.append(el('p', 'msg', 'Belum ada pembelian.'));
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const row = { created_by: employee.name };
  new FormData(form).forEach((v, k) => { if (v !== '') row[k] = v; });
  row.outlet_id = Number(row.outlet_id);
  $('save').disabled = true;
  $('msg').textContent = 'Menyimpan...';
  const { error } = await sb.from('purchases').insert(row);
  $('save').disabled = false;
  if (error) { $('msg').textContent = 'Gagal menyimpan: ' + error.message; return; }
  form.reset();
  $('date').value = today();
  updateTotal();
  $('msg').textContent = 'Tersimpan ✓';
  loadList();
});

(async () => {
  employee = await requireEmployee();
  if (!employee) return;
  $('date').value = today();
  await fillOutlets($('outlet'));
  $('outlet').addEventListener('change', loadList);
  loadList();
})();
