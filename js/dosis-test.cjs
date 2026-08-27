// Pruebas de fórmula de dosis (ml/kg, rangos tipo Dicogan) y catálogo
// para el selector de tratamiento (Dilarvon recién creado, stock 0).
//
//   node js/dosis-test.cjs
'use strict';
var fs = require('fs');
var vm = require('vm');
var path = require('path');
var ctx = { window: {}, console: console };
ctx.globalThis = ctx;
vm.createContext(ctx);
var RUTA = path.join(__dirname, 'dosis.js');
vm.runInContext(fs.readFileSync(RUTA, 'utf8'), ctx, { filename: RUTA });
var D = ctx.window.Dosis;
if (!D) throw new Error('dosis.js no expuso window.Dosis');

var fail = 0;
function t(label, got, exp) {
  var ok = JSON.stringify(got) === JSON.stringify(exp);
  if (!ok) fail++;
  console.log((ok ? '  OK ' : '  XX ') + label);
  if (!ok) console.log('       got', got, 'exp', exp);
}
function approx(label, got, exp) {
  var ok = typeof got === 'number' && Math.abs(got - exp) < 1e-9;
  if (!ok) fail++;
  console.log((ok ? '  OK ' : '  XX ') + label);
  if (!ok) console.log('       got', got, 'exp', exp);
}

// ── Fórmulas fijas que ya usaba la finca ─────────────────────────────
approx('Clozaval/Dilarvon 1 ml / 4 kg → 0.25 ml/kg', D.parseDosisMlPorKg('1 ml / 4 kg'), 0.25);
approx('Cydectin 1 ml / 20 kg', D.parseDosisMlPorKg('1 ml / 20 kg'), 0.05);
approx('1ml x 20kg', D.parseDosisMlPorKg('1ml x 20kg'), 0.05);
approx('0,5 ml / 10 kg', D.parseDosisMlPorKg('0,5 ml / 10 kg'), 0.05);
approx('vacío no parsea', D.parseDosisMlPorKg(''), 0);
approx('texto libre no parsea', D.parseDosisMlPorKg('Según etiqueta'), 0);

// ── BUG Dicogan: rango 25-50 kg dejaba factor 0 y sugerida vacía ─────
approx('Dicogan 1ml/25-50kg usa 1/25 (dosis alta, no subdosificar)', D.parseDosisMlPorKg('1ml/25-50kg'), 1 / 25);
approx('Dicogan con espacios 1 ml / 25-50 kg', D.parseDosisMlPorKg('1 ml / 25-50 kg'), 1 / 25);
approx('Dicogan 1 ml / 25 a 50 kg', D.parseDosisMlPorKg('1 ml / 25 a 50 kg'), 1 / 25);

var p = D.parseDosisPauta('1ml/25-50kg');
t('pauta Dicogan es rango', !!(p && p.rango), true);
approx('pauta kgMin 25', p && p.kgMin, 25);
approx('pauta kgMax 50', p && p.kgMax, 50);

t('50 kg Dicogan → 2.0 ml sugeridos (1 ml / 25 kg)', D.mlDePeso(50, D.parseDosisMlPorKg('1ml/25-50kg')), 2);
var txt = D.textoDosisSugerida(50, '1ml/25-50kg');
t('texto sugerida incluye 2.0 mL', /\b2\.0\s*mL\b/i.test(txt || ''), true);
t('texto sugerida muestra rango 1.0–2.0', /1\.0/.test(txt || '') && /2\.0/.test(txt || ''), true);
t('50 kg prefill aplicar = 2', D.mlAplicarDePeso(50, '1ml/25-50kg'), 2);

t('Dilarvon 50 kg → 12.5 ml', D.mlDePeso(50, D.parseDosisMlPorKg('1 ml / 4 kg')), 12.5);

// ── Dilarvon recién creado: entra al selector aunque stock=0 ─────────
var live = [
  { id: 'old', nombre: 'Ivomec', activo: true, stock_actual: 80, dosis_sugerida: '0.2 ml / 10 kg' },
  { id: 'dil', nombre: 'Dilarvon', activo: true, stock_actual: 0, dosis_sugerida: null, dosis_estandar: null }
];
var cacheViejo = [live[0]];
var lista = D.medsParaTratamiento(D.medsListaTratamiento(cacheViejo, live));
t('lista usa inventario en vivo, no el cache', lista.map(function (m) { return m.nombre; }), ['Ivomec', 'Dilarvon']);
t('Dilarvon stock 0 igual entra', lista.some(function (m) { return m.nombre === 'Dilarvon'; }), true);
t('activo false no entra', D.medsParaTratamiento([{ nombre: 'X', activo: false }]).length, 0);

t('Dilarvon sin dosis_sugerida usa 1 ml / 4 kg', D.dosisRefDeMed({ nombre: 'Dilarvon' }), '1 ml / 4 kg');
t('Clozaval sin dosis usa 1 ml / 4 kg', D.dosisRefDeMed({ nombre: 'Clozaval oral' }), '1 ml / 4 kg');
t('Cydectin sin dosis usa 1 ml / 20 kg', D.dosisRefDeMed({ nombre: 'Cydectin' }), '1 ml / 20 kg');
t('Dicogan respeta el texto cargado', D.dosisRefDeMed({ nombre: 'Dicogan', dosis_sugerida: '1ml/25-50kg' }), '1ml/25-50kg');

if (fail) {
  console.log('\nFALLÓ ' + fail + ' aserción(es)');
  process.exit(1);
}
console.log('\nOK dosis-test (' + 'todas las aserciones' + ')');
