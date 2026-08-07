// ── periodo-kpi.js ────────────────────────────────────
// Rangos de fechas reutilizables para dashboards de cada menú.
// Uso:
//   PeriodoKPI.init({ rootId:'salud-periodo', storageKey:'salud', onChange:fn })
//   PeriodoKPI.getRange() → { key, desde, hasta, label }
//   PeriodoKPI.inRange(fechaISO)
window.PeriodoKPI = (function () {
  'use strict';

  var _state = {
    key: 'mes',
    desde: null,
    hasta: null,
    onChange: null,
    rootId: null,
    storageKey: 'default'
  };

  function pad(n) { return n < 10 ? '0' + n : String(n); }
  function iso(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function fmt(d) {
    return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  function startOfDay(d) {
    var x = new Date(d); x.setHours(0, 0, 0, 0); return x;
  }
  function endOfDay(d) {
    var x = new Date(d); x.setHours(23, 59, 59, 999); return x;
  }

  function compute(key, customDesde, customHasta) {
    var hoy = startOfDay(new Date());
    var desde, hasta = endOfDay(hoy);
    if (key === '7d') {
      desde = startOfDay(new Date(hoy)); desde.setDate(desde.getDate() - 6);
    } else if (key === '30d') {
      desde = startOfDay(new Date(hoy)); desde.setDate(desde.getDate() - 29);
    } else if (key === 'anio') {
      desde = startOfDay(new Date(hoy.getFullYear(), 0, 1));
    } else if (key === 'anio_ant') {
      desde = startOfDay(new Date(hoy.getFullYear() - 1, 0, 1));
      hasta = endOfDay(new Date(hoy.getFullYear() - 1, 11, 31));
    } else if (key === 'custom' && customDesde && customHasta) {
      desde = startOfDay(new Date(customDesde + 'T00:00:00'));
      hasta = endOfDay(new Date(customHasta + 'T00:00:00'));
    } else {
      // mes actual
      key = 'mes';
      desde = startOfDay(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
    }
    var labels = {
      mes: 'Este mes',
      '7d': 'Últimos 7 días',
      '30d': 'Últimos 30 días',
      anio: 'Este año',
      anio_ant: 'Año anterior',
      custom: 'Personalizado'
    };
    return {
      key: key,
      desde: desde,
      hasta: hasta,
      desdeISO: iso(desde),
      hastaISO: iso(hasta),
      label: (labels[key] || key) + ' · ' + fmt(desde) + ' → ' + fmt(hasta)
    };
  }

  function paint() {
    var root = _state.rootId && document.getElementById(_state.rootId);
    if (!root) return;
    var r = getRange();
    var lab = root.querySelector('[data-periodo-label]');
    if (lab) lab.textContent = r.label;
    root.querySelectorAll('[data-periodo]').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-periodo') === r.key);
    });
    var custom = root.querySelector('[data-periodo-custom]');
    if (custom) custom.style.display = r.key === 'custom' ? 'flex' : 'none';
  }

  function getRange() {
    return compute(_state.key, _state.desde, _state.hasta);
  }

  function setKey(key) {
    _state.key = key || 'mes';
    try {
      localStorage.setItem('laaamb_periodo_' + _state.storageKey, _state.key);
    } catch (e) {}
    paint();
    if (typeof _state.onChange === 'function') _state.onChange(getRange());
  }

  function setCustom(desdeISO, hastaISO) {
    _state.key = 'custom';
    _state.desde = desdeISO;
    _state.hasta = hastaISO;
    try {
      localStorage.setItem('laaamb_periodo_' + _state.storageKey, 'custom');
      localStorage.setItem('laaamb_periodo_' + _state.storageKey + '_d', desdeISO || '');
      localStorage.setItem('laaamb_periodo_' + _state.storageKey + '_h', hastaISO || '');
    } catch (e) {}
    paint();
    if (typeof _state.onChange === 'function') _state.onChange(getRange());
  }

  function inRange(fecha) {
    if (!fecha) return false;
    var r = getRange();
    var t = new Date(String(fecha).slice(0, 10) + 'T12:00:00').getTime();
    if (isNaN(t)) return false;
    return t >= r.desde.getTime() && t <= r.hasta.getTime();
  }

  function htmlBar(rootId) {
    return (
      '<div id="' + rootId + '" class="periodo-bar" style="margin:0 0 14px">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:8px">' +
          '<div style="font-size:11px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:var(--text3)">Período del resumen</div>' +
          '<div data-periodo-label style="font-size:12px;font-weight:600;color:var(--teal)"></div>' +
        '</div>' +
        '<div class="periodo-chips" style="display:flex;gap:7px;overflow-x:auto;padding-bottom:4px;-webkit-overflow-scrolling:touch">' +
          '<button type="button" class="periodo-chip active" data-periodo="mes">Este mes</button>' +
          '<button type="button" class="periodo-chip" data-periodo="7d">7 días</button>' +
          '<button type="button" class="periodo-chip" data-periodo="30d">30 días</button>' +
          '<button type="button" class="periodo-chip" data-periodo="anio">Este año</button>' +
          '<button type="button" class="periodo-chip" data-periodo="anio_ant">Año ant.</button>' +
          '<button type="button" class="periodo-chip" data-periodo="custom">Personalizado</button>' +
        '</div>' +
        '<div data-periodo-custom style="display:none;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px">' +
          '<input type="date" data-periodo-desde class="fi" style="max-width:150px">' +
          '<span style="color:var(--text3)">→</span>' +
          '<input type="date" data-periodo-hasta class="fi" style="max-width:150px">' +
          '<button type="button" class="btn btn-primary btn-sm" data-periodo-aplicar>Aplicar</button>' +
        '</div>' +
        '<div style="font-size:11px;color:var(--text3);margin-top:8px;line-height:1.4">' +
          'Los KPI de <b>flujo</b> (partos, tratamientos del período, gasto…) usan este rango. ' +
          'Los de <b>estado actual</b> (gestantes, stock, retiro activo…) son foto del día, sin rango.' +
        '</div>' +
      '</div>' +
      '<style>' +
        '.periodo-chip{flex:none;padding:6px 12px;border-radius:20px;border:1px solid var(--border2);' +
        'background:var(--bg2);color:var(--text2);font-family:inherit;font-size:12px;font-weight:600;' +
        'cursor:pointer;white-space:nowrap}' +
        '.periodo-chip.active{background:var(--teal);border-color:var(--teal);color:#fff}' +
      '</style>'
    );
  }

  function init(opts) {
    opts = opts || {};
    _state.rootId = opts.rootId || 'periodo-kpi';
    _state.storageKey = opts.storageKey || 'default';
    _state.onChange = opts.onChange || null;
    try {
      _state.key = localStorage.getItem('laaamb_periodo_' + _state.storageKey) || 'mes';
      if (_state.key === 'custom') {
        _state.desde = localStorage.getItem('laaamb_periodo_' + _state.storageKey + '_d');
        _state.hasta = localStorage.getItem('laaamb_periodo_' + _state.storageKey + '_h');
      }
    } catch (e) {
      _state.key = 'mes';
    }

    var mount = opts.mountEl || document.getElementById(opts.mountId || '');
    if (mount && !document.getElementById(_state.rootId)) {
      mount.insertAdjacentHTML('afterbegin', htmlBar(_state.rootId));
    }

    var root = document.getElementById(_state.rootId);
    if (root) {
      root.querySelectorAll('[data-periodo]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var k = btn.getAttribute('data-periodo');
          if (k === 'custom') {
            _state.key = 'custom';
            paint();
            return;
          }
          setKey(k);
        });
      });
      var apl = root.querySelector('[data-periodo-aplicar]');
      if (apl) {
        apl.addEventListener('click', function () {
          var d = root.querySelector('[data-periodo-desde]');
          var h = root.querySelector('[data-periodo-hasta]');
          if (!d || !h || !d.value || !h.value) return;
          setCustom(d.value, h.value);
        });
      }
    }
    paint();
    return getRange();
  }

  return {
    init: init,
    getRange: getRange,
    setKey: setKey,
    setCustom: setCustom,
    inRange: inRange,
    htmlBar: htmlBar
  };
})();
