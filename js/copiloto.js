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
  _ejecutarTool(name, input) {
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
        const toolResults = data.content
          .filter(b => b.type === 'tool_use')
          .map(b => ({
            type: 'tool_result',
            tool_use_id: b.id,
            content: this._ejecutarTool(b.name, b.input)
          }));
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
