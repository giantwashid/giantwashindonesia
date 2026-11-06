// Cloudflare Pages Function: POST /api/contact
// Menyimpan pesan dari form kontak ke database D1 (binding: DB).

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Format data tidak valid' }, 400);
  }

  const name = String(body.name || '').trim().slice(0, 100);
  const email = String(body.email || '').trim().slice(0, 150);
  const phone = String(body.phone || '').trim().slice(0, 30);
  const message = String(body.message || '').trim().slice(0, 2000);

  if (!name || !email || !message) {
    return json({ error: 'Nama, email, dan pesan wajib diisi' }, 400);
  }

  if (!env.DB) {
    return json({ error: 'Database belum dihubungkan (binding DB)' }, 500);
  }

  await env.DB.prepare(
    'INSERT INTO contacts (name, email, phone, message) VALUES (?, ?, ?, ?)'
  ).bind(name, email, phone, message).run();

  return json({ ok: true });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
