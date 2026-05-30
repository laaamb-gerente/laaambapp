// ─────────────────────────────────────────────────────────────
// api/_auth.js — helper compartido de autenticación para las
// funciones serverless (Vercel).
//
// Los archivos que empiezan con "_" NO son rutas en Vercel: se incluyen
// como dependencia (bundle) de las funciones que los importan.
//
// Mismo patrón ya validado en api/invite-user.js:
//   · aplicarCors  → CORS por allowlist (no '*').
//   · validarToken → exige Authorization: Bearer y lo valida contra
//                    Supabase Auth (GET /auth/v1/user).
//   · obtenerRol   → rol del usuario desde perfiles (service key).
// ─────────────────────────────────────────────────────────────

// Rate limiting simple en memoria (por IP, por endpoint).
// Nota: la memoria es por-instancia de la función serverless; en Vercel
// cada cold start arranca un mapa nuevo. Es una primera barrera contra
// abuso/ráfagas, no un límite global estricto.
const rateLimitMap = new Map();

export function checkRateLimit(req, maxRequests = 20, windowMs = 60000) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.socket?.remoteAddress
    || 'unknown';
  const key = `${ip}:${req.url}`;
  const now = Date.now();

  const record = rateLimitMap.get(key) || { count: 0, resetAt: now + windowMs };

  // Reset si venció la ventana
  if (now > record.resetAt) {
    record.count = 0;
    record.resetAt = now + windowMs;
  }

  record.count++;
  rateLimitMap.set(key, record);

  if (record.count > maxRequests) {
    return {
      limited: true,
      retryAfter: Math.ceil((record.resetAt - now) / 1000)
    };
  }
  return { limited: false };
}

// Limpiar entradas viejas cada 5 minutos
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitMap.entries()) {
    if (now > record.resetAt + 60000) rateLimitMap.delete(key);
  }
}, 300000);

export const ALLOWED_ORIGINS = [
  'https://laaambapp.vercel.app',
  'https://laaamb-gerente.github.io',
  'http://localhost:3000'
];

// Aplica CORS por allowlist. Si el origin no está, NO se emite
// Access-Control-Allow-Origin (el navegador bloquea la respuesta).
// Devuelve true si el origin fue permitido.
export function aplicarCors(req, res) {
  const origin = req.headers.origin;
  const permitido = !!(origin && ALLOWED_ORIGINS.includes(origin));
  if (permitido) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return permitido;
}

// Valida el Bearer token contra Supabase Auth.
// Devuelve { ok, status, error } en fallo, o { ok:true, user, token } en éxito.
export async function validarToken(req) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return { ok: false, status: 500, error: 'Supabase URL o service key no configurada en Vercel' };
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) {
    return { ok: false, status: 401, error: 'No autenticado: falta el token de sesión' };
  }

  let userResp;
  try {
    userResp = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { 'Authorization': `Bearer ${token}`, 'apikey': serviceKey }
    });
  } catch (e) {
    return { ok: false, status: 401, error: 'No se pudo validar el token' };
  }
  if (!userResp.ok) {
    return { ok: false, status: 401, error: 'Token inválido o expirado' };
  }
  const user = await userResp.json();
  if (!user || !user.id) {
    return { ok: false, status: 401, error: 'Token inválido' };
  }
  return { ok: true, status: 200, user, token };
}

// Devuelve el rol (string) del usuario consultando perfiles con la service
// key, o null si no se pudo determinar.
export async function obtenerRol(userId) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  let resp;
  try {
    resp = await fetch(
      `${supabaseUrl}/rest/v1/perfiles?id=eq.${userId}&select=rol`,
      { headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` } }
    );
  } catch (e) {
    return null;
  }
  if (!resp.ok) return null;
  const rows = await resp.json();
  return Array.isArray(rows) && rows[0] ? rows[0].rol : null;
}
