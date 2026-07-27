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
  // Techo para pesos ESTIMADOS. El modelo lineal no tiene tope: en animales
  // de más de 18 meses produce hasta 87 kg cuando el peso real se estabiliza
  // en 60–70. Por encima de esto no se carga, se reporta.
  // Los pesos REALES y de SACRIFICIO no tienen techo: son mediciones.
  var TECHO_ESTIMADO = 70;

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

  // ── ESTADO LAAAMB (columna ya normalizada) ──────────────────────────
  // VACIA/GESTANTE/LACTANTE/DESCONOCIDO siguen activos; MUERTA y
  // NO_LOCALIZADA son estados de salida. NO_LOCALIZADA no es una baja:
  // el animal sigue vivo, solo no se ubicó en campo.
  var ESTADO_LAAAMB = {
    vacia:          { estado_salida: 'activo',        estado_reproductivo: 'vacia' },
    gestante:       { estado_salida: 'activo',        estado_reproductivo: 'prenada' },
    lactante:       { estado_salida: 'activo',        estado_reproductivo: 'madre' },
    desconocido:    { estado_salida: 'activo',        estado_reproductivo: 'sin_dato' },
    muerta:         { estado_salida: 'muerte',        estado_reproductivo: null },
    no_localizada:  { estado_salida: 'no_localizado', estado_reproductivo: null },
    // Fase 3 · crías. Un SACRIFICADO no es una muerte: es el producto del
    // negocio y va en línea propia, jamás sumado a la mortalidad.
    retenida_hato:  { estado_salida: 'activo',        estado_reproductivo: null, grupo: 'Retenidas para hato' },
    en_cebo:        { estado_salida: 'activo',        estado_reproductivo: null, grupo: 'En cebo' },
    sacrificado:    { estado_salida: 'sacrificio',    estado_reproductivo: null }
  };
  function interpretarEstadoLaaamb(v) {
    var k = sinTildes(v).replace(/[\s-]+/g, '_');
    return ESTADO_LAAAMB[k] || null;
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

  // Prefijo del codigo por hato. La fase 2 no trae columna CODIGO, así que
  // se genera {PREFIJO}-{chapeta}, igual formato que las otras dos fases.
  var PREFIJOS = { salatiel: 'SAL', paola: 'PAO', mauricio: 'MAU' };
  function prefijoDeHato(hato) {
    var h = sinTildes(hato);
    var claves = Object.keys(PREFIJOS);
    for (var i = 0; i < claves.length; i++) {
      if (h.indexOf(claves[i]) >= 0) return PREFIJOS[claves[i]];
    }
    return null;
  }

  // ── COLUMNAS ────────────────────────────────────────────────────────
  var COLS = {
    hato: ['HATO'],
    criadero: ['CRIADERO'],
    codigo: ['CHAPETA'],
    // Columna OPCIONAL. Es la vía para resolver del lado del Excel una chapeta
    // que ya está desambiguada en base: si viene, manda sobre el sufijo
    // derivado. CHAPETA sigue siendo la marca física (→ codigo_original).
    codigoExp: ['CODIGO', 'CÓDIGO', 'CODIGO INTERNO'],
    raza: ['RAZA'],
    sexo: ['SEXO'],
    madre: ['MADRE'],
    estado: ['ESTADO', 'ESTADO AL REPORTE'],
    // ESTADO LAAAMB: columna YA normalizada. Se prefiere sobre el texto libre,
    // pero se CONTRASTA contra ESTADO ACTUALIZADO y cualquier desacuerdo se
    // reporta: una columna normalizada por otro proceso es una conveniencia,
    // no una fuente que se acepte sin verificar.
    estadoLaaamb: ['ESTADO LAAAMB'],
    fechaMuerte: ['FECHA DE MUERTE'],
    pesoReal: ['PESO REAL (kg)', 'PESO REAL (KG)', 'PESO REAL'],
    pesoFecha: ['FECHA DEL PESO'],
    // Fase 3 (crías)
    chapetaOriginal: ['CHAPETA ORIGINAL'],
    codigoOriginalCol: ['CODIGO ORIGINAL'],
    pesoActual: ['PESO ACTUAL (kg)', 'PESO ACTUAL (KG)', 'PESO ACTUAL'],
    pesoSacrificio: ['PESO AL SACRIFICIO (kg)', 'PESO AL SACRIFICIO (KG)', 'PESO AL SACRIFICIO'],
    fechaSacrificio: ['FECHA SACRIFICIO', 'FECHA DE SACRIFICIO'],
    destino: ['DESTINO'],
    conflictoChapeta: ['CONFLICTO CHAPETA'],
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
    // El encabezado no siempre está en la fila 1: las hojas de carga traen
    // título y subtítulo arriba. Se busca la primera fila que contenga HATO y
    // CHAPETA en vez de asumir la 1, que daría 'Faltan columnas obligatorias'.
    var matriz = window.XLSX.utils.sheet_to_json(hoja, { header: 1, defval: null, raw: false });
    var filaHdr = -1;
    for (var fh = 0; fh < Math.min(matriz.length, 20); fh++) {
      var celdas = (matriz[fh] || []).map(function (c) { return sinTildes(c); });
      if (celdas.indexOf('hato') >= 0 && celdas.indexOf('chapeta') >= 0) { filaHdr = fh; break; }
    }
    if (filaHdr < 0) {
      throw new Error('No se encontró la fila de encabezado en "' + nombreHoja
        + '": ninguna de las primeras 20 filas tiene HATO y CHAPETA.');
    }
    var crudas = window.XLSX.utils.sheet_to_json(hoja, {
      defval: null, raw: false, range: filaHdr
    });
    if (!crudas.length) throw new Error('La hoja "' + nombreHoja + '" no tiene filas de datos.');
    var offsetFila = filaHdr + 2;   // nº de fila real de la primera fila de datos

    var mapa = {};
    Object.keys(COLS).forEach(function (k) { mapa[k] = buscarCol(crudas[0], COLS[k]); });
    var faltan = ['hato', 'codigo', 'sexo'].filter(function (k) { return !mapa[k]; });
    if (faltan.length) {
      throw new Error('Faltan columnas obligatorias en la hoja: '
        + faltan.map(function (k) { return COLS[k][0]; }).join(', ')
        + '. Encabezados encontrados: ' + Object.keys(crudas[0]).join(' | '));
    }

    var filas = [], excepciones = [], avisos = [], rechazados = [];
    function val(f, k) { return mapa[k] ? f[mapa[k]] : null; }

    crudas.forEach(function (f, idx) {
      var nFila = idx + offsetFila;   // nº de fila real en el Excel
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

      // CODIGO explícito: si la hoja lo trae, ese es el codigo y NO se le
      // aplica sufijo. CHAPETA sigue siendo la marca física.
      var codigoExp = txt(val(f, 'codigoExp'));
      // La hoja de reposición no trae CODIGO: se genera {PREFIJO}-{chapeta}
      // para que todas las fases usen el mismo formato de clave.
      if (!codigoExp && opciones.generarCodigo) {
        var pref = prefijoDeHato(hato);
        if (pref) codigoExp = pref + '-' + codigo;
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
      // 4 valores crudos → 3 del CHECK. El crudo se conserva en notas: el
      // mapeo es una interpretación y el original debe quedar consultable.
      //   CONTRACTUAL → real · REAL → real
      //   PROYECTADO  → proyectado
      //   REPOSICION  → reposicion (stock del propietario, NO es crecimiento)
      var origen = /^proyectado|^simulad/.test(origenRaw) ? 'proyectado'
                 : /^reposicion/.test(origenRaw)          ? 'reposicion'
                 : 'real';
      if (origenRaw && !/^proyectado|^simulad|^real|^contractual|^reposicion/.test(origenRaw)) {
        avisos.push({ tipo: 'origen_desconocido', fila: nFila, codigo: codigo,
          detalle: 'ORIGEN "' + txt(val(f, 'origen')) + '" → se asume real' });
      }

      // ── REETIQUETADO ──
      // El animal en el potrero SIGUE llevando el arete viejo, así que:
      //   codigo_original  ← CHAPETA ORIGINAL (el arete físico de hoy)
      //   chapeta_asignada ← CHAPETA (la nueva, pendiente en campo)
      // ⚠️ La regla NO es "CHAPETA ORIGINAL no vacía": en la hoja de crías
      // viene llena en las 136 filas. Es reetiquetado cuando DIFIERE.
      var chapOrig = txt(val(f, 'chapetaOriginal'));
      var reetiquetado = !!(chapOrig && chapOrig !== codigo);
      var chapetaFisica = chapOrig || codigo;
      var chapetaAsignada = reetiquetado ? codigo : null;

      var est = interpretarEstado(val(f, 'estadoAct'), val(f, 'estado'));
      var gr = interpretarGrupo(val(f, 'grupo'));

      // ESTADO LAAAMB manda cuando existe, pero se CONTRASTA contra lo que
      // dice el texto libre. Si discrepan, gana la columna normalizada y el
      // desacuerdo se REPORTA: aceptarla en silencio sería confiar en un
      // proceso externo sin verificarlo.
      var laaamb = interpretarEstadoLaaamb(val(f, 'estadoLaaamb'));
      if (laaamb) {
        if (est.estado_salida !== laaamb.estado_salida) {
          avisos.push({ tipo: 'estado_laaamb_discrepa', fila: nFila, codigo: codigo,
            detalle: 'ESTADO LAAAMB dice "' + txt(val(f, 'estadoLaaamb')) + '" ('
              + laaamb.estado_salida + ') pero ESTADO ACTUALIZADO "'
              + (txt(val(f, 'estadoAct')) || '(vacío)') + '" implica '
              + est.estado_salida + ' → se usa ESTADO LAAAMB' });
        }
        est.estado_salida = laaamb.estado_salida;
        est.estado_reproductivo = laaamb.estado_reproductivo;
        if (laaamb.estado_salida !== 'activo' && !est.motivo_salida) {
          est.motivo_salida = txt(val(f, 'estadoAct')) || txt(val(f, 'estadoLaaamb'));
        }
      }

      // GRUPO puede traer la muerte cuando ESTADO ACTUALIZADO no la trae.
      var estado_salida = est.estado_salida;
      var motivo_salida = est.motivo_salida;
      if (gr.estado_salida === 'muerte' && estado_salida === 'activo') {
        estado_salida = 'muerte';
        motivo_salida = motivo_salida || gr.crudo;
      }
      // FECHA DE MUERTE explícita gana sobre la extraída del texto de GRUPO.
      var fecha_salida = fechaCelda(val(f, 'fechaMuerte')) || gr.fecha_salida || null;

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
      // Jerarquía: PESO REAL (columna limpia) > peso embebido en texto >
      // PESO A HOY (estimado). La columna gana porque no depende de un regex
      // sobre texto libre.
      // snapshot = peso que NO puede ir a aportantes_pesajes porque no tiene
      // fecha, y allí 'fecha' es NOT NULL y parte del índice único.
      var snapshot = null;
      // Sacrificio: peso + fecha propios. tipo='sacrificio', que en la
      // jerarquía gana sobre real y estimado.
      var psac = parseFloat(String(val(f, 'pesoSacrificio') || '').replace(',', '.'));
      var fsac = fechaCelda(val(f, 'fechaSacrificio'));
      if (!isNaN(psac) && psac > 0) {
        if (fsac) {
          pesajes.push({ fecha: fsac, peso_kg: Math.round(psac * 100) / 100,
            tipo: 'sacrificio', nota: 'Peso al sacrificio' });
        } else {
          snapshot = { peso_kg: Math.round(psac * 100) / 100, peso_fecha: null,
            peso_tipo: 'real',
            peso_nota: 'Peso al sacrificio sin fecha registrada en origen.' };
          avisos.push({ tipo: 'peso_sacrificio_sin_fecha', fila: nFila, codigo: codigo,
            detalle: 'peso al sacrificio ' + psac + ' kg sin FECHA SACRIFICIO' });
        }
      }

      // PESO ACTUAL de fase 3 = estimado por modelo lineal.
      // TECHO DE 70 kg: el modelo no tiene tope y produce hasta 87 kg en
      // animales cuyo peso real se estabiliza en 60–70. Por encima de 70 NO
      // se carga y se reporta. Los pesos reales y de sacrificio no tienen tope.
      var pact = parseFloat(String(val(f, 'pesoActual') || '').replace(',', '.'));
      if (!isNaN(pact) && pact > 0) {
        if (pact > TECHO_ESTIMADO) {
          rechazados.push({ fila: nFila, codigo: codigo, hato: hato, peso_kg: pact,
            motivo: 'peso ESTIMADO de ' + pact + ' kg supera el techo de '
              + TECHO_ESTIMADO + ' kg — el modelo lineal no tiene tope y '
              + 'sobreestima adultos. No se carga.' });
        } else {
          pesajes.push({ fecha: opciones.fechaEstimados || PESO_ESTIMADO_FECHA,
            peso_kg: Math.round(pact * 100) / 100, tipo: 'estimado',
            nota: PESO_ESTIMADO_NOTA });
        }
      }

      var pr = parseFloat(String(val(f, 'pesoReal') || '').replace(',', '.'));
      var prFecha = fechaCelda(val(f, 'pesoFecha'));
      var emb = pesoEmbebido(val(f, 'estado'));
      if (!isNaN(pr) && pr > 0) {
        if (prFecha) {
          pesajes.push({ fecha: prFecha, peso_kg: Math.round(pr * 100) / 100,
            tipo: 'real', nota: 'Pesaje en balanza' });
        } else {
          // ⚠️ NUNCA se le pone la fecha de corte a un pesaje de balanza sin
          // fecha: quedaría un dato falso con etiqueta de 'real', que es la
          // peor combinación — en la tabla nadie lee el aviso, leen
          // "35 kg el 25-jul-2026". Va a las columnas del animal con
          // peso_fecha NULL, que es lo que el dato realmente es.
          snapshot = {
            peso_kg: Math.round(pr * 100) / 100,
            peso_fecha: null,
            peso_tipo: 'real',
            peso_nota: 'Pesaje de balanza sin fecha registrada en origen.'
          };
          avisos.push({ tipo: 'peso_real_sin_fecha', fila: nFila, codigo: codigo,
            detalle: 'peso real ' + pr + ' kg sin FECHA DEL PESO → va a las '
              + 'columnas del animal con peso_fecha NULL, no a aportantes_pesajes '
              + '(no se le inventa una fecha)' });
        }
      } else if (emb) {
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
        codigo: codigoExp || codigo,
        codigo_original: chapetaFisica,
        chapeta_asignada: chapetaAsignada,
        reetiquetado: reetiquetado,
        codigo_explicito: !!codigoExp,
        criadero_origen: criadero || null,
        raza: txt(val(f, 'raza')) || null,     // se guarda tal cual: text libre
        sexo: sexo,
        tipo: tipo,
        madre_codigo: madre || null,
        fecha_nacimiento: fechaCelda(val(f, 'nacimiento')),  // nunca se estima
        estado_salida: estado_salida,
        fecha_salida: fecha_salida,
        motivo_salida: motivo_salida,
        estado_reproductivo: estado_reproductivo,
        origen: origen,
        grupo: gr.grupo || est.grupo_sugerido || null,
        estado_origen: txt(val(f, 'estado')) || null,        // crudo, SIEMPRE
        estado_actualizado: txt(val(f, 'estadoAct')) || null,// crudo, SIEMPRE
        notas: notas,
        pesajes: pesajes,
        snapshot: snapshot
      });
    });

    return { filas: filas, excepciones: excepciones, avisos: avisos,
             pesosRechazados: rechazados,
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
      sinPeso: filas.filter(function (f) { return !f.pesajes.length && !f.snapshot; }).length,
      pesosReales: filas.filter(function (f) {
        return f.pesajes.some(function (p) { return p.tipo === 'real'; }); }).length,
      pesosSinFecha: filas.filter(function (f) { return !!f.snapshot; }).length
    };
  }

  // ── ANOMALÍAS ───────────────────────────────────────────────────────
  // Se DETECTAN y se reportan. No se corrigen.
  function detectarAnomalias(filas) {
    // ── Duplicados DENTRO del mismo hato ──
    // Son animales DISTINTOS que comparten la marca física (558 en MAURICIO
    // son tres animales). NO se descarta ninguno: se desambiguan con sufijo
    // numérico en 'codigo' y la chapeta se conserva verbatim en
    // 'codigo_original'.
    //
    // Se sufijan TODAS las filas del grupo, ninguna conserva la chapeta
    // pelada: si una quedara como '558' parecería la "verdadera" y las otras
    // derivadas. Sufijo numérico, no a/b/c, para no chocar con las marcas de
    // campo; y un codigo con sufijo nunca se confunde con una chapeta del
    // hato propio.
    //
    // El orden del sufijo sigue el orden de filas del Excel, que sheet_to_json
    // preserva: recargar el MISMO archivo asigna los MISMOS sufijos, así que
    // la idempotencia por (finca_id, aportante_id, codigo) se mantiene.
    var porClave = {};
    filas.forEach(function (f) {
      // Se agrupa por la CHAPETA FÍSICA: es la marca que se repite. Agrupar
      // por 'codigo' no detectaría nada cuando el Excel ya trae CODIGO.
      f.codigo_original = f.codigo_original || f.codigo;
      var k = f.hato + '||' + f.codigo_original;
      (porClave[k] = porClave[k] || []).push(f);
    });
    var dupIntra = [], descartadas = [], conservadas = [];
    Object.keys(porClave).forEach(function (k) {
      var g = porClave[k];
      // codigo_original SIEMPRE se fija, repetida o no la chapeta.
      g.forEach(function (f) { f.codigo_original = f.codigo_original || f.codigo; });
      if (g.length < 2) { conservadas.push(g[0]); return; }

      var chapeta = g[0].codigo_original;
      // Las filas con CODIGO explícito quedan intactas y sus codigos se
      // reservan para no colisionar al numerar las demás.
      var tomados = {};
      g.forEach(function (f) { if (f.codigo_explicito) tomados[f.codigo] = true; });
      var idx = 0;
      g.forEach(function (f) {
        if (f.codigo_explicito) { conservadas.push(f); return; }
        do { idx++; } while (tomados[chapeta + '-' + idx]);
        var i = idx - 1;
        f.codigo = chapeta + '-' + (i + 1);
        f.duplicado = { chapeta: chapeta, indice: i + 1, total: g.length };
        var nota = 'Chapeta ' + chapeta + ' compartida por ' + g.length
          + ' animales distintos en ' + f.hato + ' — cargado como ' + f.codigo
          + ' para distinguirlos. La chapeta real está en codigo_original.';
        f.notas = f.notas ? (f.notas + ' · ' + nota) : nota;
        conservadas.push(f);
      });
      dupIntra.push({
        hato: g[0].hato, chapeta: chapeta, n: g.length,
        codigosAsignados: g.map(function (f) { return f.codigo; }),
        estados: g.map(function (f) {
          return { fila: f.fila, codigo: f.codigo,
                   estado_actualizado: f.estado_actualizado || '(vacío)',
                   estado_origen: f.estado_origen || '(vacío)',
                   estado_salida: f.estado_salida };
        })
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
    // Se compara contra codigo_original: MADRE trae la chapeta física, no el
    // codigo con sufijo, así que buscar por 'codigo' daría huérfanas falsas.
    var existe = {};
    filas.forEach(function (f) {
      existe[f.hato + '||' + (f.codigo_original || f.codigo)] = true;
    });
    var madresHuerfanas = filas
      .filter(function (f) {
        return f.madre_codigo && !existe[f.hato + '||' + f.madre_codigo];
      })
      .map(function (f) {
        return { hato: f.hato, madre_codigo: f.madre_codigo,
                 cria: f.codigo_original || f.codigo, fila: f.fila };
      });

    // Una madre cuya chapeta está duplicada es AMBIGUA: madre_codigo apunta
    // a la marca física y hay varios animales con ella. No se resuelve por
    // adivinanza; se reporta para que Juan decida.
    var chapetasDup = {};
    dupIntra.forEach(function (d) { chapetasDup[d.hato + '||' + d.chapeta] = d; });
    var madresAmbiguas = filas
      .filter(function (f) {
        return f.madre_codigo && chapetasDup[f.hato + '||' + f.madre_codigo];
      })
      .map(function (f) {
        var d = chapetasDup[f.hato + '||' + f.madre_codigo];
        return { hato: f.hato, madre_codigo: f.madre_codigo,
                 cria: f.codigo, fila: f.fila, candidatos: d.codigosAsignados };
      });

    return {
      duplicadosIntraHato: dupIntra,
      filasDescartadas: descartadas,   // vacío con la regla de sufijo
      duplicadosEntreHatos: dupEntreHatos,
      madresHuerfanas: madresHuerfanas,
      madresAmbiguas: madresAmbiguas,
      filasConservadas: conservadas
    };
  }

  // ── FASES ───────────────────────────────────────────────────────────
  // 3 fases, una por archivo. Los sacrificios NO son fase aparte: vienen
  // dentro de las crías con ESTADO LAAAMB = SACRIFICADO.
  function filtrarPorFase(filas, fase) {
    if (!fase) return filas;
    if (fase === 1) {   // vientres contractuales
      return filas.filter(function (f) {
        return f.tipo === 'madre_lote_inicial' && f.origen === 'real';
      });
    }
    if (fase === 2) {   // vientres de reposición
      return filas.filter(function (f) { return f.origen === 'reposicion'; });
    }
    if (fase === 3) {   // crías (incluye proyectadas y sacrificadas)
      return filas.filter(function (f) { return f.tipo === 'cria'; });
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
        .select('id, codigo, codigo_original, estado_salida, carga_id')
        .eq('finca_id', FINCA_ID).eq('aportante_id', b.aportante.id);
      if (res.error) throw new Error('Consultar existentes de ' + b.aportante.nombre
        + ': ' + res.error.message);

      // Índice doble: por codigo (clave de idempotencia) y por chapeta física.
      // La tabla de sacrificios trae la CHAPETA, no el codigo con sufijo, así
      // que la fase 3 tiene que poder resolver por codigo_original.
      var porCodigo = {}, porChapeta = {};
      (res.data || []).forEach(function (r) {
        porCodigo[r.codigo] = r;
        var ch = r.codigo_original || r.codigo;
        (porChapeta[ch] = porChapeta[ch] || []).push(r);
      });

      b.aCrear = []; b.aActualizar = []; b.ambiguos = [];
      b.filas.forEach(function (f) {
        var exacto = porCodigo[f.codigo];
        if (exacto) { f._existente = exacto; b.aActualizar.push(f); return; }
        // Sin match exacto: probar por chapeta física.
        var porCh = porChapeta[f.codigo_original || f.codigo] || [];
        if (porCh.length === 1) { f._existente = porCh[0]; b.aActualizar.push(f); return; }
        if (porCh.length > 1) {
          // Varios animales comparten esa chapeta: NO se adivina cuál es.
          b.ambiguos.push({ codigo: f.codigo_original || f.codigo, fila: f.fila,
            candidatos: porCh.map(function (r) { return r.codigo; }) });
          return;
        }
        b.aCrear.push(f);
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
    var ambiguos = bloques.reduce(function (acc, b) { return acc.concat(b.ambiguos || []); }, []);
    if (ambiguos.length) {
      // No se resuelve por adivinanza: actualizar el animal equivocado con un
      // sacrificio es peor que no cargarlo. La salida es del lado del Excel:
      // una columna CODIGO con el codigo ya desambiguado (558-2, N55-1…), o
      // uno nuevo si el animal es distinto de los que ya están cargados.
      bloqueantes.push({ tipo: 'chapeta_ambigua_en_base', n: ambiguos.length,
        detalle: ambiguos.length + ' chapeta(s) coinciden con VARIOS animales ya '
          + 'cargados y no se puede saber a cuál corresponden: '
          + ambiguos.slice(0, 6).map(function (a) {
              return a.codigo + ' → ' + a.candidatos.join('/'); }).join(', ')
          + '. Resuélvelo agregando una columna CODIGO en la hoja con el codigo '
          + 'exacto de cada fila (CHAPETA sigue siendo la marca física).' });
    }
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
      ambiguos: ambiguos,
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
        // Con la regla de sufijo no se descarta ninguna fila por duplicado.
        // codigos_omitidos guarda las que el PARSEO no pudo interpretar.
        var omitidos = pf.excepcionesParseo
          .filter(function (e) { return e.hato && sinTildes(e.hato) === sinTildes(b.aportante.nombre); })
          .map(function (e) { return e.codigo || ('fila ' + e.fila); });
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

    reporte.omitidos = pf.excepcionesParseo.map(function (e) {
      return { codigo: e.codigo, hato: e.hato, fila: e.fila, motivo: e.motivo };
    });

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
      codigo_original: f.codigo_original || f.codigo,
      chapeta_asignada: f.chapeta_asignada || null,
      reetiquetado: !!f.reetiquetado,
      en_verificacion: !!f.en_verificacion,
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
      notas: f.notas,
      // Peso sin fecha: vive en columnas del animal porque
      // aportantes_pesajes.fecha es NOT NULL y parte del índice único.
      peso_kg: f.snapshot ? f.snapshot.peso_kg : null,
      peso_fecha: f.snapshot ? f.snapshot.peso_fecha : null,
      peso_tipo: f.snapshot ? f.snapshot.peso_tipo : null,
      peso_nota: f.snapshot ? f.snapshot.peso_nota : null
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
    _interpretarEstadoLaaamb: interpretarEstadoLaaamb,
    _interpretarGrupo: interpretarGrupo,
    _pesoEmbebido: pesoEmbebido,
    _fechaCelda: fechaCelda,
    _normFecha: normFecha
  };
})();
