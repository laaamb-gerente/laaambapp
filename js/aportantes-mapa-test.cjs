// ── aportantes-mapa-test.cjs ───────────────────────────────────────────
// Mapeo HATO (columna del Excel) → aportantes.nombre (tabla).
//
// El Excel dice SALATIEL / PAOLA / MAURICIO; la tabla dice
// 'JULIAN Y SALATIEL MORENO' / 'PAOLA MORENO' / 'MAURICIO FAJARDO'. Con
// igualdad exacta fallan las 302 filas; con LIKE resuelve hoy por casualidad
// y resuelve MAL el dia que exista una segunda Paola. Por eso hay un mapa
// explicito, y por eso estas pruebas cubren sobre todo los MODOS DE FALLO:
// un mapeo que adivina es peor que uno que se cae.
//
//   node js/aportantes-mapa-test.cjs
//
// Usa un Supabase falso: no toca la red ni la base.
var fs=require('fs'), vm=require('vm');
// Supabase falso: devuelve los aportantes que le pongamos y 0 existentes.
function hacerCtx(aportantes){
  var sb={from:function(t){
    var q={_t:t,select:function(){return q;},eq:function(){return q;},order:function(){return q;},
      then:function(res){return Promise.resolve({data:[],error:null}).then(res);}};
    return q;}};
  var ctx={window:{_sb:sb,XLSX:{utils:{sheet_to_json:function(){return [];}}},
    APARCERIA:{getAportantes:function(){return Promise.resolve(aportantes);},FINCA_ID:'f'},
    crypto:{randomUUID:function(){return 'uuid-fijo';}}},console:console,Date:Date,Promise:Promise};
  ctx.globalThis=ctx; vm.createContext(ctx);
  var R=require('path').join(__dirname,'aportantes-loader.js');
  vm.runInContext(fs.readFileSync(R,'utf8'),ctx,{filename:R});
  return ctx;
}
var REALES=[{id:'11111111-1111-1111-1111-111111111111',nombre:'JULIAN Y SALATIEL MORENO'},
            {id:'22222222-2222-2222-2222-222222222222',nombre:'PAOLA MORENO'},
            {id:'33333333-3333-3333-3333-333333333333',nombre:'MAURICIO FAJARDO'}];
function filas(hatos){return hatos.map(function(h,i){return {fila:i+5,hato:h,codigo:'C'+i,
  tipo:'madre_lote_inicial',origen:'real',sexo:'hembra',estado_salida:'activo',
  codigo_original:'C'+i,pesajes:[],madre_codigo:null};});}
var fail=0;
function t(l,g,e){var ok=String(g)===String(e);if(!ok)fail++;
  console.log('  '+(ok?'OK ':'XX ')+String(l).padEnd(52)+String(g)+(ok?'':'  ESPERADO '+e));}

(async function(){
  console.log('MAPA_HATO declarado:');
  var c0=hacerCtx(REALES); var L0=c0.window.APORTANTES_LOADER;
  Object.keys(L0.MAPA_HATO).forEach(function(k){console.log('  '+k.padEnd(10)+'→ '+L0.MAPA_HATO[k]);});

  console.log('\nCASO 1 · nombres reales de la tabla → debe resolver los 3 con uuid');
  var c1=hacerCtx(REALES);
  var pf=await c1.window.APORTANTES_LOADER.preflight(
    {filas:filas(['SALATIEL','PAOLA','MAURICIO']),excepciones:[],avisos:[],resumen:{}},{fase:1});
  pf.mapeoHato.forEach(function(m){console.log('    '+m.hato.padEnd(10)+'→ '+String(m.nombre).padEnd(26)+(m.id||m.error));});
  t('los 3 resuelven', pf.mapeoHato.filter(function(m){return m.id;}).length, 3);
  t('sin bloqueantes', pf.bloqueantes.length, 0);
  t('SALATIEL → uuid correcto',
    pf.mapeoHato.filter(function(m){return m.hato==='SALATIEL';})[0].id, REALES[0].id);

  console.log('\nCASO 2 · HATO desconocido → BLOQUEA, no adivina');
  var c2=hacerCtx(REALES);
  var pf2=await c2.window.APORTANTES_LOADER.preflight(
    {filas:filas(['SALATIEL','JUANITO']),excepciones:[],avisos:[],resumen:{}},{fase:1});
  t('bloquea', pf2.bloqueantes.filter(function(b){return b.tipo==='hato_no_resuelto';}).length, 1);
  console.log('    → '+pf2.bloqueantes.filter(function(b){return b.tipo==='hato_no_resuelto';})[0].detalle.slice(0,110));

  console.log('\nCASO 3 · el nombre del mapa NO existe en la tabla → BLOQUEA');
  var c3=hacerCtx([REALES[0]]);   // falta PAOLA MORENO
  var pf3=await c3.window.APORTANTES_LOADER.preflight(
    {filas:filas(['PAOLA']),excepciones:[],avisos:[],resumen:{}},{fase:1});
  t('bloquea', pf3.bloqueantes.filter(function(b){return b.tipo==='hato_no_resuelto';}).length, 1);
  console.log('    → '+pf3.mapeoHato[0].error);

  console.log('\nCASO 4 · nombre DUPLICADO en la tabla → BLOQUEA por ambiguo');
  var c4=hacerCtx(REALES.concat([{id:'44444444-4444-4444-4444-444444444444',nombre:'PAOLA MORENO'}]));
  var pf4=await c4.window.APORTANTES_LOADER.preflight(
    {filas:filas(['PAOLA']),excepciones:[],avisos:[],resumen:{}},{fase:1});
  t('bloquea', pf4.bloqueantes.filter(function(b){return b.tipo==='hato_no_resuelto';}).length, 1);
  console.log('    → '+pf4.mapeoHato[0].error);

  console.log('\nCASO 5 · el LIKE viejo habria resuelto mal; el mapa no');
  var c5=hacerCtx(REALES.concat([{id:'55555555-5555-5555-5555-555555555555',nombre:'PAOLA RESTREPO'}]));
  var pf5=await c5.window.APORTANTES_LOADER.preflight(
    {filas:filas(['PAOLA']),excepciones:[],avisos:[],resumen:{}},{fase:1});
  t('resuelve a PAOLA MORENO, no a RESTREPO', pf5.mapeoHato[0].id, REALES[1].id);
  t('sin bloqueantes', pf5.bloqueantes.length, 0);

  console.log(fail?'\n'+fail+' FALLOS':'\n✓ mapeo HATO → aportante: todo OK');
  process.exit(fail?1:0);
})();
