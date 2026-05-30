// ─────────────────────────────────────────────────────────────
// api/invite-user.js — proxy serverless (Vercel)
// Crea un usuario en Supabase Auth + su perfil, usando la
// service_role key (NUNCA expuesta al cliente).
//
// 🔒 SEGURIDAD (Sprint 0 — Acción 2):
//   Este endpoint usa la service_role key (permisos de admin). Antes de
//   ejecutar cualquier acción exige:
//     1. Header Authorization: Bearer <access_token de la sesión>.
//     2. Que ese token sea válido (GET /auth/v1/user).
//     3. Que el llamador tenga rol 'gerente' o 'administrador'.
//   Además solo acepta orígenes de la allowlist. Sin esto, cualquiera en
//   internet podría POST {rol:'gerente'} y crearse un admin.
//
// ⚙️  CONFIGURAR EN VERCEL (Project Settings → Environment Variables):
//   - SUPABASE_SERVICE_KEY  → Supabase: Project Settings → API → service_role key
//   - SUPABASE_URL          → https://iielilbntkihneypuywk.supabase.co
//
// La service_role key tiene permisos de administrador: por eso vive
// SOLO en el servidor (Vercel), jamás en el navegador.
// ─────────────────────────────────────────────────────────────

import crypto from 'crypto';

const ALLOWED_ORIGINS = [
  'https://laaambapp.vercel.app',
  'https://laaamb-gerente.github.io',
  'http://localhost:3000'
];

export default async function handler(req, res) {
  // CORS: solo orígenes de la allowlist. Si el origen no está, no se
  // emite Access-Control-Allow-Origin (el navegador bloquea la respuesta).
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;

  if (!serviceKey || !supabaseUrl) {
    return res.status(500).json({ error: 'Service key o URL no configurada en Vercel' });
  }

  // ── 1. Exigir Authorization: Bearer <token> ──────────────────
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) {
    return res.status(401).json({ error: 'No autenticado: falta el token de sesión' });
  }

  try {
    // ── 2. Validar el token contra Supabase Auth ───────────────
    const userResp = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'apikey': serviceKey
      }
    });
    if (!userResp.ok) {
      return res.status(401).json({ error: 'Token inválido o expirado' });
    }
    const caller = await userResp.json();
    if (!caller || !caller.id) {
      return res.status(401).json({ error: 'Token inválido' });
    }

    // ── 3. Verificar que el llamador sea gerente o administrador ─
    const perfilResp = await fetch(
      `${supabaseUrl}/rest/v1/perfiles?id=eq.${caller.id}&select=rol`,
      {
        headers: {
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`
        }
      }
    );
    if (!perfilResp.ok) {
      return res.status(403).json({ error: 'No se pudo verificar el rol del llamador' });
    }
    const perfiles = await perfilResp.json();
    const callerRol = Array.isArray(perfiles) && perfiles[0] ? perfiles[0].rol : null;
    if (callerRol !== 'gerente' && callerRol !== 'administrador') {
      return res.status(403).json({ error: 'No autorizado: se requiere rol gerente o administrador' });
    }

    // ── 4. Validar el payload ──────────────────────────────────
    const { email, nombre, rol } = req.body || {};
    if (!email || !nombre || !rol) {
      return res.status(400).json({ error: 'Faltan datos: email, nombre y rol son obligatorios' });
    }

    // ── 5. Lógica de creación (solo si pasó 1-4) ───────────────
    // Contraseña temporal aleatoria (el usuario la cambiará luego)
    const tempPassword = crypto.randomUUID().slice(0, 12) + '!A1';

    // 5a. Crear el usuario en Supabase Auth (admin API)
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

    // 5b. Crear el perfil asociado en la tabla perfiles
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

    // 5c. Confirmar email (asegura que pueda iniciar sesión de inmediato)
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
