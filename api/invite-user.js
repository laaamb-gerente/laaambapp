// ─────────────────────────────────────────────────────────────
// api/invite-user.js — proxy serverless (Vercel)
// Crea un usuario en Supabase Auth + su perfil, usando la
// service_role key (NUNCA expuesta al cliente).
//
// ⚙️  CONFIGURAR EN VERCEL (Project Settings → Environment Variables):
//   - SUPABASE_SERVICE_KEY  → Supabase: Project Settings → API → service_role key
//   - SUPABASE_URL          → https://iielilbntkihneypuywk.supabase.co
//
// La service_role key tiene permisos de administrador: por eso vive
// SOLO en el servidor (Vercel), jamás en el navegador.
// ─────────────────────────────────────────────────────────────

import crypto from 'crypto';

export default async function handler(req, res) {
  // CORS (para llamadas desde GitHub Pages u otros orígenes)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, nombre, rol } = req.body || {};
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;

  if (!serviceKey || !supabaseUrl) {
    return res.status(500).json({ error: 'Service key o URL no configurada en Vercel' });
  }
  if (!email || !nombre || !rol) {
    return res.status(400).json({ error: 'Faltan datos: email, nombre y rol son obligatorios' });
  }

  try {
    // Contraseña temporal aleatoria (el usuario la cambiará luego)
    const tempPassword = crypto.randomUUID().slice(0, 12) + '!A1';

    // 1. Crear el usuario en Supabase Auth (admin API)
    const resp = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`
      },
      body: JSON.stringify({
        email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { nombre, rol }
      })
    });

    const user = await resp.json();
    if (!resp.ok) throw new Error(user.message || user.msg || 'Error creando usuario');

    // 2. Crear el perfil asociado en la tabla perfiles
    await fetch(`${supabaseUrl}/rest/v1/perfiles`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ id: user.id, nombre, email, rol, activo: true })
    });

    // 3. Confirmar email (asegura que pueda iniciar sesión de inmediato)
    await fetch(`${supabaseUrl}/auth/v1/admin/users/${user.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`
      },
      body: JSON.stringify({ email_confirm: true })
    });

    return res.status(200).json({
      ok: true,
      password: tempPassword,
      mensaje: `Usuario ${nombre} creado. Comparte la contraseña temporal con el usuario.`
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
