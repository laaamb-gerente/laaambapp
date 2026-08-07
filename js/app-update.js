// ── app-update.js ─────────────────────────────────────────
// Actualización automática de LAAAMBAPP (Service Worker).
// "Actualizar ya" limpia caché, recarga y NO re-muestra el banner al volver.

(function () {
  var CHECK_MS = 5 * 60 * 1000;
  var bannerShown = false;
  var reloading = false; // bloquea cualquier re-show mientras se actualiza
  var DISMISS_KEY = 'laaamb_upd_dismissed_at';
  var RELOAD_KEY = 'laaamb_upd_reloading';
  var QUIET_MS = 15 * 60 * 1000; // 15 min sin molestar tras actualizar

  function now() { return Date.now(); }

  function markUpdated() {
    try {
      sessionStorage.setItem(DISMISS_KEY, String(now()));
      sessionStorage.setItem(RELOAD_KEY, '1');
    } catch (e) {}
  }

  function clearReloadFlag() {
    try { sessionStorage.removeItem(RELOAD_KEY); } catch (e) {}
  }

  function inQuietPeriod() {
    try {
      var t = parseInt(sessionStorage.getItem(DISMISS_KEY) || '0', 10);
      if (t && now() - t < QUIET_MS) return true;
    } catch (e) {}
    return false;
  }

  // Al cargar: si venimos de un update, silenciar banner y limpiar URL
  function consumeUpdateFlags() {
    var quiet = false;
    try {
      if (sessionStorage.getItem(RELOAD_KEY) === '1') {
        sessionStorage.setItem(DISMISS_KEY, String(now()));
        clearReloadFlag();
        quiet = true;
      }
      if (inQuietPeriod()) quiet = true;
      var u = new URL(window.location.href);
      if (u.searchParams.has('_upd')) {
        sessionStorage.setItem(DISMISS_KEY, String(now()));
        quiet = true;
        u.searchParams.delete('_upd');
        try {
          window.history.replaceState({}, '', u.pathname + u.search + u.hash);
        } catch (e) {}
      }
    } catch (e) {}
    return quiet;
  }

  function dismissBannerDom() {
    var b = document.getElementById('sw-update-banner');
    if (b) b.remove();
    bannerShown = false;
  }

  function showBanner(reason) {
    // Nunca mostrar si estamos recargando o acabamos de actualizar
    if (reloading) return;
    if (inQuietPeriod()) return;
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
      btn.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        btn.disabled = true;
        btn.textContent = 'Actualizando…';
        // Quitar banner YA (antes de async)
        reloading = true;
        markUpdated();
        dismissBannerDom();
        hardReload();
      });
    }
    if (x) {
      x.addEventListener('click', function (ev) {
        ev.preventDefault();
        try { sessionStorage.setItem(DISMISS_KEY, String(now())); } catch (e) {}
        dismissBannerDom();
      });
    }
  }

  async function hardReload() {
    reloading = true;
    markUpdated();
    dismissBannerDom();

    try {
      if ('serviceWorker' in navigator) {
        // Evitar que controllerchange vuelva a pintar el banner
        navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
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
    // replace: no dejar banner en el historial
    window.location.replace(u.toString());
  }

  window.LAAAMB_actualizarApp = hardReload;
  window.actualizarApp = hardReload;

  async function checkForUpdates() {
    if (reloading || inQuietPeriod()) return;
    if (!('serviceWorker' in navigator)) return;
    try {
      var reg = await navigator.serviceWorker.getRegistration();
      if (!reg) return;
      await reg.update();
      if (reg.waiting && !reloading && !inQuietPeriod()) {
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        showBanner('descargada');
      }
    } catch (e) {
      console.warn('[app-update] check', e);
    }
  }

  function onControllerChange() {
    if (reloading || inQuietPeriod()) return;
    showBanner('activada');
  }

  function registerSW() {
    if (!('serviceWorker' in navigator)) return;

    var quiet = consumeUpdateFlags();
    if (quiet) {
      dismissBannerDom();
      reloading = false;
    }

    navigator.serviceWorker.addEventListener('message', function (e) {
      if (e.data && e.data.type === 'SW_UPDATED') {
        if (reloading || inQuietPeriod()) return;
        showBanner('v' + (e.data.cache || ''));
      }
    });
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    window.addEventListener('load', function () {
      // Si acabamos de actualizar, no abrir checks agresivos de inmediato
      var delay = quiet ? 8000 : 1200;

      navigator.serviceWorker
        .register('sw.js', { updateViaCache: 'none' })
        .then(function (reg) {
          console.log('[PWA] SW registrado', reg.scope);
          if (reg.waiting && !quiet && !inQuietPeriod()) {
            reg.waiting.postMessage({ type: 'SKIP_WAITING' });
            showBanner('pendiente');
          }
          reg.addEventListener('updatefound', function () {
            var nw = reg.installing;
            if (!nw) return;
            nw.addEventListener('statechange', function () {
              if (nw.state === 'installed' && navigator.serviceWorker.controller) {
                if (reloading || inQuietPeriod()) return;
                showBanner('nueva');
              }
            });
          });
          setTimeout(checkForUpdates, delay);
        })
        .catch(function (err) {
          console.warn('[PWA] SW error', err);
        });
    });

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') checkForUpdates();
    });
    window.addEventListener('focus', checkForUpdates);
    setInterval(checkForUpdates, CHECK_MS);
  }

  registerSW();
})();
