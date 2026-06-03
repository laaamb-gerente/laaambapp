// ── copiloto.js ───────────────────────────────────────
// El cerebro de inteligencia operacional de LAAAMBAPP.
// Copiloto dual: Claude (Anthropic) + Grok (xAI).
// Construye contexto en vivo desde AppState y mantiene
// historial de conversación por sesión.
//
// Copiloto PRESCRIPTIVO: usa function calling sobre datos
// reales (AppState + AlertasMotor) para proponer acciones.

// ── Herramientas disponibles para el modelo ────────────
const COPILOTO_TOOLS = [
  {
    name: "get_alertas_activas",
    description: "Obtiene las alertas operacionales activas de la finca: animales listos para ecografía, partos próximos, retiros sanitarios, lotes en sobrecarga, medicamentos por vencer.",
    input_schema: {
      type: "object",
      properties: {
        prioridad: {
          type: "string",
          enum: ["todas", "critica", "alta", "media"],
          description: "Filtrar por prioridad de alerta"
        }
      },
      required: []
    }
  },
  {
    name: "get_animales_por_estado",
    description: "Obtiene animales filtrados por estado reproductivo, lote, o raza.",
    input_schema: {
      type: "object",
      properties: {
        estado_reproductivo: {
          type: "string",
          enum: ["gestante", "en_monta", "vacia", "lactante", "seca"]
        },
        lote_nombre: { type: "string" },
        raza: { type: "string" }
      },
      required: []
    }
  },
  {
    name: "get_kpis_produccion",
    description: "Obtiene los KPIs productivos actuales: GDP promedio, peso promedio, crías en levante, animales listos para sacrificio.",
    input_schema: {
      type: "object",
      properties: {},
      required: []
    }
  },
  {
    name: "get_estado_financiero",
    description: "Obtiene el balance financiero del mes actual: ingresos, costos, margen.",
    input_schema: {
      type: "object",
      properties: {
        periodo: {
          type: "string",
          enum: ["mes_actual", "mes_anterior", "trimestre"]
        }
      },
      required: []
    }
  },
  {
    name: "get_proyeccion_financiera",
    description: "Proyecta el flujo de caja de los próximos meses basado en histórico. Si no hay datos históricos, lo indica claramente.",
    input_schema: {
      type: "object",
      properties: {
        meses: { type: "number", description: "Meses a proyectar (3 o 6)" }
      },
      required: []
    }
  },
  {
    name: "consultar_produccion_leche",
    description: "Consulta el estado actual de la producción de leche en la finca: lactancias activas, producción acumulada, último control por oveja, promedio del rebaño, rendimiento quesero teórico y resumen de quesería de los últimos 3 meses.",
    input_schema: {
      type: "object",
      properties: {
        periodo_meses: { type: "integer", description: "Meses hacia atrás para el resumen de quesería (default 3)", default: 3 }
      },
      required: []
    }
  },
  {
    name: "estado_sala_cuna",
    description: "Consulta el estado actual de la Sala Cuna (crianza artificial): corderos activos, tomas pendientes y vencidas del día, compliance de los últimos 7 días por cordero, y alertas activas de calostro faltante.",
    input_schema: {
      type: "object",
      properties: {},
      required: []
    }
  },
  {
    name: "calcular_decision_sustituto",
    description: "Calcula si conviene criar un cordero con sustituto lácteo o destetar y destinar toda la leche de la madre al queso. Compara costo total del sustituto vs valor económico de la leche liberada transformada en queso.",
    input_schema: {
      type: "object",
      properties: {
        cordero_id: { type: "string", description: "UUID del cordero en crianza (de corderos_crianza.id)" },
        precio_sustituto_cop_kg: { type: "number", description: "Precio del sustituto lácteo en polvo en COP por kg" },
        precio_queso_cop_kg: { type: "number", description: "Precio de venta del queso en COP por kg" },
        dias_restantes: { type: "integer", description: "Días restantes hasta el destete estimado (default: 56 - días_en_crianza)", default: null }
      },
      required: ["cordero_id", "precio_sustituto_cop_kg", "precio_queso_cop_kg"]
    }
  }
];

window.Copiloto = {
  // Historial de conversación en memoria (por sesión de página)
  _historial: [],

  // Enfoque especializado por página (salud, reproducción, etc.)
  // Las páginas lo establecen con setEnfoquePagina() para inyectar
  // contexto y especialización adicional al system prompt.
  _enfoquePagina: '',
  setEnfoquePagina(texto) { this._enfoquePagina = texto || ''; this._historial = []; },

  // ── Contexto dinámico de la finca desde AppState ──────
  getContexto() {
    const ctx = window.AppState;
    if (!ctx || !ctx._loaded) {
      return 'Datos de la finca aún no disponibles (cargando…).';
    }

    // Crías en levante: nacimiento en los últimos 6 meses
    const seisMeses = new Date();
    seisMeses.setMonth(seisMeses.getMonth() - 6);
    const levante = (ctx.animales || []).filter(a =>
      a.estado === 'activo' && a.fecha_nacimiento && new Date(a.fecha_nacimiento) >= seisMeses
    ).length;

    // Peso promedio de los activos con peso real
    const conPeso = ctx.getAnimalesActivos().filter(a => a.peso_actual != null);
    const pesoProm = conPeso.length
      ? Math.round(conPeso.reduce((s, a) => s + (parseFloat(a.peso_actual) || 0), 0) / conPeso.length)
      : null;

    // Razas presentes
    const razas = [...new Set((ctx.getAnimalesActivos() || []).map(a => a.raza).filter(Boolean))];

    // Carga animal del lote más cargado en kg/ha (biomasa por hectárea)
    const objetivoCarga = ctx.finca?.config?.carga_animal_kgha || 200000;
    let kgHaActual = 0;
    (ctx.lotes || []).forEach(l => {
      const ha = parseFloat(l.hectareas) || 0;
      if (ha <= 0) return;
      const enLote = ctx.getAnimalesActivos().filter(a => a.lote_actual_id === l.id);
      if (!enLote.length) return;
      const pp = enLote.reduce((s, a) => s + (parseFloat(a.peso_actual) || 25), 0) / enLote.length;
      const kgHa = Math.round(enLote.length * pp / ha);
      if (kgHa > kgHaActual) kgHaActual = kgHa;
    });

    // Finanzas del mes (si están disponibles)
    let finanzas = '';
    if (typeof ctx.getTotalIngresosMes === 'function' && typeof ctx.getTotalCostosMes === 'function') {
      const ing = ctx.getTotalIngresosMes();
      const cos = ctx.getTotalCostosMes();
      finanzas = `\nIngresos del mes: $${ing.toLocaleString('es-CO')}\nEgresos del mes: $${cos.toLocaleString('es-CO')}\nBalance del mes: $${(ing - cos).toLocaleString('es-CO')}`;
    }

    return `Animales activos: ${ctx.getTotalAnimales()}
Hembras: ${ctx.getAnimalesHembras().length}
Machos/reproductores: ${ctx.getAnimalesMachos().length}
Gestantes: ${ctx.getGestantes().length}
Crías en levante (últimos 6 meses): ${levante}
Lotes activos: ${(ctx.lotes || []).length}
Peso promedio del hato: ${pesoProm != null ? pesoProm + ' kg' : 'sin datos de pesaje'}
Razas presentes: ${razas.length ? razas.join(', ') : 'Dorper, Katahdin, Lacaune'}
Ubicación: vereda San Bernardo, Ibagué, Tolima, Colombia
Propietario: Juan Manuel Arbelaez
Carga animal actual: ${kgHaActual.toLocaleString('es-CO')} kg/ha
Carga objetivo: ${objetivoCarga.toLocaleString('es-CO')} kg/ha${finanzas}`;
  },

  // ── System prompt compartido por ambos modelos ────────
  getSystemPrompt() {
    const perfil = window.AUTH_PERFIL || {};
    const rol = perfil.rol || 'gerente';
    const nombre = perfil.nombre || 'Juan Manuel Arbelaez';

    let enfoque = '';
    if (rol === 'veterinario') {
      enfoque = 'El usuario es el VETERINARIO: enfoca tus respuestas en salud, tratamientos, reproducción y protocolos sanitarios.';
    } else if (rol === 'gerente' || rol === 'administrador' || rol === 'socio') {
      enfoque = 'El usuario es el GERENTE: enfoca tus respuestas en rentabilidad, KPIs y decisiones estratégicas.';
    } else {
      enfoque = 'El usuario es parte del equipo operativo: sé práctico y claro en el manejo diario del hato.';
    }

    return `Eres el copiloto de inteligencia operacional de LAAAMB, finca de corderos Dorper y Katahdin en vereda San Bernardo, Ibagué, Tolima, Colombia. Propietario: Juan Manuel Arbelaez.

Estás conversando con ${nombre} (rol: ${rol}).

DATOS ACTUALES DE LA FINCA:
${this.getContexto()}

Respondes en español, eres conciso y práctico.
Priorizas la salud animal, la rentabilidad y el bienestar.
Cuando no tienes datos suficientes lo dices claramente.

${enfoque}${this._enfoquePagina ? '\n\n' + this._enfoquePagina : ''}`;
  },

  // ── Llamada principal ─────────────────────────────────
  // ask(pregunta, modelo='claude') → string con la respuesta
  async ask(pregunta, modelo = 'claude') {
    const system = this.getSystemPrompt();

    // Construir mensajes con el historial de la sesión
    const messages = this._historial
      .concat([{ role: 'user', content: pregunta }])
      .map(m => ({ role: m.role, content: m.content }));

    let respuesta;
    if (modelo === 'grok') {
      respuesta = await this._askGrok(system, messages);
    } else {
      respuesta = await this._askClaude(system, messages);
    }

    // Guardar en historial
    this._historial.push({ role: 'user', content: pregunta });
    this._historial.push({ role: 'assistant', content: respuesta });

    return respuesta;
  },

  // ── Base de la API según el host ──────────────────────
  // En Vercel/localhost usamos rutas relativas (/api/chat).
  // En GitHub Pages apuntamos al proxy serverless en Vercel.
  _apiBase() {
    return (window.location.hostname.includes('vercel.app') ||
            window.location.hostname === 'localhost')
      ? ''
      : 'https://laaambapp.vercel.app';
  },

  // ── Ejecutar una tool call sobre datos reales ─────────
  // async: las tools de leche/sala cuna consultan Supabase vía window.DB.
  async _ejecutarTool(name, input) {
    const as = window.AppState;
    input = input || {};

    if (name === 'get_alertas_activas') {
      const alertas = window.AlertasMotor?._alertas || [];
      const filtradas = input.prioridad && input.prioridad !== 'todas'
        ? alertas.filter(a => a.prioridad === input.prioridad)
        : alertas;
      return JSON.stringify(filtradas.map(a => ({
        tipo: a.tipo, prioridad: a.prioridad,
        mensaje: a.mensaje, accion: a.accion_sugerida
      })));
    }

    if (name === 'get_animales_por_estado') {
      let animales = as.animales.filter(a => a.estado === 'activo');
      if (input.estado_reproductivo)
        animales = animales.filter(a =>
          a.estado_reproductivo === input.estado_reproductivo);
      if (input.lote_nombre)
        animales = animales.filter(a =>
          a.lote?.toLowerCase().includes(input.lote_nombre.toLowerCase()));
      if (input.raza)
        animales = animales.filter(a =>
          a.raza?.toLowerCase().includes(input.raza.toLowerCase()));
      return JSON.stringify({
        total: animales.length,
        animales: animales.slice(0, 20).map(a => ({
          codigo: a.codigo, raza: a.raza,
          edad_meses: a.edad_meses, peso: a.pesoParaTabla,
          lote: a.lote, estado_rep: a.estado_reproductivo
        }))
      });
    }

    if (name === 'get_kpis_produccion') {
      const activos = as.animales.filter(a => a.estado === 'activo');
      const conPeso = activos.filter(a => a.pesoParaTabla);
      const pesoPromedio = conPeso.length
        ? (conPeso.reduce((s, a) => s + a.pesoParaTabla, 0) / conPeso.length).toFixed(1)
        : 0;
      const hoy = new Date();
      const hace6m = new Date(hoy - 180 * 86400000);
      const crias = activos.filter(a =>
        a.fecha_nacimiento && new Date(a.fecha_nacimiento) > hace6m
      ).length;
      const listosSacrificio = conPeso.filter(a =>
        a.pesoParaTabla >= (as.finca?.config?.peso_objetivo_sacrificio || 48)
      ).length;
      return JSON.stringify({
        total_activos: activos.length,
        con_peso: conPeso.length,
        peso_promedio_kg: pesoPromedio,
        crias_en_levante: crias,
        listos_sacrificio: listosSacrificio,
        gdp_promedio: as.gdpPromedio || 36,
        gestantes: as.gestantes?.length || 0
      });
    }

    if (name === 'get_estado_financiero') {
      const totalCostos = as.getTotalCostosMes?.() || 0;
      const totalIngresos = as.getTotalIngresosMes?.() || 0;
      const balance = totalIngresos - totalCostos;
      const margen = totalIngresos > 0
        ? Math.round((balance / totalIngresos) * 100) : 0;
      return JSON.stringify({
        ingresos: totalIngresos,
        costos: totalCostos,
        balance,
        margen_pct: margen,
        num_transacciones: {
          costos: as.getCostosMes?.().length || 0,
          ingresos: as.getIngresosMes?.().length || 0
        }
      });
    }

    if (name === 'get_proyeccion_financiera') {
      const costoPromMes = as.getTotalCostosMes?.() || 0;
      const ingPromMes = as.getTotalIngresosMes?.() || 0;
      if (costoPromMes === 0 && ingPromMes === 0) {
        return JSON.stringify({
          error: 'Sin datos financieros históricos. Conectar Siigo o registrar transacciones primero.'
        });
      }
      const meses = input.meses || 6;
      const hoy = new Date();
      const proyeccion = [];
      for (let i = 1; i <= meses; i++) {
        const fecha = new Date(hoy.getFullYear(), hoy.getMonth() + i, 1);
        proyeccion.push({
          mes: fecha.toLocaleString('es-CO', {month:'long', year:'numeric'}),
          ingresos_proyectados: ingPromMes,
          costos_proyectados: costoPromMes,
          balance: ingPromMes - costoPromMes,
          margen_pct: Math.round(((ingPromMes-costoPromMes)/ingPromMes)*100)
        });
      }
      return JSON.stringify({ proyeccion });
    }

    // ── Fase 7 — tools de leche / sala cuna / decisión (async, vía window.DB) ──
    const DB = window.DB;

    if (name === 'consultar_produccion_leche') {
      if (!DB) return JSON.stringify({ error: 'Capa de datos no disponible.' });
      const meses = input.periodo_meses || 3;
      const rl = await DB.getLactancias(true);
      const lacts = (rl && rl.data) || [];
      let sumUlt = 0, n = 0, top = null;
      lacts.forEach(l => {
        const ctr = l.controles || [];
        const ult = ctr.length ? ctr[ctr.length - 1] : null;
        if (ult && ult.leche_dia_l != null) {
          const v = Number(ult.leche_dia_l);
          sumUlt += v; n++;
          const nombre = (l.animal && (l.animal.nombre || l.animal.codigo)) || 'oveja';
          if (!top || v > top.litros_ultimo_control) top = { nombre, litros_ultimo_control: v };
        }
      });
      const rq = await DB.getResumenQueseria(meses);
      const q = (rq && rq.data) || {};
      return JSON.stringify({
        lactancias_activas: lacts.length,
        produccion_promedio_l_dia: n ? Math.round((sumUlt / n) * 100) / 100 : null,
        oveja_top: top,
        resumen_queseria: {
          total_queso_kg: q.total_queso_kg != null ? q.total_queso_kg : null,
          rendimiento_promedio: q.rendimiento_promedio_real != null ? q.rendimiento_promedio_real : null,
          margen_total_cop: q.margen_total_cop != null ? q.margen_total_cop : null
        },
        fuente: 'supabase_directo'
      });
    }

    if (name === 'estado_sala_cuna') {
      if (!DB) return JSON.stringify({ error: 'Capa de datos no disponible.' });
      const d0 = new Date(); d0.setHours(0, 0, 0, 0);
      const d1 = new Date(); d1.setHours(23, 59, 59, 999);
      const rc = await DB.getCorderosCrianza(true);
      const corderos = (rc && rc.data) || [];
      const rp = await DB.getTomasPendientes({ desde: d0.toISOString(), hasta: d1.toISOString() });
      const pend = (rp && rp.data) || [];
      const rv = await DB.getTomasVencidas();
      const venc = (rv && rv.data) || [];
      const alertas = [];
      const out = [];
      for (const c of corderos) {
        const nombre = (c.cordero && (c.cordero.nombre || c.cordero.codigo)) || 'cordero';
        let gmd = null; try { gmd = await DB.calcularGMD(c.cordero_id); } catch (e) {}
        let cal = 0; try { cal = await DB.getCalostroTotal24h(c.cordero_id); } catch (e) {}
        const calostro_ok = !!cal;
        if (!calostro_ok) alertas.push('Sin calostro: ' + nombre);
        out.push({
          nombre,
          dias_en_crianza: c.fecha_inicio ? Math.floor((Date.now() - new Date(c.fecha_inicio)) / 86400000) : null,
          gmd_g_dia: gmd != null ? Math.round(gmd * 1000) : null,
          calostro_ok,
          compliance_7d_pct: null,
          _ccid: c.id
        });
      }
      // compliance 7d por cordero (cumplidas / cumplidas+perdidas)
      try {
        const sieteAgo = new Date(Date.now() - 7 * 86400000).toISOString();
        const { data } = await window._sb.from('tomas_programadas')
          .select('corderos_crianza_id, estado')
          .gte('fecha_hora_programada', sieteAgo)
          .in('estado', ['cumplida', 'perdida']);
        const agg = {};
        (data || []).forEach(t => { const a = agg[t.corderos_crianza_id] || (agg[t.corderos_crianza_id] = { ok: 0, tot: 0 }); a.tot++; if (t.estado === 'cumplida') a.ok++; });
        out.forEach(o => { const a = agg[o._ccid]; if (a && a.tot) o.compliance_7d_pct = Math.round(a.ok / a.tot * 100); delete o._ccid; });
      } catch (e) { out.forEach(o => { delete o._ccid; }); }
      return JSON.stringify({
        corderos_activos: corderos.length,
        tomas_pendientes_hoy: pend.length,
        tomas_vencidas_hoy: venc.length,
        corderos: out,
        alertas
      });
    }

    if (name === 'calcular_decision_sustituto') {
      if (!DB) return JSON.stringify({ error: 'Capa de datos no disponible.' });
      const rc = await DB.getCorderosCrianza(true);
      const corderos = (rc && rc.data) || [];
      const c = corderos.find(x => x.id === input.cordero_id);
      if (!c) return JSON.stringify({ error: 'Cordero no encontrado en crianza activa.' });
      const corderoNombre = (c.cordero && (c.cordero.nombre || c.cordero.codigo)) || 'cordero';
      const rl = await DB.getLactancias(true);
      const lacts = (rl && rl.data) || [];
      const lact = c.madre_id ? lacts.find(l => l.animal_id === c.madre_id) : null;
      const madreNombre = (lact && lact.animal && (lact.animal.nombre || lact.animal.codigo))
        || (c.madre && (c.madre.nombre || c.madre.codigo)) || 'desconocida';
      let prodMadre = 0, comp = {};
      if (lact) {
        const ctr = lact.controles || [];
        const ult = ctr.length ? ctr[ctr.length - 1] : null;
        if (ult) { prodMadre = Number(ult.leche_dia_l) || 0; comp = { grasa_pct: ult.grasa_pct, caseina_pct: ult.caseina_pct }; }
      }
      const rendObj = await DB.calcularRendimientoTeorico(null, comp);
      const rend = rendObj.rendimiento_l_kg || 3.9;
      const diasCrianza = c.fecha_inicio ? Math.floor((Date.now() - new Date(c.fecha_inicio)) / 86400000) : 0;
      const diasRest = (input.dias_restantes != null) ? input.dias_restantes : Math.max(0, 56 - diasCrianza);
      const consumoG = 600; // g/día de polvo (referencia)
      const costoSust = (consumoG / 1000) * (input.precio_sustituto_cop_kg || 0) * diasRest;
      const litrosLib = prodMadre * diasRest;
      const kgQueso = rend > 0 ? litrosLib / rend : 0;
      const valorQueso = kgQueso * (input.precio_queso_cop_kg || 0);
      const dif = valorQueso - costoSust;
      const margen = costoSust > 0 ? Math.round(dif / costoSust * 100) : null;
      const rec = dif > 50000 ? 'destetar' : (dif < -50000 ? 'sustituto' : 'equilibrio');
      const cop = (x) => '$' + Math.round(x).toLocaleString('es-CO');
      let resumen;
      if (rec === 'destetar') resumen = 'Conviene DESTETAR a ' + corderoNombre + ': la leche de ' + madreNombre + ' como queso vale ' + cop(valorQueso) + ' vs ' + cop(costoSust) + ' de sustituto en ' + diasRest + ' días — diferencia a favor del queso ' + cop(dif) + (margen != null ? (' (' + margen + '%)') : '') + '.';
      else if (rec === 'sustituto') resumen = 'Conviene el SUSTITUTO para ' + corderoNombre + ': cuesta ' + cop(costoSust) + ' vs ' + cop(valorQueso) + ' de valor de la leche como queso — el sustituto ahorra ' + cop(-dif) + '.';
      else resumen = 'Punto de equilibrio para ' + corderoNombre + ': sustituto ' + cop(costoSust) + ' vs queso ' + cop(valorQueso) + ' (diferencia ' + cop(dif) + '). Decidir por mano de obra, mortalidad y GMD.';
      if (prodMadre <= 0) resumen += ' Nota: no hay control lechero reciente de la madre; el valor de la leche es estimado en 0 — registra producción para afinar.';
      return JSON.stringify({
        cordero_nombre: corderoNombre,
        madre_nombre: madreNombre,
        dias_restantes: diasRest,
        costo_sustituto_total_cop: Math.round(costoSust),
        valor_leche_queso_cop: Math.round(valorQueso),
        diferencia_cop: Math.round(dif),
        margen_pct: margen,
        recomendacion: rec,
        resumen
      });
    }

    return JSON.stringify({ error: 'Tool no reconocida' });
  },

  // ── Claude (Anthropic) vía proxy serverless ───────────
  // Loop agentic de function calling: hasta 3 iteraciones.
  // Mantiene la firma (system, messages) que usa ask().
  async _askClaude(system, messages) {
    const msgs = messages.slice();

    // Token de la sesión activa para autenticar el proxy serverless
    const session = window._sb ? (await window._sb.auth.getSession()).data.session : null;
    if (!session) throw new Error('Sesión expirada. Vuelve a iniciar sesión para usar el copiloto.');

    for (let i = 0; i < 3; i++) {
      const res = await fetch(this._apiBase() + '/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + session.access_token
        },
        body: JSON.stringify({
          model: 'claude-opus-4-5',
          max_tokens: 1024,
          system,
          tools: COPILOTO_TOOLS,
          messages: msgs
        })
      });
      const data = await res.json();

      if (data && data.error) {
        throw new Error((data.error && data.error.message) || data.error || 'Error de la API de Claude');
      }

      // Si el modelo pide ejecutar tools → ejecutarlas y continuar
      if (data.stop_reason === 'tool_use' && Array.isArray(data.content)) {
        msgs.push({ role: 'assistant', content: data.content });
        const toolUses = data.content.filter(b => b.type === 'tool_use');
        const toolResults = [];
        for (const b of toolUses) {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: b.id,
            content: await this._ejecutarTool(b.name, b.input)
          });
        }
        msgs.push({ role: 'user', content: toolResults });
        continue; // siguiente iteración
      }

      // Respuesta final con texto
      if (data && Array.isArray(data.content)) {
        const texto = data.content
          .filter(b => b.type === 'text')
          .map(b => b.text || '')
          .join('');
        return texto || 'Sin respuesta.';
      }

      return 'Sin respuesta.';
    }

    return 'Respuesta no disponible — límite de iteraciones alcanzado.';
  },

  // ── Grok (xAI) vía proxy serverless ───────────────────
  async _askGrok(system, messages) {
    // Grok solo funciona donde el proxy tiene la GROK_API_KEY (Vercel)
    // o si se inyectó window.GROK_API_KEY localmente.
    if (!window.GROK_API_KEY &&
        !window.location.hostname.includes('vercel.app') &&
        window.location.hostname !== 'localhost') {
      return 'Grok disponible próximamente. Configura GROK_API_KEY en Vercel.';
    }
    const session = window._sb ? (await window._sb.auth.getSession()).data.session : null;
    if (!session) return 'Sesión expirada. Vuelve a iniciar sesión para usar el copiloto.';
    const res = await fetch(this._apiBase() + '/api/chat-grok', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + session.access_token
      },
      body: JSON.stringify({ messages, system })
    });
    const data = await res.json();
    // Formato xAI es OpenAI-compatible
    if (data && data.choices && data.choices[0]) {
      return data.choices[0].message?.content || 'Sin respuesta.';
    }
    if (data && data.error) {
      throw new Error((data.error && data.error.message) || data.error || 'Error de la API de Grok');
    }
    return 'Sin respuesta.';
  },

  // ── Utilidades ────────────────────────────────────────
  reset() { this._historial = []; },
  getHistorial() { return this._historial.slice(); },
  grokDisponible() {
    // Disponible si hay key local o si corremos donde el proxy la tiene.
    return !!window.GROK_API_KEY ||
      window.location.hostname.includes('vercel.app') ||
      window.location.hostname === 'localhost';
  }
};
