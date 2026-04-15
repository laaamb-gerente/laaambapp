// ═══ FarmSelector — selector multifinca global ═══════════════════════════════
const FarmSelector = (function(){
  const KEY_ACTIVE = 'laaamb-active-finca';

  function getActive(){
    return localStorage.getItem(KEY_ACTIVE) || 'default';
  }
  function setActive(id){
    localStorage.setItem(KEY_ACTIVE, id);
    window.dispatchEvent(new CustomEvent('finca-changed', { detail: { id } }));
  }

  // Obtener lista de fincas — SIEMPRE incluye d.finca como primera (id='default')
  function getFincas(){
    if(typeof AppData === 'undefined') return [];
    const d = AppData.get();
    // La finca principal siempre va primero
    const fincaPrincipal = Object.assign({ id: 'default' }, d.finca || { nombre: 'La Marinilla', area_ha: 50 });
    // Las fincas adicionales van después
    const extras = d.fincas || [];
    return [fincaPrincipal, ...extras];
  }

  // Renderizar dropdown
  function render(){
    const dropdown = document.getElementById('farm-dropdown');
    if(!dropdown) return;
    const fincas = getFincas();
    const active = getActive();
    const d = typeof AppData !== 'undefined' ? AppData.get() : {};
    const totalAnimales = d.animales ? d.animales.filter(function(a){ return a.activo; }).length : 0;

    let html = '';

    // Opción "Todas las fincas" — solo si hay más de una
    if(fincas.length > 1){
      html += '<div class="farm-option all-farms ' + (active === 'all' ? 'active' : '') + '" onclick="FarmSelector.select(\'all\')">'
        + '<span class="farm-opt-ico"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" width="14" height="14"><rect x="2" y="2" width="7" height="7" rx="1"/><rect x="11" y="2" width="7" height="7" rx="1"/><rect x="2" y="11" width="7" height="7" rx="1"/><rect x="11" y="11" width="7" height="7" rx="1"/></svg></span>'
        + '<div class="farm-opt-info"><div class="farm-opt-name">Todas las fincas</div>'
        + '<div class="farm-opt-sub">' + fincas.length + ' fincas · ' + totalAnimales + ' animales total</div></div>'
        + '<span class="farm-opt-check"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.5" width="13" height="13"><path d="M4 10l4 4 8-8"/></svg></span>'
        + '</div>';
    }

    // Una opción por cada finca
    fincas.forEach(function(f){
      const isActive = active === f.id || (active === 'default' && f.id === 'default');
      // Animales: para la finca principal todos los sin finca_id, para extras solo los de ese id
      const animalesF = d.animales ? d.animales.filter(function(a){
        if(!a.activo) return false;
        if(f.id === 'default') return !a.finca_id || a.finca_id === 'default';
        return a.finca_id === f.id;
      }).length : 0;

      html += '<div class="farm-option ' + (isActive ? 'active' : '') + '" onclick="FarmSelector.select(\'' + f.id + '\')">'
        + '<span class="farm-opt-ico"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" width="14" height="14"><path d="M2 17L8 5l4 7 2-3 4 8H2z"/></svg></span>'
        + '<div class="farm-opt-info">'
        + '<div class="farm-opt-name">' + (f.nombre || 'Sin nombre') + '</div>'
        + '<div class="farm-opt-sub">' + (f.area_ha ? f.area_ha + ' ha · ' : '') + animalesF + ' animales</div>'
        + '</div>'
        + '<span class="farm-opt-check"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.5" width="13" height="13"><path d="M4 10l4 4 8-8"/></svg></span>'
        + '</div>';
    });

    // Link a Ajustes
    html += '<div class="farm-option" onclick="window.location.href=\'ajustes.html#fincas\'" style="color:var(--text3);font-size:11px;padding:8px 12px;gap:6px">'
      + '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" width="12" height="12"><circle cx="10" cy="10" r="3"/><path d="M10 2v2M10 16v2M2 10h2M16 10h2"/></svg>'
      + ' Gestionar fincas en Ajustes'
      + '</div>';

    dropdown.innerHTML = html;
  }

  // Actualizar el botón del sidebar con la finca activa
  function updateBtn(){
    const fincas = getFincas();
    const active = getActive();
    const nameEl = document.getElementById('sb-farm-name');
    const subEl = document.getElementById('sb-farm-sub');
    if(!nameEl) return;
    const d = typeof AppData !== 'undefined' ? AppData.get() : {};
    const totalAnimales = d.animales ? d.animales.filter(function(a){ return a.activo; }).length : 0;

    if(active === 'all' && fincas.length > 1){
      nameEl.textContent = 'Todas las fincas';
      if(subEl) subEl.textContent = fincas.length + ' fincas · ' + totalAnimales + ' animales';
    } else {
      // Buscar la finca activa en la lista (incluye 'default' → d.finca)
      const finca = fincas.find(function(f){ return f.id === active; }) || fincas[0] || {};
      nameEl.textContent = finca.nombre || 'La Marinilla';
      if(subEl) subEl.textContent = (finca.area_ha ? finca.area_ha + ' ha · ' : '') + totalAnimales + ' animales';
    }
  }

  function toggle(){
    const dd = document.getElementById('farm-dropdown');
    if(!dd) return;
    if(dd.classList.contains('open')){ close(); } else { open(); }
  }
  function open(){
    render();
    document.getElementById('farm-btn')?.classList.add('open');
    document.getElementById('farm-dropdown')?.classList.add('open');
  }
  function close(){
    document.getElementById('farm-btn')?.classList.remove('open');
    document.getElementById('farm-dropdown')?.classList.remove('open');
  }
  function select(id){
    setActive(id);
    updateBtn();
    close();
    if(typeof loadDashboardFromAppData === 'function') loadDashboardFromAppData();
    if(typeof cargarDatos === 'function') cargarDatos();
  }

  // Cerrar al hacer clic fuera
  document.addEventListener('click', function(e){
    const selector = document.getElementById('farm-selector');
    if(selector && !selector.contains(e.target)) close();
  });

  function init(){
    updateBtn();
  }

  return { toggle, select, open, close, render, getActive, getFincas, init, updateBtn };
})();

document.addEventListener('DOMContentLoaded', function(){
  if(typeof AppData !== 'undefined') FarmSelector.init();
});

// ═══ SpeciesFilter — filtro de especie global ════════════════════════════════
const SpeciesFilter = (function(){
  const KEY = 'laaamb-active-especie';
  function get() { return localStorage.getItem(KEY) || 'todas'; }
  function set(especie) {
    localStorage.setItem(KEY, especie);
    window.dispatchEvent(new CustomEvent('especie-changed', { detail: { especie } }));
    render();
    updateBtn();
  }
  function getLabel() {
    const e = get();
    if(e === 'todas') return 'Todas las especies';
    if(typeof AppData !== 'undefined' && AppData.ESPECIES && AppData.ESPECIES[e]) return AppData.ESPECIES[e].label + 's';
    return e.charAt(0).toUpperCase() + e.slice(1) + 's';
  }
  function render() {
    const dd = document.getElementById('species-dropdown');
    if(!dd) return;
    const active = get();
    const especies = typeof AppData !== 'undefined' && AppData.ESPECIES
      ? Object.entries(AppData.ESPECIES)
      : [['ovino',{label:'Ovino'}],['bovino',{label:'Bovino'}]];
    const d = typeof AppData !== 'undefined' ? AppData.get() : {animales:[]};
    let html = '';
    html += '<div class="species-option ' + (active==='todas'?'active':'') + '" onclick="SpeciesFilter.set(\'todas\')">'
      + '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" width="13" height="13" style="flex-shrink:0"><rect x="2" y="2" width="7" height="7" rx="1"/><rect x="11" y="2" width="7" height="7" rx="1"/><rect x="2" y="11" width="7" height="7" rx="1"/><rect x="11" y="11" width="7" height="7" rx="1"/></svg>'
      + '<span style="flex:1">Todas las especies</span>'
      + '<span class="species-check">' + (active==='todas'?'<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.5" width="12" height="12"><path d="M4 10l4 4 8-8"/></svg>':'') + '</span>'
      + '</div>';
    especies.forEach(function(entry){
      const key = entry[0], esp = entry[1];
      const n = d.animales.filter(function(a){ return a.activo && (a.especie||'ovino')===key; }).length;
      const isActive = active === key;
      html += '<div class="species-option ' + (isActive?'active':'') + '" onclick="SpeciesFilter.set(\'' + key + '\')">'
        + '<span style="flex-shrink:0;color:var(--teal)">' + (esp.icon||'') + '</span>'
        + '<div style="flex:1"><div style="font-weight:600;font-size:12px">' + (esp.labelPlural||esp.label+'s') + '</div>'
        + '<div style="font-size:10px;color:var(--text3)">' + n + ' animales</div></div>'
        + '<span class="species-check">' + (isActive?'<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.5" width="12" height="12"><path d="M4 10l4 4 8-8"/></svg>':'') + '</span>'
        + '</div>';
    });
    dd.innerHTML = html;
  }
  function updateBtn() {
    const el = document.getElementById('species-btn-label');
    if(el) el.textContent = getLabel();
    const pill = document.getElementById('species-filter-pill');
    const active = get();
    if(pill){
      pill.style.borderColor = active !== 'todas' ? 'var(--teal)' : 'var(--border2)';
      pill.style.color = active !== 'todas' ? 'var(--teal)' : 'var(--text2)';
    }
  }
  function toggle() {
    const dd = document.getElementById('species-dropdown');
    if(!dd) return;
    if(dd.classList.contains('open')){ dd.classList.remove('open'); } else { render(); dd.classList.add('open'); }
  }
  document.addEventListener('click', function(e){
    const wrap = document.getElementById('species-filter-wrap');
    if(wrap && !wrap.contains(e.target)){
      const dd = document.getElementById('species-dropdown');
      if(dd) dd.classList.remove('open');
    }
  });
  function init() { updateBtn(); }
  return { get, set, getLabel, render, updateBtn, toggle, init };
})();

document.addEventListener('DOMContentLoaded', function(){
  if(typeof AppData !== 'undefined') SpeciesFilter.init();
});
