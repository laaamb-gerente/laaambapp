// ── copiloto.js ───────────────────────────────────────
// Copiloto LAAAMB — SOLO Grok (xAI).
// Tools sobre inventarios/historiales reales + visión (fotos).
// Propuestas de escritura con confirmación en UI.

// Tools en formato OpenAI / xAI
const COPILOTO_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'buscar_animal',
      description: 'Busca un animal del hato por chapeta/código o UUID. Usar SIEMPRE antes de recomendar tratamiento de un animal concreto.',
      parameters: {
        type: 'object',
        properties: {
          codigo: { type: 'string', description: 'Chapeta o código (ej. 377, OV-123)' },
          animal_id: { type: 'string', description: 'UUID del animal si se conoce' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_historial_animal',
      description: 'Historial clínico y productivo de un animal: tratamientos, pesajes, partos, crías. Requiere codigo o animal_id.',
      parameters: {
        type: 'object',
        properties: {
          codigo: { type: 'string' },
          animal_id: { type: 'string' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_inventario_medicamentos',
      description: 'Lista el inventario de medicamentos de la finca (stock, vencimiento, principio activo).',
      parameters: {
        type: 'object',
        properties: {
          solo_con_stock: { type: 'boolean', description: 'Si true, solo con stock_actual > 0' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'proponer_alta_medicamento',
      description: 'Estructura una propuesta de ALTA de medicamento al inventario. NO guarda; el usuario confirma en la UI.',
      parameters: {
        type: 'object',
        properties: {
          nombre: { type: 'string' },
          principio_activo: { type: 'string' },
          tipo: { type: 'string', description: 'ej. antiparasitario, antibiotico, vitamina' },
          unidad: { type: 'string', description: 'Presentación: ml, frasco, kg, dosis…' },
          stock_actual: { type: 'number' },
          fecha_vencimiento: { type: 'string', description: 'YYYY-MM-DD si se ve' },
          lote_texto: { type: 'string' },
          dias_retiro: { type: 'number' },
          dosis_sugerida: { type: 'string' },
          notas: { type: 'string' }
        },
        required: ['nombre']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'proponer_nacimiento',
      description: 'Estructura una propuesta de registro de nacimiento/parto. NO guarda; el usuario confirma.',
      parameters: {
        type: 'object',
        properties: {
          madre_codigo: { type: 'string' },
          fecha: { type: 'string', description: 'YYYY-MM-DD' },
          notas: { type: 'string' },
          crias: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                codigo: { type: 'string' },
                sexo: { type: 'string', description: 'H o M / hembra o macho' },
                peso_kg: { type: 'number' },
                estado_al_nacer: { type: 'string', description: 'vivo o muerto' }
              }
            }
          }
        },
        required: ['madre_codigo', 'crias']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'proponer_baja',
      description: 'Estructura una propuesta de baja/muerte. NO guarda; el usuario confirma.',
      parameters: {
        type: 'object',
        properties: {
          animal_codigo: { type: 'string' },
          fecha: { type: 'string' },
          causa: { type: 'string' },
          peso_kg: { type: 'number' },
          notas: { type: 'string' },
          tipo: { type: 'string', description: 'muerte (default), robo, otro' }
        },
        required: ['animal_codigo', 'causa']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_alertas_activas',
      description: 'Alertas operacionales activas del día (partos, dosis, sala cuna, etc.).',
      parameters: {
        type: 'object',
        properties: {
          prioridad: { type: 'string', enum: ['todas', 'critica', 'alta', 'media'] }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'estado_sala_cuna',
      description: 'Estado de Sala Cuna: corderos en crianza artificial y tomas del día.',
      parameters: { type: 'object', properties: {} }
    }
  }
];

function explicarErrorGrok(msg) {
  const s = String(msg || '');
  if (/newly created team|credits or licenses/i.test(s)) {
    return 'La clave GROK_API_KEY está en un team nuevo de console.x.ai sin créditos. ' +
      'Los créditos de grok.com / X Premium no sirven para la API. ' +
      'En https://console.x.ai cambiá al team que SÍ tiene saldo (casi siempre Personal Team), ' +
      'creá una API key ahí y reemplazá GROK_API_KEY en Vercel (proyecto laaambapp).';
  }
  if (/insufficient.?credit|credit.?balance|spend limit/i.test(s)) {
    return 'El team de esa API key se quedó sin créditos en console.x.ai. Recargá ahí (no en grok.com) y reintentá.';
  }
  return s;
}

window.Copiloto = {
  _historial: [],
  _enfoquePagina: '',
  _ultimaPropuesta: null,
  _pendingImages: [],

  setEnfoquePagina(texto) {
    this._enfoquePagina = texto || '';
    this._historial = [];
  },

  fincaId() {
    return (window.AppState && window.AppState._finca_id) ||
      'a1b2c3d4-0000-0000-0000-000000000001';
  },

  // ── Contexto vivo de finca ───────────────────────────
  getContexto() {
    const ctx = window.AppState;
    if (!ctx || !ctx._loaded) {
      return 'Datos de la finca aún no disponibles (cargando…).';
    }
    const seisMeses = new Date();
    seisMeses.setMonth(seisMeses.getMonth() - 6);
    const activos = (ctx.animales || []).filter(a => a.estado === 'activo');
    const levante = activos.filter(a =>
      a.fecha_nacimiento && new Date(a.fecha_nacimiento) >= seisMeses
    ).length;
    const conPeso = activos.filter(a => a.peso_actual != null);
    const pesoProm = conPeso.length
      ? Math.round(conPeso.reduce((s, a) => s + (parseFloat(a.peso_actual) || 0), 0) / conPeso.length)
      : null;
    const razas = [...new Set(activos.map(a => a.raza).filter(Boolean))];
    const meds = (ctx.medicamentos || []).length;
    return [
      'Animales activos: ' + activos.length,
      'Hembras: ' + (typeof ctx.getAnimalesHembras === 'function' ? ctx.getAnimalesHembras().length : '—'),
      'Gestantes: ' + (typeof ctx.getGestantes === 'function' ? ctx.getGestantes().length : ((ctx.gestantes || []).length)),
      'Crías en levante (6m): ' + levante,
      'Lotes: ' + ((ctx.lotes || []).length),
      'Medicamentos en inventario: ' + meds,
      'Peso promedio: ' + (pesoProm != null ? pesoProm + ' kg' : 'sin pesajes'),
      'Razas: ' + (razas.length ? razas.join(', ') : '—'),
      'Ubicación: La Marinilla · San Bernardo · Ibagué · Tolima'
    ].join('\n');
  },

  getSystemPrompt() {
    const perfil = window.AUTH_PERFIL || {};
    const rol = perfil.rol || 'operativo';
    const nombre = perfil.nombre || 'Usuario de campo';
    const base = (window.COPILOTO_PROMPT_LAAAMB || '') +
      '\n\nUsuario actual: ' + nombre + ' (rol: ' + rol + ').\n\nDATOS ACTUALES DE LA FINCA:\n' +
      this.getContexto();
    return base + (this._enfoquePagina ? '\n\n' + this._enfoquePagina : '');
  },

  // ── API ──────────────────────────────────────────────
  _apiBase() {
    return (window.location.hostname.includes('vercel.app') ||
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1')
      ? ''
      : 'https://laaambapp.vercel.app';
  },

  async _sessionToken() {
    if (!window._sb) throw new Error('Supabase no disponible');
    const session = (await window._sb.auth.getSession()).data.session;
    if (!session) throw new Error('Sesión expirada. Vuelve a iniciar sesión para usar el copiloto.');
    return session.access_token;
  },

  // Normaliza chapeta
  _normCod(c) {
    return String(c || '').replace(/^#/, '').trim().toUpperCase();
  },

  _findAnimalLocal(codigo, animal_id) {
    const list = (window.AppState && window.AppState.animales) || [];
    if (animal_id) {
      const byId = list.find(a => a.id === animal_id);
      if (byId) return byId;
    }
    if (codigo) {
      const cod = this._normCod(codigo);
      return list.find(a => this._normCod(a.codigo) === cod || this._normCod(a.nombre) === cod) || null;
    }
    return null;
  },

  _mapAnimal(a) {
    if (!a) return null;
    const lote = a.lotes && (a.lotes.nombre || a.lotes) || a.lote || null;
    return {
      id: a.id,
      codigo: a.codigo,
      nombre: a.nombre,
      sexo: a.sexo,
      raza: a.raza,
      especie: a.especie,
      estado: a.estado,
      peso_actual_kg: a.peso_actual,
      fecha_nacimiento: a.fecha_nacimiento,
      estado_reproductivo: a.estado_reproductivo,
      madre_id: a.madre_id,
      padre_id: a.padre_id,
      lote: typeof lote === 'string' ? lote : (lote && lote.nombre) || null,
      lote_actual_id: a.lote_actual_id
    };
  },

  // ── Tools ────────────────────────────────────────────
  async _ejecutarTool(name, input) {
    input = input || {};
    const as = window.AppState;
    const DB = window.DB;
    const finca = this.fincaId();

    try {
      if (name === 'buscar_animal') {
        let a = this._findAnimalLocal(input.codigo, input.animal_id);
        if (!a && DB && input.animal_id) {
          const r = await DB.getAnimal(input.animal_id);
          a = r && r.data;
        }
        if (!a && DB && input.codigo) {
          const r = await DB.getAnimales(finca, { estado: 'activo' });
          const cod = this._normCod(input.codigo);
          a = ((r && r.data) || []).find(x => this._normCod(x.codigo) === cod) || null;
          // también buscar no activos
          if (!a) {
            const r2 = await DB.getAnimales(finca, {});
            a = ((r2 && r2.data) || []).find(x => this._normCod(x.codigo) === cod) || null;
          }
        }
        if (!a) {
          return JSON.stringify({
            encontrado: false,
            mensaje: 'No se encontró animal con chapeta/código "' + (input.codigo || input.animal_id || '') + '". Verifica el número o regístralo primero.'
          });
        }
        return JSON.stringify({ encontrado: true, animal: this._mapAnimal(a) });
      }

      if (name === 'get_historial_animal') {
        let a = this._findAnimalLocal(input.codigo, input.animal_id);
        if (!a && DB && input.codigo) {
          const r = await DB.getAnimales(finca, {});
          const cod = this._normCod(input.codigo);
          a = ((r && r.data) || []).find(x => this._normCod(x.codigo) === cod) || null;
        }
        if (!a && DB && input.animal_id) {
          const r = await DB.getAnimal(input.animal_id);
          a = r && r.data;
        }
        if (!a) {
          return JSON.stringify({ error: 'Animal no encontrado. Llama buscar_animal primero.' });
        }
        const out = {
          animal: this._mapAnimal(a),
          tratamientos: [],
          pesajes: [],
          partos_como_madre: [],
          crias: [],
          nota_famacha: 'FAMACHA no está en un campo fijo de inventario; si el usuario no lo dio, PÍDELO antes de decidir antihelmíntico.'
        };
        if (DB) {
          try {
            const tr = await DB.getTratamientosAnimal(a.id);
            out.tratamientos = ((tr && tr.data) || []).slice(0, 30).map(t => ({
              fecha_inicio: t.fecha_inicio,
              fecha_fin: t.fecha_fin,
              medicamento: (t.medicamentos && t.medicamentos.nombre) || t.medicamento_nombre || null,
              dosis: t.dosis,
              via: t.via,
              estado: t.estado,
              motivo: t.motivo || t.diagnostico,
              fecha_fin_retiro: t.fecha_fin_retiro
            }));
          } catch (e) { /* ignore */ }
          try {
            const pe = await DB.getPesajes(finca, a.id);
            out.pesajes = ((pe && pe.data) || []).slice(0, 15).map(p => ({
              fecha: p.fecha, peso_kg: p.peso, tipo: p.tipo
            }));
          } catch (e) { /* ignore */ }
          try {
            if (typeof DB.getPartosPorAnimal === 'function') {
              const pa = await DB.getPartosPorAnimal(a.id);
              out.partos_como_madre = ((pa && pa.data) || []).slice(0, 10).map(p => ({
                fecha_parto: p.fecha_parto,
                tipo_parto: p.tipo_parto,
                num_vivos: p.num_corderos_vivos,
                corderos: p.corderos_nacidos
              }));
            }
          } catch (e) { /* ignore */ }
          try {
            if (typeof DB.getCrias === 'function') {
              const cr = await DB.getCrias(a.id);
              out.crias = ((cr && cr.data) || []).slice(0, 20);
            }
          } catch (e) { /* ignore */ }
        }
        return JSON.stringify(out);
      }

      if (name === 'get_inventario_medicamentos') {
        let meds = (as && as.medicamentos) || [];
        if (DB && (!meds || !meds.length)) {
          const r = await DB.getMedicamentos(finca);
          meds = (r && r.data) || [];
        }
        if (input.solo_con_stock) {
          meds = meds.filter(m => (parseFloat(m.stock_actual) || 0) > 0);
        }
        return JSON.stringify({
          total: meds.length,
          medicamentos: meds.slice(0, 80).map(m => ({
            id: m.id,
            nombre: m.nombre,
            principio_activo: m.principio_activo,
            tipo: m.tipo,
            unidad: m.unidad,
            stock_actual: m.stock_actual,
            fecha_vencimiento: m.fecha_vencimiento,
            dias_retiro: m.dias_retiro,
            dosis_sugerida: m.dosis_sugerida,
            notas: m.notas
          }))
        });
      }

      if (name === 'proponer_alta_medicamento') {
        const prop = {
          tipo: 'medicamento',
          nombre: input.nombre,
          principio_activo: input.principio_activo || null,
          tipo_med: input.tipo || 'otro',
          unidad: input.unidad || 'unidad',
          stock_actual: input.stock_actual != null ? Number(input.stock_actual) : 1,
          fecha_vencimiento: input.fecha_vencimiento || null,
          lote_texto: input.lote_texto || null,
          dias_retiro: input.dias_retiro != null ? Number(input.dias_retiro) : null,
          dosis_sugerida: input.dosis_sugerida || null,
          notas: input.notas || (input.lote_texto ? ('Lote: ' + input.lote_texto) : null)
        };
        this._ultimaPropuesta = prop;
        return JSON.stringify({
          ok: true,
          mensaje: 'Propuesta lista. El usuario debe CONFIRMAR en la tarjeta de la app para guardar.',
          propuesta: prop
        });
      }

      if (name === 'proponer_nacimiento') {
        const prop = {
          tipo: 'nacimiento',
          madre_codigo: input.madre_codigo,
          fecha: input.fecha || new Date().toISOString().slice(0, 10),
          notas: input.notas || null,
          crias: (input.crias || []).map(c => ({
            codigo: c.codigo || null,
            sexo: c.sexo || 'H',
            peso_kg: c.peso_kg != null ? Number(c.peso_kg) : null,
            estado_al_nacer: c.estado_al_nacer || 'vivo'
          }))
        };
        this._ultimaPropuesta = prop;
        return JSON.stringify({
          ok: true,
          mensaje: 'Propuesta de nacimiento lista. Confirmar en la app para registrar.',
          propuesta: prop
        });
      }

      if (name === 'proponer_baja') {
        const prop = {
          tipo: 'baja',
          animal_codigo: input.animal_codigo,
          fecha: input.fecha || new Date().toISOString().slice(0, 10),
          causa: input.causa || 'Sin causa',
          peso_kg: input.peso_kg != null ? Number(input.peso_kg) : null,
          notas: input.notas || null,
          tipo_baja: input.tipo || 'muerte'
        };
        this._ultimaPropuesta = prop;
        return JSON.stringify({
          ok: true,
          mensaje: 'Propuesta de baja lista. Confirmar en la app para registrar.',
          propuesta: prop
        });
      }

      if (name === 'get_alertas_activas') {
        const alertas = window.AlertasMotor?._alertas || [];
        const filtradas = input.prioridad && input.prioridad !== 'todas'
          ? alertas.filter(a => a.prioridad === input.prioridad)
          : alertas;
        return JSON.stringify(filtradas.slice(0, 25).map(a => ({
          tipo: a.tipo,
          prioridad: a.prioridad,
          mensaje: a.mensaje,
          accion: a.accion_sugerida
        })));
      }

      if (name === 'estado_sala_cuna') {
        if (!DB) return JSON.stringify({ error: 'Capa de datos no disponible.' });
        const rc = await DB.getCorderosCrianza(true);
        const corderos = (rc && rc.data) || [];
        return JSON.stringify({
          corderos_activos: corderos.length,
          corderos: corderos.slice(0, 20).map(c => ({
            id: c.id,
            codigo: c.cordero && (c.cordero.codigo || c.cordero.nombre),
            fecha_inicio: c.fecha_inicio
          }))
        });
      }

      return JSON.stringify({ error: 'Tool no reconocida: ' + name });
    } catch (err) {
      return JSON.stringify({ error: (err && err.message) || String(err) });
    }
  },

  // Extrae bloque <<<PROPUESTA ... PROPUESTA>>> del texto del modelo
  _extractPropuestaFromText(texto) {
    if (!texto) return null;
    const m = String(texto).match(/<<<PROPUESTA\s*([\s\S]*?)\s*PROPUESTA>>>/i);
    if (!m) return this._ultimaPropuesta;
    try {
      const obj = JSON.parse(m[1].trim());
      if (obj && obj.tipo) {
        this._ultimaPropuesta = obj;
        return obj;
      }
    } catch (e) { /* ignore */ }
    return this._ultimaPropuesta;
  },

  _stripPropuestaMarker(texto) {
    return String(texto || '').replace(/<<<PROPUESTA[\s\S]*?PROPUESTA>>>/gi, '').trim();
  },

  // ── ask: SOLO Grok ───────────────────────────────────
  // images: array de data URLs (data:image/jpeg;base64,...)
  async ask(pregunta, _modeloIgnorado, images) {
    const system = this.getSystemPrompt();
    const imgs = images && images.length ? images : (this._pendingImages || []);
    this._pendingImages = [];

    // Mensaje de usuario (texto o multimodal)
    let userContent;
    if (imgs.length) {
      userContent = [{ type: 'text', text: pregunta || 'Analiza la(s) imagen(es) adjunta(s).' }];
      imgs.forEach(function (url) {
        userContent.push({
          type: 'image_url',
          image_url: { url: url }
        });
      });
    } else {
      userContent = pregunta;
    }

    const messages = this._historial
      .map(m => ({ role: m.role, content: m.content }))
      .concat([{ role: 'user', content: userContent }]);

    const respuesta = await this._askGrok(system, messages);

    const textoLimpio = this._stripPropuestaMarker(respuesta.texto || respuesta);
    const propuesta = respuesta.propuesta || this._extractPropuestaFromText(respuesta.texto || respuesta);

    // Historial: guardar solo texto plano (no base64 de imágenes)
    this._historial.push({ role: 'user', content: typeof userContent === 'string' ? userContent : (pregunta || '[imagen]') });
    this._historial.push({ role: 'assistant', content: textoLimpio });

    return {
      texto: textoLimpio,
      propuesta: propuesta || null
    };
  },

  async _askGrok(system, messages) {
    const token = await this._sessionToken();
    let msgs = messages.slice();
    let lastPropuesta = null;

    for (let i = 0; i < 5; i++) {
      const res = await fetch(this._apiBase() + '/api/chat-grok', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token
        },
        body: JSON.stringify({
          system: system,
          messages: msgs,
          tools: COPILOTO_TOOLS,
          max_tokens: 2048
        })
      });

      const data = await res.json();
      if (data && data.error) {
        const msg = (data.error && data.error.message) || data.error || 'Error de la API de Grok';
        throw new Error(explicarErrorGrok(typeof msg === 'string' ? msg : JSON.stringify(msg)));
      }

      const choice = data && data.choices && data.choices[0];
      const message = choice && choice.message;
      if (!message) {
        return { texto: 'Sin respuesta de Grok.', propuesta: null };
      }

      const toolCalls = message.tool_calls;
      if (toolCalls && toolCalls.length) {
        msgs.push({
          role: 'assistant',
          content: message.content || null,
          tool_calls: toolCalls
        });
        for (const tc of toolCalls) {
          let args = {};
          try {
            args = typeof tc.function.arguments === 'string'
              ? JSON.parse(tc.function.arguments || '{}')
              : (tc.function.arguments || {});
          } catch (e) {
            args = {};
          }
          const result = await this._ejecutarTool(tc.function.name, args);
          try {
            const parsed = JSON.parse(result);
            if (parsed && parsed.propuesta) lastPropuesta = parsed.propuesta;
          } catch (e) { /* ignore */ }
          msgs.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: result
          });
        }
        continue;
      }

      const texto = message.content || 'Sin respuesta.';
      const prop = this._extractPropuestaFromText(texto) || lastPropuesta || this._ultimaPropuesta;
      return { texto: texto, propuesta: prop };
    }

    return { texto: 'Límite de pasos del copiloto alcanzado. Reformula la pregunta.', propuesta: lastPropuesta };
  },

  // ── Confirmar propuestas (escritura real) ────────────
  async confirmarPropuesta(prop) {
    prop = prop || this._ultimaPropuesta;
    if (!prop || !prop.tipo) throw new Error('No hay propuesta para confirmar');
    const DB = window.DB;
    if (!DB) throw new Error('Capa de datos no disponible');
    const finca = this.fincaId();
    const colab = (window.AUTH_PERFIL && window.AUTH_PERFIL.nombre) || 'Copiloto';

    if (prop.tipo === 'medicamento') {
      const notas = [prop.notas, prop.lote_texto ? ('Lote: ' + prop.lote_texto) : null].filter(Boolean).join(' · ') || null;
      const res = await DB.saveMedicamento({
        finca_id: finca,
        nombre: prop.nombre,
        tipo: prop.tipo_med || 'otro',
        unidad: prop.unidad || 'unidad',
        stock_actual: prop.stock_actual != null ? prop.stock_actual : 1,
        principio_activo: prop.principio_activo || null,
        dosis_sugerida: prop.dosis_sugerida || null,
        dias_retiro: prop.dias_retiro != null ? prop.dias_retiro : null,
        fecha_vencimiento: prop.fecha_vencimiento || null,
        notas: notas
      });
      if (res && res.error) throw new Error(res.error.message || 'Error guardando medicamento');
      // refrescar AppState meds
      try {
        const r = await DB.getMedicamentos(finca);
        if (r && r.data && window.AppState) window.AppState.medicamentos = r.data;
      } catch (e) { /* ignore */ }
      this._ultimaPropuesta = null;
      return { ok: true, tipo: 'medicamento', data: res.data };
    }

    if (prop.tipo === 'nacimiento') {
      let madre = this._findAnimalLocal(prop.madre_codigo, null);
      if (!madre) {
        const r = await DB.getAnimales(finca, {});
        const cod = this._normCod(prop.madre_codigo);
        madre = ((r && r.data) || []).find(x => this._normCod(x.codigo) === cod) || null;
      }
      if (!madre) throw new Error('Madre no encontrada: ' + prop.madre_codigo);

      const fecha = prop.fecha || new Date().toISOString().slice(0, 10);
      const criasIn = prop.crias || [];
      const animalIds = [];
      const criasDestino = [];

      for (let i = 0; i < criasIn.length; i++) {
        const c = criasIn[i];
        const sexoRaw = String(c.sexo || 'H').toLowerCase();
        const sexo = (sexoRaw === 'm' || sexoRaw === 'macho' || sexoRaw === 'male') ? 'macho' : 'hembra';
        const sexoNac = sexo === 'macho' ? 'M' : 'H';
        const cod = c.codigo || ('OV-' + Date.now().toString().slice(-6) + (i + 1));
        const estadoNacer = c.estado_al_nacer || 'vivo';

        let animalId = null;
        if (estadoNacer !== 'muerto') {
          const ar = await DB.saveAnimal({
            finca_id: finca,
            codigo: cod,
            especie: madre.especie || 'ovino',
            sexo: sexo,
            raza: madre.raza || null,
            fecha_nacimiento: fecha,
            madre_id: madre.id,
            peso_actual: c.peso_kg != null ? c.peso_kg : null,
            estado: 'activo'
          });
          if (ar && ar.error) throw new Error(ar.error.message || 'Error creando cría ' + cod);
          animalId = ar.data && ar.data.id;
          animalIds.push(animalId);
          if (c.peso_kg != null && animalId) {
            try {
              await DB.savePesaje({
                finca_id: finca,
                animal_id: animalId,
                peso: c.peso_kg,
                fecha: fecha,
                tipo: 'nacimiento',
                registrado_por: colab
              });
            } catch (e) { /* ignore */ }
          }
        }
        criasDestino.push({
          animal_id: animalId,
          sexo: sexoNac,
          peso_nacimiento_kg: c.peso_kg != null ? c.peso_kg : null,
          estado_al_nacer: estadoNacer,
          destino_crianza: 'pie_madre',
          notas: null
        });
      }

      const vivos = criasDestino.filter(c => c.estado_al_nacer !== 'muerto').length;
      const muertos = criasDestino.length - vivos;

      if (typeof DB.createParto === 'function') {
        const n = criasDestino.length || 1;
        const tipoMap = { 1: 'simple', 2: 'doble', 3: 'triple', 4: 'cuadruple' };
        const pr = await DB.createParto({
          madre_id: madre.id,
          fecha_parto: fecha,
          tipo_parto: tipoMap[n] || 'cuadruple',
          num_corderos_nacidos: n,
          num_corderos_vivos: vivos,
          estado_madre: 'bien',
          notas: prop.notas || null,
          finca_id: finca,
          responsable: (window.AUTH_PERFIL && window.AUTH_PERFIL.id) || null,
          _animal_ids: animalIds
        }, criasDestino);
        if (pr && pr.error) throw new Error(pr.error.message || 'Error en createParto');
      }

      try {
        await DB.saveAnimal({ id: madre.id, estado_reproductivo: 'lactante' });
      } catch (e) { /* ignore */ }

      // refrescar animales
      try {
        const ra = await DB.getAnimales(finca);
        if (ra && ra.data && window.AppState) window.AppState.animales = ra.data;
      } catch (e) { /* ignore */ }

      this._ultimaPropuesta = null;
      return { ok: true, tipo: 'nacimiento', madre: madre.codigo, crias: vivos };
    }

    if (prop.tipo === 'baja') {
      let a = this._findAnimalLocal(prop.animal_codigo, null);
      if (!a) {
        const r = await DB.getAnimales(finca, {});
        const cod = this._normCod(prop.animal_codigo);
        a = ((r && r.data) || []).find(x => this._normCod(x.codigo) === cod) || null;
      }
      if (!a) throw new Error('Animal no encontrado: ' + prop.animal_codigo);

      const tipoBaja = prop.tipo_baja || 'muerte';
      const payload = {
        finca_id: finca,
        animal_id: a.id,
        tipo: tipoBaja,
        fecha: prop.fecha || new Date().toISOString().slice(0, 10),
        causa: prop.causa || 'Sin causa',
        peso_salida: prop.peso_kg != null ? prop.peso_kg : null,
        notas: prop.notas || null,
        registrado_por: colab
      };
      if (window.Approval && typeof window.Approval.getEstadoInicial === 'function') {
        payload.estado_aprobacion = window.Approval.getEstadoInicial();
        if (typeof window.Approval.getPropuestoPor === 'function') {
          Object.assign(payload, window.Approval.getPropuestoPor());
        }
      }

      const res = await DB.saveBaja(payload);
      if (res && res.error) throw new Error(res.error.message || 'Error guardando baja');

      const estado = payload.tipo === 'muerte' ? 'muerto' : 'descartado';
      await DB.saveAnimal({ id: a.id, estado: estado });

      try {
        const ra = await DB.getAnimales(finca);
        if (ra && ra.data && window.AppState) window.AppState.animales = ra.data;
      } catch (e) { /* ignore */ }

      this._ultimaPropuesta = null;
      return { ok: true, tipo: 'baja', animal: a.codigo, estado: estado };
    }

    throw new Error('Tipo de propuesta desconocido: ' + prop.tipo);
  },

  cancelarPropuesta() {
    this._ultimaPropuesta = null;
  },

  setPendingImages(dataUrls) {
    this._pendingImages = dataUrls || [];
  },

  reset() {
    this._historial = [];
    this._ultimaPropuesta = null;
    this._pendingImages = [];
  },

  getHistorial() { return this._historial.slice(); },

  grokDisponible() {
    return !!window.GROK_API_KEY ||
      window.location.hostname.includes('vercel.app') ||
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.hostname.includes('laaamb');
  }
};
