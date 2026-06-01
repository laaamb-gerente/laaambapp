// ─────────────────────────────────────────────────────────────
// api/delete-user.js — proxy serverless (Vercel)
// Elimina DEFINITIVAMENTE un usuario de Supabase Auth usando la
// service_role key (NUNCA expuesta al cliente).
//
// 🔒 SEGURIDAD (mismo patrón que invite-user.js):
//   Este endpoint usa la service_role key (permisos de admin). Antes de
//   ejecutar cualquier acción exige:
//     1. Header Authorization: Bearer <access_token de la sesión>.
//     2. Que ese token sea válido (GET /auth/v1/user).
//     3. Que el llamador tenga rol 'gerente'.
//     4. Que NO se esté eliminando a sí mismo (user_id !== caller.id).
//   Además solo acepta orígenes de la allowlist. Sin esto, cualquiera en
//   internet podría POST {user_id:'...'} y borrar usuarios.
//
//   El borrado en Auth NO elimina los registros del historial de
//   auditoría (audit_log guarda usuario_email/usuario_rol como texto):
//   la trazabilidad se conserva.
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

  // Rate limiting por IP (5 req/min — estricto: borra usuarios)
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

    // ── 3. Verificar que el llamador sea gerente ───────────────
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
    if (callerRol !== 'gerente') {
      return res.status(403).json({ error: 'No autorizado: se requiere rol gerente' });
    }

    // ── 4. Validar el payload ──────────────────────────────────
    const { user_id } = req.body || {};
    if (!user_id) {
      return res.status(400).json({ error: 'Falta user_id' });
    }

    // El gerente no puede eliminarse a sí mismo
    if (user_id === caller.id) {
      return res.status(400).json({ error: 'No puedes eliminarte a ti mismo' });
    }

    // ── 5. Eliminar el usuario en Supabase Auth (admin API) ────
    const delResp = await fetch(`${supabaseUrl}/auth/v1/admin/users/${user_id}`, {
      method: 'DELETE',
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`
      }
    });
    if (!delResp.ok) {
      const err = await delResp.json().catch(() => ({}));
      throw new Error(err.message || err.msg || 'No se pudo eliminar el usuario');
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
