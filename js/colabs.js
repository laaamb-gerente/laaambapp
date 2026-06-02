// ─────────────────────────────────────────────────────────────
// js/colabs.js — carga de colaboradores reales (tabla perfiles) en
// los <select> de los módulos. Elimina los nombres hardcodeados.
//
// Uso:
//   · fillColabSelect(selectId, placeholder)  → llena un select por id
//   · fillAllColabSelects(placeholder)        → llena TODOS los select que
//     tengan la clase .colab-select (auto-init en carga y appstate:ready)
//
// RLS: gerente/administrador ven todo el equipo; los demás roles ven solo
// su propio perfil. Si no hay datos o falla, queda solo el placeholder
// (estado honesto, sin nombres falsos).
// ─────────────────────────────────────────────────────────────
(function () {
  'use strict';

  var FINCA_ID = 'a1b2c3d4-0000-0000-0000-000000000001';
  var _cache = null; // [{id,nombre,email,rol}]

  async function _load() {
    if (_cache) return _cache;
    try {
      if (!(window.DB && typeof window.DB.getColaboradores === 'function')) return [];
      var res = await window.DB.getColaboradores(FINCA_ID);
      _cache = (res && res.data) || [];
    } catch (e) {
      _cache = [];
    }
    return _cache;
  }

  function _optionsHTML(data) {
    return (data || []).map(function (c) {
      var label = c.nombre || c.email || '—';
      var val = c.nombre || c.email || '';
      var rol = c.rol ? ' (' + c.rol + ')' : '';
      return '<option value="' + val + '">' + label + rol + '</option>';
    }).join('');
  }

  // Llena un select concreto por id.
  async function fillColabSelect(selectId, placeholder) {
    var sel = document.getElementById(selectId);
    if (!sel) return;
    var data = await _load();
    sel.innerHTML =
      '<option value="">' + (placeholder || 'Seleccionar colaborador') + '</option>' +
      _optionsHTML(data);
  }

  // Llena TODOS los <select class="colab-select">. Cada select puede definir
  // su propio placeholder con el atributo data-colab-ph.
  async function fillAllColabSelects(placeholder) {
    var sels = document.querySelectorAll('select.colab-select');
    if (!sels.length) return;
    var data = await _load();
    var opts = _optionsHTML(data);
    sels.forEach(function (sel) {
      var ph = sel.getAttribute('data-colab-ph') || placeholder || '— Seleccionar colaborador —';
      var cur = sel.value;
      sel.innerHTML = '<option value="">' + ph + '</option>' + opts;
      if (cur) sel.value = cur;
    });
  }

  // Auto-init: al cargar el DOM y cuando Supabase (AppState) esté listo.
  document.addEventListener('DOMContentLoaded', function () { fillAllColabSelects(); });
  document.addEventListener('appstate:ready', function () { _cache = null; fillAllColabSelects(); });

  window.fillColabSelect = fillColabSelect;
  window.fillAllColabSelects = fillAllColabSelects;
})();
