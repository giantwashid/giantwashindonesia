// Koneksi Supabase (publishable key memang aman ditaruh di website;
// keamanan data diatur oleh Row Level Security di Supabase).
const SUPABASE_URL = 'https://oaxrqjbqtiibiqhsnvlt.supabase.co';
const SUPABASE_KEY = 'sb_publishable_OXzFWfF0lhf866nnu_9Z-Q_-WfZzDG8';

document.getElementById('year').textContent = new Date().getFullYear();

document.querySelectorAll('.links a').forEach(a =>
  a.addEventListener('click', () => document.body.classList.remove('menu-open'))
);

const form = document.getElementById('contact-form');
const statusEl = document.getElementById('form-status');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  statusEl.textContent = 'Mengirim...';
  const data = Object.fromEntries(new FormData(form));
  try {
    const res = await fetch(SUPABASE_URL + '/rest/v1/contacts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_KEY,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        name: (data.name || '').trim(),
        email: (data.email || '').trim(),
        phone: (data.phone || '').trim() || null,
        message: (data.message || '').trim(),
      }),
    });
    if (!res.ok) throw new Error('Gagal mengirim (' + res.status + ')');
    statusEl.textContent = 'Terima kasih! Pesan Anda sudah kami terima.';
    form.reset();
  } catch (err) {
    statusEl.textContent = 'Maaf, pesan gagal terkirim: ' + err.message;
  }
});
