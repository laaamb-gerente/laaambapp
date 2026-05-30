// ─────────────────────────────────────────────────────────────
// api/siigo-sync.js — proxy serverless (Vercel) para Siigo.
// Evita CORS y mantiene la lógica de autenticación del lado servidor.
// Acciones: 'auth' (genera token), 'facturas' (ventas), 'gastos'
// (comprobantes de egreso / journal-vouchers).
//
// Nota: el access_key se envía desde el cliente solo en 'auth'.
// El access_token devuelto se guarda en la tabla siigo_config.
// ─────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Method not allowed' });

  const { accion, username, access_token, fecha_desde, fecha_hasta }
    = req.body;

  try {
    if (accion === 'auth') {
      // Autenticar con Siigo
      const resp = await fetch(
        'https://api.siigo.com/auth/v1/users:generate-token',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Partner-Id': 'LAAAMB'
          },
          body: JSON.stringify({
            username,
            access_key: req.body.access_key
          })
        }
      );
      const data = await resp.json();
      return res.status(resp.status).json(data);
    }

    if (accion === 'facturas') {
      // Traer facturas de venta del período
      const resp = await fetch(
        `https://api.siigo.com/v1/invoices?date_start=${fecha_desde}&date_end=${fecha_hasta}&page=1&page_size=100`,
        {
          headers: {
            'Authorization': `Bearer ${access_token}`,
            'Partner-Id': 'LAAAMB'
          }
        }
      );
      const data = await resp.json();
      return res.status(resp.status).json(data);
    }

    if (accion === 'gastos') {
      // Traer comprobantes de egreso
      const resp = await fetch(
        `https://api.siigo.com/v1/journal-vouchers?date_start=${fecha_desde}&date_end=${fecha_hasta}&page=1&page_size=100`,
        {
          headers: {
            'Authorization': `Bearer ${access_token}`,
            'Partner-Id': 'LAAAMB'
          }
        }
      );
      const data = await resp.json();
      return res.status(resp.status).json(data);
    }

    return res.status(400).json({ error: 'Acción no reconocida' });

  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
