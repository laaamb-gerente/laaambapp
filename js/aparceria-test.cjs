// ── aparceria-test.js ──────────────────────────────────────────────────
// Aserciones del motor de KPIs de APARCERÍA.
//
// CAPA 1 — identidades estructurales. Valen con CUALQUIER dataset, incluido
// el vacío. No contienen un solo valor puntual del negocio: comprueban que
// el motor sea internamente coherente. Sobreviven a que cambien las cifras.
//
// CAPA 2 — valores puntuales. Salen de un FIXTURE que se genera a partir de
// los datos realmente cargados (`--fixture`), nunca escritos a mano aquí.
// Así una recarga con otras fundadoras no invalida el test: se regenera.
//
// Se ejecuta con Node:
//   node js/aparceria-test.cjs                      → capa 1 (incl. vacío)
//   node js/aparceria-test.cjs --fixture <f.json>   → capa 1 + capa 2
//
// Extensión .cjs porque package.json declara "type":"module" y este archivo
// es CommonJS de Node. js/aparceria.js sigue siendo un IIFE de navegador y se
// carga con vm, no con require(), justo porque en un paquete ESM un .js no se
// puede require(). Así el test valida EL MISMO archivo que sirve la app, sin
// una copia paralela que se pueda desincronizar.
//
// Lo único hardcodeado son las CLÁUSULAS DE CONTRATO (hato_inicial y
// meta_anual), que no son datos: son la base contra la que se mide el
// crecimiento y no se mueven cuando se recarga el dataset.

'use strict';

// aparceria.js es un IIFE de navegador que se cuelga de window. Se evalúa en
// un contexto con un window falso: así se prueba el archivo real que sirve la
// app, no una copia.
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ctx = { window: { _sb: {} }, console: console };
ctx.globalThis = ctx;
vm.createContext(ctx);
var rutaModulo = path.join(__dirname, 'aparceria.js');
vm.runInContext(fs.readFileSync(rutaModulo, 'utf8'), ctx, { filename: rutaModulo });

var A = ctx.window.APARCERIA;
if (!A) throw new Error('aparceria.js no expuso window.APARCERIA');

// ── CLÁUSULAS DE CONTRATO (no son datos del dataset) ──
var CONTRATOS = [
  { nombre: 'JULIAN Y SALATIEL MORENO', hato_inicial: 42, meta_anual: 113.4 },
  { nombre: 'PAOLA MORENO',             hato_inicial: 24, meta_anual: 64.8 },
  { nombre: 'MAURICIO FAJARDO',         hato_inicial: 70, meta_anual: 189 }
];

var fallos = 0, corridas = 0;
function ok(etiqueta, cond, detalle) {
  corridas++;
  if (!cond) { fallos++; console.log('  XX ' + etiqueta + (detalle ? '  → ' + detalle : '')); }
  else console.log('  OK ' + etiqueta + (detalle ? '  (' + detalle + ')' : ''));
}

// Genera filas sintéticas. Solo para ejercitar las identidades: ninguna
// cifra de aquí se compara contra un valor esperado del negocio.
function fila(o) {
  return Object.assign({
    origen: 'real', estado_salida: 'activo', tipo: 'cria', codigo: 'X',
    sexo: 'hembra', raza: 'KATAHDIN', grupo: 'Madres',
    estado_reproductivo: null, madre_codigo: null, fecha_nacimiento: null,
    motivo_salida: null, fecha_salida: null, pesajes: []
  }, o);
}
function n(cant, o) {
  return Array.from({ length: cant }, function (_, i) {
    return fila(Object.assign({ codigo: 'X' + i }, o));
  });
}

// ══ CAPA 1 ══════════════════════════════════════════════════════════════
console.log('\n═══ CAPA 1 · identidades estructurales ═══');

var ESCENARIOS = [
  {
    nombre: 'DATASET VACÍO (fase 0 — nada cargado)',
    rows: [],
    aportante: { hato_inicial: 42, meta_anual: 113.4 },
    extra: function (k) {
      ok('vacío → hato_actual = 0', k.hatoActual === 0);
      ok('vacío → crecimiento = -100%', k.crecimientoPct === -100, String(k.crecimientoPct));
      ok('vacío → cumplimiento = 0%', k.cumplimientoPct === 0, String(k.cumplimientoPct));
      ok('vacío → mortalidad null (sin división por cero)', k.mortalidadPct === null);
      ok('vacío → fertilidad null', k.fertilidadPct === null);
      ok('vacío → prolificidad null', k.prolificidad === null);
      ok('vacío → gap = -hato_inicial', k.gapConciliacion === -42, String(k.gapConciliacion));
    }
  },
  {
    nombre: 'SIN aportante (hato_inicial y meta ausentes)',
    rows: n(5, {}),
    aportante: null,
    extra: function (k) {
      ok('sin base → crecimiento null', k.crecimientoPct === null);
      ok('sin base → cumplimiento null', k.cumplimientoPct === null);
      ok('sin base → gap null', k.gapConciliacion === null);
      ok('sin base → hato_actual sigue contando', k.hatoActual === 5);
    }
  },
  {
    nombre: 'SOLO fundadoras (fase 1 cargada)',
    rows: [].concat(n(30, { tipo: 'madre_lote_inicial' }),
                    n(5,  { tipo: 'madre_lote_inicial', estado_salida: 'muerte', motivo_salida: 'Murio' }),
                    n(2,  { tipo: 'madre_lote_inicial', estado_salida: 'no_localizado' })),
    aportante: { hato_inicial: 42, meta_anual: 113.4 },
    extra: function (k) {
      ok('sin crías → prolificidad null', k.prolificidad === null);
      ok('sin crías → crias_activas = 0', k.criasActivas === 0);
      ok('no_localizados NO son muertes', k.muertes === 5 && k.noLocalizados === 2);
    }
  },
  {
    nombre: 'CON sacrificios (fase 3) — el caso que no debe inflar mortalidad',
    rows: [].concat(n(20, { tipo: 'madre_lote_inicial' }),
                    n(15, { tipo: 'cria', madre_codigo: 'M1' }),
                    n(9,  { tipo: 'cria', madre_codigo: 'M2', estado_salida: 'sacrificio' }),
                    n(3,  { tipo: 'cria', madre_codigo: 'M3', estado_salida: 'muerte', motivo_salida: 'Murio' }),
                    n(2,  { tipo: 'cria', madre_codigo: 'M4', estado_salida: 'venta' }),
                    n(1,  { tipo: 'cria', estado_salida: 'no_localizado' })),
    aportante: { hato_inicial: 42, meta_anual: 113.4 },
    extra: function (k) {
      ok('sacrificios en línea propia', k.sacrificios === 9);
      // 3 muertes de 50 registrados = 6%. Si se sumaran los 9 sacrificios
      // serían 24% — cuatro veces más. Esta es la mentira que 0057 evita.
      ok('mortalidad = solo muertes (6%, no 24%)', k.mortalidadPct === 6, String(k.mortalidadPct) + '%');
      ok('ventas contabilizadas aparte', k.ventas === 2);
    }
  },
  {
    nombre: 'CON proyectados (fase 2) — fuera de los KPIs de portada',
    rows: [].concat(n(20, { tipo: 'madre_lote_inicial' }),
                    n(10, { tipo: 'cria', madre_codigo: 'M1' }),
                    n(14, { origen: 'proyectado', tipo: 'cria' })),
    aportante: { hato_inicial: 42, meta_anual: 113.4 },
    extra: function (k) {
      ok('proyectados NO entran al hato', k.hatoActual === 30, String(k.hatoActual));
      ok('proyectados contados aparte', k.proyectados === 14);
      ok('hato con escenario = 30 + 14', k.hatoConEscenario === 44);
      ok('total registrado excluye proyectados', k.totalRegistradas === 30);
    }
  },
  {
    nombre: 'TODO salido (hato en cero con animales registrados)',
    rows: [].concat(n(4, { tipo: 'madre_lote_inicial', estado_salida: 'muerte', motivo_salida: 'Murio' }),
                    n(3, { tipo: 'cria', madre_codigo: 'M1', estado_salida: 'sacrificio' })),
    aportante: { hato_inicial: 42, meta_anual: 113.4 },
    extra: function (k) {
      ok('hato_actual = 0 con 7 registrados', k.hatoActual === 0 && k.totalRegistradas === 7);
      ok('crecimiento = -100%', k.crecimientoPct === -100);
      ok('mortalidad = 57.1% (4/7)', k.mortalidadPct === 57.1, String(k.mortalidadPct));
      ok('fertilidad null (nadie activo)', k.fertilidadPct === null);
    }
  }
];

ESCENARIOS.forEach(function (e) {
  console.log('\n· ' + e.nombre);
  var r = A.verificarIdentidades(e.rows, e.aportante);
  r.identidades.forEach(function (i) { ok(i.id, i.ok, i.detalle); });
  if (e.extra) e.extra(r.kpis);
});

// Las cláusulas de contrato deben cumplir meta = hato_inicial × 2.7.
console.log('\n· CLÁUSULAS DE CONTRATO (meta = hato_inicial × 2.7)');
CONTRATOS.forEach(function (c) {
  var esperada = Math.round(c.hato_inicial * A.META_MULT * 100) / 100;
  ok(c.nombre, Math.abs(c.meta_anual - esperada) < 0.01,
     c.hato_inicial + ' × 2.7 = ' + esperada + ' vs ' + c.meta_anual);
});

// ── PESO SIN FECHA (chapeta 235) ────────────────────────────────────────
// Un pesaje de balanza sin fecha NO puede recibir la fecha de corte: seria
// un dato falso etiquetado como 'real'. Vive en las columnas del animal con
// fecha null y pesoVigente lo devuelve tal cual.
console.log('\n· PESO SIN FECHA vs pesajes fechados');
var sinFecha = { peso_kg: 35, peso_fecha: null, peso_tipo: 'real',
                 peso_nota: 'Pesaje de balanza sin fecha registrada en origen.', pesajes: [] };
var pv = A.pesoVigente(sinFecha);
ok('peso sin fecha se devuelve', pv && pv.peso_kg === 35, String(pv && pv.peso_kg));
ok('conserva tipo real', pv && pv.tipo === 'real', pv && pv.tipo);
ok('fecha queda NULL, no inventada', pv && pv.fecha === null, String(pv && pv.fecha));
ok('sin peso alguno → null', A.pesoVigente({ pesajes: [] }) === null);
// Un pesaje fechado gana sobre el snapshot sin fecha.
var conAmbos = { peso_kg: 35, peso_fecha: null, peso_tipo: 'real', pesajes: [
  { fecha: '2026-03-02', peso_kg: 41, tipo: 'real' } ] };
ok('pesaje fechado gana al snapshot', A.pesoVigente(conAmbos).peso_kg === 41,
   String(A.pesoVigente(conAmbos).peso_kg));
// Jerarquia sacrificio > real > estimado.
var jer = { pesajes: [ { fecha: '2026-01-01', peso_kg: 20, tipo: 'estimado' },
                       { fecha: '2026-02-01', peso_kg: 30, tipo: 'real' },
                       { fecha: '2025-12-01', peso_kg: 38, tipo: 'sacrificio' } ] };
ok('sacrificio > real > estimado (aunque sea mas viejo)',
   A.pesoVigente(jer).tipo === 'sacrificio' && A.pesoVigente(jer).peso_kg === 38);

// ── BAJAS SIN FECHA ─────────────────────────────────────────────────────
// Toda vista de mortalidad con filtro de fechas debe poder declarar cuantas
// bajas quedarian fuera del rango por no tener fecha.
console.log('\n· BAJAS SIN FECHA (regla de mortalidad por rango)');
var conMuertes = [].concat(
  n(10, { tipo: 'madre_lote_inicial' }),
  n(7,  { tipo: 'madre_lote_inicial', estado_salida: 'muerte', fecha_salida: null }),
  n(3,  { tipo: 'madre_lote_inicial', estado_salida: 'muerte', fecha_salida: '2026-01-14' }));
var km = A.kpis(conMuertes, { hato_inicial: 42, meta_anual: 113.4 });
ok('muertes totales', km.muertes === 10, String(km.muertes));
ok('muertes SIN fecha expuestas', km.muertesSinFecha === 7, String(km.muertesSinFecha));
ok('muertes CON fecha expuestas', km.muertesConFecha === 3, String(km.muertesConFecha));
ok('sin_fecha + con_fecha = total', km.muertesSinFecha + km.muertesConFecha === km.muertes);

// ══ CAPA 2 ══════════════════════════════════════════════════════════════
// Se activa solo con --fixture. El fixture lo genera el cargador a partir de
// lo realmente insertado, así que los valores puntuales nunca se escriben a
// mano y una recarga con otras cifras se valida regenerándolo.
var argFix = process.argv.indexOf('--fixture');
if (argFix > -1 && process.argv[argFix + 1]) {
  var ruta = process.argv[argFix + 1];
  console.log('\n═══ CAPA 2 · valores puntuales desde fixture ═══');
  console.log('  fixture: ' + ruta);
  var fx = JSON.parse(require('fs').readFileSync(ruta, 'utf8'));
  (fx.aportantes || []).forEach(function (blo) {
    console.log('\n· ' + blo.aportante.nombre);
    var r = A.verificarIdentidades(blo.rows, blo.aportante);
    r.identidades.forEach(function (i) { ok('[estructural] ' + i.id, i.ok, i.detalle); });
    Object.keys(blo.esperado || {}).forEach(function (campo) {
      ok('[fixture] ' + campo, r.kpis[campo] === blo.esperado[campo],
         'motor=' + r.kpis[campo] + ' fixture=' + blo.esperado[campo]);
    });
  });
} else {
  console.log('\n═══ CAPA 2 · omitida (sin --fixture) ═══');
  console.log('  Se genera al correr el cargador. Sin animales cargados no hay');
  console.log('  valores puntuales que verificar, y eso es correcto en fase 0.');
}

console.log('\n' + (fallos
  ? '✗ ' + fallos + ' de ' + corridas + ' aserciones FALLAN'
  : '✓ ' + corridas + ' aserciones OK'));
process.exit(fallos ? 1 : 0);
