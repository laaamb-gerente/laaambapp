// ── aparceria.js ───────────────────────────────────────────────────────
// Capa de datos y motor de KPIs del módulo APARCERÍA.
//
// Fuente ÚNICA de verdad de los cálculos: la usan aportantes-animales.html,
// reporte-aportantes.html, el adaptador de REPORTES y el cargador. Si un KPI
// se calculara en dos sitios con dos fórmulas, el reporte y el listado se
// contradirían; por eso todo pasa por APARCERIA.kpis().
//
// ⚠️ Este módulo NUNCA lee ni escribe la tabla 'animales' del hato real.
//    Solo aportantes / aportantes_animales / aportantes_cargas /
//    aportantes_pesajes. Los animales de aparcería no son inventario de
//    La Marinilla y no entran en ningún agregado de la finca.
//
// ⚠️ El destino del animal se lee SOLO de estado_salida (0057). Las columnas
//    'vivo' y 'localizado' de la 0056 fueron eliminadas a propósito: dos
//    columnas describiendo el mismo hecho pueden desincronizarse.
//
// ── POR QUÉ LOS REPORTES DE FINCA NO APLICAN A APARCERÍA ───────────────
// Decisión de arquitectura, no una limitación pendiente de arreglar.
//
// Se evaluó agregar un selector de fuente en reportes.html para correr los
// reportes de la finca sobre estos animales. Se descartó por tres razones,
// en orden de peso:
//
//   1. ICA / RSPP queda fuera con CUALQUIER diseño. Radicar animales de
//      terceros bajo el registro ICA de La Marinilla es exposición
//      regulatoria, no un hueco de datos. Ningún adaptador arregla eso.
//   2. ROLES. reportes.html es visible para veterinario y socio (ver
//      roles.js PAGE_ACCESS). Un selector ahí filtraría datos de los
//      aparceros a dos roles que se decidió excluir del módulo. Blindarlo
//      es complejidad añadida para habilitar un solo reporte.
//   3. LA UNIDAD REAL DE reportes.html ES EL GENERADOR, NO EL TEMA. Solo
//      hay 5 (Semanal, Mensual, Inventario, Trazabilidad, ICA) y cada uno
//      agrupa varios temas. Composición, mortalidad y crecimiento no son
//      reportes: son secciones DENTRO de Semanal y Mensual, que dependen de
//      tratamientos, partos, costos e ingresos. Solo Inventario sería
//      compatible — 1 de 5 — y duplicaría lo que ya exporta
//      reporte-aportantes.html.
//
// La razón de fondo: estos animales son un CORTE DE VITRINA. No tienen
// tratamientos, ni partos registrados, ni costos, ni movilizaciones, ni
// trazabilidad de beneficio. Los reportes de finca leen precisamente esas
// tablas hijas, así que correrlos aquí devolvería ceros — y un reporte en
// cero se lee como "no hubo tratamientos", que es falso y peor que no
// ofrecer el reporte.
//
// El día que estos animales se manejen de verdad en el sistema (con sus
// tratamientos y partos reales), esto cambia. Ese día es una decisión de
// arquitectura nueva, no un parche a este archivo.
//
// Por eso las vistas temáticas que sí aplican (composición por sexo y raza,
// distribución por grupo, mortalidad con causas, sacrificios en línea
// aparte) viven en reporte-aportantes.html y se calculan aquí abajo.
// reportes.html NO se toca.

(function () {
  'use strict';

  var FINCA_ID = 'a1b2c3d4-0000-0000-0000-000000000001';

  // Multiplicador contractual: meta_anual = hato_inicial × 2.7.
  // Se verifica, no se usa para calcular: meta_anual es dato de contrato y
  // vive en la tabla. Si dejan de cuadrar, es un error de captura y el
  // reporte lo debe avisar en vez de recalcular por su cuenta.
  var META_MULT = 2.7;

  // Fases de carga. Mientras falte alguna, los indicadores no son
  // representativos y la UI lo advierte.
  var FASES = {
    1: { clave: 'fundadoras',  etiqueta: 'Fundadoras' },
    2: { clave: 'nacimientos', etiqueta: 'Nacimientos' },
    3: { clave: 'salidas',     etiqueta: 'Salidas por sacrificio' }
  };

  function sb() {
    if (!window._sb) throw new Error('Supabase no inicializado (window._sb)');
    return window._sb;
  }

  // Toda respuesta de Supabase se valida: si trae error, se lanza. Sin
  // try/catch vacíos — el error llega a la UI con su mensaje real.
  function chk(res, contexto) {
    if (res && res.error) {
      throw new Error(contexto + ': ' + (res.error.message || JSON.stringify(res.error)));
    }
    return res ? res.data : null;
  }

  // ── DATOS ───────────────────────────────────────────────────────────
  async function getAportantes() {
    return chk(
      await sb().from('aportantes').select('*').eq('finca_id', FINCA_ID).order('nombre'),
      'cargar aportantes'
    ) || [];
  }

  async function getAnimales(aportante_id) {
    var q = sb().from('aportantes_animales')
      .select('*, pesajes:aportantes_pesajes(fecha, peso_kg, tipo, nota)')
      .eq('finca_id', FINCA_ID);
    if (aportante_id) q = q.eq('aportante_id', aportante_id);
    return chk(await q.order('codigo'), 'cargar animales de aparcería') || [];
  }

  async function getCargas(aportante_id) {
    var q = sb().from('aportantes_cargas')
      .select('*, ejecutada_por:perfiles(nombre)')
      .eq('finca_id', FINCA_ID);
    if (aportante_id) q = q.eq('aportante_id', aportante_id);
    return chk(await q.order('ejecutada_at', { ascending: false }), 'cargar historial de cargas') || [];
  }

  // ── PREDICADOS ──────────────────────────────────────────────────────
  // 'proyectado' son filas SIMULADAS: quedan fuera de TODO KPI de portada y
  // se subtotalizan aparte como escenario.
  function esReal(a) { return a.origen === 'real'; }
  function esProy(a) { return a.origen === 'proyectado'; }

  // Un animal está en el hato solo si su estado_salida es 'activo'.
  function enHato(a)   { return esReal(a) && a.estado_salida === 'activo'; }
  function esMuerto(a) { return esReal(a) && a.estado_salida === 'muerte'; }
  function esSacrif(a) { return esReal(a) && a.estado_salida === 'sacrificio'; }
  function esVenta(a)  { return esReal(a) && a.estado_salida === 'venta'; }
  function esNoLoc(a)  { return esReal(a) && a.estado_salida === 'no_localizado'; }

  function esFundadora(a) { return a.tipo === 'madre_lote_inicial'; }
  function esCria(a)      { return a.tipo === 'cria'; }

  // pct devuelve null si el denominador es 0 o nulo: nunca Infinity ni NaN.
  // La UI imprime '—' ante null, así que un dataset vacío no muestra basura.
  function pct(num, den) {
    if (den == null || den === 0) return null;
    return Math.round((num / den) * 1000) / 10;
  }

  // ── PESO VIGENTE ────────────────────────────────────────────────────
  // Jerarquía sacrificio > real > estimado. Ante empate de tipo, gana la
  // fecha más reciente. No se promedia ni se interpola: se elige un pesaje
  // concreto y se reporta su tipo, para que un estimado nunca se lea como
  // un pesaje de balanza.
  var PRIORIDAD = { sacrificio: 3, real: 2, estimado: 1 };
  function pesoVigente(a) {
    var ps = a.pesajes || [];
    if (!ps.length) {
      // Las columnas peso_* del animal NO son un residuo: son el hogar del
      // peso SIN fecha, que no cabe en aportantes_pesajes porque allí 'fecha'
      // es NOT NULL y parte del índice único. Caso real: la chapeta 235 de
      // MAURICIO, 35 kg de balanza sin fecha en el origen. Se devuelve con
      // fecha null — nunca se le sustituye por la fecha de corte, que
      // convertiría un dato incompleto en uno falso etiquetado como 'real'.
      if (a.peso_kg == null) return null;
      return { peso_kg: Number(a.peso_kg), tipo: a.peso_tipo || 'estimado',
               fecha: a.peso_fecha || null, nota: a.peso_nota || null };
    }
    var mejor = null;
    ps.forEach(function (p) {
      if (!mejor) { mejor = p; return; }
      var dp = (PRIORIDAD[p.tipo] || 0) - (PRIORIDAD[mejor.tipo] || 0);
      if (dp > 0 || (dp === 0 && String(p.fecha) > String(mejor.fecha))) mejor = p;
    });
    return { peso_kg: Number(mejor.peso_kg), tipo: mejor.tipo,
             fecha: mejor.fecha, nota: mejor.nota || null };
  }

  // ── MOTOR DE KPIs ───────────────────────────────────────────────────
  // rows = filas de UN aportante. aportante = fila de 'aportantes'.
  // Diseñado para dar resultados coherentes con rows = [] (fase 0).
  function kpis(rows, aportante) {
    rows = rows || [];
    var reales = rows.filter(esReal);
    var proyectados = rows.filter(esProy);

    var activos    = reales.filter(enHato);
    var muertos    = reales.filter(esMuerto);
    var sacrifs    = reales.filter(esSacrif);
    var ventas     = reales.filter(esVenta);
    var noLoc      = reales.filter(esNoLoc);

    var fundadoras = reales.filter(esFundadora);
    var crias      = reales.filter(esCria);
    var fundActivas = fundadoras.filter(enHato);
    var criasActivas = crias.filter(enHato);

    // hato_inicial = MADRES APORTADAS al firmar. Cláusula de contrato que se
    // lee de la tabla; jamás se deriva de las filas cargadas.
    var hatoInicial = (aportante && aportante.hato_inicial != null)
      ? Number(aportante.hato_inicial) : null;
    var meta = (aportante && aportante.meta_anual != null)
      ? Number(aportante.meta_anual) : null;

    var hatoActual = activos.length;

    // Crecimiento sobre la base contractual. Con hato_actual = 0 da -100%,
    // que es correcto y no un error a esconder.
    var crecPct  = pct(hatoActual - (hatoInicial || 0), hatoInicial);
    var crecNeto = hatoInicial != null ? hatoActual - hatoInicial : null;

    // Coherencia meta ↔ base: meta_anual debería ser hato_inicial × 2.7.
    // Se AVISA, no se corrige: si no cuadra es un error de captura.
    var metaEsperada = hatoInicial != null
      ? Math.round(hatoInicial * META_MULT * 100) / 100 : null;
    var metaCoherente = (meta == null || metaEsperada == null)
      ? null : Math.abs(meta - metaEsperada) < 0.01;

    // Gap de conciliación: fundadoras REGISTRADAS vs madres CONTRATADAS.
    // Ambas cifras son correctas en su contexto; no se ajusta ninguna.
    var gap = hatoInicial != null ? fundadoras.length - hatoInicial : null;

    // Estado reproductivo sobre el hato activo.
    var prenadas = activos.filter(function (a) { return a.estado_reproductivo === 'prenada'; });
    var paridas  = activos.filter(function (a) { return a.estado_reproductivo === 'madre'; });
    var vacias   = activos.filter(function (a) { return a.estado_reproductivo === 'vacia'; });
    var sinDato  = activos.filter(function (a) {
      return a.estado_reproductivo === 'sin_dato' || a.estado_reproductivo == null;
    });
    var evaluadas = prenadas.length + paridas.length + vacias.length;

    // Prolificidad: crías registradas ÷ madres distintas en madre_codigo.
    var madres = {};
    crias.forEach(function (a) {
      var m = (a.madre_codigo || '').trim();
      if (m) madres[m] = true;
    });
    var nMadres = Object.keys(madres).length;

    function agrupar(lista, campo) {
      var acc = {};
      lista.forEach(function (a) {
        var v = (a[campo] || '').trim() || 'Sin registrar';
        acc[v] = (acc[v] || 0) + 1;
      });
      return Object.keys(acc).map(function (k) { return { clave: k, n: acc[k] }; })
        .sort(function (x, y) { return y.n - x.n; });
    }

    var conPeso = reales.map(pesoVigente).filter(Boolean);

    return {
      // ── Totales de registro ──
      totalRegistradas: reales.length,
      fundadorasRegistradas: fundadoras.length,
      fundadorasActivas: fundActivas.length,
      criasRegistradas: crias.length,
      criasActivas: criasActivas.length,

      // ── Crecimiento ──
      hatoInicial: hatoInicial,
      hatoActual: hatoActual,
      crecimientoNeto: crecNeto,
      crecimientoPct: crecPct,
      meta: meta,
      metaEsperada: metaEsperada,
      metaCoherente: metaCoherente,
      cumplimientoPct: pct(hatoActual, meta),
      gapConciliacion: gap,

      // ── Salidas: cada tipo en su propia línea, NUNCA sumadas ──
      muertes: muertos.length,
      mortalidadPct: pct(muertos.length, reales.length),
      causasBaja: agrupar(muertos, 'motivo_salida'),
      // REGLA: toda vista de mortalidad con filtro de fechas DEBE mostrar
      // aparte este conteo. Una baja sin fecha_salida cae fuera de cualquier
      // rango, así que un filtro diría "7 muertes en 2026" habiendo 23 — una
      // falla silenciosa. Exponerlo obliga a que la vista lo declare.
      muertesSinFecha: muertos.filter(function (a) { return !a.fecha_salida; }).length,
      muertesConFecha: muertos.filter(function (a) { return !!a.fecha_salida; }).length,
      sacrificios: sacrifs.length,
      sacrificiosPct: pct(sacrifs.length, reales.length),
      ventas: ventas.length,
      noLocalizados: noLoc.length,
      noLocalizadosDetalle: noLoc,

      // ── Reproductivo ──
      prenadas: prenadas.length,
      paridas: paridas.length,
      vacias: vacias.length,
      sinDato: sinDato.length,
      fertilidadPct: pct(prenadas.length + paridas.length, evaluadas),
      prolificidad: nMadres ? Math.round((crias.length / nMadres) * 100) / 100 : null,
      madresDistintas: nMadres,

      // ── Escenario proyectado — SIEMPRE aparte ──
      proyectados: proyectados.length,
      hatoConEscenario: hatoActual + proyectados.length,

      // ── Composición ──
      porSexo: agrupar(activos, 'sexo'),
      porRaza: agrupar(activos, 'raza'),
      porGrupo: agrupar(activos, 'grupo'),

      // ── Calidad del dato ──
      sinFechaNacimiento: reales.filter(function (a) { return !a.fecha_nacimiento; }).length,
      sinPeso: reales.length - conPeso.length,
      pesosReales: conPeso.filter(function (p) { return p.tipo === 'real'; }).length,
      pesosEstimados: conPeso.filter(function (p) { return p.tipo === 'estimado'; }).length,
      pesosSacrificio: conPeso.filter(function (p) { return p.tipo === 'sacrificio'; }).length
    };
  }

  // ── IDENTIDADES ESTRUCTURALES ───────────────────────────────────────
  // Valen con CUALQUIER dataset, incluido el vacío. No comprueban valores
  // puntuales (esos salen del fixture regenerable), sino que el motor sea
  // internamente coherente. Si una falla, el motor está mal, no los datos.
  function verificarIdentidades(rows, aportante) {
    var k = kpis(rows, aportante);
    var reales = (rows || []).filter(esReal);
    var out = [];
    function id(nombre, ok, detalle) { out.push({ id: nombre, ok: !!ok, detalle: detalle || '' }); }

    id('fundadoras_activas + crias_activas = hato_actual',
      k.fundadorasActivas + k.criasActivas === k.hatoActual,
      k.fundadorasActivas + ' + ' + k.criasActivas + ' = ' + k.hatoActual);

    id('hato_actual = count(real AND activo)',
      k.hatoActual === reales.filter(enHato).length);

    // La identidad de conservación incluye VENTAS: el CHECK de estado_salida
    // admite 'venta', así que omitirla rompería la suma en cuanto se registre
    // una. Se verifica con los 5 estados, no con 4.
    id('activos + muertes + sacrificios + ventas + no_localizados = total real',
      k.hatoActual + k.muertes + k.sacrificios + k.ventas + k.noLocalizados === k.totalRegistradas,
      k.hatoActual + '+' + k.muertes + '+' + k.sacrificios + '+' + k.ventas + '+'
        + k.noLocalizados + ' = ' + k.totalRegistradas);

    id('fundadoras + crias = total real',
      k.fundadorasRegistradas + k.criasRegistradas === k.totalRegistradas);

    id('gap = fundadoras_registradas - hato_inicial',
      k.hatoInicial == null
        ? k.gapConciliacion === null
        : k.gapConciliacion === k.fundadorasRegistradas - k.hatoInicial);

    id('crecimiento = (hato_actual - hato_inicial) / hato_inicial',
      (!k.hatoInicial)
        ? k.crecimientoPct === null
        : k.crecimientoPct === Math.round(((k.hatoActual - k.hatoInicial) / k.hatoInicial) * 1000) / 10);

    id('cumplimiento = hato_actual / meta_anual',
      (!k.meta)
        ? k.cumplimientoPct === null
        : k.cumplimientoPct === Math.round((k.hatoActual / k.meta) * 1000) / 10);

    id('meta_anual = hato_inicial x 2.7',
      k.metaCoherente === null ? true : k.metaCoherente === true,
      'meta=' + k.meta + ' esperada=' + k.metaEsperada);

    // Los sacrificios NUNCA entran en mortalidad: un cordero vendido al
    // matadero no es una pérdida productiva.
    id('mortalidad excluye sacrificios',
      k.mortalidadPct === pct(k.muertes, k.totalRegistradas)
        && (k.sacrificios === 0 || k.mortalidadPct !== pct(k.muertes + k.sacrificios, k.totalRegistradas)));

    id('proyectados fuera del hato',
      reales.length + k.proyectados === (rows || []).length
        && k.hatoConEscenario === k.hatoActual + k.proyectados);

    // Ningún porcentaje puede ser NaN ni Infinity, ni con dataset vacío.
    var pcts = ['crecimientoPct','cumplimientoPct','mortalidadPct','sacrificiosPct','fertilidadPct'];
    var sucios = pcts.filter(function (p) {
      var v = k[p];
      return v !== null && (typeof v !== 'number' || !isFinite(v));
    });
    id('ningun porcentaje NaN/Infinity', sucios.length === 0, sucios.join(','));

    return { kpis: k, identidades: out, fallan: out.filter(function (r) { return !r.ok; }) };
  }

  window.APARCERIA = {
    FINCA_ID: FINCA_ID,
    META_MULT: META_MULT,
    FASES: FASES,
    getAportantes: getAportantes,
    getAnimales: getAnimales,
    getCargas: getCargas,
    kpis: kpis,
    verificarIdentidades: verificarIdentidades,
    pesoVigente: pesoVigente,
    esReal: esReal,
    esProy: esProy,
    enHato: enHato,
    esMuerto: esMuerto,
    esSacrif: esSacrif,
    esVenta: esVenta,
    esNoLoc: esNoLoc,
    esFundadora: esFundadora,
    esCria: esCria,
    pct: pct
  };
})();
