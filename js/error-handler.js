// ── error-handler.js ──────────────────────────────────
// Captura global de errores para LAAAMBAPP.
// Se carga en TODOS los HTML, justo después de Sentry.init.
// Si Sentry no está disponible (CDN bloqueado / offline), degrada
// a console sin romper la app.

(function () {
  'use strict';

  function _sentryOk() {
    return typeof window.Sentry !== 'undefined' &&
           typeof window.Sentry.captureException === 'function';
  }

  // Contexto común que adjuntamos a cada reporte.
  function _contexto() {
    var ctx = {
      pagina: location.pathname.split('/').pop() || 'index.html',
      url: location.href
    };
    try {
      ctx.finca_id = (window.AppState && window.AppState._finca_id) ||
                     'a1b2c3d4-0000-0000-0000-000000000001';
    } catch (e) {}
    try {
      var perfil = window.AUTH_PERFIL ||
                   (window.Auth && window.Auth._perfil) || null;
      if (perfil) {
        ctx.user_email = perfil.email || null;
        ctx.user_rol = perfil.rol || window.AUTH_ROL || null;
      } else if (window.AUTH_ROL) {
        ctx.user_rol = window.AUTH_ROL;
      }
    } catch (e) {}
    return ctx;
  }

  // Helper público: logError(context, error)
  // - context: string que describe DÓNDE ocurrió (p.ej. 'saveParto')
  // - error: Error o string
  window.logError = function (context, error) {
    var err = (error instanceof Error) ? error : new Error(String(error));
    var ctx = _contexto();
    ctx.contexto = context || 'desconocido';
    try {
      if (_sentryOk()) {
        window.Sentry.withScope(function (scope) {
          scope.setTag('contexto', ctx.contexto);
          scope.setTag('pagina', ctx.pagina);
          if (ctx.user_rol) scope.setTag('rol', ctx.user_rol);
          scope.setContext('laaamb', ctx);
          window.Sentry.captureException(err);
        });
      }
    } catch (e) {
      /* nunca dejar que el reporte rompa la app */
    }
    if (typeof console !== 'undefined' && console.error) {
      console.error('[' + ctx.contexto + ']', err);
    }
  };

  // window.onerror global → Sentry.captureException
  window.addEventListener('error', function (event) {
    var err = event.error || new Error(event.message || 'Error desconocido');
    try {
      if (_sentryOk()) {
        window.Sentry.withScope(function (scope) {
          scope.setContext('laaamb', _contexto());
          window.Sentry.captureException(err);
        });
      }
    } catch (e) {}
  });

  // Promesas rechazadas no capturadas
  window.addEventListener('unhandledrejection', function (event) {
    var reason = event.reason;
    var err = (reason instanceof Error) ? reason
            : new Error('Promesa rechazada: ' + JSON.stringify(reason));
    try {
      if (_sentryOk()) {
        window.Sentry.withScope(function (scope) {
          scope.setTag('tipo', 'unhandledrejection');
          scope.setContext('laaamb', _contexto());
          window.Sentry.captureException(err);
        });
      }
    } catch (e) {}
  });
})();
