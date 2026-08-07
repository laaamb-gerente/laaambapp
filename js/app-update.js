// ── app-update.js ─────────────────────────────────────────
// Actualización automática de LAAAMBAPP (Service Worker).
// "Actualizar ya" oculta el banner YA y no lo re-muestra
// (localStorage + quiet period + flag en memoria).

(function () {
  var CHECK_MS = 5 * 60 * 1000;
  var QUIET_MS = 24 * 60 * 60 * 1000; // 24 h sin molestar tras actualizar/cerrar
  var DISMISS_KEY = 'laaamb_upd_quiet_until';
  var RELOAD_KEY = 'laaamb_upd_reloading';

  var bannerShown = false;
  var reloading = false;
  var quietUntilMem = 0; // respaldo si storage falla (p. ej. modo privado)

  function now() {
    return Date.now();
  }

  function storageGet(key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function storageSet(key, val) {
    try {
      localStorage.setItem(key, val);
    } catch (e) {}
    try {
      sessionStorage.setItem(key, val);
    } catch (e) {}
  }

  function storageRemove(key) {
    try {
      localStorage.removeItem(key);
    } catch (e) {}
    try {
      sessionStorage.removeItem(key);
    } catch (e) {}
  }

  function setQuiet(ms) {
    var until = now() + (ms || QUIET_MS);
    quietUntilMem = until;
    storageSet(DISMISS_KEY, String(until));
  }

  function inQuietPeriod() {
    if (reloading) return true;
    if (quietUntilMem && now() < quietUntilMem) return true;
    var raw = storageGet(DISMISS_KEY);
    if (!raw) {
      try {
        raw = sessionStorage.getItem(DISMISS_KEY);
      } catch (e) {}
    }
    var until = parseInt(raw || '0', 10);
    if (until && now() < until) {
      quietUntilMem = until;
      return true;
    }
    return false;
  }

  function markReloading() {
    reloading = true;
    setQuiet(QUIET_MS);
    storageSet(RELOAD_KEY, '1');
  }

  function consumeUpdateFlags() {
    var quiet = false;
    try {
      if (storageGet(RELOAD_KEY) === '1' || (function () {
        try { return sessionStorage.getItem(RELOAD_KEY) === '1'; } catch (e) { return false; }
      })()) {
        storageRemove(RELOAD_KEY);
        setQuiet(QUIET_MS);
        quiet = true;
      }
      if (inQuietPeriod()) quiet = true;

      var u = new URL(window.location.href);
      if (u.searchParams.has('_upd')) {
        setQuiet(QUIET_MS);
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
    var nodes = document.querySelectorAll('#sw-update-banner, .sw-update-banner');
    for (var i = 0; i < nodes.length; i++) {
      try {
        nodes[i].remove();
      } catch (e) {
        try {
          nodes[i].style.display = 'none';
        } catch (e2) {}
      }
    }
    bannerShown = false;
  }

  /** Ocultar de inmediato + no volver a pintar en esta sesión de update */
  function killBannerPermanentlyForNow() {
    reloading = true;
    setQuiet(QUIET_MS);
    dismissBannerDom();
    // Observador: si algo re-inserta el banner, lo borramos
    try {
      if (window.__laaambUpdObs) {
        window.__laaambUpdObs.disconnect();
      }
      var obs = new MutationObserver(function () {
        if (reloading || inQuietPeriod()) {
          var b = document.getElementById('sw-update-banner');
          if (b) b.remove();
        }
      });
      if (document.body) {
        obs.observe(document.body, { childList: true, subtree: false });
        window.__laaambUpdObs = obs;
        setTimeout(function () {
          try {
            obs.disconnect();
          } catch (e) {}
        }, 20000);
      }
    } catch (e) {}
  }

  function showBanner(reason) {
    if (reloading || inQuietPeriod()) return;
    if (bannerShown) return;
    if (document.getElementById('sw-update-banner')) return;

    bannerShown = true;
    var banner = document.createElement('div');
    banner.id = 'sw-update-banner';
    banner.className = 'sw-update-banner';
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
      'padding:8px 16px;border-radius:8px;cursor:pointer;font-family:inherit;font-weight:700;' +
      '-webkit-tap-highlight-color:transparent;touch-action:manipulation">Actualizar ya</button>' +
      '<button type="button" id="sw-upd-x" style="background:none;border:none;color:#04181a;' +
      'cursor:pointer;font-size:18px;opacity:.6;padding:8px;-webkit-tap-highlight-color:transparent;' +
      'touch-action:manipulation" aria-label="Cerrar">✕</button>';
    document.body.prepend(banner);

    var handled = false;
    function onUpdateClick(ev) {
      if (handled) return;
      handled = true;
      if (ev) {
        ev.preventDefault();
        ev.stopPropagation();
      }
      var b = document.getElementById('sw-upd-btn');
      if (b) {
        b.disabled = true;
        b.textContent = 'Actualizando…';
      }
      // Banner fuera YA — antes de cualquier async
      killBannerPermanentlyForNow();
      hardReload();
    }

    function onDismissClick(ev) {
      if (handled) return;
      handled = true;
      if (ev) {
        ev.preventDefault();
        ev.stopPropagation();
      }
      setQuiet(QUIET_MS);
      dismissBannerDom();
    }

    var btn = document.getElementById('sw-upd-btn');
    var x = document.getElementById('sw-upd-x');
    // pointerup cubre dedo y mouse en PWA sin doble-disparo
    if (btn) {
      btn.addEventListener('pointerup', onUpdateClick, { passive: false });
      btn.addEventListener('click', onUpdateClick, { passive: false });
    }
    if (x) {
      x.addEventListener('pointerup', onDismissClick, { passive: false });
      x.addEventListener('click', onDismissClick, { passive: false });
    }
  }

  async function hardReload() {
    markReloading();
    killBannerPermanentlyForNow();

    try {
      if ('serviceWorker' in navigator) {
        try {
          navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
        } catch (e) {}
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
        await Promise.all(
          names.map(function (n) {
            return caches.delete(n);
          })
        );
      }
    } catch (e) {
      console.warn('[app-update] hardReload', e);
    }

    var u = new URL(window.location.href);
    u.searchParams.set('_upd', String(Date.now()));
    // Cache-bust de la página
    u.searchParams.set('_v', '37');
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
      // Solo avisar si hay worker en waiting (update real pendiente)
      if (reg.waiting && !reloading && !inQuietPeriod()) {
        showBanner('lista');
      }
    } catch (e) {
      console.warn('[app-update] check', e);
    }
  }

  function onControllerChange() {
    // Ya no mostramos banner aquí: el claim del SW tras el primer load
    // re-disparaba el banner justo después de "Actualizar ya".
    // Las actualizaciones se detectan por updatefound / waiting.
    if (reloading || inQuietPeriod()) {
      dismissBannerDom();
    }
  }

  function registerSW() {
    if (!('serviceWorker' in navigator)) return;

    var quiet = consumeUpdateFlags();
    if (quiet) {
      reloading = false; // ya consumimos el reload; quiet sigue activo
      dismissBannerDom();
    }

    // SW_UPDATED del worker: solo si NO estamos en quiet y hay update real
    navigator.serviceWorker.addEventListener('message', function (e) {
      if (!e.data || e.data.type !== 'SW_UPDATED') return;
      if (reloading || inQuietPeriod()) {
        dismissBannerDom();
        return;
      }
      // Tras un deploy el SW nuevo avisa una vez; mostramos banner
      showBanner('v' + String(e.data.cache || '').replace(/^laaambapp-/, ''));
    });

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    window.addEventListener('load', function () {
      var delay = quiet ? 12000 : 1500;

      navigator.serviceWorker
        .register('sw.js?v=37', { updateViaCache: 'none' })
        .then(function (reg) {
          console.log('[PWA] SW registrado', reg.scope);
          // Si ya hay waiting al cargar y no estamos en quiet → banner
          if (reg.waiting && !quiet && !inQuietPeriod()) {
            showBanner('pendiente');
          }
          reg.addEventListener('updatefound', function () {
            var nw = reg.installing;
            if (!nw) return;
            nw.addEventListener('statechange', function () {
              // Solo si ya había un controller (es un update, no 1ª instalación)
              if (
                nw.state === 'installed' &&
                navigator.serviceWorker.controller &&
                !reloading &&
                !inQuietPeriod()
              ) {
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

  // Si el DOM ya tiene un banner huérfano al cargar este script, quitarlo en quiet
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      if (inQuietPeriod() || consumeUpdateFlags()) dismissBannerDom();
    });
  } else if (inQuietPeriod()) {
    dismissBannerDom();
  }

  registerSW();
})();
