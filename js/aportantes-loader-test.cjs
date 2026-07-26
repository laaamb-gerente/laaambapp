// ── aportantes-loader-test.cjs ─────────────────────────────────────────
// Pruebas del PARSEO del cargador de aparcería. No tocan la base ni la red:
// ejercitan las funciones puras (regex de pesos, fechas d-m-aa, ESTADO →
// estado_salida, GRUPO, detección de anomalías) contra los valores REALES
// del export consolidado que Juan auditó a mano.
//
// Su valor es ser un test de contradicción: si el parseo deja de reproducir
// los conteos que él verificó, algo se rompió y hay que saberlo antes de
// cargar. Ver js/aparceria-test.cjs para las aserciones del motor de KPIs.
//
//   node js/aportantes-loader-test.cjs
//
// Extensión .cjs porque package.json declara "type":"module"; el módulo se
// evalúa con vm para probar el MISMO archivo que sirve la app.
'use strict';
var fs=require('fs'), vm=require('vm'), path=require('path');
var ctx={window:{_sb:{}},console:console}; ctx.globalThis=ctx; vm.createContext(ctx);
var RUTA=path.join(__dirname,'aportantes-loader.js');
vm.runInContext(fs.readFileSync(RUTA,'utf8'),ctx,{filename:RUTA});
var L=ctx.window.APORTANTES_LOADER;
if(!L) throw new Error('aportantes-loader.js no expuso window.APORTANTES_LOADER');
var fail=0;
function t(l,g,e){var ok=String(g)===String(e);if(!ok)fail++;console.log('  '+(ok?'OK ':'XX ')+String(l).padEnd(46)+String(g).padStart(4)+(ok?'':'  ESPERADO '+e));}

// Las 7 filas con peso embebido reportadas por Juan (todas de MAURICIO).
var CASOS=[
 ['197','42k 02-02-26',   42,'2026-02-02'],
 ['217','30k 31-12-25',   30,'2025-12-31'],
 ['218','38k 31-12-25',   38,'2025-12-31'],
 ['227','26k 02-03-26',   26,'2026-03-02'],
 ['235','35k',            35, null],        // SIN fecha en el origen
 ['237','35k 31-12-25',   35,'2025-12-31'],
 ['241','31k 31-12-25',   31,'2025-12-31'],
];
console.log('CHAPETA  ESTADO crudo      peso  fecha extraida   esperado');
CASOS.forEach(function(c){
  var r=L._pesoEmbebido(c[1]);
  var okP=r&&r.peso===c[2], okF=r&&r.fecha===c[3];
  if(!okP||!okF)fail++;
  console.log((okP&&okF?'  OK ':'  XX ')+c[0].padEnd(6)+' "'+c[1]+'"'.padEnd(16)
    +'  '+String(r&&r.peso).padStart(4)+'  '+String(r&&r.fecha).padEnd(12)
    +'  esperado '+c[2]+' / '+c[3]);
});

// Falsos positivos: texto que NO debe interpretarse como peso.
console.log('\nNO deben dar peso:');
['Preñada','Vacia','Murio 07-03-26','Madre','Vacia no tiene info','Desarrollo','',
 'Engorde/sacrificio','No existe'].forEach(function(s){
  var r=L._pesoEmbebido(s);
  if(r){fail++;console.log('  XX "'+s+'" → '+JSON.stringify(r));}
  else console.log('  OK "'+s+'" → sin peso');
});

// d-m-aa nunca m-d-aa
console.log('\nFechas d-m-aa (nunca m/d):');
[['02-02-26','2026-02-02'],['31-12-25','2025-12-31'],['09-03-26','2026-03-09'],
 ['14-01-26','2026-01-14'],['16-12-25','2025-12-16'],['17-03-26','2026-03-17']]
 .forEach(function(c){
  var got=L._normFecha.apply(null,c[0].split('-'));
  var ok=got===c[1]; if(!ok)fail++;
  console.log('  '+(ok?'OK ':'XX ')+c[0]+' → '+got+' (esperado '+c[1]+')');
});
console.log(fail?'\n'+fail+' FALLOS':'\nRegex de pesos y fechas: todo OK');





// Los 16 valores reales de ESTADO ACTUALIZADO con su distribucion.
console.log('ESTADO ACTUALIZADO → estado_salida / estado_reproductivo');
var CASOS=[
 ['',                   'activo','sin_dato'],   // 101 filas
 ['Preñada',            'activo','prenada'],    // 46
 ['Vacia',              'activo','vacia'],      // 32
 ['Murio',              'muerte', null],        // 30
 ['Madre',              'activo','madre'],      // 18  ← NO es prenada
 ['Desarrollo',         'activo', null],        // 18  ← va a grupo
 ['Engorde',            'activo', null],        // 10  ← va a grupo
 ['No tiene info',      'activo','sin_dato'],   // 7
 ['Vacia no tiene info','activo','sin_dato'],   // 6   ← NO colapsa con Vacia
 ['No tiene dato',      'activo','sin_dato'],   // 5
 ['No existe',          'no_localizado', null], // 3   ← NO es baja
 ['Murio preñada',      'muerte', null],        // 1
 ['Murio en parto',     'muerte', null],        // 1
 ['Moved off',          'no_localizado', null], // 1
 ['Sin dato',           'activo','sin_dato'],   // 1
 ['No esta',            'no_localizado', null], // 1
];
CASOS.forEach(function(c){
  var r=L._interpretarEstado(c[0],null);
  // el reproductivo se anula si no esta activo (lo hace el parser, aqui se emula)
  var rep = r.estado_salida==='activo' ? r.estado_reproductivo : null;
  t('"'+c[0]+'"', r.estado_salida+' / '+rep, c[1]+' / '+c[2]);
});

console.log('\nMatiz de la causa preservado en motivo_salida:');
['Murio preñada','Murio en parto'].forEach(function(s){
  var r=L._interpretarEstado(s,null);
  t('"'+s+'"', r.motivo_salida, s);
});

console.log('\nGRUPO: las 7 celdas con fecha de muerte (no son grupo)');
[['Muerta 07-03-26','2026-03-07'],['Muerta 16-12-25','2025-12-16'],
 ['Muerta 03-03-26','2026-03-03'],['Muerta 09-03-26','2026-03-09'],
 ['Muerta 14-01-26','2026-01-14'],['Muerta 17-03-26','2026-03-17']].forEach(function(c){
  var r=L._interpretarGrupo(c[0]);
  t('"'+c[0]+'"', r.estado_salida+' '+r.fecha_salida, 'muerte '+c[1]);
});
var mp=L._interpretarGrupo('Murio en parto');
t('"Murio en parto"', mp.estado_salida, 'muerte');

console.log('\nGRUPO: normalizacion y anotaciones');
t('"Madre"',   L._interpretarGrupo('Madre').grupo,  'Madres');
t('"Madres"',  L._interpretarGrupo('Madres').grupo, 'Madres');
t('"Engorde"', L._interpretarGrupo('Engorde').grupo,'Engorde');
t('"Engorde/sacrificio"', L._interpretarGrupo('Engorde/sacrificio').grupo,'Engorde/sacrificio');
['Madre del 639','Madre de 642 y 643','Madre del N137','Madre del N129','Madre del 628',
 'Madre del N117','Madre del N115','Madre del 572','Madre de 645'].forEach(function(s){
  var r=L._interpretarGrupo(s);
  t('"'+s+'"', (r.grupo||'')+' | notas:'+(r.notas?'si':'no'), 'Madres | notas:si');
});
console.log(fail?'\n'+fail+' FALLOS':'\nInterpretacion de ESTADO y GRUPO: todo OK');





function fila(hato,codigo,estAct,extra){
  return Object.assign({hato:hato,codigo:codigo,estado_actualizado:estAct||null,
    estado_origen:null,estado_salida:estAct&&/^Murio/.test(estAct)?'muerte':(estAct==='No esta'?'no_localizado':'activo'),
    tipo:'madre_lote_inicial',origen:'real',madre_codigo:null,fila:0,pesajes:[]},extra||{});
}

// Los 6 duplicados intra-hato reportados, con sus estados reales.
var filas=[
  fila('SALATIEL','330','Vacia'), fila('SALATIEL','330',''),
  fila('SALATIEL','432',''),      fila('SALATIEL','432',''),
  fila('SALATIEL','433',''),      fila('SALATIEL','433',''),
  fila('SALATIEL','N55',''),      fila('SALATIEL','N55',''),
  fila('PAOLA','560','Vacia no tiene info'), fila('PAOLA','560',''),
  fila('MAURICIO','558','Murio'), fila('MAURICIO','558','No esta'), fila('MAURICIO','558','Murio en parto'),
  // chapetas compartidas Salatiel ∩ Mauricio (ya NO bloquean)
  fila('SALATIEL','410'), fila('MAURICIO','410'),
  fila('SALATIEL','N137'), fila('MAURICIO','N137'),
  // madres huerfanas
  fila('MAURICIO','N109','',{tipo:'cria',madre_codigo:'143'}),
  fila('PAOLA','N100','',{tipo:'cria',madre_codigo:'845'}),
  fila('SALATIEL','330b','',{tipo:'cria',madre_codigo:'NA'}),
];
filas.forEach(function(f,i){f.fila=i+2;});

var a=L.detectarAnomalias(filas);
console.log('DUPLICADOS INTRA-HATO → se DESAMBIGUAN con sufijo, no se descartan');
t('casos detectados', a.duplicadosIntraHato.length, 6);
t('NINGUNA fila descartada', a.filasDescartadas.length, 0);
// 21 filas de entrada → 21 conservadas. Antes se perdian 7.
t('todas las filas se conservan', a.filasConservadas.length, filas.length);
var d558=a.duplicadosIntraHato.filter(function(d){return d.chapeta==='558';})[0];
t('558 detectado con 3 filas', d558&&d558.n, 3);
t('558 → codigos 558-1/558-2/558-3', d558&&d558.codigosAsignados.join('/'), '558-1/558-2/558-3');
// Los tres animales de 558 SIGUEN EXISTIENDO, con sus tres estados distintos.
var c558=a.filasConservadas.filter(function(f){return f.codigo_original==='558';});
t('los 3 animales de 558 se cargan', c558.length, 3);
t('estados de los 3 preservados',
  c558.map(function(f){return f.estado_salida;}).sort().join(','), 'muerte,muerte,no_localizado');
t('chapeta real en codigo_original', c558.every(function(f){return f.codigo_original==='558';}), true);
t('ninguno conserva la chapeta pelada', c558.some(function(f){return f.codigo==='558';}), false);
t('nota explica el sufijo', /compartida por 3 animales/.test(c558[0].notas||''), true);
a.duplicadosIntraHato.forEach(function(d){
  console.log('     '+d.hato.padEnd(10)+d.chapeta.padEnd(6)+'n='+d.n
    +'  → '+d.codigosAsignados.join(' ')
    +'  estados: '+d.estados.map(function(e){return '['+e.estado_actualizado+']';}).join(' '));
});
// Sufijo determinista: el mismo archivo produce los mismos codigos, que es lo
// que sostiene la idempotencia por (finca_id, aportante_id, codigo).
// Se reconstruye la entrada ORIGINAL: codigo = la chapeta, sin sufijo ni
// codigo_original, tal como sale del parseo. (detectarAnomalias muta sus
// filas, así que `filas` ya viene sufijado a estas alturas.)
var a2=L.detectarAnomalias(filas.map(function(f){
  var c=Object.assign({},f);
  c.codigo=f.codigo_original||f.codigo;   // leer ANTES de borrar
  delete c.codigo_original; delete c.duplicado;
  c.notas=null; return c;}));
t('sufijos deterministas al reprocesar',
  a2.duplicadosIntraHato.filter(function(d){return d.chapeta==='558';})[0].codigosAsignados.join('/'),
  '558-1/558-2/558-3');
// Chapetas NO duplicadas conservan su codigo intacto.
var c410=a.filasConservadas.filter(function(f){return f.codigo_original==='410';});
t('410 (no duplicada en su hato) sin sufijo',
  c410.every(function(f){return f.codigo==='410';}), true);

console.log('\nCHAPETAS EN MAS DE UN HATO (advertencia, NO bloquean)');
t('detectadas', a.duplicadosEntreHatos.length, 2);
a.duplicadosEntreHatos.forEach(function(d){
  console.log('     '+d.codigo.padEnd(6)+' en '+d.hatos.join(' ∩ '));
});
var conservadas410=a.filasConservadas.filter(function(f){return f.codigo==='410';});
t('410 se conserva en AMBOS hatos', conservadas410.length, 2);

console.log('\nMADRES QUE NO EXISTEN EN LA TABLA');
t('detectadas', a.madresHuerfanas.length, 3);
a.madresHuerfanas.forEach(function(m){
  console.log('     '+m.hato.padEnd(10)+m.madre_codigo+' → '+m.cria);
});
console.log('\nFASES');
t('fase 1 = fundadoras reales', L.filtrarPorFase(a.filasConservadas,1).length,
   a.filasConservadas.filter(function(f){return f.tipo==='madre_lote_inicial'&&f.origen==='real';}).length);
t('fase 2 = crias', L.filtrarPorFase(a.filasConservadas,2).length,
   a.filasConservadas.filter(function(f){return f.tipo==='cria';}).length);
console.log(fail?'\n'+fail+' FALLOS':'\nDeteccion de anomalias: todo OK');
// Sin process.exit aquí: el resumen y el código de salida van UNA sola vez al
// final del archivo. Un exit intermedio dejaría los bloques siguientes como
// código muerto que nunca corre y que parecería estar pasando.


// ── COLUMNA CODIGO EXPLICITA (escape hatch de desambiguacion) ──────────
// Caso real: la fase 1 carga 558-1 y 558-2. Despues aparece una TERCERA 558
// (cria de madre 437) en otra hoja. En esa hoja 558 sale una sola vez, asi
// que sin CODIGO explicito derivaria codigo='558' y el pre-flight bloquearia
// contra los dos animales ya cargados. Con CODIGO se resuelve.
console.log('\nCOLUMNA CODIGO EXPLICITA');
function filaExp(hato,chapeta,codigoExp,extra){
  return Object.assign({hato:hato,codigo:codigoExp||chapeta,codigo_original:chapeta,
    codigo_explicito:!!codigoExp,estado_actualizado:null,estado_origen:null,
    estado_salida:'activo',tipo:'cria',origen:'real',madre_codigo:null,fila:0,
    pesajes:[],notas:null},extra||{});
}
var fx=[
  filaExp('MAURICIO','558',null),          // sin CODIGO → se sufija
  filaExp('MAURICIO','558',null),          // sin CODIGO → se sufija
  filaExp('MAURICIO','558','558-9'),       // CON CODIGO → intacto
  filaExp('SALATIEL','N55','N55-1'),       // CON CODIGO, unico en su hato
];
fx.forEach(function(f,i){f.fila=i+2;});
var ax=L.detectarAnomalias(fx);
var g558=fx.filter(function(f){return f.codigo_original==='558';});
t('CODIGO explicito se respeta', g558.filter(function(f){return f.codigo_explicito;})[0].codigo, '558-9');
t('no colisiona con el explicito',
  g558.filter(function(f){return !f.codigo_explicito;}).map(function(f){return f.codigo;}).join('/'),
  '558-1/558-2');
t('todos los 558 conservan la chapeta fisica',
  g558.every(function(f){return f.codigo_original==='558';}), true);
t('las 4 filas se conservan', ax.filasConservadas.length, 4);
// Una chapeta unica en su hato con CODIGO explicito no se toca ni se marca dup.
var n55=fx.filter(function(f){return f.hato==='SALATIEL';})[0];
t('N55 con CODIGO y sin repetir queda intacto', n55.codigo, 'N55-1');
t('N55 no cuenta como duplicado',
  ax.duplicadosIntraHato.filter(function(d){return d.chapeta==='N55';}).length, 0);


// ── ESTADO LAAAMB (columna ya normalizada, esquema 'CARGA MADRES') ─────
console.log('\nESTADO LAAAMB → estado_salida / estado_reproductivo');
[['VACIA','activo','vacia'],
 ['GESTANTE','activo','prenada'],
 ['LACTANTE','activo','madre'],          // lactante = ya pario, NO prenada
 ['DESCONOCIDO','activo','sin_dato'],    // no saber != estar vacia
 ['MUERTA','muerte',null],
 ['NO_LOCALIZADA','no_localizado',null], // vivo pero sin ubicar, NO es baja
].forEach(function(c){
  var r=L._interpretarEstadoLaaamb(c[0]);
  t('"'+c[0]+'"', r? (r.estado_salida+' / '+r.estado_reproductivo) : 'null', c[1]+' / '+c[2]);
});
t('valor desconocido → null (no se inventa)', L._interpretarEstadoLaaamb('CUALQUIERA'), null);
t('vacio → null', L._interpretarEstadoLaaamb(''), null);

console.log(fail?'\n\u2717 '+fail+' FALLOS':'\n\u2713 parseo del cargador: todo OK');
process.exit(fail?1:0);
