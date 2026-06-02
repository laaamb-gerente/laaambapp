// ── roles.js ──────────────────────────────────────────
// Control de acceso por rol a nivel de UI (NO sustituye RLS de Supabase).
// Se carga en todas las páginas de la app (las que tienen auth.js),
// justo después de auth.js. auth.js invoca window.Roles.apply(rol)
// una vez cargado el perfil; además se auto-aplica como respaldo.
//
// Roles: gerente, administrador, veterinario, auxiliar, socio.

(function () {
  'use strict';

  // Páginas permitidas por rol (clave = nombre de archivo sin .html).
  // '*' = acceso total.
  var PAGE_ACCESS = {
    gerente: '*',
    administrador: '*',
    veterinario: ['animales', 'reproduccion', 'salud', 'lotes', 'hoy', 'reportes'],
    auxiliar: ['animales', 'hoy', 'salud', 'reproduccion'],
    // Socio: solo Dashboard, OKRs y Reportes ejecutivos (sin Finanzas).
    socio: ['index', 'okr', 'reportes']
  };

  // Páginas donde el rol es SOLO LECTURA (se ocultan acciones de escritura).
  var READONLY_PAGES = {
    veterinario: ['reportes'],
    auxiliar: ['reproduccion'],
    socio: ['index', 'okr', 'reportes']
  };

  // A dónde mandar al usuario si entra a una página no autorizada.
  var LANDING = {
    veterinario: 'hoy.html',
    auxiliar: 'hoy.html',
    socio: 'index.html',
    gerente: 'index.html',
    administrador: 'index.html'
  };

  // Verbos de acción (escritura) que delatan un botón mutador.
  var WRITE_VERBS = /(open(Modal|Add)|save|guardar|registr|crear|create|nuev|añad|agreg|eliminar|delete|borrar|descart|import|confirm|aplicar|enviar|subir|update|editar|edit|toggleactivo|deactiv|activar)/i;
  // Verbos de exportación (datos, financieros incluidos).
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
    return a || '*'; // rol desconocido → no restringir (defensivo: evita lockout)
  }

  function isReadonlyHere(rol, page) {
    var list = READONLY_PAGES[rol];
    return !!(list && list.indexOf(page) >= 0);
  }

  // 1. Ocultar links del sidebar a páginas no autorizadas.
  function hideNavLinks(rol) {
    var allowed = allowedPages(rol);
    if (allowed === '*') return;
    var links = document.querySelectorAll('.nav-link[href], a.nav-link[href], aside a[href]');
    links.forEach(function (a) {
      var href = a.getAttribute('href') || '';
      var key = href.replace(/^.*\//, '').replace(/\.html$/i, '');
      if (!key || /^https?:|^#|^javascript:/i.test(href)) return; // externos / anclas
      // index dashboard
      if (href === 'index.html' || href === './' || href === '/') key = 'index';
      if (allowed.indexOf(key) < 0) {
        a.style.display = 'none';
        a.setAttribute('data-role-hidden', '1');
      }
    });
  }

  // 2. Forzar acceso: si la página actual no está permitida → redirigir.
  function enforceAccess(rol) {
    var allowed = allowedPages(rol);
    if (allowed === '*') return false;
    var page = currentPageKey();
    if (allowed.indexOf(page) < 0) {
      var dest = LANDING[rol] || 'index.html';
      // evitar bucle si el landing tampoco está permitido
      var destKey = dest.replace(/\.html$/i, '');
      if (allowed.indexOf(destKey) < 0 && allowed.length) dest = allowed[0] + '.html';
      location.replace(_base() + dest);
      return true;
    }
    return false;
  }

  // 3. Inyectar CSS para ocultar elementos marcados como readonly.
  function injectReadonlyCSS() {
    if (document.getElementById('roles-readonly-css')) return;
    var st = document.createElement('style');
    st.id = 'roles-readonly-css';
    st.textContent =
      'html[data-role-readonly="1"] [data-role="readonly"]{display:none !important}' +
      'html[data-role-readonly="1"] .role-readonly-banner{display:flex}';
    document.head.appendChild(st);
  }

  // 4. Marcar controles de acción como readonly (para ocultarlos).
  //    scopeWrite = ocultar TODA acción de escritura (modo socio/solo-lectura).
  //    Si scopeWrite=false sólo se ocultan exportaciones (caso veterinario/auxiliar).
  function tagActionControls(scopeWrite) {
    var scope = document.querySelector('.main, main, .content, body') || document.body;
    var candidates = scope.querySelectorAll('button, a.btn, label.btn, input[type="submit"]');
    candidates.forEach(function (el) {
      if (el.closest('.sidebar, aside, nav')) return;          // no tocar navegación
      if (el.id === 'logout' || /logout|signout|cerrar.?sesi/i.test(el.getAttribute('onclick') || '')) return;
      var oc = (el.getAttribute('onclick') || '') + ' ' + (el.className || '') + ' ' + (el.textContent || '');
      var isExport = EXPORT_VERBS.test(oc);
      var isWrite = WRITE_VERBS.test(oc) || el.type === 'submit' ||
                    /\bbtn-primary\b/.test(el.className || '');
      if (isExport || (scopeWrite && isWrite)) {
        el.setAttribute('data-role', 'readonly');
      }
    });
    // Nota: NO se desactivan inputs sueltos (filtros de fecha/búsqueda) para no
    // romper la navegación de solo lectura. Sin botón de acción no hay escritura.
  }

  // 5. Banner discreto de "modo solo lectura".
  function showReadonlyBanner(rol) {
    if (document.querySelector('.role-readonly-banner')) return;
    var host = document.querySelector('.main, main, .content');
    if (!host) return;
    var b = document.createElement('div');
    b.className = 'role-readonly-banner';
    b.style.cssText = 'display:flex;align-items:center;gap:8px;margin:0 0 14px;padding:9px 14px;' +
      'background:var(--teal-bg,rgba(0,175,182,.1));border:1px solid var(--border2,#3E4C61);' +
      'border-radius:var(--r,8px);font-size:12px;color:var(--text2,#94A3B8)';
    b.innerHTML = '🔒 Vista de solo lectura — tu rol (' +
      (rol ? rol.charAt(0).toUpperCase() + rol.slice(1) : '') +
      ') no puede modificar datos en esta página.';
    host.insertBefore(b, host.firstChild);
  }

  // 6. Re-tag controles tras renders dinámicos (tablas que llegan de Supabase).
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

  // API pública
  window.Roles = {
    PAGE_ACCESS: PAGE_ACCESS,
    currentPageKey: currentPageKey,
    can: function (rol, page) {
      var a = allowedPages(rol);
      return a === '*' || a.indexOf(page) >= 0;
    },
    apply: function (rol) {
      if (!rol) return;
      window.AUTH_ROL = window.AUTH_ROL || rol;
      // gerente/administrador: acceso total, nada que restringir.
      if (rol === 'gerente' || rol === 'administrador') return;

      // Redirigir ANTES de pintar si la página no está permitida.
      if (enforceAccess(rol)) return;

      hideNavLinks(rol);

      var page = currentPageKey();
      var readonly = isReadonlyHere(rol, page);
      injectReadonlyCSS();

      if (readonly) {
        document.documentElement.setAttribute('data-role-readonly', '1');
        // socio = solo lectura total; otros roles = solo ocultar exportaciones.
        var fullReadonly = rol === 'socio';
        tagActionControls(fullReadonly);
        _observe(fullReadonly);
        if (rol === 'socio') {
          if (document.body) showReadonlyBanner(rol);
          else document.addEventListener('DOMContentLoaded', function () { showReadonlyBanner(rol); });
        }
      } else {
        // Veterinario/auxiliar en páginas de escritura: ocultar SOLO exportaciones financieras.
        if (rol === 'veterinario' || rol === 'auxiliar') {
          document.documentElement.setAttribute('data-role-readonly', '1');
          tagActionControls(false);
          _observe(false);
        }
      }
    }
  };

  // Respaldo: si auth.js ya dejó el rol en window pero no llamó apply
  // (p.ej. orden de carga), aplicarlo al estar listo el DOM.
  function _fallback() {
    if (window.__rolesApplied) return;
    var rol = window.AUTH_ROL || (window.AUTH_PERFIL && window.AUTH_PERFIL.rol);
    if (rol) { window.__rolesApplied = true; window.Roles.apply(rol); }
  }
  // Re-tag tras render dinámico de tablas/botones.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _fallback);
  }
})();
