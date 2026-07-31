// ── aparceria.js ─────────────────────────────────────────────────────
// Motor de datos y KPIs del módulo Aparcería.
// Consumido por aportantes-animales.html y reporte-aportantes.html.
//
// Arquitectura: los animales de aparcería viven en aportantes_animales,
// AISLADOS del hato de la finca. Cero FKs hacia animales(id).
//
// origen:
//   'real'        → aportado o nacido en el proyecto (cuenta en todo)
//   'reposicion'  → entregado por el propietario para cubrir mortalidad
//                   (está en el hato, NO cuenta como crecimiento)
//   'proyectado'  → simulación; fuera de TODO KPI de portada
//
// estado_salida es la fuente única de verdad (activo / muerte / sacrificio /
// venta / no_localizado). No existe vivo ni localizado.
// ─────────────────────────────────────────────────────────────────────

(function () {
  'use strict';

  var FINCA_ID = 'a1b2c3d4-0000-0000-0000-000000000001';

  // Meta de crecimiento = hato_inicial × este multiplicador.
  // El valor es dato de contrato y vive en la tabla. Si dejan de cuadrar,
  // es un error de captura y el reporte lo debe avisar en vez de recalcular.
  var META_MULT = 2.7;

  // Fases de carga. Mientras falte alguna, los indicadores no son
  // representativos y la UI lo advierte.
  // Son 3 fases, una por archivo. Los sacrificios NO son una fase aparte:
  // vienen dentro de las crías (ESTADO LAAAMB = SACRIFICADO).
  var FASES = {
    1: { clave: 'contractuales', etiqueta: 'Vientres contractuales' },
    2: { clave: 'reposicion',    etiqueta: 'Vientres de reposición' },
    3: { clave: 'crias',         etiqueta: 'Crías' }
  };

  function sb() {
    if (!window._sb) throw new Error('Supabase no inicializado (window._sb)');
    return window._sb;
  }

  // Toda respuesta de Supabase se valida: si trae error, se lanza.
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
  function esProy(a)    { return a.origen === 'proyectado'; }
  function esReposic(a) { return a.origen === 'reposicion'; }
  function esReal(a)    { return !esProy(a); }

  function enHato(a)   { return esReal(a) && a.estado_salida === 'activo'; }
  function esMuerto(a) { return esReal(a) && a.estado_salida === 'muerte'; }
  function esSacrif(a) { return esReal(a) && a.estado_salida === 'sacrificio'; }
  function esVenta(a)  { return esReal(a) && a.estado_salida === 'venta'; }
  function esNoLoc(a)  { return esReal(a) && a.estado_salida === 'no_localizado'; }

  function esFundadora(a) { return a.tipo === 'madre_lote_inicial' && a.origen === 'real'; }
  function esCria(a)      { return a.tipo === 'cria' && a.origen === 'real'; }

  function pct(num, den) {
    if (den == null || den === 0) return null;
    return Math.round((num / den) * 1000) / 10;
  }

  // ── PESO VIGENTE ────────────────────────────────────────────────────
  var PRIORIDAD = { sacrificio: 3, real: 2, estimado: 1 };
  function pesoVigente(a) {
    var ps = a.pesajes || [];
    if (!ps.length) {
      if (a.peso_kg == null) return null;
      return {
        peso_kg: Number(a.peso_kg),
        tipo: a.peso_tipo || 'estimado',
        fecha: a.peso_fecha || null,
        nota: a.peso_nota || null
      };
    }
    var mejor = null;
    ps.forEach(function (p) {
      if (!mejor) { mejor = p; return; }
      var dp = (PRIORIDAD[p.tipo] || 0) - (PRIORIDAD[mejor.tipo] || 0);
      if (dp > 0 || (dp === 0 && String(p.fecha) > String(mejor.fecha))) mejor = p;
    });
    return {
      peso_kg: Number(mejor.peso_kg),
      tipo: mejor.tipo,
      fecha: mejor.fecha,
      nota: mejor.nota || null
    };
  }

  // ── MOTOR DE KPIs ───────────────────────────────────────────────────
  function kpis(rows, aportante) {
    rows = rows || [];
    var reales = rows.filter(esReal);
    var proyectados = rows.filter(esProy);

    var activos = reales.filter(enHato);
    var muertos = reales.filter(esMuerto);
    var sacrifs = reales.filter(esSacrif);
    var ventas  = reales.filter(esVenta);
    var noLoc   = reales.filter(esNoLoc);

    var fundadoras = reales.filter(esFundadora);
    var crias      = reales.filter(esCria);
    var reposicion = reales.filter(esReposic);
    var fundActivas  = fundadoras.filter(enHato);
    var criasActivas = crias.filter(enHato);
    var reposActiva  = reposicion.filter(enHato);

    var criasEnVerificacion = crias.filter(function (a) {
      return a.reetiquetado === true && a.en_verificacion === true;
    });

    var hatoInicial = (aportante && aportante.hato_inicial != null)
      ? Number(aportante.hato_inicial) : null;
    var meta = (aportante && aportante.meta_anual != null)
      ? Number(aportante.meta_anual) : null;

    var hatoActual = activos.length;
    var reposicionActiva = reposActiva.length;

    var produccion = hatoActual - reposicionActiva;
    var crecPct  = pct(produccion - (hatoInicial || 0), hatoInicial);
    var crecNeto = hatoInicial != null ? produccion - hatoInicial : null;

    var metaEsperada = hatoInicial != null
      ? Math.round(hatoInicial * META_MULT * 100) / 100 : null;
    var metaCoherente = (meta == null || metaEsperada == null)
      ? null : Math.abs(meta - metaEsperada) < 0.01;

    var gap = hatoInicial != null ? fundadoras.length - hatoInicial : null;

    var prenadas = activos.filter(function (a) { return a.estado_reproductivo === 'prenada'; });
    var paridas  = activos.filter(function (a) { return a.estado_reproductivo === 'madre'; });
    var vacias   = activos.filter(function (a) { return a.estado_reproductivo === 'vacia'; });
    var sinDato  = activos.filter(function (a) {
      return a.estado_reproductivo === 'sin_dato' || a.estado_reproductivo == null;
    });
    var evaluadas = prenadas.length + paridas.length + vacias.length;

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

    // Peso promedio de sacrificio
    var pesosSac = sacrifs.map(function (a) {
      if (a.peso_salida != null && a.peso_salida > 0) return Number(a.peso_salida);
      var p = pesoVigente(a);
      return (p && p.tipo === 'sacrificio' && p.peso_kg > 0) ? p.peso_kg : null;
    }).filter(function (v) { return v != null; });
    var pesoPromedioSacrificio = pesosSac.length
      ? Math.round((pesosSac.reduce(function (s, v) { return s + v; }, 0) / pesosSac.length) * 10) / 10
      : null;

    // Corderas en levante = crías hembras activas (retenidas para crecimiento)
    var corderasLevante = criasActivas.filter(function (a) {
      return a.sexo === 'hembra';
    }).length;

    return {
      totalRegistradas: reales.length,
      fundadorasRegistradas: fundadoras.length,
      fundadorasActivas: fundActivas.length,
      criasRegistradas: crias.length,
      criasActivas: criasActivas.length,

      hatoInicial: hatoInicial,
      hatoActual: hatoActual,
      reposicionRegistrada: reposicion.length,
      reposicionActiva: reposicionActiva,
      produccionPropia: produccion,
      criasEnVerificacion: criasEnVerificacion.length,
      criasEnVerificacionDetalle: criasEnVerificacion,
      crecimientoNeto: crecNeto,
      crecimientoPct: crecPct,
      meta: meta,
      metaEsperada: metaEsperada,
      metaCoherente: metaCoherente,
      cumplimientoPct: pct(hatoActual, meta),
      gapConciliacion: gap,

      muertes: muertos.length,
      mortalidadPct: pct(muertos.length, reales.length),
      causasBaja: agrupar(muertos, 'motivo_salida'),
      muertesSinFecha: muertos.filter(function (a) { return !a.fecha_salida; }).length,
      muertesConFecha: muertos.filter(function (a) { return !!a.fecha_salida; }).length,
      sacrificios: sacrifs.length,
      sacrificiosPct: pct(sacrifs.length, reales.length),
      ventas: ventas.length,
      noLocalizados: noLoc.length,
      noLocalizadosDetalle: noLoc,

      // Nuevos indicadores
      pesoPromedioSacrificio: pesoPromedioSacrificio,
      corderasLevante: corderasLevante,

      prenadas: prenadas.length,
      paridas: paridas.length,
      vacias: vacias.length,
      sinDato: sinDato.length,
      fertilidadPct: pct(prenadas.length + paridas.length, evaluadas),
      prolificidad: nMadres ? Math.round((crias.length / nMadres) * 100) / 100 : null,
      madresDistintas: nMadres,

      proyectados: proyectados.length,
      hatoConEscenario: hatoActual + proyectados.length,

      porSexo: agrupar(activos, 'sexo'),
      porRaza: agrupar(activos, 'raza'),
      porGrupo: agrupar(activos, 'grupo'),

      sinFechaNacimiento: reales.filter(function (a) { return !a.fecha_nacimiento; }).length,
      sinPeso: reales.length - conPeso.length,
      pesosReales: conPeso.filter(function (p) { return p.tipo === 'real'; }).length,
      pesosEstimados: conPeso.filter(function (p) { return p.tipo === 'estimado'; }).length,
      pesosSacrificio: conPeso.filter(function (p) { return p.tipo === 'sacrificio'; }).length
    };
  }

  // ── IDENTIDADES ESTRUCTURALES ───────────────────────────────────────
  function verificarIdentidades(rows, aportante) {
    var k = kpis(rows, aportante);
    var reales = (rows || []).filter(esReal);
    var out = [];
    function id(nombre, ok, detalle) { out.push({ id: nombre, ok: !!ok, detalle: detalle || '' }); }

    id('fundadoras_activas + crias_activas = produccion_propia',
      k.fundadorasActivas + k.criasActivas === k.produccionPropia,
      k.fundadorasActivas + ' + ' + k.criasActivas + ' = ' + k.produccionPropia);

    id('hato_actual = count(real AND activo)',
      k.hatoActual === reales.filter(enHato).length);

    id('activos + muertes + sacrificios + ventas + no_localizados = total real',
      k.hatoActual + k.muertes + k.sacrificios + k.ventas + k.noLocalizados === k.totalRegistradas,
      k.hatoActual + '+' + k.muertes + '+' + k.sacrificios + '+' + k.ventas + '+'
        + k.noLocalizados + ' = ' + k.totalRegistradas);

    id('fundadoras + crias + reposicion = total contable',
      k.fundadorasRegistradas + k.criasRegistradas + k.reposicionRegistrada === k.totalRegistradas,
      k.fundadorasRegistradas + '+' + k.criasRegistradas + '+' + k.reposicionRegistrada
        + ' = ' + k.totalRegistradas);

    id('hato_actual incluye reposicion',
      k.hatoActual === k.fundadorasActivas + k.criasActivas + k.reposicionActiva,
      k.fundadorasActivas + '+' + k.criasActivas + '+' + k.reposicionActiva
        + ' = ' + k.hatoActual);
    id('produccion_propia = hato_actual - reposicion_activa',
      k.produccionPropia === k.hatoActual - k.reposicionActiva);
    id('crecimiento EXCLUYE la reposicion',
      (!k.hatoInicial) ? k.crecimientoPct === null
        : k.crecimientoPct === Math.round(((k.produccionPropia - k.hatoInicial) / k.hatoInicial) * 1000) / 10);

    id('gap = fundadoras_registradas - hato_inicial',
      k.hatoInicial == null
        ? k.gapConciliacion === null
        : k.gapConciliacion === k.fundadorasRegistradas - k.hatoInicial);

    id('cumplimiento = hato_actual / meta_anual',
      (!k.meta)
        ? k.cumplimientoPct === null
        : k.cumplimientoPct === Math.round((k.hatoActual / k.meta) * 1000) / 10);

    id('meta_anual = hato_inicial x 2.7',
      k.metaCoherente === null ? true : k.metaCoherente === true,
      'meta=' + k.meta + ' esperada=' + k.metaEsperada);

    id('mortalidad excluye sacrificios',
      k.mortalidadPct === pct(k.muertes, k.totalRegistradas)
        && (k.sacrificios === 0 || k.mortalidadPct !== pct(k.muertes + k.sacrificios, k.totalRegistradas)));

    id('proyectados fuera del hato',
      reales.length + k.proyectados === (rows || []).length
        && k.hatoConEscenario === k.hatoActual + k.proyectados);

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
    esReposic: esReposic,
    esFundadora: esFundadora,
    esCria: esCria,
    enHato: enHato,
    esMuerto: esMuerto,
    esSacrif: esSacrif,
    esVenta: esVenta,
    esNoLoc: esNoLoc,
    pct: pct
  };
})();