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

  // La columna meta_anual se cargó como hato_inicial × 2,7
  // (madres + un parto de 1,7 contando todas las crías).
  // La curva año a año NO usa ese número: usa el flujo de vientres.
  var META_MULT = 2.7;

  // Flujo 100 hembras.xlsx (8 ene 2026), hoja «Sencillo flujo 100 hembras».
  // Base 100 hembras puestas. Cada parto de esas fundadoras retiene
  // 100 × 1,7 × 0,15 = 25,5 hijas. La cohorte del mes 6 vuelve a parir
  // en el mes 21 y retiene 25,5 × 1,7 × 0,15 = 6,5025.
  // El mes es del proyecto: el mes 1 empieza en fecha_inicio.
  // Flujo Mauricio Fajardo.xlsx (sep 2025) trae el mismo calendario
  // (meses 6, 15, 21 y 24) y parte sus 70 hembras en 20 Lacaune,
  // 35 Katahdin y 15 de Guasca, con retención 0,25 en vez de 0,15.
  // El reporte usa el archivo de enero, que es el posterior, y lo escala
  // por el hato_inicial de cada aportante.
  var FLUJO = {
    fuente: 'Flujo 100 hembras.xlsx',
    base: 100,
    criasPorParto: 1.7,
    retencion: 0.15,
    entradasFundadoras: [6, 15, 24],
    entradaHijas: 21
  };

  // Referencias de valor y GDP (declaradas en el reporte como modelo)
  var PRECIO_VIENTRE = 1200000;          // COP Katahdin / otras
  var PRECIO_VIENTRE_LACAUNE = 5200000;  // COP Lacaune (capital superior)
  var PRECIO_KG_PIE = 9000;              // COP/kg en pie — compra garantizada LAAAMB
  var PESO_REF_CRIA_KG = 28;             // peso ref. si no hay pesaje (para valor estimado)
  var GDP_MODELO = {
    'KATAHDIN': 120,
    'KATAHDIN F5': 120,
    'KATAHDIN x DORPER': 180,
    'LACAUNE': 122
  };

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

    var criasConMadre = crias.filter(function (a) {
      return !!(a.madre_codigo || '').trim();
    });
    var madres = {};
    criasConMadre.forEach(function (a) {
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

    // ── Desglose por raza (normaliza nombre) ──
    function razaKey(a) {
      var r = String(a.raza || '').trim().toUpperCase();
      if (!r) return 'SIN RAZA';
      if (r.indexOf('LACAUNE') >= 0) return 'LACAUNE';
      if (r.indexOf('DORPER') >= 0) return 'KATAHDIN x DORPER';
      if (r.indexOf('KATAHDIN') >= 0) return 'KATAHDIN';
      return r;
    }
    function bloqueRaza(lista) {
      var acc = {};
      lista.forEach(function (a) {
        var k = razaKey(a);
        if (!acc[k]) acc[k] = { raza: k, activas: 0, madres: 0, crias: 0, muertes: 0, sacrificios: 0 };
        if (enHato(a)) {
          acc[k].activas++;
          if (a.tipo === 'cria') acc[k].crias++;
          else acc[k].madres++;
        }
        if (esMuerto(a)) acc[k].muertes++;
        if (esSacrif(a)) acc[k].sacrificios++;
      });
      return Object.keys(acc).map(function (k) {
        var b = acc[k];
        var den = b.activas + b.muertes + b.sacrificios;
        b.mortalidadPct = den ? Math.round((b.muertes / den) * 1000) / 10 : null;
        b.gdpModelo = GDP_MODELO[k] != null ? GDP_MODELO[k] : null;
        return b;
      }).sort(function (x, y) { return y.activas - x.activas; });
    }
    var porRazaDetalle = bloqueRaza(reales);

    // Valor estimado del hato activo (Lacaune capitaliza más)
    function precioVientreDe(a) {
      var r = String(a.raza || '').toUpperCase();
      return r.indexOf('LACAUNE') >= 0 ? PRECIO_VIENTRE_LACAUNE : PRECIO_VIENTRE;
    }
    var madresActivasValor = activos.filter(function (a) {
      return a.tipo !== 'cria';
    });
    var madresValor = madresActivasValor.reduce(function (s, a) {
      return s + precioVientreDe(a);
    }, 0);
    var criasValor = criasActivas.reduce(function (s, a) {
      var p = pesoVigente(a);
      var kg = (p && p.peso_kg > 0) ? p.peso_kg : PESO_REF_CRIA_KG;
      return s + (kg * PRECIO_KG_PIE);
    }, 0);
    var valorHatoEstimado = madresValor + criasValor;
    var nLacauneMadres = madresActivasValor.filter(function (a) {
      return String(a.raza || '').toUpperCase().indexOf('LACAUNE') >= 0;
    }).length;
    var nOtrasMadres = madresActivasValor.length - nLacauneMadres;



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
      // Solo crías con madre_codigo: si no, el numerador infla (p.ej. cargas sin ligar)
      // y sale "3+ crías/madre", imposible en ovino.
      prolificidad: nMadres ? Math.round((criasConMadre.length / nMadres) * 100) / 100 : null,
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
      pesosSacrificio: conPeso.filter(function (p) { return p.tipo === 'sacrificio'; }).length,
      porRazaDetalle: porRazaDetalle,
      valorHatoEstimado: valorHatoEstimado,
      valorMadresEstimado: madresValor,
      valorCriasEstimado: criasValor,
      precioVientre: PRECIO_VIENTRE,
      precioVientreLacaune: PRECIO_VIENTRE_LACAUNE,
      nLacauneMadres: nLacauneMadres,
      nOtrasMadres: nOtrasMadres,
      precioKgPie: PRECIO_KG_PIE,
      gdpModelo: GDP_MODELO
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

  // ── AÑO DE CONTRATO · vientres del flujo vs hembras registradas ─
  // El reloj es el del contrato: el año 1 cierra el día antes del
  // aniversario. La promesa no es una recta. Sube el día en que el flujo
  // mete una cohorte de hijas y se queda quieta entre partos.
  // El resultado cuenta hembras (madres y crías hembra). Los machos salen
  // a venta en el flujo y no entran en esta comparación.

  function pad2(n) { return n < 10 ? '0' + n : String(n); }

  function partesFecha(iso) {
    if (!iso) return null;
    var m = String(iso).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    return { y: +m[1], m: +m[2], d: +m[3] };
  }

  function fechaISO(y, m, d) { return y + '-' + pad2(m) + '-' + pad2(d); }

  function diasDelMes(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }

  function sumarAnios(iso, n) {
    var p = partesFecha(iso);
    if (!p) return null;
    var y = p.y + n;
    return fechaISO(y, p.m, Math.min(p.d, diasDelMes(y, p.m)));
  }

  function sumarDias(iso, n) {
    var p = partesFecha(iso);
    if (!p) return null;
    var d = new Date(Date.UTC(p.y, p.m - 1, p.d) + n * 86400000);
    return fechaISO(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }

  function diasEntre(a, b) {
    var pa = partesFecha(a), pb = partesFecha(b);
    if (!pa || !pb) return null;
    return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86400000);
  }

  function red2(n) { return Math.round(n * 100) / 100; }

  function sumarMeses(iso, n) {
    var p = partesFecha(iso);
    if (!p) return null;
    var total = (p.y * 12 + (p.m - 1)) + n;
    var y = Math.floor(total / 12);
    var m = total % 12;
    if (m < 0) { m += 12; y -= 1; }
    return fechaISO(y, m + 1, Math.min(p.d, diasDelMes(y, m + 1)));
  }

  // Mes 1 = el mes que empieza en fecha_inicio. Mes 6 empieza cinco meses después.
  function mesProyecto(inicio, fecha) {
    if (!partesFecha(inicio) || !partesFecha(fecha)) return null;
    if (fecha < inicio) return 0;
    var n = 1;
    while (n < 121 && sumarMeses(inicio, n) <= fecha) n++;
    return n;
  }

  function saltosFlujo() {
    var porParto = FLUJO.base * FLUJO.criasPorParto * FLUJO.retencion;
    var deHijas = porParto * FLUJO.criasPorParto * FLUJO.retencion;
    var lista = FLUJO.entradasFundadoras.map(function (mes) {
      return { mes: mes, hembras: porParto };
    });
    lista.push({ mes: FLUJO.entradaHijas, hembras: deHijas });
    lista.sort(function (a, b) { return a.mes - b.mes; });
    return lista;
  }

  function hembrasEnMes(hato, mes) {
    var acum = FLUJO.base;
    saltosFlujo().forEach(function (s) {
      if (s.mes <= mes) acum += s.hembras;
    });
    return hato * acum / FLUJO.base;
  }

  function pasosFlujo(hato) {
    var pts = [{ mes: 0, hembras: red2(hato) }];
    var acum = FLUJO.base;
    saltosFlujo().forEach(function (s) {
      if (s.mes > 24) return;
      acum += s.hembras;
      pts.push({ mes: s.mes, hembras: red2(hato * acum / FLUJO.base) });
    });
    return pts;
  }

  // Entrada al proyecto. La fecha de nacimiento de una fundadora es anterior
  // al contrato: entra el día de inicio, no el día en que nació.
  function entradaAnimal(a, fechaInicio) {
    if (!a || a.origen === 'proyectado') return { clase: 'fuera' };
    if (a.origen === 'reposicion') {
      var fr = a.fecha_nacimiento ? String(a.fecha_nacimiento).slice(0, 10) : null;
      if (fr && fr >= fechaInicio) return { clase: 'fechada', entrada: fr };
      return { clase: 'reposicion_sin_entrega' };
    }
    if (a.tipo === 'cria') {
      if (!a.fecha_nacimiento) return { clase: 'cria_sin_fecha' };
      var fn = String(a.fecha_nacimiento).slice(0, 10);
      return { clase: 'fechada', entrada: fn < fechaInicio ? fechaInicio : fn };
    }
    return { clase: 'fechada', entrada: fechaInicio };
  }

  function esHembraFila(a) {
    var s = String((a && a.sexo) || '').toLowerCase();
    return s === 'hembra' || s === 'h' || s === 'f';
  }

  function sigueEnHato(a, D) {
    var activo = a.estado_salida === 'activo' || a.estado_salida == null || a.estado_salida === '';
    if (activo) return true;
    if (a.fecha_salida) return String(a.fecha_salida).slice(0, 10) > D;
    return false;
  }

  // modo 'historico': un cierre ya pasado. Sin fecha de entrada no se
  // retrotrae. modo 'corte': la foto de hoy; la reposición y las crías
  // sin fecha entran si siguen activas, porque el hato de hoy sí las tiene.
  function hatoEnFecha(rows, D, fechaInicio, modo, sexo) {
    var n = 0;
    (rows || []).forEach(function (a) {
      if (sexo === 'hembra' && !esHembraFila(a)) return;
      var e = entradaAnimal(a, fechaInicio);
      if (e.clase === 'fuera') return;
      var entrada = e.entrada;
      if (e.clase !== 'fechada') {
        if (modo !== 'corte') return;
        entrada = fechaInicio;
      }
      if (!entrada || entrada > D) return;
      if (sigueEnHato(a, D)) n++;
    });
    return n;
  }

  function advertenciasAnios(rows, fechaInicio) {
    var salidasSinFecha = 0, criasSinFecha = 0, reposicionSinEntrega = 0;
    (rows || []).forEach(function (a) {
      if (!a || a.origen === 'proyectado') return;
      if (a.estado_salida && a.estado_salida !== 'activo' && !a.fecha_salida) salidasSinFecha++;
      if (a.tipo === 'cria' && a.origen !== 'reposicion' && !a.fecha_nacimiento) criasSinFecha++;
      if (a.origen === 'reposicion') {
        var fr = a.fecha_nacimiento ? String(a.fecha_nacimiento).slice(0, 10) : null;
        if (!fr || fr < fechaInicio) reposicionSinEntrega++;
      }
    });
    return {
      salidasSinFecha: salidasSinFecha,
      criasSinFecha: criasSinFecha,
      reposicionSinEntrega: reposicionSinEntrega
    };
  }

  function bloqueAnio(numero, inicioContrato, corte, rows, hato) {
    var ini = sumarAnios(inicioContrato, numero - 1);
    var finExcl = sumarAnios(inicioContrato, numero);
    var fin = sumarDias(finExcl, -1);
    var total = diasEntre(ini, finExcl);
    var apertura = red2(hembrasEnMes(hato, (numero - 1) * 12));
    var cierrePromesa = red2(hembrasEnMes(hato, numero * 12));
    var estado, esperado, resultado, dias, modo;
    if (corte < ini) {
      estado = 'no_iniciado';
      esperado = null;
      resultado = null;
      dias = 0;
      modo = null;
    } else if (corte >= fin) {
      estado = 'cerrado';
      esperado = cierrePromesa;
      resultado = hatoEnFecha(rows, fin, inicioContrato, 'historico', 'hembra');
      dias = total;
      modo = 'historico';
    } else {
      estado = 'en_curso';
      dias = diasEntre(ini, corte);
      esperado = red2(hembrasEnMes(hato, mesProyecto(inicioContrato, corte)));
      resultado = hatoEnFecha(rows, corte, inicioContrato, 'corte', 'hembra');
      modo = 'corte';
    }
    var mes = estado === 'cerrado' ? 12
      : estado === 'no_iniciado' ? 0
      : Math.min(12, Math.floor(dias / (total / 12)) + 1);
    return {
      numero: numero,
      inicio: ini,
      fin: fin,
      estado: estado,
      modo: modo,
      diasTranscurridos: dias,
      diasTotales: total,
      mes: mes,
      apertura: apertura,
      promesaCierre: cierrePromesa,
      esperado: esperado,
      resultado: resultado,
      cumplimientoPct: (esperado == null || resultado == null) ? null : pct(resultado, esperado)
    };
  }

  function aniosContrato(rows, aportante, corte) {
    var inicio = aportante && aportante.fecha_inicio;
    var hato = (aportante && aportante.hato_inicial != null)
      ? Number(aportante.hato_inicial) : null;
    if (!partesFecha(inicio)) return { ok: false, motivo: 'sin_fecha_inicio' };
    if (hato == null || !isFinite(hato)) return { ok: false, motivo: 'sin_hato_inicial' };
    if (!partesFecha(corte)) return { ok: false, motivo: 'sin_corte' };
    inicio = String(inicio).slice(0, 10);
    corte = String(corte).slice(0, 10);
    var promesa1 = red2(hembrasEnMes(hato, 12));
    var promesa2 = red2(hembrasEnMes(hato, 24));
    return {
      ok: true,
      fechaInicio: inicio,
      corte: corte,
      hatoInicial: hato,
      esquema: FLUJO.fuente,
      promesaAnio1: promesa1,
      promesaAnio2: promesa2,
      pasos: pasosFlujo(hato),
      anio1: bloqueAnio(1, inicio, corte, rows, hato),
      anio2: bloqueAnio(2, inicio, corte, rows, hato),
      advertencias: advertenciasAnios(rows, inicio)
    };
  }

  window.APARCERIA = {
    FINCA_ID: FINCA_ID,
    META_MULT: META_MULT,
    FASES: FASES,
    getAportantes: getAportantes,
    getAnimales: getAnimales,
    getCargas: getCargas,
    kpis: kpis,
    aniosContrato: aniosContrato,
    hatoEnFecha: hatoEnFecha,
    mesProyecto: mesProyecto,
    FLUJO: FLUJO,
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
    pct: pct,
    PRECIO_VIENTRE: PRECIO_VIENTRE,
    PRECIO_VIENTRE_LACAUNE: PRECIO_VIENTRE_LACAUNE,
    PRECIO_KG_PIE: PRECIO_KG_PIE,
    GDP_MODELO: GDP_MODELO
  };
})();