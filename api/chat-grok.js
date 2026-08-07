import { aplicarCors, validarToken, checkRateLimit } from './_auth.js';

/**
 * Proxy Grok (xAI) para el Copiloto LAAAMB.
 * Soporta: chat, function calling (tools) y mensajes multimodales (imágenes).
 * Solo Grok — sin Claude.
 */
export default async function handler(req, res) {
  aplicarCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rl = checkRateLimit(req, 30, 60000);
  if (rl.limited) {
    res.setHeader('Retry-After', rl.retryAfter);
    return res.status(429).json({
      error: 'Demasiadas peticiones. Intenta en ' + rl.retryAfter + 's'
    });
  }

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
    const { messages, system, tools, model, max_tokens, temperature } = req.body || {};

    // Modelo con tools + visión (override con GROK_MODEL en Vercel)
    const modelId = model || process.env.GROK_MODEL || 'grok-4.5';

    const apiMessages = [];
    if (system) {
      apiMessages.push({ role: 'system', content: system });
    }
    (messages || []).forEach(function (m) {
      apiMessages.push(m);
    });

    const body = {
      model: modelId,
      messages: apiMessages,
      max_tokens: max_tokens || 2048,
      temperature: temperature != null ? temperature : 0.3
    };

    // OpenAI-compatible tools
    if (tools && tools.length) {
      body.tools = tools;
      body.tool_choice = 'auto';
    }

    const response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + apiKey
      },
      body: JSON.stringify(body)
    });

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (error) {
    return res.status(500).json({ error: error.message || String(error) });
  }
}
