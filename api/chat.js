export default async function handler(req, res) {
  // CORS headers (en TODAS las respuestas, incluido preflight)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Preflight: el navegador envía OPTIONS antes del POST cross-origin
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Solo POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verificar que viene de la app (origen válido)
  const origin = req.headers.origin || '';
  const allowed = [
    'https://laaambapp.vercel.app',
    'https://laaamb-gerente.github.io',
    'http://localhost:3000'
  ];

  // Leer ANTHROPIC_API_KEY desde env vars de Vercel
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key no configurada' });
  }

  try {
    const { messages, system, model } = req.body;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: model || 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: system || '',
        messages: messages || []
      })
    });

    const data = await response.json();

    return res.status(response.status).json(data);

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
