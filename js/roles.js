// ── roles.js ──────────────────────────────────────────
// Control de acceso por rol a nivel de UI (NO sustituye RLS de Supabase).
// auth.js invoca window.Roles.apply(rol) al cargar el perfil.
//
// Roles:
//   gerente / administrador → todo + bandeja de aprobación
//   veterinario             → campo amplio (sigue con aprobación en writes)
//   auxiliar                → SOLO Hoy + Salud + Bajas (pesos, vacunas/trat., muertes)
//   aportante               → SOLO lectura de su hato de aparcería
//   socio                   → dashboards/reportes financieros (lectura)

(function () {
  'use strict';

  // Páginas permitidas (clave = archivo sin .html). '*' = todas.
  var PAGE_ACCESS = {
    gerente: '*',
    administrador: '*',
    veterinario: [
      'animales', 'reproduccion', 'salud', 'lotes', 'hoy', 'copiloto',
      'reportes', 'sala-cuna', 'medicamentos', 'bajas', 'auditoria'
    ],
    // Auxiliar de finca (sin estudios): menú mínimo. Escribe solo vía aprobación.
    // También puede resolver búsquedas post-auditoría en Hoy.
    auxiliar: ['hoy', 'salud', 'bajas'],
    // Aportante (aparcería): solo su hato, solo lectura.
    aportante: ['aportantes-animales', 'reporte-aportantes'],
    socio: ['index', 'okr', 'reportes', 'leche', 'queseria', 'lacteo']
  };

  // Páginas en solo-lectura (oculta botones de escritura).
  var READONLY_PAGES = {
    veterinario: ['reportes'],
    auxiliar: [], // escribe en hoy/salud/bajas (queda pendiente de aprobación)
    aportante: ['aportantes-animales', 'reporte-aportantes'], // 100% lectura
    socio: ['index', 'okr', 'reportes', 'leche', 'queseria', 'lacteo']
  };

  var LANDING = {
    veterinario: 'hoy.html',
    auxiliar: 'hoy.html',
    aportante: 'aportantes-animales.html',
    socio: 'index.html',
    gerente: 'index.html',
    administrador: 'index.html'
  };

  // Matriz legible para Ajustes (gerente).
  // canWrite: si las escrituras van a bandeja de aprobación (true) o son directas (gerente).
  var ROLE_MATRIX = [
    {
      rol: 'gerente',
      label: 'Gerente / Superadmin',
      ve: 'Todo el sistema',
      hace: 'Todo. Aprueba o rechaza lo que proponen otros.',
      aprueba: false
    },
    {
      rol: 'administrador',
      label: 'Administrador',
      ve: 'Todo el sistema',
      hace: 'Igual que gerente (operación y equipo).',
      aprueba: false
    },
    {
      rol: 'auxiliar',
      label: 'Auxiliar de finca',
      ve: 'Hoy · Salud · Bajas (menú mínimo)',
      hace: 'Registrar peso, tratamientos/vacunas y muertes. TODO queda pendiente de tu aprobación antes de afectar inventario o stock.',
      aprueba: true
    },
    {
      rol: 'veterinario',
      label: 'Veterinario',
      ve: 'Hato, salud, reproducción, sala cuna, bajas, auditoría…',
      hace: 'Operación de campo + auditoría mensual en corral (pesos/CC/FAMACHA/tratamientos al momento). Bajas de cabezas siguen con tu aprobación.',
      aprueba: true
    },
    {
      rol: 'aportante',
      label: 'Aportante (aparcería)',
      ve: 'Solo Aparcería → Animales y Reportes de SU aportante (ej. Julián Moreno)',
      hace: 'Solo lectura. No puede tratamientos, muertes ni pesos del hato LAAAMB.',
      aprueba: false
    },
    {
      rol: 'socio',
      label: 'Socio',
      ve: 'Dashboard, OKRs, reportes, lácteos',
      hace: 'Solo lectura de indicadores.',
      aprueba: false
    }
  ];

  // En HOY, secciones que el auxiliar NO debe ver (ruido).
  var HOY_HIDE_FOR_AUXILIAR = [
    '#hoy-teteros-sec',
    '#seg-trat-sec',
    '#sec-meds-terminados',
    '#sec-retiro-cumplido',
    '#bandeja-aprobaciones'
  ];

  var WRITE_VERBS = /(open(Modal|Add)|save|guardar|registr|crear|create|nuev|añad|agreg|eliminar|delete|borrar|descart|import|confirm|aplicar|enviar|subir|update|editar|edit|toggleactivo|deactiv|activar)/i;
  var EXPORT_VERBS = /(export|exportar|downloadtemplate|descargar)/i;

  function _base() {
    return location.pathname.includes('/laaambapp/') ? '/laaambapp/' : '/';
  }

  function currentPageKey() {
    var p = location.pathname;
    var file = p.split('/').pop();
    if (!file || file === '' || /\/laaambapp\/?$/.test(p) || p === '/') return 'index';
    return file.replace(/\.html$/i, '') || 'index';
  }

  function allowedPages(rol) {
    var a = PAGE_ACCESS[rol];
    // Rol desconocido → sin acceso amplio (seguridad). Solo landing si se define.
    if (a === undefined) return [];
    return a;
  }

  function isReadonlyHere(rol, page) {
    var list = READONLY_PAGES[rol];
    if (!list) return false;
    if (list.indexOf('*') >= 0) return true;
    return list.indexOf(page) >= 0;
  }

  function pageKeyFromHref(href) {
    if (!href) return '';
    if (href === 'index.html' || href === './' || href === '/') return 'index';
    return href.replace(/^.*\//, '').replace(/\.html$/i, '');
  }

  // 1. Ocultar links no autorizados + grupos vacíos del menú.
  function hideNavLinks(rol) {
    var allowed = allowedPages(rol);
    if (allowed === '*') return;

    var links = document.querySelectorAll(
      '.nav-link[href], a.nav-link[href], #nav-scroll a[href], aside a.nav-link[href]'
    );
    links.forEach(function (a) {
      var href = a.getAttribute('href') || '';
      if (!href || /^https?:|^#|^javascript:/i.test(href)) return;
      var key = pageKeyFromHref(href);
      if (!key) return;
      if (allowed.indexOf(key) < 0) {
        a.style.display = 'none';
        a.setAttribute('data-role-hidden', '1');
        a.setAttribute('aria-hidden', 'true');
      }
    });

    // Ocultar títulos de grupo si todos sus links están ocultos
    var nav = document.getElementById('nav-scroll') || document.querySelector('.nav-scroll');
    if (!nav) return;
    var children = Array.prototype.slice.call(nav.children);
    var i = 0;
    while (i < children.length) {
      var el = children[i];
      if (el.classList && el.classList.contains('nav-group')) {
        var j = i + 1;
        var anyVisible = false;
        while (j < children.length && !(children[j].classList && children[j].classList.contains('nav-group'))) {
          var link = children[j];
          if (link.tagName === 'A' && link.getAttribute('data-role-hidden') !== '1') {
            if (link.style.display !== 'none') anyVisible = true;
          }
          j++;
        }
        if (!anyVisible) {
          el.style.display = 'none';
          el.setAttribute('data-role-hidden', '1');
        }
        i = j;
      } else {
        i++;
      }
    }
  }

  function enforceAccess(rol) {
    var allowed = allowedPages(rol);
    if (allowed === '*') return false;
    var page = currentPageKey();
    if (!allowed.length || allowed.indexOf(page) < 0) {
      var dest = LANDING[rol] || 'hoy.html';
      var destKey = dest.replace(/\.html$/i, '');
      if (allowed.length && allowed.indexOf(destKey) < 0) dest = allowed[0] + '.html';
      location.replace(_base() + dest);
      return true;
    }
    return false;
  }

  function injectReadonlyCSS() {
    if (document.getElementById('roles-readonly-css')) return;
    var st = document.createElement('style');
    st.id = 'roles-readonly-css';
    st.textContent =
      'html[data-role-readonly="1"] [data-role="readonly"]{display:none !important}' +
      'html[data-role-readonly="1"] .role-readonly-banner{display:flex}' +
      'html[data-rol="auxiliar"] [data-hide-auxiliar]{display:none !important}' +
      'html[data-rol="aportante"] [data-hide-aportante]{display:none !important}';
    document.head.appendChild(st);
  }

  function tagActionControls(scopeWrite) {
    var scope = document.querySelector('.main, main, .content, body') || document.body;
    var candidates = scope.querySelectorAll('button, a.btn, label.btn, input[type="submit"]');
    candidates.forEach(function (el) {
      if (el.closest('.sidebar, aside, nav')) return;
      if (el.id === 'logout' || /logout|signout|cerrar.?sesi/i.test(el.getAttribute('onclick') || '')) return;
      // No tocar botones de la bandeja de aprobación del gerente
      if (el.closest('#bandeja-aprobaciones, #bandeja-lista')) return;
      var oc = (el.getAttribute('onclick') || '') + ' ' + (el.className || '') + ' ' + (el.textContent || '');
      var isExport = EXPORT_VERBS.test(oc);
      var isWrite = WRITE_VERBS.test(oc) || el.type === 'submit' ||
                    /\bbtn-primary\b/.test(el.className || '');
      if (isExport || (scopeWrite && isWrite)) {
        el.setAttribute('data-role', 'readonly');
      }
    });
  }

  function showReadonlyBanner(rol) {
    if (document.querySelector('.role-readonly-banner')) return;
    var host = document.querySelector('.main, main, .content');
    if (!host) return;
    var b = document.createElement('div');
    b.className = 'role-readonly-banner';
    b.style.cssText = 'display:flex;align-items:center;gap:8px;margin:0 0 14px;padding:9px 14px;' +
      'background:var(--teal-bg,rgba(0,175,182,.1));border:1px solid var(--border2,#3E4C61);' +
      'border-radius:var(--r,8px);font-size:12px;color:var(--text2,#94A3B8)';
    var msg = rol === 'aportante'
      ? '🔒 Solo lectura · ves únicamente el hato de aparcería vinculado a tu cuenta.'
      : '🔒 Vista de solo lectura — tu rol (' +
        (rol ? rol.charAt(0).toUpperCase() + rol.slice(1) : '') +
        ') no puede modificar datos en esta página.';
    b.innerHTML = msg;
    host.insertBefore(b, host.firstChild);
  }

  var _observer = null;
  function _observe(scopeWrite) {
    if (_observer || typeof MutationObserver === 'undefined') return;
    var target = document.querySelector('.main, main, .content') || document.body;
    if (!target) return;
    var pending = false;
    _observer = new MutationObserver(function () {
      if (pending) return;
      pending = true;
      requestAnimationFrame(function () { pending = false; tagActionControls(scopeWrite); });
    });
    _observer.observe(target, { childList: true, subtree: true });
  }

  function simplifyHoyForAuxiliar() {
    if (currentPageKey() !== 'hoy') return;
    HOY_HIDE_FOR_AUXILIAR.forEach(function (sel) {
      try {
        var el = document.querySelector(sel);
        if (el) { el.style.display = 'none'; el.setAttribute('data-hide-auxiliar', '1'); }
      } catch (e) {}
    });
    // Acciones rápidas: dejar solo pesaje, tratamiento y baja
    try {
      var grid = document.querySelector('.acc-grid');
      if (grid) {
        Array.prototype.slice.call(grid.children).forEach(function (btn) {
          var t = (btn.textContent || '').toLowerCase();
          var ok = /pesaje|tratamiento|baja|muerte/.test(t);
          if (!ok) btn.style.display = 'none';
        });
      }
    } catch (e) {}
    // Banner simple de ayuda
    if (!document.getElementById('aux-hoy-help')) {
      var main = document.querySelector('.main, main');
      var head = main && main.querySelector('.page-head');
      if (head) {
        var help = document.createElement('div');
        help.id = 'aux-hoy-help';
        help.style.cssText = 'margin:0 0 16px;padding:12px 14px;border-radius:10px;background:rgba(0,175,182,.10);border:1px solid rgba(0,175,182,.28);font-size:13px;color:var(--text);line-height:1.45';
        help.innerHTML = '<b>Tu trabajo de hoy</b><br>1) Registrar <b>pesos</b> · 2) Registrar <b>vacunas / tratamientos</b> · 3) Registrar <b>muertes</b>.<br><span style="color:var(--text2);font-size:12px">Todo queda en espera de aprobación del gerente. No cambia el inventario hasta que él confirme.</span>';
        head.insertAdjacentElement('afterend', help);
      }
    }
  }

  window.Roles = {
    PAGE_ACCESS: PAGE_ACCESS,
    ROLE_MATRIX: ROLE_MATRIX,
    LANDING: LANDING,
    currentPageKey: currentPageKey,
    can: function (rol, page) {
      var a = allowedPages(rol);
      return a === '*' || a.indexOf(page) >= 0;
    },
    requiresApproval: function (rol) {
      return rol === 'auxiliar' || rol === 'veterinario';
    },
    apply: function (rol) {
      if (!rol) return;
      window.AUTH_ROL = window.AUTH_ROL || rol;
      try { document.documentElement.setAttribute('data-rol', rol); } catch (e) {}

      if (rol === 'gerente' || rol === 'administrador') return;

      if (enforceAccess(rol)) return;

      hideNavLinks(rol);
      injectReadonlyCSS();

      var page = currentPageKey();
      var readonly = isReadonlyHere(rol, page);

      if (rol === 'aportante' || rol === 'socio' || readonly) {
        document.documentElement.setAttribute('data-role-readonly', '1');
        var fullRo = rol === 'aportante' || rol === 'socio' || readonly;
        tagActionControls(fullRo);
        _observe(fullRo);
        if (rol === 'aportante' || rol === 'socio') {
          if (document.body) showReadonlyBanner(rol);
          else document.addEventListener('DOMContentLoaded', function () { showReadonlyBanner(rol); });
        }
      } else if (rol === 'veterinario' || rol === 'auxiliar') {
        // Escritura permitida en UI, pero Approval marca pendiente.
        // Ocultar solo exportaciones.
        document.documentElement.setAttribute('data-role-readonly', '1');
        tagActionControls(false);
        _observe(false);
      }

      if (rol === 'auxiliar') {
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', simplifyHoyForAuxiliar);
        } else {
          simplifyHoyForAuxiliar();
        }
      }
    }
  };

  function _fallback() {
    if (window.__rolesApplied) return;
    var rol = window.AUTH_ROL || (window.AUTH_PERFIL && window.AUTH_PERFIL.rol);
    if (rol) { window.__rolesApplied = true; window.Roles.apply(rol); }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _fallback);
  }
})();
