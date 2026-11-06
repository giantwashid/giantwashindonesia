document.getElementById('year').textContent = new Date().getFullYear();

document.querySelectorAll('.links a').forEach(a =>
  a.addEventListener('click', () => document.body.classList.remove('menu-open'))
);

const form = document.getElementById('contact-form');
const statusEl = document.getElementById('form-status');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  statusEl.textContent = 'Mengirim...';
  try {
    const res = await fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(new FormData(form))),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal mengirim');
    statusEl.textContent = 'Terima kasih! Pesan Anda sudah kami terima.';
    form.reset();
  } catch (err) {
    statusEl.textContent = 'Maaf, pesan gagal terkirim: ' + err.message;
  }
});
