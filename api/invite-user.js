// ─────────────────────────────────────────────────────────────
// api/invite-user.js — proxy serverless (Vercel)
// Invita a un usuario vía Supabase Auth (/admin/invite, envía email)
// y crea su perfil, usando la service_role key (NUNCA expuesta al
// cliente).
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

import { checkRateLimit } from './_auth.js';

const ALLOWED_ORIGINS = [
  'https://app.laaambcorderos.com',
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

  // Rate limiting por IP (5 req/min — estricto: crea usuarios admin)
  const rl = checkRateLimit(req, 5, 60000);
  if (rl.limited) {
    res.setHeader('Retry-After', rl.retryAfter);
    return res.status(429).json({
      error: 'Demasiadas peticiones. Intenta en ' + rl.retryAfter + 's'
    });
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
    const rolResp = await fetch(
      `${supabaseUrl}/rest/v1/perfiles?id=eq.${caller.id}&select=rol`,
      {
        headers: {
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`
        }
      }
    );
    if (!rolResp.ok) {
      return res.status(403).json({ error: 'No se pudo verificar el rol del llamador' });
    }
    const perfiles = await rolResp.json();
    const callerRol = Array.isArray(perfiles) && perfiles[0] ? perfiles[0].rol : null;
    if (callerRol !== 'gerente' && callerRol !== 'administrador') {
      return res.status(403).json({ error: 'No autorizado: se requiere rol gerente o administrador' });
    }

    // ── 4. Validar el payload ──────────────────────────────────
    const { email, nombre, rol } = req.body || {};
    if (!email || !nombre || !rol) {
      return res.status(400).json({ error: 'Faltan datos: email, nombre y rol son obligatorios' });
    }

    // ── 5. Lógica de invitación (solo si pasó 1-4) ─────────────
    // 5a. Invitar vía SDK oficial de Supabase
    // (maneja internamente el endpoint correcto)
    const { createClient } = await import(
      '@supabase/supabase-js'
    );
    const supabaseAdmin = createClient(
      supabaseUrl, serviceKey,
      { auth: { autoRefreshToken: false,
                persistSession: false } }
    );
    const { data: inviteData, error: inviteError } =
      await supabaseAdmin.auth.admin.inviteUserByEmail(
        email,
        {
          data: { nombre, rol },
          redirectTo: 'https://app.laaambcorderos.com/login.html'
        }
      );
    if (inviteError) {
      throw new Error(
        inviteError.message ||
        'Error enviando invitación'
      );
    }
    const user = inviteData.user;

    // 5b. Crear/actualizar el perfil asociado en la tabla perfiles.
    // El trigger on_auth_user_created (0008) ya crea un perfil al crear el
    // usuario en Auth, así que hacemos upsert (merge sobre id) para no
    // chocar con esa fila y respetar el rol enviado.
    const perfilResp = await fetch(
      `${supabaseUrl}/rest/v1/perfiles?on_conflict=id`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
          'Prefer': 'resolution=merge-duplicates,return=minimal'
        },
        body: JSON.stringify({ id: user.id, nombre, email, rol, activo: true })
      }
    );
    if (!perfilResp.ok) {
      // revertir el auth user huérfano para no dejar basura
      await fetch(`${supabaseUrl}/auth/v1/admin/users/${user.id}`, {
        method: 'DELETE',
        headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` }
      });
      const err = await perfilResp.json().catch(() => ({}));
      throw new Error(err.message || 'No se pudo crear el perfil; usuario revertido');
    }

    return res.status(200).json({
      ok: true,
      message: 'Invitación enviada. ' + email +
        ' recibirá un email para establecer su contraseña.',
      userId: user.id
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
