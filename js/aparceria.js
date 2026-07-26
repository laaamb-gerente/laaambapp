// ── aparceria.js ───────────────────────────────────────────────────────
// Capa de datos y motor de KPIs del módulo APARCERÍA.
//
// Fuente ÚNICA de verdad de los cálculos: la usan aportantes-animales.html,
// reporte-aportantes.html y el cargador. Si un KPI se calcula en dos sitios
// con dos fórmulas, el reporte y el listado se contradicen; por eso todo
// pasa por APARCERIA.kpis().
//
// ⚠️ Este módulo NUNCA lee ni escribe la tabla 'animales' del hato real.
//    Solo aportantes / aportantes_animales / aportantes_cargas.
//    Los animales de aparcería no son inventario de La Marinilla.

(function () {
  'use strict';

  var FINCA_ID = 'a1b2c3d4-0000-0000-0000-000000000001';

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
    var q = sb().from('aportantes_animales').select('*').eq('finca_id', FINCA_ID);
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
  // 'real' vs 'proyectado': los proyectados son filas SIMULADAS y quedan
  // fuera de TODO KPI de portada. Se subtotalizan aparte como escenario.
  function esReal(a)  { return a.origen === 'real'; }
  function esProy(a)  { return a.origen === 'proyectado'; }

  // Un animal cuenta en el hato actual solo si está vivo Y localizado.
  // 'No existe' / 'No esta' / 'Moved off' → vivo=true, localizado=false:
  // no son bajas, son animales que no se pudieron ubicar en campo. Nunca
  // se suman a las muertes ni se cuentan en el hato.
  function enHato(a)  { return esReal(a) && a.vivo === true && a.localizado === true; }
  function esMuerto(a){ return esReal(a) && a.vivo === false; }
  function esNoLoc(a) { return esReal(a) && a.vivo === true && a.localizado === false; }

  // tipo: 'madre_lote_inicial' = del lote aportado al inicio.
  //       'cria' = nacida bajo el manejo del proyecto (crecimiento).
  function esLoteInicial(a) { return a.tipo === 'madre_lote_inicial'; }
  function esNacida(a)      { return a.tipo === 'cria'; }

  function pct(num, den) {
    if (!den || den === 0) return null;
    return Math.round((num / den) * 1000) / 10;
  }

  // ── MOTOR DE KPIs ───────────────────────────────────────────────────
  // rows = filas de UN aportante. aportante = fila de 'aportantes'.
  function kpis(rows, aportante) {
    rows = rows || [];
    var reales = rows.filter(esReal);
    var proyectados = rows.filter(esProy);

    var hato       = reales.filter(enHato);
    var muertos    = reales.filter(esMuerto);
    var noLoc      = reales.filter(esNoLoc);

    var loteInicial      = reales.filter(esLoteInicial);
    var nacidas          = reales.filter(esNacida);
    // "vivo" en estas dos líneas = vivo Y localizado, para que
    // loteInicialVivo + nacidasVivas == hatoActual exactamente.
    var loteInicialVivo  = loteInicial.filter(enHato);
    var nacidasVivas     = nacidas.filter(enHato);

    // hato_inicial es la cifra CONTRACTUAL de madres aportadas. Se lee de
    // aportantes.hato_inicial; jamás se deriva de las filas cargadas.
    var hatoInicial = (aportante && aportante.hato_inicial != null)
      ? Number(aportante.hato_inicial) : null;
    var meta = (aportante && aportante.meta_anual != null)
      ? Number(aportante.meta_anual) : null;

    var hatoActual = hato.length;
    var crecNeto = hatoInicial != null ? hatoActual - hatoInicial : null;
    var crecPct  = hatoInicial ? pct(hatoActual - hatoInicial, hatoInicial) : null;

    // Gap de conciliación: lote inicial REGISTRADO vs madres CONTRATADAS.
    // Son cosas distintas y ambas correctas; el reporte lo muestra como
    // nota al pie. No se ajusta ninguna cifra para cerrarlo.
    var gapConciliacion = hatoInicial != null ? loteInicial.length - hatoInicial : null;

    // Estado reproductivo sobre el hato actual.
    var prenadas = hato.filter(function (a) { return a.estado_reproductivo === 'prenada'; });
    var paridas  = hato.filter(function (a) { return a.estado_reproductivo === 'madre'; });
    var vacias   = hato.filter(function (a) { return a.estado_reproductivo === 'vacia'; });
    var sinDato  = hato.filter(function (a) {
      return a.estado_reproductivo === 'sin_dato' || a.estado_reproductivo == null;
    });

    // Fertilidad excluyendo sin_dato (denominador = evaluadas).
    var evaluadas = prenadas.length + paridas.length + vacias.length;
    var fertilidad = pct(prenadas.length + paridas.length, evaluadas);

    // Prolificidad: crías registradas ÷ madres distintas en madre_codigo.
    var madresDistintas = {};
    nacidas.forEach(function (a) {
      var m = (a.madre_codigo || '').trim();
      if (m) madresDistintas[m] = true;
    });
    var nMadresDistintas = Object.keys(madresDistintas).length;
    var prolificidad = nMadresDistintas
      ? Math.round((nacidas.length / nMadresDistintas) * 100) / 100 : null;

    // Causas de baja agrupadas, de mayor a menor.
    var causas = {};
    muertos.forEach(function (a) {
      var c = (a.causa_baja || '').trim() || 'Sin causa registrada';
      causas[c] = (causas[c] || 0) + 1;
    });
    var causasOrdenadas = Object.keys(causas)
      .map(function (c) { return { causa: c, n: causas[c] }; })
      .sort(function (x, y) { return y.n - x.n; });

    return {
      // Totales de registro
      totalRegistradas: reales.length,
      loteInicialRegistrado: loteInicial.length,
      loteInicialVivo: loteInicialVivo.length,
      nacidasRegistradas: nacidas.length,
      nacidasVivas: nacidasVivas.length,

      // Crecimiento (la historia del reporte)
      hatoInicial: hatoInicial,
      hatoActual: hatoActual,
      crecimientoNeto: crecNeto,
      crecimientoPct: crecPct,
      meta: meta,
      cumplimientoPct: meta ? pct(hatoActual, meta) : null,
      gapConciliacion: gapConciliacion,

      // Bajas y no localizados: SIEMPRE separados, nunca sumados.
      muertes: muertos.length,
      mortalidadPct: pct(muertos.length, reales.length),
      causasBaja: causasOrdenadas,
      noLocalizados: noLoc.length,
      noLocalizadosDetalle: noLoc,

      // Reproductivo
      prenadas: prenadas.length,
      paridas: paridas.length,
      vacias: vacias.length,
      sinDato: sinDato.length,
      fertilidadPct: fertilidad,
      prolificidad: prolificidad,
      madresDistintas: nMadresDistintas,

      // Escenario proyectado — SIEMPRE aparte, nunca dentro del hato.
      proyectados: proyectados.length,
      hatoConEscenario: hatoActual + proyectados.length,

      // Calidad del dato
      sinFechaNacimiento: reales.filter(function (a) { return !a.fecha_nacimiento; }).length,
      sinPeso: reales.filter(function (a) { return a.peso_kg == null; }).length,
      pesosReales: reales.filter(function (a) { return a.peso_tipo === 'real'; }).length,
      pesosEstimados: reales.filter(function (a) { return a.peso_tipo === 'estimado'; }).length
    };
  }

  window.APARCERIA = {
    FINCA_ID: FINCA_ID,
    getAportantes: getAportantes,
    getAnimales: getAnimales,
    getCargas: getCargas,
    kpis: kpis,
    esReal: esReal,
    esProy: esProy,
    enHato: enHato,
    esMuerto: esMuerto,
    esNoLoc: esNoLoc,
    pct: pct
  };
})();
