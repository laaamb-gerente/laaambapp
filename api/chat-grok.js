import { aplicarCors, validarToken, checkRateLimit } from './_auth.js';

export default async function handler(req, res) {
  // CORS por allowlist (en TODAS las respuestas, incluido preflight)
  aplicarCors(req, res);

  // Preflight: el navegador envía OPTIONS antes del POST cross-origin
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Rate limiting por IP (30 req/min) antes de validar sesión
  const rl = checkRateLimit(req, 30, 60000);
  if (rl.limited) {
    res.setHeader('Retry-After', rl.retryAfter);
    return res.status(429).json({
      error: 'Demasiadas peticiones. Intenta en ' + rl.retryAfter + 's'
    });
  }

  // Exigir sesión válida antes de gastar la GROK_API_KEY
  const auth = await validarToken(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }

  const apiKey = process.env.GROK_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'GROK_API_KEY no configurada en Vercel env vars'
    });
  }

  try {
    const { messages, system } = req.body;

    const response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'grok-3-mini',
        messages: [
          { role: 'system', content: system || '' },
          ...(messages || [])
        ],
        max_tokens: 1024
      })
    });

    const data = await response.json();

    return res.status(response.status).json(data);

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
