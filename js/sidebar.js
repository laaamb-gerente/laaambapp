// ── sidebar.js ─────────────────────────────────────────
// Fuente única de verdad del menú lateral de LAAAMBAPP.
// Inyecta el contenido de <nav class="nav-scroll" id="nav-scroll"> desde datos.
// NO maneja logo, farm-selector, info de usuario ni hamburguesa: esas partes
// siguen hardcodeadas en cada página. Solo se dinamiza el <nav>.
//
// Las clases (nav-group, nav-link, nav-ico, nav-badge), los SVG y los badges
// son EXACTAMENTE los que existían antes (copiados del nav de index.html).

// Estructura de 8 grupos (datos puros).
window.SIDEBAR = [
  { grupo: 'Inicio', items: [
    { t: 'Dashboard',              href: 'index.html',        ico: 'dashboard' },
    { t: 'Hoy',                    href: 'hoy.html',          ico: 'hoy',        badge: 'alertas' },
    { t: 'Copiloto',               href: 'copiloto.html',     ico: 'copiloto' },
  ]},
  { grupo: 'Hato', items: [
    { t: 'Animales',               href: 'animales.html',     ico: 'animales',   badge: 'count' },
    { t: 'Auditoría de hato',      href: 'auditoria.html',    ico: 'auditoria' },
    { t: 'Reproducción',           href: 'reproduccion.html', ico: 'reproduccion' },
    { t: 'Sala Cuna',              href: 'sala-cuna.html',    ico: 'salacuna' },
    { t: 'Salud & Tratamientos',   href: 'salud.html',        ico: 'salud' },
    { t: 'Medicamentos',           href: 'medicamentos.html', ico: 'medicamentos' },
  ]},
  { grupo: 'Finca', items: [
    { t: 'Lotes & Potreros',       href: 'lotes.html',        ico: 'lotes' },
    { t: 'Nutrición',              href: 'nutricion.html',    ico: 'nutricion' },
  ]},
  { grupo: 'Producción', items: [
    { t: 'Leche',                  href: 'leche.html',        ico: 'leche' },
    { t: 'Panel Lácteo',           href: 'lacteo.html',       ico: 'lacteo' },
    { t: 'Quesería',               href: 'queseria.html',     ico: 'queseria' },
  ]},
  { grupo: 'Comercial', items: [
    { t: 'Beneficio & QR',         href: 'beneficio.html',    ico: 'beneficio' },
    { t: 'Ventas & Salidas',       href: 'bajas.html',        ico: 'bajas' },
    { t: 'Clientes B2B',           href: 'b2b.html',          ico: 'b2b' },
  ]},
  // APARCERÍA: grupo propio, NO colgado de Hato. Estos animales pertenecen a
  // terceros y viven en aportantes_animales, fuera del inventario de la finca;
  // la separación visual en el menú es intencional.
  { grupo: 'Aparcería', items: [
    { t: 'Animales',               href: 'aportantes-animales.html', ico: 'aparceria' },
    { t: 'Reportes',               href: 'reporte-aportantes.html',  ico: 'aparceriarep' },
  ]},
  { grupo: 'Finanzas', items: [
    { t: 'Costos & Finanzas',      href: 'finanzas.html',     ico: 'finanzas' },
    { t: 'Nómina & Asistencia',    href: 'nomina.html',       ico: 'nomina' },
  ]},
  { grupo: 'Análisis & Cumplimiento', items: [
    { t: 'OKRs & Análisis',        href: 'okr.html',          ico: 'okr' },
    { t: 'Reportes',               href: 'reportes.html',     ico: 'reportes' },
    { t: 'ICA & Movilización',     href: 'ica.html',          ico: 'ica' },
    { t: 'Historial & Auditoría',  href: 'historial.html',    ico: 'historial' },
  ]},
  { grupo: 'Sistema', items: [
    { t: 'Ajustes',                href: 'ajustes.html',      ico: 'ajustes' },
  ]},
];

// SVG exactos (copiados del nav de index.html: mismo viewBox, clase nav-ico,
// stroke-width). Ninguno quedó vacío — todos los ítems tenían icono.
window.SIDEBAR_ICONS = {
  dashboard:    '<svg class="nav-ico" viewBox="0 0 20 20" fill="currentColor"><rect x="2" y="2" width="7" height="7" rx="1.5"/><rect x="11" y="2" width="7" height="7" rx="1.5"/><rect x="2" y="11" width="7" height="7" rx="1.5"/><rect x="11" y="11" width="7" height="7" rx="1.5"/></svg>',
  hoy:          '<svg class="nav-ico" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="14" height="14" rx="2"/><line x1="3" y1="8" x2="17" y2="8"/><line x1="7" y1="2" x2="7" y2="5"/><line x1="13" y1="2" x2="13" y2="5"/></svg>',
  copiloto:     '<svg class="nav-ico" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="3" width="12" height="10" rx="2"/><path d="M10 13v4M7 17h6"/><path d="M7 7h6M8 10h4"/></svg>',
  animales:     '<svg class="nav-ico" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="10" cy="7" r="3"/><path d="M4 18c0-3.3 2.7-6 6-6s6 2.7 6 6"/></svg>',
  reproduccion: '<svg class="nav-ico" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="10" cy="10" r="7"/><path d="M10 6v4l3 3"/></svg>',
  salacuna:     '<svg class="nav-ico" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M7 7h6v9a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V7z"/><path d="M8 7l.6-2.5h2.8L12 7"/><line x1="7" y1="10.5" x2="13" y2="10.5"/></svg>',
  salud:        '<svg class="nav-ico" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M10 3v14M3 10h14"/></svg>',
  auditoria:    '<svg class="nav-ico" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 4h12v14H4z"/><path d="M7 8h6M7 11h6M7 14h4"/><path d="M14 2v4"/></svg>',
  medicamentos: '<svg class="nav-ico" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="3" width="12" height="14" rx="2"/><path d="M7 8h6M7 11h4"/></svg>',
  lotes:        '<svg class="nav-ico" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 7l7-4 7 4v9l-7 4-7-4z"/></svg>',
  nutricion:    '<svg class="nav-ico" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M10 17c4-1 7-4 7-9V4l-4 1c-3 .8-5 3-5 6v6z"/><path d="M10 17c-3-1-5-3-5-6"/></svg>',
  leche:        '<svg class="nav-ico" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 2h8M7 2l-.5 4.5a4 4 0 0 0-.5 2V16a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V8.5a4 4 0 0 0-.5-2L13 2"/><line x1="6.2" y1="10" x2="13.8" y2="10"/></svg>',
  lacteo:       '<svg class="nav-ico" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 5h14v3H3zM4 8l1 9a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-9"/><path d="M8 12h4"/></svg>',
  queseria:     '<svg class="nav-ico" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 11l7-4 7 4v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><circle cx="8" cy="13.5" r="1"/><circle cx="12.5" cy="13" r="1"/></svg>',
  beneficio:    '<svg class="nav-ico" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="6" height="6" rx="1"/><rect x="11" y="3" width="6" height="6" rx="1"/><rect x="3" y="11" width="6" height="6" rx="1"/><path d="M11 11h2v2h-2zM15 11h2v2h-2zM11 15h2v2h-2zM15 15h2v2h-2z"/></svg>',
  bajas:        '<svg class="nav-ico" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="4 6 6 6 16 6"/><path d="M15 6v11a1 1 0 01-1 1H6a1 1 0 01-1-1V6"/></svg>',
  b2b:          '<svg class="nav-ico" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="9" height="14" rx="1"/><path d="M12 8h5v9h-5"/><path d="M6 6h3M6 9h3M6 12h3"/></svg>',
  aparceria:    '<svg class="nav-ico" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M7 5.5a2.5 2.5 0 1 1 5 0"/><circle cx="6.5" cy="8" r="2.2"/><circle cx="13.5" cy="8" r="2.2"/><path d="M2.5 17c0-2.2 1.8-4 4-4s4 1.8 4 4"/><path d="M11 17c0-2.2 1.5-4 3.5-4s3 1.8 3 4"/></svg>',
  aparceriarep: '<svg class="nav-ico" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 3h7l4 4v10a1 1 0 01-1 1H5a1 1 0 01-1-1V4a1 1 0 011-1z"/><path d="M12 3v4h4"/><path d="M7 15V11M10 15V9.5M13 15v-2.5"/></svg>',
  finanzas:     '<svg class="nav-ico" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><line x1="10" y1="2" x2="10" y2="18"/><path d="M14 5H8a3 3 0 000 6h4a3 3 0 010 6H6"/></svg>',
  nomina:       '<svg class="nav-ico" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="7" cy="6" r="3"/><path d="M2 17c0-2.8 2.2-5 5-5s5 2.2 5 5"/><path d="M14 8h4M14 11h4M14 14h2"/></svg>',
  okr:          '<svg class="nav-ico" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="3 14 7 9 11 12 17 5"/><polyline points="14 5 17 5 17 8"/></svg>',
  reportes:     '<svg class="nav-ico" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 3h7l4 4v10a1 1 0 01-1 1H5a1 1 0 01-1-1V4a1 1 0 011-1z"/><path d="M12 3v4h4M7 11h6M7 14h6"/></svg>',
  ica:          '<svg class="nav-ico" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 7l7-3 7 3v6l-7 3-7-3z"/><path d="M3 7l7 3 7-3M10 10v6"/></svg>',
  historial:    '<svg class="nav-ico" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 3h7l4 4v10a1 1 0 01-1 1H5a1 1 0 01-1-1V4a1 1 0 011-1z"/><path d="M7 11h6M7 14h4"/></svg>',
  ajustes:      '<svg class="nav-ico" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="10" cy="10" r="3"/><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.9 4.9l1.4 1.4M13.7 13.7l1.4 1.4M4.9 15.1l1.4-1.4M13.7 6.3l1.4-1.4"/></svg>',
};

// CSS global: el menú lateral SIEMPRE se puede hacer scroll (móvil y desktop).
// Algunas páginas sobreescribían .nav-scroll con overflow:visible y se trababa.
(function injectSidebarScrollFix(){
  if (document.getElementById('laaamb-sidebar-scroll-fix')) return;
  var s = document.createElement('style');
  s.id = 'laaamb-sidebar-scroll-fix';
  s.textContent = [
    '.sidebar, #sidebar {',
    '  display: flex !important;',
    '  flex-direction: column !important;',
    '  height: 100% !important;',
    '  max-height: 100vh !important;',
    '  max-height: 100dvh !important;',
    '  overflow: hidden !important;',
    '}',
    '.sidebar .sb-head, #sidebar .sb-head,',
    '.sidebar .sb-foot, #sidebar .sb-foot { flex-shrink: 0 !important; }',
    '.sidebar .nav-scroll, #sidebar .nav-scroll {',
    '  flex: 1 1 auto !important;',
    '  min-height: 0 !important;',
    '  overflow-y: auto !important;',
    '  overflow-x: hidden !important;',
    '  -webkit-overflow-scrolling: touch !important;',
    '  overscroll-behavior: contain;',
    '  touch-action: pan-y;',
    '}',
    '@media (max-width: 768px) {',
    '  .sidebar, #sidebar {',
    '    height: 100vh !important;',
    '    height: 100dvh !important;',
    '    max-height: 100vh !important;',
    '    max-height: 100dvh !important;',
    '    overflow: hidden !important;',
    '  }',
    '  .sidebar .nav-scroll, #sidebar .nav-scroll {',
    '    overflow-y: auto !important;',
    '    flex-shrink: 1 !important;',
    '  }',
    '}'
  ].join('\n');
  (document.head || document.documentElement).appendChild(s);
})();

function renderSidebar(){
  var el = document.getElementById('nav-scroll');
  if(!el) return;
  var here = (location.pathname.split('/').pop() || 'index.html');
  if(!here) here = 'index.html';
  var ICON = window.SIDEBAR_ICONS || {};
  var html = '';
  (window.SIDEBAR || []).forEach(function(g){
    html += '<div class="nav-group">' + g.grupo + '</div>';
    (g.items || []).forEach(function(it){
      var active = (it.href === here) ? ' active' : '';
      var badge = '';
      if(it.badge === 'count') {
        badge = '<span class="nav-badge" id="sb-count">—</span>';
      } else if(it.badge === 'alertas') {
        badge = '<span id="alertas-badge" style="display:none;background:#F18F22;color:white;border-radius:10px;padding:1px 6px;font-size:11px;margin-left:4px;font-weight:700"></span>';
      }
      html += '<a class="nav-link' + active + '" href="' + it.href + '">' + (ICON[it.ico] || '') + it.t + badge + '</a>';
    });
  });
  el.innerHTML = html;
  // Reaplicar restricciones por rol si ya hay rol cargado (auth.js también
  // llama a Roles.apply tras cargar el perfil, normalmente después de esto).
  if(window.Roles && typeof window.Roles.apply === 'function' && window.AUTH_ROL){
    try { window.Roles.apply(window.AUTH_ROL); } catch(e){}
  }
}
window.renderSidebar = renderSidebar;

// El <nav id="nav-scroll"> está en el <body>; este script suele cargar en el
// <head>, así que se difiere a DOMContentLoaded si el DOM aún no está listo.
if(document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', renderSidebar);
} else {
  renderSidebar();
}
