// ── aportantes-loader.js ───────────────────────────────────────────────
// Cargador del módulo APARCERÍA. Parametrizable por hato, por fase y con
// dry-run. Depende de SheetJS (window.XLSX) y de window.APARCERIA.
//
// ⚠️ REGLA DURA: este cargador NUNCA hace un INSERT ni un UPDATE sobre la
//    tabla 'animales' del hato real. Escribe SOLO en aportantes_animales,
//    aportantes_pesajes y aportantes_cargas. No hay ninguna ruta de código
//    que toque el inventario de La Marinilla.
//
// FASES (un carga_id por fase, con su etiqueta; borrar una no toca las otras)
//   1 fundadoras  → tipo='madre_lote_inicial', origen='real'. Incluye las
//                   muertas y las no localizadas.
//   2 nacimientos → tipo='cria'. Incluye origen='proyectado', que nunca
//                   entra a los KPIs de portada.
//   3 salidas     → principalmente UPDATE: un macho sacrificado nació en el
//                   proyecto y ya entró en la fase 2. Busca por
//                   (finca_id, aportante_id, codigo), actualiza el estado de
//                   salida, e INSERTA solo si no existe — reportando cuáles.
//
// Una fila que falle NO aborta el resto: se acumula en excepciones con su
// motivo y su contenido, y el reporte final las lista todas.

(function () {
  'use strict';

  var FINCA_ID = 'a1b2c3d4-0000-0000-0000-000000000001';
  var HOJA_DEFECTO = 'EXPORT LAAAMB';

  // Fecha del corte de los pesos estimados. Se pasa por opciones para no
  // depender del reloj del navegador al reproducir una carga.
  var PESO_ESTIMADO_FECHA = '2026-07-25';
  var PESO_ESTIMADO_NOTA =
    'Estimado: 3,0 kg al nacer + 0,147 kg/día lineal. No es pesaje en balanza.';

  // ── NORMALIZACIÓN DE TEXTO ──────────────────────────────────────────
  function txt(v) {
    if (v == null) return '';
    return String(v).replace(/\s+/g, ' ').trim();
  }
  function sinTildes(s) {
    // Rango escrito con escapes \u para que no dependa de cómo se guarde el
    // archivo: son los diacríticos combinantes U+0300–U+036F.
    return txt(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }

  // ── FECHAS ──────────────────────────────────────────────────────────
  // Origen d/m/aa, NUNCA m/d/aa. Las celdas de fecha del Excel llegan como
  // Date (cellDates:true); las embebidas en texto son d-m-aa.
  function fechaCelda(v) {
    if (v == null || v === '') return null;
    if (v instanceof Date && !isNaN(v)) {
      return v.getFullYear() + '-'
        + String(v.getMonth() + 1).padStart(2, '0') + '-'
        + String(v.getDate()).padStart(2, '0');
    }
    var s = txt(v);
    var m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (!m) return null;
    return normFecha(m[1], m[2], m[3]);
  }
  function normFecha(d, mes, anio) {
    var D = parseInt(d, 10), M = parseInt(mes, 10), A = parseInt(anio, 10);
    if (!(D >= 1 && D <= 31) || !(M >= 1 && M <= 12)) return null;
    if (A < 100) A = 2000 + A;   // 'aa' → 20aa
    return A + '-' + String(M).padStart(2, '0') + '-' + String(D).padStart(2, '0');
  }

  // ── PESO EMBEBIDO EN EL TEXTO DE ESTADO ─────────────────────────────
  // '42k 02-02-26' → { peso: 42, fecha: '2026-02-02' }
  // '35k' (sin fecha) → { peso: 35, fecha: null }
  // El peso embebido es REAL (balanza) y gana sobre PESO A HOY (estimado).
  var RE_PESO = /(\d{1,3})\s*[kK]\b/;
  var RE_FECHA_TXT = /(\d{2})-(\d{2})-(\d{2})\b/;
  function pesoEmbebido(estadoTxt) {
    var s = txt(estadoTxt);
    if (!s) return null;
    var mp = s.match(RE_PESO);
    if (!mp) return null;
    var mf = s.match(RE_FECHA_TXT);
    return {
      peso: parseInt(mp[1], 10),
      fecha: mf ? normFecha(mf[1], mf[2], mf[3]) : null,
      crudo: s
    };
  }

  // ── ESTADO → estado_salida / estado_reproductivo ────────────────────
  // Manda ESTADO ACTUALIZADO sobre ESTADO.
  //  · Empieza por Murio/Muerta        → muerte (el matiz va a motivo_salida)
  //  · No existe / No esta / Moved off → no_localizado (NO es baja)
  //  · Madre    → ya parió y lacta. NO es preñada → 'madre'
  //  · Preñada  → 'prenada' · Vacia → 'vacia'
  //  · *no tiene info* / *sin dato* / vacío → 'sin_dato'
  //    (NO se colapsa con 'Vacia': no saber no es estar vacía)
  //  · Desarrollo / Engorde → NO son estado reproductivo: van a grupo
  function interpretarEstado(estadoActualizado, estadoOrigen) {
    var fuente = txt(estadoActualizado) || txt(estadoOrigen);
    var s = sinTildes(fuente);
    var out = {
      estado_salida: 'activo',
      motivo_salida: null,
      estado_reproductivo: null,
      grupo_sugerido: null,
      crudo: fuente
    };
    if (!s) { out.estado_reproductivo = 'sin_dato'; return out; }

    if (/^(murio|muerta|muerto)/.test(s)) {
      out.estado_salida = 'muerte';
      out.motivo_salida = fuente;          // 'Murio preñada', 'Murio en parto'
      return out;
    }
    if (/^(no existe|no esta|moved off)/.test(s)) {
      out.estado_salida = 'no_localizado';
      out.motivo_salida = fuente;
      return out;
    }
    // 'Vacia no tiene info' debe caer en sin_dato, así que se evalúa ANTES
    // que 'vacia'. El orden de estos ifs es significativo.
    if (/no tiene info|no tiene dato|sin dato|sin info/.test(s)) {
      out.estado_reproductivo = 'sin_dato';
      return out;
    }
    if (/^prenada|^preniada|^prenad/.test(s)) { out.estado_reproductivo = 'prenada'; return out; }
    if (/^vacia/.test(s))                     { out.estado_reproductivo = 'vacia';   return out; }
    if (/^madre/.test(s))                     { out.estado_reproductivo = 'madre';   return out; }
    if (/^desarrollo/.test(s))                { out.grupo_sugerido = 'Desarrollo';   return out; }
    if (/^engorde/.test(s))                   { out.grupo_sugerido = 'Engorde';      return out; }

    out.estado_reproductivo = 'sin_dato';
    return out;
  }

  // ── GRUPO ───────────────────────────────────────────────────────────
  // Normaliza Madre/Madres → Madres. Distingue Engorde de Engorde/sacrificio.
  // 'Muerta 07-03-26' NO es un grupo: es fecha de muerte → fecha_salida.
  // 'Madre del 639' NO es un grupo: es una anotación → notas.
  function interpretarGrupo(grupoTxt) {
    var fuente = txt(grupoTxt);
    var s = sinTildes(fuente);
    var out = { grupo: null, fecha_salida: null, estado_salida: null, notas: null, crudo: fuente };
    if (!s) return out;

    var mm = s.match(/^muert[ao]\b/);
    if (mm) {
      out.estado_salida = 'muerte';
      var mf = fuente.match(RE_FECHA_TXT);
      if (mf) out.fecha_salida = normFecha(mf[1], mf[2], mf[3]);
      out.notas = fuente;
      return out;
    }
    if (/^murio en parto/.test(s)) {
      out.estado_salida = 'muerte';
      out.notas = fuente;
      return out;
    }
    // 'Madre del 639' / 'Madre de 642 y 643' → anotación, no grupo.
    if (/^madre (del?|de)\s/.test(s)) { out.notas = fuente; out.grupo = 'Madres'; return out; }
    if (/^madres?$/.test(s))          { out.grupo = 'Madres'; return out; }
    if (/^engorde\s*\/\s*sacrificio/.test(s)) { out.grupo = 'Engorde/sacrificio'; return out; }
    if (/^engorde$/.test(s))          { out.grupo = 'Engorde'; return out; }
    if (/^desarrollo/.test(s))        { out.grupo = 'Desarrollo'; return out; }

    out.grupo = fuente;   // cualquier otro grupo se conserva tal cual
    return out;
  }

  // ── COLUMNAS ────────────────────────────────────────────────────────
  var COLS = {
    hato: ['HATO'],
    criadero: ['CRIADERO'],
    codigo: ['CHAPETA'],
    raza: ['RAZA'],
    sexo: ['SEXO'],
    madre: ['MADRE'],
    estado: ['ESTADO'],
    grupo: ['GRUPO'],
    nacimiento: ['FECHA NACIMIENTO', 'FECHA DE NACIMIENTO'],
    estadoAct: ['ESTADO ACTUALIZADO'],
    origen: ['ORIGEN'],
    peso: ['PESO A HOY (KG)', 'PESO A HOY', 'PESO A HOY (KG.)']
  };
  function buscarCol(fila, nombres) {
    for (var i = 0; i < nombres.length; i++) {
      if (Object.prototype.hasOwnProperty.call(fila, nombres[i])) return nombres[i];
    }
    // Tolerancia a espacios/tildes en el encabezado, sin inventar columnas.
    var claves = Object.keys(fila);
    for (var j = 0; j < nombres.length; j++) {
      var buscado = sinTildes(nombres[j]);
      for (var k = 0; k < claves.length; k++) {
        if (sinTildes(claves[k]) === buscado) return claves[k];
      }
    }
    return null;
  }

  // ── PARSEO ──────────────────────────────────────────────────────────
  // Devuelve { filas, excepciones, avisos, resumen }. No toca la base.
  function parsear(workbook, opciones) {
    opciones = opciones || {};
    var nombreHoja = opciones.hoja || HOJA_DEFECTO;
    var hoja = workbook.Sheets[nombreHoja];
    if (!hoja) {
      throw new Error('No existe la hoja "' + nombreHoja + '". Hojas disponibles: '
        + Object.keys(workbook.Sheets).join(', '));
    }
    var crudas = window.XLSX.utils.sheet_to_json(hoja, { defval: null, raw: false });
    if (!crudas.length) throw new Error('La hoja "' + nombreHoja + '" no tiene filas.');

    var mapa = {};
    Object.keys(COLS).forEach(function (k) { mapa[k] = buscarCol(crudas[0], COLS[k]); });
    var faltan = ['hato', 'codigo', 'sexo'].filter(function (k) { return !mapa[k]; });
    if (faltan.length) {
      throw new Error('Faltan columnas obligatorias en la hoja: '
        + faltan.map(function (k) { return COLS[k][0]; }).join(', ')
        + '. Encabezados encontrados: ' + Object.keys(crudas[0]).join(' | '));
    }

    var filas = [], excepciones = [], avisos = [];
    function val(f, k) { return mapa[k] ? f[mapa[k]] : null; }

    crudas.forEach(function (f, idx) {
      var nFila = idx + 2;   // +2: fila 1 es el encabezado
      var hato = txt(val(f, 'hato'));
      var codigo = txt(val(f, 'codigo'));

      if (!hato && !codigo) return;   // fila totalmente vacía: se ignora
      if (!codigo) {
        excepciones.push({ fila: nFila, codigo: null, hato: hato,
          motivo: 'CHAPETA vacía', crudo: f });
        return;
      }
      if (!hato) {
        excepciones.push({ fila: nFila, codigo: codigo, hato: null,
          motivo: 'HATO vacío — no se puede resolver el aportante', crudo: f });
        return;
      }

      var sexoRaw = sinTildes(val(f, 'sexo'));
      var sexo = /^hembra/.test(sexoRaw) ? 'hembra'
               : /^macho/.test(sexoRaw)  ? 'macho' : null;
      if (!sexo) {
        excepciones.push({ fila: nFila, codigo: codigo, hato: hato,
          motivo: 'SEXO no reconocido: "' + txt(val(f, 'sexo')) + '"', crudo: f });
        return;
      }

      var origenRaw = sinTildes(val(f, 'origen'));
      var origen = /^proyectado/.test(origenRaw) ? 'proyectado' : 'real';
      if (origenRaw && !/^proyectado|^real/.test(origenRaw)) {
        avisos.push({ tipo: 'origen_desconocido', fila: nFila, codigo: codigo,
          detalle: 'ORIGEN "' + txt(val(f, 'origen')) + '" → se asume real' });
      }

      var est = interpretarEstado(val(f, 'estadoAct'), val(f, 'estado'));
      var gr = interpretarGrupo(val(f, 'grupo'));

      // GRUPO puede traer la muerte cuando ESTADO ACTUALIZADO no la trae.
      var estado_salida = est.estado_salida;
      var motivo_salida = est.motivo_salida;
      if (gr.estado_salida === 'muerte' && estado_salida === 'activo') {
        estado_salida = 'muerte';
        motivo_salida = motivo_salida || gr.crudo;
      }
      // Un animal muerto no tiene estado reproductivo vigente.
      var estado_reproductivo = (estado_salida === 'activo') ? est.estado_reproductivo : null;

      var madre = txt(val(f, 'madre'));
      // tipo se DERIVA de MADRE: vacío = fundadora del lote aportado.
      // CRIADERO es la señal secundaria (viene vacío en todas las crías) y
      // se usa solo para reportar desacuerdos, nunca para decidir.
      var criadero = txt(val(f, 'criadero'));
      var tipo = madre ? 'cria' : 'madre_lote_inicial';
      if (madre && criadero) {
        avisos.push({ tipo: 'senales_tipo_en_conflicto', fila: nFila, codigo: codigo,
          detalle: 'tiene MADRE ("' + madre + '") y CRIADERO ("' + criadero
            + '") a la vez → se clasifica como cria por MADRE' });
      }

      // Prefijo N con sexo hembra: se REPORTA, no se corrige.
      if (/^N/i.test(codigo) && sexo === 'hembra') {
        avisos.push({ tipo: 'sexo_incoherente_con_prefijo', fila: nFila, codigo: codigo,
          detalle: 'chapeta con prefijo N registrada como HEMBRA — no se corrige' });
      }

      // ── PESOS ──
      // Jerarquía: peso embebido en ESTADO (real) > PESO A HOY (estimado).
      var pesajes = [];
      var emb = pesoEmbebido(val(f, 'estado'));
      if (emb) {
        pesajes.push({
          fecha: emb.fecha || PESO_ESTIMADO_FECHA,
          peso_kg: emb.peso, tipo: 'real',
          nota: emb.fecha
            ? 'Peso de balanza extraído de ESTADO: "' + emb.crudo + '"'
            : 'Peso de balanza extraído de ESTADO: "' + emb.crudo
              + '" — SIN FECHA en el origen, se usa la fecha de corte'
        });
        if (!emb.fecha) {
          avisos.push({ tipo: 'peso_real_sin_fecha', fila: nFila, codigo: codigo,
            detalle: 'peso real ' + emb.peso + ' kg sin fecha en ESTADO' });
        }
      } else {
        var pe = parseFloat(String(val(f, 'peso') || '').replace(',', '.'));
        if (!isNaN(pe) && pe > 0) {
          pesajes.push({ fecha: opciones.fechaEstimados || PESO_ESTIMADO_FECHA,
            peso_kg: Math.round(pe * 100) / 100, tipo: 'estimado',
            nota: PESO_ESTIMADO_NOTA });
        }
      }

      var notas = [gr.notas, est.grupo_sugerido ? null : null]
        .filter(Boolean).join(' · ') || null;

      filas.push({
        fila: nFila,
        hato: hato,
        codigo: codigo,
        criadero_origen: criadero || null,
        raza: txt(val(f, 'raza')) || null,     // se guarda tal cual: text libre
        sexo: sexo,
        tipo: tipo,
        madre_codigo: madre || null,
        fecha_nacimiento: fechaCelda(val(f, 'nacimiento')),  // nunca se estima
        estado_salida: estado_salida,
        fecha_salida: gr.fecha_salida || null,
        motivo_salida: motivo_salida,
        estado_reproductivo: estado_reproductivo,
        origen: origen,
        grupo: gr.grupo || est.grupo_sugerido || null,
        estado_origen: txt(val(f, 'estado')) || null,        // crudo, SIEMPRE
        estado_actualizado: txt(val(f, 'estadoAct')) || null,// crudo, SIEMPRE
        notas: notas,
        pesajes: pesajes
      });
    });

    return { filas: filas, excepciones: excepciones, avisos: avisos,
             resumen: resumirParseo(filas, excepciones) };
  }

  function resumirParseo(filas, excepciones) {
    var porHato = {};
    filas.forEach(function (f) {
      var h = porHato[f.hato] = porHato[f.hato] || { total: 0, real: 0, proyectado: 0,
        fundadoras: 0, crias: 0, muertes: 0, sacrificios: 0, no_localizados: 0 };
      h.total++;
      h[f.origen]++;
      if (f.tipo === 'madre_lote_inicial') h.fundadoras++; else h.crias++;
      if (f.estado_salida === 'muerte') h.muertes++;
      if (f.estado_salida === 'sacrificio') h.sacrificios++;
      if (f.estado_salida === 'no_localizado') h.no_localizados++;
    });
    return {
      totalFilas: filas.length,
      excepciones: excepciones.length,
      porHato: porHato,
      sinFechaNacimiento: filas.filter(function (f) { return !f.fecha_nacimiento; }).length,
      sinPeso: filas.filter(function (f) { return !f.pesajes.length; }).length,
      pesosReales: filas.filter(function (f) {
        return f.pesajes.some(function (p) { return p.tipo === 'real'; }); }).length
    };
  }

  // ── ANOMALÍAS ───────────────────────────────────────────────────────
  // Se DETECTAN y se reportan. No se corrigen.
  function detectarAnomalias(filas) {
    // Duplicados DENTRO del mismo hato: violan el UNIQUE
    // (finca_id, aportante_id, codigo). Regla acordada: se conserva la fila
    // con ESTADO ACTUALIZADO no vacío; si empatan, la primera. Las demás NO
    // se cargan y van al listado de excepciones con su contenido completo.
    var porClave = {};
    filas.forEach(function (f) {
      var k = f.hato + '||' + f.codigo;
      (porClave[k] = porClave[k] || []).push(f);
    });
    var dupIntra = [], descartadas = [], conservadas = {};
    Object.keys(porClave).forEach(function (k) {
      var g = porClave[k];
      if (g.length < 2) { conservadas[k] = g[0]; return; }
      var conEstado = g.filter(function (f) { return !!f.estado_actualizado; });
      var elegida = conEstado.length ? conEstado[0] : g[0];
      conservadas[k] = elegida;
      dupIntra.push({
        hato: g[0].hato, codigo: g[0].codigo, n: g.length,
        elegida: elegida.fila,
        estados: g.map(function (f) {
          return { fila: f.fila, estado_actualizado: f.estado_actualizado || '(vacío)',
                   estado_origen: f.estado_origen || '(vacío)',
                   estado_salida: f.estado_salida };
        })
      });
      g.forEach(function (f) {
        if (f !== elegida) {
          descartadas.push({ fila: f.fila, codigo: f.codigo, hato: f.hato,
            motivo: 'chapeta duplicada dentro de ' + f.hato
              + ' — se conservó la fila ' + elegida.fila, crudo: f });
        }
      });
    });

    // Chapetas en más de un hato: YA NO BLOQUEAN. El UNIQUE es por
    // aportante, así que conviven. Se reportan como advertencia informativa
    // (es la disputa de propiedad pendiente).
    var porCodigo = {};
    filas.forEach(function (f) {
      (porCodigo[f.codigo] = porCodigo[f.codigo] || {})[f.hato] = true;
    });
    var dupEntreHatos = Object.keys(porCodigo)
      .filter(function (c) { return Object.keys(porCodigo[c]).length > 1; })
      .map(function (c) { return { codigo: c, hatos: Object.keys(porCodigo[c]) }; })
      .sort(function (a, b) { return a.codigo.localeCompare(b.codigo); });

    // Madres referenciadas que no existen como fila. Se cargan igual
    // (madre_codigo es texto libre, no una FK) y se listan.
    var existe = {};
    filas.forEach(function (f) { existe[f.hato + '||' + f.codigo] = true; });
    var madresHuerfanas = filas
      .filter(function (f) {
        return f.madre_codigo && !existe[f.hato + '||' + f.madre_codigo];
      })
      .map(function (f) {
        return { hato: f.hato, madre_codigo: f.madre_codigo, cria: f.codigo, fila: f.fila };
      });

    return {
      duplicadosIntraHato: dupIntra,
      filasDescartadas: descartadas,
      duplicadosEntreHatos: dupEntreHatos,
      madresHuerfanas: madresHuerfanas,
      filasConservadas: Object.keys(conservadas).map(function (k) { return conservadas[k]; })
    };
  }

  // ── FASES ───────────────────────────────────────────────────────────
  function filtrarPorFase(filas, fase) {
    if (!fase) return filas;
    if (fase === 1) {
      return filas.filter(function (f) {
        return f.tipo === 'madre_lote_inicial' && f.origen === 'real';
      });
    }
    if (fase === 2) return filas.filter(function (f) { return f.tipo === 'cria'; });
    if (fase === 3) {
      return filas.filter(function (f) { return f.estado_salida === 'sacrificio'; });
    }
    throw new Error('Fase desconocida: ' + fase + ' (válidas: 1, 2, 3)');
  }

  // ── PRE-FLIGHT ──────────────────────────────────────────────────────
  // Consulta la base pero NO escribe. Devuelve todo lo que la UI debe
  // mostrar antes de pedir confirmación.
  async function preflight(parseado, opciones) {
    opciones = opciones || {};
    var fase = opciones.fase;
    var aportantes = await window.APARCERIA.getAportantes();

    // Resolver HATO → aportante por coincidencia de nombre. Se usa HATO, no
    // el orden de las filas.
    var porNombre = {};
    aportantes.forEach(function (a) { porNombre[sinTildes(a.nombre)] = a; });
    function resolver(hato) {
      var h = sinTildes(hato);
      if (porNombre[h]) return porNombre[h];
      // Coincidencia parcial: 'SALATIEL' dentro de 'JULIAN Y SALATIEL MORENO'
      var cand = aportantes.filter(function (a) {
        return sinTildes(a.nombre).indexOf(h) >= 0 || h.indexOf(sinTildes(a.nombre)) >= 0;
      });
      return cand.length === 1 ? cand[0] : null;
    }

    var anom = detectarAnomalias(parseado.filas);
    var candidatas = filtrarPorFase(anom.filasConservadas, fase);
    if (opciones.hato) {
      var hf = sinTildes(opciones.hato);
      candidatas = candidatas.filter(function (f) { return sinTildes(f.hato).indexOf(hf) >= 0; });
    }

    // Resolución de aportante por fila; sin resolver = bloqueante.
    var sinResolver = [], porAportante = {};
    candidatas.forEach(function (f) {
      var ap = resolver(f.hato);
      if (!ap) { sinResolver.push({ fila: f.fila, codigo: f.codigo, hato: f.hato }); return; }
      f._aportante = ap;
      (porAportante[ap.id] = porAportante[ap.id] || { aportante: ap, filas: [] }).filas.push(f);
    });

    // Existentes en base por (aportante, codigo): determinan INSERT vs UPDATE.
    var bloques = Object.keys(porAportante).map(function (id) { return porAportante[id]; });
    for (var i = 0; i < bloques.length; i++) {
      var b = bloques[i];
      var res = await window._sb.from('aportantes_animales')
        .select('id, codigo, estado_salida, carga_id')
        .eq('finca_id', FINCA_ID).eq('aportante_id', b.aportante.id);
      if (res.error) throw new Error('Consultar existentes de ' + b.aportante.nombre
        + ': ' + res.error.message);
      var yaHay = {};
      (res.data || []).forEach(function (r) { yaHay[r.codigo] = r; });
      b.aCrear = []; b.aActualizar = [];
      b.filas.forEach(function (f) {
        if (yaHay[f.codigo]) { f._existente = yaHay[f.codigo]; b.aActualizar.push(f); }
        else b.aCrear.push(f);
      });
      b.existentesTotal = (res.data || []).length;
    }

    // En fase 3 lo normal es ACTUALIZAR: el macho sacrificado ya entró en la
    // fase 2. Un INSERT en fase 3 significa que no estaba cargado, y eso se
    // reporta explícitamente en vez de pasar desapercibido.
    var insertsEnFase3 = (fase === 3)
      ? bloques.reduce(function (acc, b) { return acc.concat(b.aCrear); }, [])
      : [];

    // Bloqueantes: impiden ejecutar. Advertencias: informan y dejan seguir.
    var bloqueantes = [];
    if (sinResolver.length) {
      bloqueantes.push({ tipo: 'hato_sin_aportante', n: sinResolver.length,
        detalle: 'No se pudo resolver el aportante de ' + sinResolver.length
          + ' filas: ' + sinResolver.slice(0, 5).map(function (x) { return x.hato; })
            .filter(function (v, i, a) { return a.indexOf(v) === i; }).join(', ') });
    }
    if (!candidatas.length) {
      bloqueantes.push({ tipo: 'sin_filas', n: 0,
        detalle: 'Ninguna fila corresponde a la fase ' + fase
          + (opciones.hato ? ' y al hato "' + opciones.hato + '"' : '') });
    }

    return {
      fase: fase,
      carga_id: (opciones.carga_id || (window.crypto && window.crypto.randomUUID
        ? window.crypto.randomUUID() : null)),
      etiqueta: opciones.etiqueta || null,
      bloques: bloques,
      totales: {
        candidatas: candidatas.length,
        aCrear: bloques.reduce(function (a, b) { return a + b.aCrear.length; }, 0),
        aActualizar: bloques.reduce(function (a, b) { return a + b.aActualizar.length; }, 0)
      },
      anomalias: anom,
      avisos: parseado.avisos,
      excepcionesParseo: parseado.excepciones,
      insertsEnFase3: insertsEnFase3,
      sinResolver: sinResolver,
      bloqueantes: bloqueantes,
      resumenParseo: parseado.resumen
    };
  }

  // ── EJECUCIÓN ───────────────────────────────────────────────────────
  // dryRun:true no escribe nada. dryRun:false inserta/actualiza por lotes y
  // registra la carga en aportantes_cargas.
  async function ejecutar(pf, opciones) {
    opciones = opciones || {};
    var dryRun = opciones.dryRun !== false;
    if (pf.bloqueantes.length && !dryRun) {
      throw new Error('No se puede ejecutar con bloqueantes pendientes: '
        + pf.bloqueantes.map(function (b) { return b.tipo; }).join(', '));
    }
    var carga_id = pf.carga_id;
    if (!carga_id) throw new Error('Falta carga_id');

    var reporte = { dryRun: dryRun, carga_id: carga_id, etiqueta: pf.etiqueta,
      fase: pf.fase, creados: 0, actualizados: 0, pesajes: 0,
      fallidos: [], omitidos: [], porAportante: [], conteos: [] };

    for (var i = 0; i < pf.bloques.length; i++) {
      var b = pf.bloques[i];

      // Conteo ANTES, para poder verificar el delta.
      var antes = await contar(b.aportante.id);

      var creados = 0, actualizados = 0, pesajesIns = 0;

      // ── INSERTS ──
      for (var j = 0; j < b.aCrear.length; j++) {
        var f = b.aCrear[j];
        var payload = aPayload(f, b.aportante.id, carga_id);
        if (dryRun) { creados++; pesajesIns += f.pesajes.length; continue; }
        var ins = await window._sb.from('aportantes_animales')
          .insert(payload).select('id').single();
        if (ins.error) {
          // Una fila que falla NO aborta el resto.
          reporte.fallidos.push({ codigo: f.codigo, hato: f.hato, fila: f.fila,
            accion: 'insert', motivo: ins.error.message });
          continue;
        }
        creados++;
        pesajesIns += await insertarPesajes(ins.data.id, f, carga_id, reporte);
      }

      // ── UPDATES ──
      // En fase 3 es la ruta principal. Solo se tocan las columnas de salida
      // y el peso: no se sobrescribe el resto de la ficha.
      for (var m = 0; m < b.aActualizar.length; m++) {
        var fu = b.aActualizar[m];
        if (dryRun) { actualizados++; pesajesIns += fu.pesajes.length; continue; }
        var parche = (pf.fase === 3)
          ? { estado_salida: fu.estado_salida, fecha_salida: fu.fecha_salida,
              motivo_salida: fu.motivo_salida,
              peso_salida: pesoSacrificio(fu) }
          : aPayload(fu, b.aportante.id, carga_id, true);
        var upd = await window._sb.from('aportantes_animales')
          .update(parche).eq('id', fu._existente.id).select('id').single();
        if (upd.error) {
          reporte.fallidos.push({ codigo: fu.codigo, hato: fu.hato, fila: fu.fila,
            accion: 'update', motivo: upd.error.message });
          continue;
        }
        actualizados++;
        pesajesIns += await insertarPesajes(fu._existente.id, fu, carga_id, reporte);
      }

      var despues = dryRun ? antes + creados : await contar(b.aportante.id);
      reporte.conteos.push({
        aportante: b.aportante.nombre, antes: antes, creados: creados,
        despues: despues, esperado: antes + creados,
        coincide: despues === antes + creados
      });
      reporte.porAportante.push({ aportante: b.aportante.nombre,
        creados: creados, actualizados: actualizados, pesajes: pesajesIns });
      reporte.creados += creados;
      reporte.actualizados += actualizados;
      reporte.pesajes += pesajesIns;

      // ── AUDITORÍA DE LA CARGA ──
      if (!dryRun) {
        var omitidos = pf.anomalias.filasDescartadas
          .filter(function (d) { return sinTildes(d.hato) === sinTildes(b.aportante.nombre); })
          .map(function (d) { return d.codigo; });
        var car = await window._sb.from('aportantes_cargas').insert({
          finca_id: FINCA_ID, aportante_id: b.aportante.id, carga_id: carga_id,
          etiqueta: pf.etiqueta, animales_creados: creados,
          codigos_omitidos: omitidos.length ? omitidos : null,
          ejecutada_por: opciones.perfil_id || null
        });
        if (car.error) {
          reporte.fallidos.push({ codigo: null, hato: b.aportante.nombre, fila: null,
            accion: 'registrar carga',
            motivo: 'Se cargaron ' + creados + ' animales pero falló el registro en '
              + 'aportantes_cargas: ' + car.error.message
              + ' — el borrado por carga_id seguirá funcionando con ' + carga_id });
        }
      }
    }

    reporte.omitidos = pf.anomalias.filasDescartadas.map(function (d) {
      return { codigo: d.codigo, hato: d.hato, fila: d.fila, motivo: d.motivo };
    }).concat(pf.excepcionesParseo.map(function (e) {
      return { codigo: e.codigo, hato: e.hato, fila: e.fila, motivo: e.motivo };
    }));

    return reporte;
  }

  function pesoSacrificio(f) {
    var p = f.pesajes.filter(function (x) { return x.tipo === 'sacrificio'; })[0]
         || f.pesajes.filter(function (x) { return x.tipo === 'real'; })[0];
    return p ? p.peso_kg : null;
  }

  async function insertarPesajes(animalId, f, carga_id, reporte) {
    if (!f.pesajes.length) return 0;
    var rows = f.pesajes.map(function (p) {
      return { aportante_animal_id: animalId, fecha: p.fecha, peso_kg: p.peso_kg,
               tipo: p.tipo, nota: p.nota, carga_id: carga_id };
    });
    var res = await window._sb.from('aportantes_pesajes').insert(rows);
    if (res.error) {
      reporte.fallidos.push({ codigo: f.codigo, hato: f.hato, fila: f.fila,
        accion: 'pesajes', motivo: res.error.message });
      return 0;
    }
    return rows.length;
  }

  async function contar(aportante_id) {
    var res = await window._sb.from('aportantes_animales')
      .select('id', { count: 'exact', head: true })
      .eq('finca_id', FINCA_ID).eq('aportante_id', aportante_id);
    if (res.error) throw new Error('Contar registros: ' + res.error.message);
    return res.count || 0;
  }

  function aPayload(f, aportante_id, carga_id, esUpdate) {
    var p = {
      aportante_id: aportante_id,
      codigo: f.codigo,
      criadero_origen: f.criadero_origen,
      raza: f.raza,
      sexo: f.sexo,
      tipo: f.tipo,
      madre_codigo: f.madre_codigo,
      fecha_nacimiento: f.fecha_nacimiento,
      estado_salida: f.estado_salida,
      fecha_salida: f.fecha_salida,
      motivo_salida: f.motivo_salida,
      estado_reproductivo: f.estado_reproductivo,
      origen: f.origen,
      grupo: f.grupo,
      estado_origen: f.estado_origen,
      estado_actualizado: f.estado_actualizado,
      notas: f.notas
    };
    if (!esUpdate) { p.finca_id = FINCA_ID; p.carga_id = carga_id; }
    return p;
  }

  // ── FIXTURE (capa 2 de las aserciones) ──────────────────────────────
  // Se genera a partir de lo REALMENTE cargado, para que los valores
  // puntuales nunca se escriban a mano en el test.
  async function generarFixture() {
    var aportantes = await window.APARCERIA.getAportantes();
    var bloques = [];
    for (var i = 0; i < aportantes.length; i++) {
      var ap = aportantes[i];
      var rows = await window.APARCERIA.getAnimales(ap.id);
      if (!rows.length) continue;
      var k = window.APARCERIA.kpis(rows, ap);
      bloques.push({
        aportante: { nombre: ap.nombre, hato_inicial: ap.hato_inicial,
                     meta_anual: ap.meta_anual },
        rows: rows,
        esperado: {
          totalRegistradas: k.totalRegistradas,
          fundadorasRegistradas: k.fundadorasRegistradas,
          fundadorasActivas: k.fundadorasActivas,
          criasRegistradas: k.criasRegistradas,
          criasActivas: k.criasActivas,
          hatoActual: k.hatoActual,
          crecimientoPct: k.crecimientoPct,
          crecimientoNeto: k.crecimientoNeto,
          cumplimientoPct: k.cumplimientoPct,
          gapConciliacion: k.gapConciliacion,
          muertes: k.muertes,
          mortalidadPct: k.mortalidadPct,
          sacrificios: k.sacrificios,
          ventas: k.ventas,
          noLocalizados: k.noLocalizados,
          proyectados: k.proyectados,
          prenadas: k.prenadas, paridas: k.paridas, vacias: k.vacias
        }
      });
    }
    return { generado_desde: 'aportantes_animales', aportantes: bloques };
  }

  window.APORTANTES_LOADER = {
    FINCA_ID: FINCA_ID,
    HOJA_DEFECTO: HOJA_DEFECTO,
    parsear: parsear,
    detectarAnomalias: detectarAnomalias,
    filtrarPorFase: filtrarPorFase,
    preflight: preflight,
    ejecutar: ejecutar,
    generarFixture: generarFixture,
    // expuestos para pruebas unitarias
    _interpretarEstado: interpretarEstado,
    _interpretarGrupo: interpretarGrupo,
    _pesoEmbebido: pesoEmbebido,
    _fechaCelda: fechaCelda,
    _normFecha: normFecha
  };
})();
