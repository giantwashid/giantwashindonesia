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

// Kecilkan foto sebelum di-upload (lebar maks 900px).
async function shrinkPhoto(file) {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, 900 / img.width);
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return new Promise((r) => c.toBlob(r, 'image/jpeg', 0.8));
}

// Outlet kerja. Karyawan yang terdaftar di satu outlet selalu memakai outlet itu.
// Pemilik / karyawan tanpa outlet memakai outlet dari link (?outlet=), yang dipilih di menu karyawan.
async function currentOutlet(employee) {
  const id = employee.outlet_id || Number(new URLSearchParams(location.search).get('outlet'));
  if (!id) { location.href = '/karyawan/'; return null; }
  const { data } = await sb.from('outlets').select('*').eq('id', id).maybeSingle();
  if (!data) { location.href = '/karyawan/'; return null; }
  return data;
}
