// Dipakai bersama oleh halaman karyawan: koneksi Supabase, cek login, data karyawan & outlet.
const SUPABASE_URL = 'https://oaxrqjbqtiibiqhsnvlt.supabase.co';
const SUPABASE_KEY = 'sb_publishable_OXzFWfF0lhf866nnu_9Z-Q_-WfZzDG8';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, '0');
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const rp = (n) => 'Rp' + Math.round(Number(n) || 0).toLocaleString('id-ID');
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

// Halaman selain menu: kalau belum login, kembali ke menu karyawan.
async function requireEmployee() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { location.href = '/karyawan/'; return null; }
  const { data } = await sb.from('employees').select('*').ilike('email', session.user.email).eq('active', true).maybeSingle();
  if (!data) { location.href = '/karyawan/'; return null; }
  return data;
}

async function fillOutlets(select) {
  const { data } = await sb.from('outlets').select('*').eq('active', true).order('id');
  const outlets = data || [];
  select.replaceChildren(...outlets.map((o) => { const op = el('option', null, o.name); op.value = o.id; return op; }));
  let saved = null;
  try { saved = localStorage.getItem('gw-outlet'); } catch (_) {}
  if (saved && outlets.some((o) => String(o.id) === saved)) select.value = saved;
  select.addEventListener('change', () => { try { localStorage.setItem('gw-outlet', select.value); } catch (_) {} });
  return outlets;
}

// Kecilkan foto sebelum di-upload (lebar maks 900px).
async function shrinkPhoto(file) {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, 900 / img.width);
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return new Promise((r) => c.toBlob(r, 'image/jpeg', 0.8));
}
