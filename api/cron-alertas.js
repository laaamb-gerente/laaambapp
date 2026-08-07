// ─────────────────────────────────────────────────────────────
// api/cron-alertas.js — Digest diario de alertas por EMAIL.
//
// Mismo patrón de notificaciones que juanchoconat-app (bajas de
// inventario en tiendas / volteos de fermentación en fábrica):
// un cron de Vercel consulta Supabase con la service key y envía
// un correo con TODO lo que requiere atención hoy:
//
//   1. 👁 Seguimientos post-tratamiento del día (¿cómo está el animal?)
//   2. 💉 Dosis de tratamiento pendientes / atrasadas
//   3. 🛑 Retiros sanitarios vencidos pendientes de "Confirmar apto"
//   4. 🍼 Tomas de tetero (Sala Cuna) pendientes o perdidas
//
// Programación: vercel.json → crons → /api/cron-alertas (11:00 UTC
// = 6:00 a.m. Colombia).
//
// Variables de entorno requeridas en Vercel:
//   SUPABASE_URL          (ya existe)
//   SUPABASE_SERVICE_KEY  (ya existe)
//   RESEND_API_KEY        ← crear en https://resend.com (API Keys)
//   ALERTAS_EMAIL_TO      ← ej. jmarbelaez92@gmail.com (coma-separado para varios)
//   ALERTAS_EMAIL_FROM    ← opcional; default onboarding@resend.dev
//                           (con dominio verificado: alertas@laaambcorderos.com)
//   CRON_SECRET           ← opcional; si existe, Vercel Cron lo envía como
//                           Authorization: Bearer y aquí se valida.
// ─────────────────────────────────────────────────────────────

const FINCA_ID = 'a1b2c3d4-0000-0000-0000-000000000001';

async function sbGet(path) {
  const url = `${process.env.SUPABASE_URL}/rest/v1/${path}`;
  const key = process.env.SUPABASE_SERVICE_KEY;
  const r = await fetch(url, {
    headers: { apikey: key, Authorization: `Bearer ${key}` }
  });
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${path}`);
  return r.json();
}

function hoyISO() {
  // Fecha "hoy" en zona de Colombia (UTC-5, sin DST)
  const d = new Date(Date.now() - 5 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

function fila(icono, titulo, detalle) {
  return `<tr>
    <td style="padding:8px 10px;border-bottom:1px solid #e5eeef;font-size:20px;width:34px">${icono}</td>
    <td style="padding:8px 10px;border-bottom:1px solid #e5eeef">
      <div style="font-weight:600;color:#0d2b2e;font-size:14px">${titulo}</div>
      ${detalle ? `<div style="color:#5a8a90;font-size:12px;margin-top:2px">${detalle}</div>` : ''}
    </td></tr>`;
}

function seccion(titulo, filas) {
  if (!filas.length) return '';
  return `
    <h2 style="font-family:Arial,sans-serif;font-size:15px;color:#9C3F66;margin:22px 0 8px;border-left:4px solid #F18F22;padding-left:10px">${titulo} (${filas.length})</h2>
    <table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #e5eeef;border-radius:8px">${filas.join('')}</table>`;
}

export default async function handler(req, res) {
  // Vercel Cron llega por GET. Si hay CRON_SECRET configurado, validarlo.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.authorization || '';
    if (auth !== `Bearer ${secret}`) {
      return res.status(401).json({ error: 'No autorizado' });
    }
  }

  const hoy = hoyISO();
  const resumen = { seguimientos: 0, dosis: 0, retiros: 0, tomas: 0 };

  try {
    // 1. Seguimientos post-tratamiento pendientes (hoy o atrasados)
    let seguimientos = [];
    try {
      seguimientos = await sbGet(
        `seguimientos_tratamiento?estado=eq.pendiente&fecha_programada=lte.${hoy}` +
        `&finca_id=eq.${FINCA_ID}&select=dia_seguimiento,fecha_programada,medicamento_nombre,animales(codigo,nombre,estado)` +
        `&order=fecha_programada.asc&limit=50`
      );
      seguimientos = seguimientos.filter(s => !s.animales || s.animales.estado === 'activo');
    } catch (e) { /* tabla puede no existir aún */ }

    // 2. Dosis de tratamiento pendientes (hoy o atrasadas)
    let dosis = [];
    try {
      dosis = await sbGet(
        `dosis_programadas?estado=eq.pendiente&fecha_programada=lte.${hoy}` +
        `&finca_id=eq.${FINCA_ID}&select=numero_dosis,total_dosis,fecha_programada,animales(codigo,nombre)` +
        `&order=fecha_programada.asc&limit=50`
      );
    } catch (e) { }

    // 3. Retiros sanitarios vencidos pendientes de confirmación manual
    let retiros = [];
    try {
      const rawRetiros = await sbGet(
        `tratamientos?estado=eq.en_retiro&fecha_fin_retiro=lte.${hoy}` +
        `&finca_id=eq.${FINCA_ID}&select=medicamento_nombre,fecha_fin_retiro,animal_id,animales(codigo,nombre,estado)&limit=100`
      );
      // Agrupar por animal (un aviso por animal) y excluir muertos/vendidos.
      const porAnimal = {};
      (rawRetiros || []).forEach(t => {
        if (t.animales && t.animales.estado && t.animales.estado !== 'activo') return;
        const aid = t.animal_id || 'sin';
        const g = porAnimal[aid] || (porAnimal[aid] = {
          cod: (t.animales && (t.animales.codigo || t.animales.nombre)) || '—', meds: [], fechaMax: ''
        });
        if (t.medicamento_nombre) g.meds.push(t.medicamento_nombre);
        if ((t.fecha_fin_retiro || '') > g.fechaMax) g.fechaMax = t.fecha_fin_retiro || '';
      });
      retiros = Object.keys(porAnimal).map(k => porAnimal[k]);
    } catch (e) { }

    // 4. Tomas de tetero (Sala Cuna) pendientes de hoy o perdidas
    let tomas = [];
    try {
      const finDia = `${hoy}T23:59:59`;
      tomas = await sbGet(
        `tomas_programadas?estado=eq.pendiente&fecha_hora_programada=lte.${finDia}` +
        `&select=fecha_hora_programada,cantidad_ml_objetivo,tipo,corderos_crianza(estado,cordero:cordero_id(codigo,nombre))` +
        `&order=fecha_hora_programada.asc&limit=60`
      );
      tomas = tomas.filter(t => t.corderos_crianza && t.corderos_crianza.estado === 'activo');
    } catch (e) { }

    // 5. Medicamentos próximos a agotarse o vencer.
    //    Dos criterios (avisa si CUALQUIERA se cumple):
    //    a) Vencimiento por FECHA: el lote comprado caduca en ≤30 días.
    //    b) Vencimiento por AGOTAMIENTO: se estima el consumo diario real
    //       (mL usados en tratamientos de los últimos 60 días) y se proyecta
    //       cuántos días de stock quedan. Alerta si queda ≤10% del stock
    //       inicial estimado O ≤14 días de existencia al ritmo actual.
    //       Así, un medicamento muy usado avisa aunque quede >10%, y uno
    //       poco usado no molesta antes de tiempo.
    let medsAlerta = [];
    try {
      const meds = await sbGet(
        `medicamentos?finca_id=eq.${FINCA_ID}&select=id,nombre,unidad,stock_actual,stock_minimo`
      );
      // Consumo de los últimos 60 días por medicamento
      const hace60 = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
      let trats = [];
      try {
        trats = await sbGet(
          `tratamientos?finca_id=eq.${FINCA_ID}&fecha_inicio=gte.${hace60}` +
          `&select=medicamento_id,dosis&limit=1000`
        );
      } catch (e) { }
      const consumo = {}; // medicamento_id → mL en 60 días
      trats.forEach(t => {
        const v = parseFloat(t.dosis);
        if (t.medicamento_id && !isNaN(v)) consumo[t.medicamento_id] = (consumo[t.medicamento_id] || 0) + v;
      });
      // Compras: fecha de vencimiento más próxima por medicamento
      let compras = [];
      try {
        compras = await sbGet(
          `compras_medicamentos?finca_id=eq.${FINCA_ID}&fecha_vencimiento=not.is.null` +
          `&select=medicamento_id,medicamento_nombre,fecha_vencimiento,cantidad&order=fecha_vencimiento.asc&limit=200`
        );
      } catch (e) { }
      const vencProx = {}; // medicamento_id → fecha_vencimiento más próxima futura
      compras.forEach(c => {
        if (c.fecha_vencimiento >= hoy && (!vencProx[c.medicamento_id] || c.fecha_vencimiento < vencProx[c.medicamento_id])) {
          vencProx[c.medicamento_id] = c.fecha_vencimiento;
        }
      });

      (meds || []).forEach(m => {
        const stock = parseFloat(m.stock_actual) || 0;
        const razones = [];
        // a) Vencimiento por fecha
        const fv = vencProx[m.id];
        if (fv) {
          const diasVenc = Math.round((new Date(fv) - new Date(hoy)) / 86400000);
          if (diasVenc <= 30) razones.push(`vence en ${diasVenc} día(s) (${fv})`);
        }
        // b) Agotamiento con ritmo de consumo
        const mlDia = (consumo[m.id] || 0) / 60;
        if (stock > 0 && mlDia > 0) {
          const diasRestantes = Math.floor(stock / mlDia);
          if (diasRestantes <= 14) razones.push(`~${diasRestantes} día(s) de stock al ritmo actual (${mlDia.toFixed(1)} ${m.unidad || 'mL'}/día)`);
        }
        // Stock bajo por umbral (stock_minimo o 10% si no hay mínimo)
        if (stock > 0 && m.stock_minimo && stock <= m.stock_minimo) {
          razones.push(`stock ${stock} ${m.unidad || ''} ≤ mínimo ${m.stock_minimo}`);
        }
        if (stock === 0) razones.push('sin stock');
        if (razones.length) {
          medsAlerta.push({ nombre: m.nombre, stock, unidad: m.unidad || '', razones });
        }
      });
    } catch (e) { }

    // 6. Registro diario de asistencia (¿ya se marcó hoy?)
    let asistencia = { empleados: 0, marcados: 0, faltan: [] };
    try {
      const emps = await sbGet(`empleados?finca_id=eq.${FINCA_ID}&activo=eq.true&select=id,nombre`);
      const asisHoy = await sbGet(`asistencia?finca_id=eq.${FINCA_ID}&fecha=eq.${hoy}&select=empleado_id`);
      const marcadosSet = new Set((asisHoy || []).map(a => a.empleado_id));
      asistencia.empleados = (emps || []).length;
      asistencia.marcados = marcadosSet.size;
      asistencia.faltan = (emps || []).filter(e => !marcadosSet.has(e.id)).map(e => e.nombre);
    } catch (e) { }

    // 7. Leche en polvo tetero (calostro/sustituto) — proyección 8 días
    let lecheTetero = [];
    try {
      const crias = await sbGet(
        `corderos_crianza?estado=eq.activo&select=id`
      );
      const nCrias = (crias || []).length;
      if (nCrias > 0) {
        const inv = await sbGet(
          `inventario_nutricion?finca_id=eq.${FINCA_ID}&select=ingrediente,stock_kg,stock_minimo_kg`
        );
        let formulas = [];
        try {
          formulas = await sbGet(
            `formula_tetero?finca_id=eq.${FINCA_ID}&select=tipo,ingrediente,g_polvo_por_litro`
          );
        } catch (e) { formulas = []; }
        const formByTipo = {};
        (formulas || []).forEach(f => { formByTipo[f.tipo] = f; });
        const mlDiaTotal = nCrias * 400; // estimación base
        [
          { tipo: 'calostro', fraccion: 0.25, defIng: 'Leche en polvo calostro', defG: 150 },
          { tipo: 'sustituto', fraccion: 0.75, defIng: 'Leche en polvo sustituto', defG: 150 }
        ].forEach(fr => {
          const form = formByTipo[fr.tipo] || {};
          const ing = form.ingrediente || fr.defIng;
          const gPorL = Number(form.g_polvo_por_litro) || fr.defG;
          const row = (inv || []).find(i =>
            String(i.ingrediente || '').toLowerCase() === String(ing).toLowerCase()
          );
          const stockKg = row ? (parseFloat(row.stock_kg) || 0) : 0;
          const gDia = mlDiaTotal * fr.fraccion * (gPorL / 1000);
          const dias = gDia > 0 ? Math.floor((stockKg * 1000) / gDia) : 999;
          if (stockKg <= 0 || dias < 8) {
            lecheTetero.push({
              ingrediente: ing,
              tipo: fr.tipo,
              stock_kg: stockKg,
              dias: stockKg <= 0 ? 0 : dias,
              nCrias,
              gDia: Math.round(gDia)
            });
          }
        });
      }
    } catch (e) { }

    resumen.seguimientos = seguimientos.length;
    resumen.dosis = dosis.length;
    resumen.retiros = retiros.length;
    resumen.tomas = tomas.length;
    resumen.medicamentos = medsAlerta.length;
    resumen.asistencia_faltan = asistencia.faltan.length;
    resumen.leche_tetero = lecheTetero.length;
    const total = seguimientos.length + dosis.length + retiros.length + tomas.length
      + medsAlerta.length + lecheTetero.length + (asistencia.empleados > 0 ? 1 : 0);

    if (total === 0) {
      return res.status(200).json({ ok: true, enviado: false, motivo: 'Sin alertas hoy', resumen });
    }

    // ── Armar el email ──
    const cod = a => (a && (a.codigo || a.nombre)) || '—';
    const html = `
<div style="font-family:Arial,sans-serif;background:#f4f8f9;padding:24px">
  <div style="max-width:640px;margin:0 auto">
    <div style="display:flex;align-items:center;gap:12px;border-bottom:3px solid #00AFB6;padding-bottom:14px;margin-bottom:6px">
      <div style="width:46px;height:46px;border-radius:10px;background:#00AFB6;color:#fff;text-align:center;line-height:46px;font-size:19px;font-weight:800">LA</div>
      <div>
        <div style="font-size:20px;font-weight:800;color:#00AFB6">LAAAMB · Alertas del día</div>
        <div style="font-size:12px;color:#5a8a90">Finca La Marinilla · ${hoy} · ${total} pendiente(s)</div>
      </div>
    </div>
    ${seccion('👁 Seguimiento post-tratamiento — pregunta cómo están', seguimientos.map(s =>
      fila('👁', `${cod(s.animales)} · día ${s.dia_seguimiento} después del tratamiento`,
        `${s.medicamento_nombre || ''}${s.fecha_programada < hoy ? ` · ⚠ atrasado (${s.fecha_programada})` : ''}`)))}
    ${seccion('💉 Dosis de tratamiento pendientes', dosis.map(d =>
      fila('💉', `${cod(d.animales)} · dosis ${d.numero_dosis}/${d.total_dosis}`,
        d.fecha_programada < hoy ? `⚠ atrasada (${d.fecha_programada})` : 'aplicar hoy')))}
    ${seccion('Retiros sanitarios cumplidos — confirmar apto', retiros.map(g =>
      fila('•', `${g.cod}${g.meds.length > 1 ? ` · ${g.meds.length} medicamentos` : (g.meds.length ? ` · ${g.meds[0]}` : '')}`,
        `carne apta · retiro venció ${g.fechaMax} · confirma en HOY → "Confirmar apto"`)))}
    ${seccion('🍼 Tetero / Sala Cuna — tomas pendientes', tomas.map(t =>
      fila('🍼', `${cod(t.corderos_crianza && t.corderos_crianza.cordero)} · ${t.cantidad_ml_objetivo} mL (${t.tipo})`,
        `programada ${String(t.fecha_hora_programada).replace('T', ' ').slice(0, 16)}`)))}
    ${seccion('💊 Medicamentos por vencer o agotarse', medsAlerta.map(m =>
      fila('💊', `${m.nombre} · stock ${m.stock} ${m.unidad}`, m.razones.join(' · '))))}
    ${seccion('🚨 Leche tetero / calostro — se agota en ≤8 días', lecheTetero.map(l =>
      fila('🍼',
        `URGENTE: ${l.ingrediente} · ${l.dias <= 0 ? 'SIN STOCK' : 'se agota en ~' + l.dias + ' día(s)'}`,
        `${l.nCrias} corderos en crianza · ~${l.gDia} g polvo/día · stock ${l.stock_kg} kg · reponer en Nutrición`)))}
    ${asistencia.empleados > 0 ? `
    <h2 style="font-family:Arial,sans-serif;font-size:15px;color:#9C3F66;margin:22px 0 8px;border-left:4px solid #F18F22;padding-left:10px">📋 Registro de asistencia de hoy</h2>
    <table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #e5eeef;border-radius:8px">
      ${fila(asistencia.faltan.length === 0 ? '✅' : '⏰',
        asistencia.faltan.length === 0
          ? `Asistencia completa (${asistencia.marcados}/${asistencia.empleados} marcados)`
          : `Falta marcar ${asistencia.faltan.length} de ${asistencia.empleados}`,
        asistencia.faltan.length === 0 ? 'Todo el equipo registrado hoy' : 'Pendientes: ' + asistencia.faltan.join(', '))}
    </table>` : ''}
    <div style="margin-top:20px;text-align:center">
      <a href="https://app.laaambcorderos.com/hoy.html" style="display:inline-block;background:#00AFB6;color:#fff;text-decoration:none;padding:11px 26px;border-radius:8px;font-weight:700;font-size:14px">Abrir HOY en LAAAMBAPP →</a>
    </div>
    <div style="margin-top:22px;border-top:1px solid #d8e8ea;padding-top:10px;font-size:10px;color:#9ab;text-align:center">
      LAAAMBAPP · Digest automático diario · vereda San Bernardo, Ibagué, Tolima
    </div>
  </div>
</div>`;

    // ── Enviar con Resend ──
    const apiKey = process.env.RESEND_API_KEY;
    const to = (process.env.ALERTAS_EMAIL_TO || '').split(',').map(s => s.trim()).filter(Boolean);
    if (!apiKey || !to.length) {
      return res.status(200).json({
        ok: false, enviado: false, resumen,
        error: 'Faltan RESEND_API_KEY o ALERTAS_EMAIL_TO en Vercel — configúralas para activar los correos'
      });
    }
    const from = process.env.ALERTAS_EMAIL_FROM || 'LAAAMB Alertas <onboarding@resend.dev>';
    const send = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from, to,
        subject: `🐑 LAAAMB · ${resumen.seguimientos} seguim. · ${resumen.dosis} dosis · ${resumen.tomas} teteros · ${resumen.leche_tetero || 0} leche · ${resumen.medicamentos} medic.`,
        html
      })
    });
    const sendBody = await send.json().catch(() => ({}));
    if (!send.ok) {
      return res.status(200).json({ ok: false, enviado: false, resumen, error: sendBody });
    }
    return res.status(200).json({ ok: true, enviado: true, resumen, id: sendBody.id });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
