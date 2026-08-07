// ── app-update.js ─────────────────────────────────────────
// Actualización automática de LAAAMBAPP (Service Worker).
// - Revisa versión al cargar, al volver a la pestaña y cada 5 min
// - Banner "Nueva versión" → Actualizar ya limpia caché, recarga y NO reaparece al volver
// - window.LAAAMB_actualizarApp() para Ajustes → Datos → Actualizar ahora

(function () {
  var CHECK_MS = 5 * 60 * 1000;
  var bannerShown = false;
  var DISMISS_KEY = 'laaamb_upd_dismissed_at';
  var RELOAD_KEY = 'laaamb_upd_reloading';

  function now() { return Date.now(); }

  // Tras "Actualizar ya", no molestar de nuevo por unos minutos
  function wasJustUpdated() {
    try {
      var t = parseInt(sessionStorage.getItem(DISMISS_KEY) || '0', 10);
      if (t && now() - t < 10 * 60 * 1000) return true;
      // Flag de recarga en curso (esta misma navegación)
      if (sessionStorage.getItem(RELOAD_KEY) === '1') {
        sessionStorage.removeItem(RELOAD_KEY);
        sessionStorage.setItem(DISMISS_KEY, String(now()));
        return true;
      }
      // Si llegamos con ?_upd=… también contamos como actualización hecha
      var u = new URL(window.location.href);
      if (u.searchParams.has('_upd')) {
        sessionStorage.setItem(DISMISS_KEY, String(now()));
        // limpiar el query de la barra sin recargar
        u.searchParams.delete('_upd');
        try {
          window.history.replaceState({}, '', u.pathname + u.search + u.hash);
        } catch (e) {}
        return true;
      }
    } catch (e) {}
    return false;
  }

  function dismissBannerDom() {
    var b = document.getElementById('sw-update-banner');
    if (b) b.remove();
    bannerShown = false;
  }

  function showBanner(reason) {
    if (wasJustUpdated()) return;
    if (bannerShown) return;
    if (document.getElementById('sw-update-banner')) return;
    bannerShown = true;
    var banner = document.createElement('div');
    banner.id = 'sw-update-banner';
    banner.setAttribute('role', 'status');
    banner.style.cssText =
      'position:fixed;top:0;left:0;right:0;background:#00AFB6;color:#04181a;' +
      'padding:12px 16px;text-align:center;z-index:99999;font-size:13px;' +
      'font-family:Changa,system-ui,sans-serif;font-weight:600;' +
      'display:flex;justify-content:center;align-items:center;gap:12px;flex-wrap:wrap;' +
      'box-shadow:0 4px 20px rgba(0,0,0,.25)';
    banner.innerHTML =
      '🆕 Nueva versión de LAAAMB lista' +
      (reason ? ' <span style="font-weight:500;opacity:.85">(' + reason + ')</span>' : '') +
      '<button type="button" id="sw-upd-btn" style="background:#04181a;color:#fff;border:none;' +
      'padding:8px 16px;border-radius:8px;cursor:pointer;font-family:inherit;font-weight:700">Actualizar ya</button>' +
      '<button type="button" id="sw-upd-x" style="background:none;border:none;color:#04181a;' +
      'cursor:pointer;font-size:18px;opacity:.6" aria-label="Cerrar">✕</button>';
    document.body.prepend(banner);
    var btn = document.getElementById('sw-upd-btn');
    var x = document.getElementById('sw-upd-x');
    if (btn) {
      btn.onclick = function () {
        btn.disabled = true;
        btn.textContent = 'Actualizando…';
        hardReload();
      };
    }
    if (x) {
      x.onclick = function () {
        try { sessionStorage.setItem(DISMISS_KEY, String(now())); } catch (e) {}
        dismissBannerDom();
      };
    }
  }

  async function hardReload() {
    // Marcar ANTES de recargar para que al volver no se re-muestre el banner
    try {
      sessionStorage.setItem(RELOAD_KEY, '1');
      sessionStorage.setItem(DISMISS_KEY, String(now()));
    } catch (e) {}
    dismissBannerDom();

    try {
      if ('serviceWorker' in navigator) {
        var regs = await navigator.serviceWorker.getRegistrations();
        for (var i = 0; i < regs.length; i++) {
          try {
            if (regs[i].waiting) regs[i].waiting.postMessage({ type: 'SKIP_WAITING' });
            if (regs[i].active) regs[i].active.postMessage({ type: 'CLEAR_CACHES' });
            await regs[i].unregister();
          } catch (e) {}
        }
      }
      if ('caches' in window) {
        var names = await caches.keys();
        await Promise.all(names.map(function (n) { return caches.delete(n); }));
      }
    } catch (e) {
      console.warn('[app-update] hardReload', e);
    }

    var u = new URL(window.location.href);
    u.searchParams.set('_upd', String(Date.now()));
    window.location.replace(u.toString());
  }

  window.LAAAMB_actualizarApp = hardReload;
  window.actualizarApp = hardReload;

  async function checkForUpdates() {
    if (!('serviceWorker' in navigator)) return;
    if (wasJustUpdated()) return;
    try {
      var reg = await navigator.serviceWorker.getRegistration();
      if (!reg) return;
      await reg.update();
      if (reg.waiting) {
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        showBanner('descargada');
      }
    } catch (e) {
      console.warn('[app-update] check', e);
    }
  }

  function onControllerChange() {
    if (wasJustUpdated()) return;
    // Solo avisar; el usuario confirma con "Actualizar ya"
    showBanner('activada');
  }

  function registerSW() {
    if (!('serviceWorker' in navigator)) return;

    // Si esta carga viene de un "Actualizar ya", limpia flag y no muestres banner
    wasJustUpdated();

    navigator.serviceWorker.addEventListener('message', function (e) {
      if (e.data && e.data.type === 'SW_UPDATED') {
        if (wasJustUpdated()) return;
        showBanner('v' + (e.data.cache || ''));
      }
    });
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    window.addEventListener('load', function () {
      navigator.serviceWorker
        .register('sw.js', { updateViaCache: 'none' })
        .then(function (reg) {
          console.log('[PWA] SW registrado', reg.scope);
          if (reg.waiting && !wasJustUpdated()) {
            reg.waiting.postMessage({ type: 'SKIP_WAITING' });
            showBanner('pendiente');
          }
          reg.addEventListener('updatefound', function () {
            var nw = reg.installing;
            if (!nw) return;
            nw.addEventListener('statechange', function () {
              if (nw.state === 'installed' && navigator.serviceWorker.controller && !wasJustUpdated()) {
                showBanner('nueva');
              }
            });
          });
          // Pequeño delay: no competir con el reload recién hecho
          setTimeout(checkForUpdates, 1500);
        })
        .catch(function (err) {
          console.warn('[PWA] SW error', err);
        });
    });

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') checkForUpdates();
    });
    window.addEventListener('focus', function () {
      checkForUpdates();
    });
    setInterval(checkForUpdates, CHECK_MS);
  }

  registerSW();
})();
