// ── copiloto.js ───────────────────────────────────────
// El cerebro de inteligencia operacional de LAAAMBAPP.
// Copiloto dual: Claude (Anthropic) + Grok (xAI).
// Construye contexto en vivo desde AppState y mantiene
// historial de conversación por sesión.

window.Copiloto = {
  // Historial de conversación en memoria (por sesión de página)
  _historial: [],

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
Razas presentes: ${razas.length ? razas.join(', ') : 'Dorper, Katahdin, Lacaune'}${finanzas}`;
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

    return `Eres el copiloto de inteligencia operacional de LAAAMB, finca de corderos Dorper y Katahdin en La Marinilla, Antioquia, Colombia. Propietario: Juan Manuel Arbelaez.

Estás conversando con ${nombre} (rol: ${rol}).

DATOS ACTUALES DE LA FINCA:
${this.getContexto()}

Respondes en español, eres conciso y práctico.
Priorizas la salud animal, la rentabilidad y el bienestar.
Cuando no tienes datos suficientes lo dices claramente.

${enfoque}`;
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

  // ── Claude (Anthropic) vía proxy serverless ───────────
  async _askClaude(system, messages) {
    const res = await fetch(this._apiBase() + '/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages,
        system,
        model: 'claude-sonnet-4-20250514'
      })
    });
    const data = await res.json();
    if (data && data.content) {
      return data.content.map(b => b.text || '').join('') || 'Sin respuesta.';
    }
    if (data && data.error) {
      throw new Error((data.error && data.error.message) || data.error || 'Error de la API de Claude');
    }
    return 'Sin respuesta.';
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
    const res = await fetch(this._apiBase() + '/api/chat-grok', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
