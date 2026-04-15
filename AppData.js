/**
 * LAAAMBAPP · AppData.js
 * Motor central de datos — persiste en localStorage
 * Todas las páginas lo cargan. Cambios se propagan automáticamente.
 *
 * Estructura de AppData:
 * {
 *   animales:     [],  // inventario base
 *   pesajes:      [],  // histórico de pesajes
 *   montas:       [],  // eventos reproducción
 *   partos:       [],  // partos registrados
 *   ecografias:   [],  // resultados ecografía
 *   tratamientos: [],  // tratamientos individuales y grupales
 *   medicamentos: [],  // inventario farmacia
 *   costos:       [],  // egresos
 *   ingresos:     [],  // ventas e ingresos
 *   bajas:        [],  // muertes, ventas, robos
 *   movimientos:  [],  // cambios de lote
 *   lotes:        [],  // configuración de lotes
 *   colabs:       [],  // colaboradores
 *   finca:        {},  // datos de la finca
 *   meta:         {}   // versión, última actualización
 * }
 */

const AppData = (function() {
  const KEY = 'laaamb_data';
  const VERSION = '1.0';

  // ── Esquemas de campos por entidad ──────────────────────────────────────────
  const SCHEMAS = {
    animales: [
      'id','nombre','especie','sexo','categoria','raza','fecha_nacimiento','peso_inicial',
      'lote','costo_adquisicion','madre_id','padre_id','estado',
      'origen','observaciones','fecha_ingreso','activo','finca_id','created_at'
    ],
    pesajes: [
      'id','animal_id','fecha','peso_kg','gdp_calculado',
      'colaborador','observaciones','created_at'
    ],
    montas: [
      'id','hembra_id','macho_id','fecha','ciclo_nro','tipo',
      'lote','condicion_corporal','resultado','fecha_eco_programada',
      'colaborador','observaciones','created_at'
    ],
    partos: [
      'id','madre_id','padre_id','fecha','hora','nro_parto','tipo_parto',
      'crias_vivas','crias_muertas','lote','colaborador',
      'observaciones','created_at'
    ],
    crias_parto: [
      'id','parto_id','madre_id','padre_id','sexo','peso_nacimiento',
      'animal_id_generado','created_at'
    ],
    ecografias: [
      'id','animal_id','fecha','resultado','dias_gestacion','nro_fetos',
      'veterinario','observaciones','created_at'
    ],
    tratamientos: [
      'id','tipo','animales_ids','lote','diagnostico','medicamento_nombre',
      'medicamento_id','dosis_aplicada','via','duracion_dias','dia_actual',
      'fecha_inicio','fecha_fin_estimada','dias_retiro','costo_total',
      'colaborador','estado','observaciones','created_at'
    ],
    medicamentos: [
      'id','nombre','principio_activo','categoria','presentacion','nro_lote',
      'stock_actual','stock_maximo','dosis_estandar','dias_retiro',
      'fecha_vencimiento','costo_por_unidad','proveedor',
      'temperatura_almacenamiento','observaciones','activo','created_at'
    ],
    costos: [
      'id','categoria','descripcion','animal_id','lote','valor_cop',
      'metodo_pago','fecha','colaborador','comprobante','observaciones','created_at'
    ],
    ingresos: [
      'id','tipo','animales_ids','peso_total_kg','precio_por_kg','total_cop',
      'comprador','canal_venta','fecha','colaborador','observaciones','created_at'
    ],
    bajas: [
      'id','animal_id','tipo_baja','fecha','hora','peso_kg','causa',
      'hubo_tratamiento','necropsia','valor_venta','comprador',
      'colaborador','observaciones','created_at'
    ],
    movimientos: [
      'id','animal_ids','lote_origen','lote_destino','fecha','nro_animales',
      'criterio','motivo','colaborador','created_at'
    ],
    lotes: [
      'id','nombre','area_ha','capacidad_max','tipo_pasto','condicion_pasto',
      'fuente_agua','descripcion','activo','created_at'
    ]
  };


  // ── Configuración por especie ─────────────────────────────────────────────
  const ESPECIES = {
    ovino: {
      label: 'Ovino',
      labelPlural: 'Ovinos',
      icon: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" width="14" height="14"><ellipse cx="10" cy="11" rx="5" ry="4"/><circle cx="14" cy="8" r="2"/><path d="M7 15l-1 2M10 15v2M13 15l1 2"/></svg>',
      categorias: {
        H: ['Reproductora', 'Cordera', 'Levante', 'Cría'],
        M: ['Reproductor', 'Cordero', 'Levante', 'Cría'],
      },
      razas: ['Dorper', 'White Dorper', 'Katahdin', 'Kerry Hill', 'Pelibuey', 'Hampshire', 'Merino', 'Rambouillet', 'Suffolk', 'Criollo'],
      metas: {
        gdp_g_dia: 250,          // g/día
        peso_sacrificio_kg: 48,  // kg
        dias_gestacion: 147,
        ciclo_reproductivo: 17,  // días
        fertilidad_pct: 90,
        mortalidad_pct: 2,
        crias_parto: 1.5,
        condicion_corporal_optima: 3.5,
      },
      pesos_referencia: {
        nacimiento: 4,
        destete: 15,
        levante: 30,
        sacrificio: 48,
        reproductora: 45,
        reproductor: 70,
      }
    },
    bovino: {
      label: 'Bovino',
      labelPlural: 'Bovinos',
      icon: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" width="14" height="14"><ellipse cx="10" cy="12" rx="6" ry="4"/><circle cx="14" cy="8" r="2.5"/><path d="M7 9c-1-2-2-3-4-2M13 9c1-2 2-3 4-2"/><path d="M7 16l-1 2.5M10 16v2.5M13 16l1 2.5"/></svg>',
      categorias: {
        H: ['Vaca', 'Vaquilla', 'Levante', 'Ternera'],
        M: ['Toro', 'Novillo', 'Levante', 'Ternero'],
      },
      razas: ['Brahman', 'Angus', 'Hereford', 'Simmental', 'Gyr', 'Holstein', 'Normando', 'Cebú', 'Brangus', 'Romosinuano', 'Blanco Orejinegro', 'Criollo'],
      metas: {
        gdp_g_dia: 1000,          // g/día
        peso_sacrificio_kg: 450,  // kg
        dias_gestacion: 283,
        ciclo_reproductivo: 21,   // días
        fertilidad_pct: 85,
        mortalidad_pct: 3,
        crias_parto: 1.0,
        condicion_corporal_optima: 3.5,
      },
      pesos_referencia: {
        nacimiento: 35,
        destete: 150,
        levante: 300,
        sacrificio: 450,
        vaca: 400,
        toro: 600,
      }
    }
  };

  // Categorías "engorde" por especie (para filtros rápidos)
  const CATEGORIAS_ENGORDE = {
    ovino: ['Cordero', 'Cordera'],
    bovino: ['Novillo', 'Vaquilla'],
  };

  const CATEGORIAS_REPRODUCCION = {
    ovino: ['Reproductora', 'Reproductor'],
    bovino: ['Vaca', 'Toro'],
  };

  // ── Datos de ejemplo (solo si no hay datos reales) ───────────────────────────
  const EJEMPLO = {
    animales: [
      {id:'OV-0234',nombre:'Bella',especie:'ovino',sexo:'H',categoria:'Reproductora',raza:'Dorper',fecha_nacimiento:'2022-01-15',peso_inicial:35,lote:'Lote A',costo_adquisicion:380000,madre_id:'',padre_id:'RE-001',estado:'Gestante',origen:'Nacido en finca',observaciones:'Top madre hato',fecha_ingreso:'2022-01-15',activo:true,created_at:new Date().toISOString()},
      {id:'OV-1102',nombre:'Luna',especie:'ovino',sexo:'H',categoria:'Reproductora',raza:'Dorper',fecha_nacimiento:'2021-03-08',peso_inicial:38,lote:'Lote B',costo_adquisicion:420000,madre_id:'',padre_id:'RE-001',estado:'Activa',origen:'Nacido en finca',observaciones:'',fecha_ingreso:'2021-03-08',activo:true,created_at:new Date().toISOString()},
      {id:'OV-0788',nombre:'Rosa',especie:'ovino',sexo:'H',categoria:'Reproductora',raza:'Katahdin',fecha_nacimiento:'2022-06-20',peso_inicial:32,lote:'Lote A',costo_adquisicion:350000,madre_id:'',padre_id:'RE-003',estado:'Activa',origen:'Comprado',observaciones:'',fecha_ingreso:'2022-07-01',activo:true,created_at:new Date().toISOString()},
      {id:'OV-2341',nombre:'',especie:'ovino',sexo:'H',categoria:'Reproductora',raza:'Dorper',fecha_nacimiento:'2020-04-10',peso_inicial:40,lote:'Lote C',costo_adquisicion:360000,madre_id:'',padre_id:'RE-001',estado:'En tratamiento',origen:'Nacido en finca',observaciones:'Tratamiento activo neumonía',fecha_ingreso:'2020-04-10',activo:true,created_at:new Date().toISOString()},
      {id:'OV-0441',nombre:'',especie:'ovino',sexo:'H',categoria:'Reproductora',raza:'Katahdin',fecha_nacimiento:'2021-01-05',peso_inicial:30,lote:'Lote A',costo_adquisicion:350000,madre_id:'',padre_id:'RE-001',estado:'Vacía',origen:'Comprado',observaciones:'3 ciclos vacía',fecha_ingreso:'2021-01-10',activo:true,created_at:new Date().toISOString()},
      {id:'RE-003',nombre:'Príncipe',especie:'ovino',sexo:'M',categoria:'Reproductor',raza:'Dorper',fecha_nacimiento:'2021-08-14',peso_inicial:55,lote:'Lote B',costo_adquisicion:1200000,madre_id:'',padre_id:'',estado:'Reproductor',origen:'Comprado',observaciones:'Fertilidad 96%',fecha_ingreso:'2021-09-01',activo:true,created_at:new Date().toISOString()},
      {id:'RE-007',nombre:'Zeus',especie:'ovino',sexo:'M',categoria:'Reproductor',raza:'Dorper',fecha_nacimiento:'2023-02-20',peso_inicial:50,lote:'Lote C',costo_adquisicion:1100000,madre_id:'',padre_id:'',estado:'Reproductor',origen:'Comprado',observaciones:'Fertilidad 92%',fecha_ingreso:'2023-03-01',activo:true,created_at:new Date().toISOString()},
      {id:'RE-001',nombre:'Titan',especie:'ovino',sexo:'M',categoria:'Reproductor',raza:'Dorper',fecha_nacimiento:'2020-05-10',peso_inicial:60,lote:'Lote A',costo_adquisicion:1300000,madre_id:'',padre_id:'',estado:'Reproductor',origen:'Comprado',observaciones:'Fertilidad 89%',fecha_ingreso:'2020-06-01',activo:true,created_at:new Date().toISOString()},
    ],
    pesajes: [],
    montas: [],
    partos: [],
    crias_parto: [],
    ecografias: [],
    tratamientos: [],
    medicamentos: [
      {id:'MED-001',nombre:'Ivermectina 1%',principio_activo:'Ivermectina',categoria:'Antiparasitario',presentacion:'Inyectable',nro_lote:'IV-2024-341',stock_actual:340,stock_maximo:500,dosis_estandar:'0.2 mL/10kg SC',dias_retiro:14,fecha_vencimiento:'2026-08-12',costo_por_unidad:85000,proveedor:'Agroveterinaria',temperatura_almacenamiento:'Temperatura ambiente',observaciones:'',activo:true,created_at:new Date().toISOString()},
      {id:'MED-002',nombre:'Oxitetraciclina 20%',principio_activo:'Oxitetraciclina',categoria:'Antibiótico',presentacion:'Inyectable',nro_lote:'OX-A2341',stock_actual:180,stock_maximo:250,dosis_estandar:'5 mL/10kg IM',dias_retiro:28,fecha_vencimiento:'2025-04-18',costo_por_unidad:42000,proveedor:'Agroveterinaria',temperatura_almacenamiento:'Refrigeración 2-8°C',observaciones:'',activo:true,created_at:new Date().toISOString()},
    ],
    costos: [],
    ingresos: [],
    bajas: [],
    movimientos: [],
    lotes: [
      {id:'L-A',nombre:'Lote A',area_ha:18.4,capacidad_max:147,tipo_pasto:'Kikuyo',condicion_pasto:72,fuente_agua:'Bebedero',descripcion:'Zona norte',activo:true,created_at:new Date().toISOString()},
      {id:'L-B',nombre:'Lote B',area_ha:24.1,capacidad_max:193,tipo_pasto:'Brachiaria',condicion_pasto:48,fuente_agua:'Nacimiento',descripcion:'Zona central',activo:true,created_at:new Date().toISOString()},
      {id:'L-C',nombre:'Lote C',area_ha:19.7,capacidad_max:158,tipo_pasto:'Mixto',condicion_pasto:61,fuente_agua:'Quebrada',descripcion:'Zona sur',activo:true,created_at:new Date().toISOString()},
      {id:'L-D',nombre:'Lote D',area_ha:14.0,capacidad_max:112,tipo_pasto:'Kikuyo',condicion_pasto:22,fuente_agua:'Bebedero',descripcion:'Zona oriente',activo:true,created_at:new Date().toISOString()},
    ],
    finca: {nombre:'La Marinilla',empresa:'LAAAMB',municipio:'La Marinilla',departamento:'Antioquia',area_ha:76.2},
    meta: {version:VERSION,creado:new Date().toISOString(),actualizado:new Date().toISOString()}
  };

  // ── Cargar / guardar ──────────────────────────────────────────────────────────
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch(e) { return null; }
  }

  function save(data) {
    try {
      data.meta = data.meta || {};
      data.meta.actualizado = new Date().toISOString();
      localStorage.setItem(KEY, JSON.stringify(data));
      return true;
    } catch(e) {
      console.error('AppData save error:', e);
      return false;
    }
  }

  function get() {
    const d = load();
    if (!d) {
      // Primera vez — cargar datos de ejemplo
      save(EJEMPLO);
      return EJEMPLO;
    }
    // Merge: asegurar que todas las colecciones existen
    Object.keys(EJEMPLO).forEach(k => {
      if (d[k] === undefined) d[k] = EJEMPLO[k];
    });
    return d;
  }

  // ── ID único ──────────────────────────────────────────────────────────────────
  function uid(prefix) {
    return prefix + '-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2,5).toUpperCase();
  }

  // ── CRUD genérico ─────────────────────────────────────────────────────────────
  function addRecord(collection, record) {
    const d = get();
    if (!d[collection]) d[collection] = [];
    record.created_at = record.created_at || new Date().toISOString();
    d[collection].unshift(record); // más nuevo primero
    save(d);
    return record;
  }

  function updateRecord(collection, id, changes) {
    const d = get();
    const idx = d[collection].findIndex(r => r.id === id);
    if (idx === -1) return false;
    d[collection][idx] = {...d[collection][idx], ...changes, updated_at: new Date().toISOString()};
    save(d);
    return d[collection][idx];
  }

  function deleteRecord(collection, id) {
    const d = get();
    d[collection] = d[collection].filter(r => r.id !== id);
    save(d);
  }

  function getCollection(collection) {
    return get()[collection] || [];
  }

  // ── Estadísticas derivadas ────────────────────────────────────────────────────
  function stats(especieFiltro) {
    const d = get();
    // especieFiltro: 'ovino' | 'bovino' | null (todos)
    const activos = d.animales.filter(a => a.activo && (!especieFiltro || (a.especie||'ovino') === especieFiltro));
    const ovinos  = d.animales.filter(a => a.activo && (a.especie||'ovino') === 'ovino');
    const bovinos = d.animales.filter(a => a.activo && (a.especie||'ovino') === 'bovino');

    const hembras   = activos.filter(a => a.sexo === 'H');
    const machos    = activos.filter(a => a.sexo === 'M');
    const reproductores = activos.filter(a => a.sexo === 'M' && ['Reproductor','Toro'].includes(a.categoria));
    const levante   = activos.filter(a => ['Levante','Cría','Ternero','Ternera','Cordero','Cordera','Novillo','Vaquilla'].includes(a.categoria));
    const engorde   = activos.filter(a => ['Cordero','Cordera','Novillo','Vaquilla'].includes(a.categoria));
    const gestantes = activos.filter(a => a.estado === 'Gestante');

    // GDP promedio por especie
    const calcGDP = function(esp) {
      const pesajesEsp = d.pesajes.filter(function(p) {
        if (!p.gdp_calculado) return false;
        const animal = d.animales.find(function(a) { return a.id === p.animal_id; });
        return animal && (!esp || (animal.especie||'ovino') === esp);
      });
      if (!pesajesEsp.length) return null;
      return Math.round(pesajesEsp.reduce((s,p) => s + p.gdp_calculado, 0) / pesajesEsp.length);
    };

    // Tratamientos activos
    const tratActivos = d.tratamientos.filter(t => t.estado === 'En curso').length;

    // Muertes este mes
    const now = new Date();
    const mesActual = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    const muertesmes = d.bajas.filter(b => b.tipo_baja === 'muerte' && b.fecha && b.fecha.startsWith(mesActual)).length;

    // Metas según especie
    const meta = especieFiltro && ESPECIES[especieFiltro] ? ESPECIES[especieFiltro].metas : null;

    return {
      total: activos.length,
      total_ovinos: ovinos.length,
      total_bovinos: bovinos.length,
      hembras: hembras.length,
      machos: machos.length,
      reproductores: reproductores.length,
      levante: levante.length,
      engorde: engorde.length,
      gestantes: gestantes.length,
      gdp_promedio: calcGDP(especieFiltro),
      gdp_ovinos: calcGDP('ovino'),
      gdp_bovinos: calcGDP('bovino'),
      tratamientos_activos: tratActivos,
      muertes_mes: muertesmes,
      mortalidad_pct: activos.length > 0 ? ((muertesmes / activos.length) * 100).toFixed(2) : 0,
      // Metas de la especie activa
      meta_gdp: meta ? meta.gdp_g_dia : null,
      meta_fertilidad: meta ? meta.fertilidad_pct : null,
      meta_mortalidad: meta ? meta.mortalidad_pct : null,
      meta_dias_gestacion: meta ? meta.dias_gestacion : null,
      // Especie filtrada
      especie: especieFiltro || 'todas',
    };
  }

  // ── Peso actual de un animal (último pesaje) ──────────────────────────────────
  function pesoActual(animalId) {
    const d = get();
    const pesajes = d.pesajes.filter(p => p.animal_id === animalId).sort((a,b) => new Date(b.fecha) - new Date(a.fecha));
    if (pesajes.length) return pesajes[0].peso_kg;
    const animal = d.animales.find(a => a.id === animalId);
    return animal ? animal.peso_inicial : null;
  }

  // ── Costo acumulado de un animal ──────────────────────────────────────────────
  function costoAnimal(animalId) {
    const d = get();
    const animal = d.animales.find(a => a.id === animalId);
    if (!animal) return 0;
    let total = animal.costo_adquisicion || 0;
    total += d.costos.filter(c => c.animal_id === animalId).reduce((s,c) => s + (c.valor_cop||0), 0);
    return total;
  }

  // ── Importación masiva ────────────────────────────────────────────────────────
  /**
   * Valida filas de importación contra el esquema de la colección
   * Retorna { valid: [], errors: [] }
   */
  function validateImport(collection, rows, headers) {
    const schema = SCHEMAS[collection] || [];
    const valid = [], errors = [];

    rows.forEach((row, i) => {
      const rowNum = i + 2; // +2 porque fila 1 = headers
      const obj = {};
      const rowErrors = [];

      headers.forEach((h, j) => {
        const key = h.toLowerCase().trim().replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'');
        obj[key] = row[j] !== undefined ? String(row[j]).trim() : '';
      });

      // Validaciones mínimas por colección
      if (collection === 'animales') {
        if (!obj.id && !obj['id/arete']) rowErrors.push('ID/Arete requerido');
        if (!obj.sexo && !obj['sexo_(h/m)']) rowErrors.push('Sexo requerido');
        // Normalizar ID
        obj.id = obj.id || obj['id/arete'] || obj.arete || '';
        obj.sexo = (obj.sexo || obj['sexo_(h/m)'] || '').toUpperCase().charAt(0);
        if (!['H','M'].includes(obj.sexo)) rowErrors.push('Sexo debe ser H o M');
      }
      if (collection === 'pesajes') {
        if (!obj.animal_id && !obj['id_animal']) rowErrors.push('ID Animal requerido');
        if (!obj.peso_kg && !obj['peso_kg'] && !obj['peso_(kg)']) rowErrors.push('Peso requerido');
        obj.animal_id = obj.animal_id || obj['id_animal'] || obj['animal_(id)'] || '';
        obj.peso_kg = parseFloat(obj.peso_kg || obj['peso_(kg)'] || obj.peso || 0);
      }
      if (collection === 'ecografias') {
        if (!obj.animal_id && !obj['id_animal']) rowErrors.push('ID Animal requerido');
        const res = (obj.resultado || '').toLowerCase();
        if (res && !['gestante','vacía','vacia','no apta'].includes(res)) rowErrors.push('Resultado debe ser: Gestante, Vacía o No apta');
        obj.animal_id = obj.animal_id || obj['id_animal'] || '';
      }

      if (rowErrors.length) {
        errors.push({fila: rowNum, errores: rowErrors, datos: obj});
      } else {
        obj.created_at = new Date().toISOString();
        if (!obj.id) obj.id = uid(collection.slice(0,3).toUpperCase());
        valid.push(obj);
      }
    });

    return {valid, errors};
  }

  /**
   * Confirmar importación validada
   * Si replace=true, reemplaza la colección completa; si no, hace append
   */
  function confirmImport(collection, validRows, replace) {
    const d = get();
    if (!d[collection]) d[collection] = [];

    if (replace) {
      d[collection] = validRows;
    } else {
      // Deduplicar por ID
      const existingIds = new Set(d[collection].map(r => r.id));
      validRows.forEach(r => {
        if (!existingIds.has(r.id)) {
          d[collection].unshift(r);
        } else {
          // Actualizar existente
          const idx = d[collection].findIndex(x => x.id === r.id);
          if (idx !== -1) d[collection][idx] = {...d[collection][idx], ...r};
        }
      });
    }

    // Efectos secundarios por colección
    if (collection === 'ecografias') {
      // Actualizar estado de las ovejas según resultado
      validRows.forEach(eco => {
        const idx = d.animales.findIndex(a => a.id === eco.animal_id);
        if (idx !== -1) {
          const res = (eco.resultado || '').toLowerCase();
          if (res === 'gestante') d.animales[idx].estado = 'Gestante';
          else if (res === 'vacía' || res === 'vacia') d.animales[idx].estado = 'Vacía';
        }
      });
    }

    if (collection === 'animales') {
      // Marcar como activo por defecto y normalizar especie
      d[collection].forEach(a => {
        if (a.activo === undefined) a.activo = true;
        if (!a.especie) a.especie = 'ovino'; // default
        a.especie = String(a.especie).toLowerCase().trim();
        if (!['ovino','bovino'].includes(a.especie)) a.especie = 'ovino';
      });
    }

    save(d);
    return validRows.length;
  }

  // ── Exportación completa ──────────────────────────────────────────────────────
  /**
   * Retorna todas las colecciones como objeto { coleccion: [filas] }
   * Listo para crear Excel con XLSX
   */
  function exportAll() {
    const d = get();
    const result = {};
    Object.keys(SCHEMAS).forEach(col => {
      if (!d[col] || !d[col].length) return;
      // Headers = todos los campos del schema
      const schema = SCHEMAS[col];
      const rows = [schema]; // primera fila = headers
      d[col].forEach(record => {
        rows.push(schema.map(field => {
          const v = record[field];
          if (v === undefined || v === null) return '';
          if (typeof v === 'boolean') return v ? 'SI' : 'NO';
          return v;
        }));
      });
      result[col] = rows;
    });
    // Hoja de resumen
    const s = stats();
    result['_resumen'] = [
      ['Campo','Valor'],
      ['Total animales activos', s.total],
      ['Hembras', s.hembras],
      ['Machos reproductores', s.machos],
      ['En levante', s.levante],
      ['Gestantes', s.gestantes],
      ['GDP promedio g/d', s.gdp_promedio || 'Sin pesajes'],
      ['Tratamientos activos', s.tratamientos_activos],
      ['Exportado', new Date().toLocaleString('es-CO')],
    ];
    return result;
  }

  function exportCollection(collection) {
    const d = get();
    const schema = SCHEMAS[collection] || [];
    const rows = [schema];
    (d[collection] || []).forEach(record => {
      rows.push(schema.map(f => {
        const v = record[f];
        if (v === undefined || v === null) return '';
        if (typeof v === 'boolean') return v ? 'SI' : 'NO';
        return v;
      }));
    });
    return rows;
  }

  // ── Plantillas de importación ─────────────────────────────────────────────────
  const TEMPLATES = {
    animales: [
      ['ID/Arete*','Nombre','Especie (ovino/bovino)*','Sexo (H/M)*','Categoría*','Raza*','Fecha nacimiento (YYYY-MM-DD)','Peso inicial kg','Lote*','Costo adquisición COP','Madre ID','Padre ID','Estado','Origen','Observaciones'],
      ['OV-0471','Bella','ovino','H','Reproductora','Dorper','2022-01-15',35,'Lote A',380000,'','RE-001','Activa','Nacido en finca',''],
      ['OV-0472','','ovino','M','Reproductor','Dorper','2021-08-14',55,'Lote B',1200000,'','','Reproductor','Comprado',''],
      ['BO-0101','','bovino','M','Novillo','Brahman','2023-06-01',250,'Lote A',0,'','','Levante','Nacido en finca',''],
    ],
    pesajes: [
      ['ID Animal*','Fecha pesaje (YYYY-MM-DD)*','Peso kg*','Colaborador','Observaciones'],
      ['OV-0234','2025-04-10',48,'Juan García',''],
    ],
    montas: [
      ['ID Hembra*','ID Macho*','Fecha monta (YYYY-MM-DD)*','Ciclo N°','Tipo (Natural/IA)','Lote','Condición corporal 1-5','Colaborador','Observaciones'],
      ['OV-0234','RE-003','2025-04-15',1,'Natural','Lote A',3.5,'Juan García',''],
    ],
    ecografias: [
      ['ID Animal*','Fecha eco (YYYY-MM-DD)*','Resultado (Gestante/Vacía/No apta)*','Días gestación','N° fetos','Veterinario','Observaciones'],
      ['OV-1102','2025-04-10','Gestante',45,2,'Dr. Martínez','Mellizos confirmados'],
      ['OV-0441','2025-04-10','Vacía','','','Dr. Martínez','3er ciclo vacía'],
    ],
    tratamientos: [
      ['ID/Lote Animal*','Diagnóstico/Motivo*','Medicamento*','Dosis aplicada','Vía (IM/SC/IV/VO)','Duración días','Fecha inicio (YYYY-MM-DD)*','Días retiro','Costo COP','Colaborador','Observaciones'],
      ['OV-2341','Neumonía bacteriana','Oxitetraciclina 20%','21 mL','IM',5,'2025-04-08',28,18500,'Juan García',''],
    ],
    costos: [
      ['Categoría*','Descripción*','ID Animal (opcional)','Lote','Valor COP*','Método pago','Fecha (YYYY-MM-DD)*','Colaborador','Observaciones'],
      ['Alimentación / Pasto','Concentrado proteico Lote B','','Lote B',1800000,'Efectivo','2025-04-10','Juan García',''],
    ],
    bajas: [
      ['ID Animal*','Tipo baja*','Fecha (YYYY-MM-DD)*','Peso kg','Causa muerte','Valor venta COP','Comprador','Colaborador','Observaciones'],
      ['OV-1892','muerte','2025-04-10',12,'Neumonía','','','Juan García',''],
    ],
  };

  function getTemplate(collection) {
    return TEMPLATES[collection] || [['Sin plantilla definida']];
  }

  // ── Lógica de negocio: registrar parto ────────────────────────────────────────
  function registrarParto(partoData, criasData) {
    const d = get();

    // 1. Guardar el parto
    partoData.id = partoData.id || uid('PRT');
    partoData.created_at = new Date().toISOString();
    d.partos.unshift(partoData);

    // 2. Crear animales-cría
    const criasCreadas = [];
    (criasData || []).forEach((cria, i) => {
      const animalId = `OV-${Date.now().toString().slice(-4)}${i}`;
      const nuevoAnimal = {
        id: animalId,
        nombre: '',
        sexo: cria.sexo || 'H',
        categoria: 'Cría',
        raza: d.animales.find(a => a.id === partoData.madre_id)?.raza || 'Dorper',
        fecha_nacimiento: partoData.fecha,
        peso_inicial: cria.peso_kg || 0,
        lote: partoData.lote || 'Lote A',
        costo_adquisicion: 0,
        madre_id: partoData.madre_id,
        padre_id: partoData.padre_id,
        estado: 'Activa',
        origen: 'Nacido en finca',
        observaciones: `Cría de parto ${partoData.id}`,
        fecha_ingreso: partoData.fecha,
        activo: true,
        created_at: new Date().toISOString()
      };
      d.animales.unshift(nuevoAnimal);

      // Registrar cría en tabla crias_parto
      d.crias_parto = d.crias_parto || [];
      d.crias_parto.unshift({
        id: uid('CRP'),
        parto_id: partoData.id,
        madre_id: partoData.madre_id,
        padre_id: partoData.padre_id,
        sexo: cria.sexo,
        peso_nacimiento: cria.peso_kg,
        animal_id_generado: animalId,
        created_at: new Date().toISOString()
      });

      criasCreadas.push(animalId);
    });

    // 3. Actualizar estado de la madre
    const madreIdx = d.animales.findIndex(a => a.id === partoData.madre_id);
    if (madreIdx !== -1) {
      d.animales[madreIdx].estado = 'Activa';
      d.animales[madreIdx].updated_at = new Date().toISOString();
    }

    save(d);
    return {partoId: partoData.id, criasCreadas};
  }

  // ── Lógica: registrar baja ────────────────────────────────────────────────────
  function registrarBaja(bajaData) {
    const d = get();
    bajaData.id = bajaData.id || uid('BAJ');
    bajaData.created_at = new Date().toISOString();
    d.bajas.unshift(bajaData);

    // Marcar animal como inactivo
    const idx = d.animales.findIndex(a => a.id === bajaData.animal_id);
    if (idx !== -1) {
      d.animales[idx].activo = false;
      d.animales[idx].estado = bajaData.tipo_baja === 'muerte' ? 'Muerto' : 'Vendido';
      d.animales[idx].updated_at = new Date().toISOString();
    }

    // Si es venta, registrar ingreso
    if (bajaData.valor_venta) {
      d.ingresos.unshift({
        id: uid('ING'),
        tipo: bajaData.tipo_baja === 'muerte' ? 'Venta sacrificio' : 'Venta ' + bajaData.tipo_baja,
        animales_ids: bajaData.animal_id,
        total_cop: bajaData.valor_venta,
        comprador: bajaData.comprador || '',
        fecha: bajaData.fecha,
        colaborador: bajaData.colaborador || '',
        created_at: new Date().toISOString()
      });
    }

    save(d);
    return bajaData.id;
  }

  // ── Lógica: aplicar tratamiento grupal → descuenta stock ─────────────────────
  function registrarTratamiento(tratData, medicamentoId, dosisTotal) {
    const d = get();
    tratData.id = tratData.id || uid('TRT');
    tratData.created_at = new Date().toISOString();
    d.tratamientos.unshift(tratData);

    // Descontar stock del medicamento
    if (medicamentoId && dosisTotal) {
      const mIdx = d.medicamentos.findIndex(m => m.id === medicamentoId);
      if (mIdx !== -1) {
        d.medicamentos[mIdx].stock_actual = Math.max(0, (d.medicamentos[mIdx].stock_actual || 0) - dosisTotal);
      }
    }

    // Si es individual, actualizar estado del animal
    if (tratData.tipo === 'Individual' && tratData.animales_ids) {
      const ids = String(tratData.animales_ids).split(',').map(s => s.trim());
      ids.forEach(aid => {
        const idx = d.animales.findIndex(a => a.id === aid);
        if (idx !== -1) d.animales[idx].estado = 'En tratamiento';
      });
    }

    save(d);
    return tratData.id;
  }

  // ── Reiniciar datos ───────────────────────────────────────────────────────────
  function reset(withExample) {
    if (withExample) {
      save(EJEMPLO);
    } else {
      const empty = {};
      Object.keys(EJEMPLO).forEach(k => {
        empty[k] = Array.isArray(EJEMPLO[k]) ? [] : {};
      });
      empty.meta = {version: VERSION, creado: new Date().toISOString()};
      save(empty);
    }
  }

  function resetField(collection) {
    const d = get();
    d[collection] = [];
    save(d);
  }

  // ── API pública ───────────────────────────────────────────────────────────────
  return {
    // Core
    get, save, load,
    // Especies
    ESPECIES,
    CATEGORIAS_ENGORDE,
    CATEGORIAS_REPRODUCCION,
    // CRUD
    add: addRecord,
    update: updateRecord,
    delete: deleteRecord,
    list: getCollection,
    // Stats
    stats,
    pesoActual,
    costoAnimal,
    // Import/Export
    validateImport,
    confirmImport,
    exportAll,
    exportCollection,
    getTemplate,
    // Business logic
    registrarParto,
    registrarBaja,
    registrarTratamiento,
    // Utils
    uid,
    reset,
    resetField,
    SCHEMAS,
  };
})();

// Disponible globalmente
window.AppData = AppData;
