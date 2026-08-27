// Fórmulas de dosis (ml/kg) para tratamientos LAAAMB.
// Soporta "1 ml / 4 kg" y rangos de etiqueta "1ml/25-50kg" (Dicogan).
// En un rango se sugiere la dosis ALTA (kg menor) para no subdosificar.
(function (root) {
  function _num(s) {
    var n = parseFloat(String(s == null ? '' : s).replace(',', '.'));
    return n > 0 ? n : 0;
  }
  function _norm(txt) {
    return String(txt || '').replace(/,/g, '.').replace(/×/g, 'x').replace(/\s+/g, ' ').trim();
  }

  function parseDosisPauta(txt) {
    var s = _norm(txt);
    if (!s) return null;
    var m = s.match(/([\d.]+)\s*m[lL]\s*(?:\/|x|por|p\/)\s*([\d.]+)\s*(?:-|–|—|a)\s*([\d.]+)\s*kg/i);
    if (m) {
      var ml = _num(m[1]), a = _num(m[2]), b = _num(m[3]);
      if (!(ml > 0 && a > 0 && b > 0)) return null;
      var kgMin = Math.min(a, b), kgMax = Math.max(a, b);
      return {
        rango: kgMin !== kgMax,
        ml: ml,
        kgMin: kgMin,
        kgMax: kgMax,
        factor: ml / kgMin,
        factorMin: ml / kgMax,
        factorMax: ml / kgMin
      };
    }
    m = s.match(/([\d.]+)\s*m[lL]\s*(?:\/|x|por|p\/)\s*([\d.]+)\s*kg/i);
    if (!m) m = s.match(/([\d.]+)\s*m[lL]\s*\/\s*([\d.]+)\s*kg/i);
    if (m) {
      var ml2 = _num(m[1]), kg = _num(m[2]);
      if (!(ml2 > 0 && kg > 0)) return null;
      var f = ml2 / kg;
      return { rango: false, ml: ml2, kgMin: kg, kgMax: kg, factor: f, factorMin: f, factorMax: f };
    }
    return null;
  }

  function parseDosisMlPorKg(txt) {
    var p = parseDosisPauta(txt);
    return p && p.factor > 0 ? p.factor : 0;
  }

  function mlDePeso(peso, factorMl) {
    if (!(peso > 0) || !(factorMl > 0)) return null;
    return Math.round(factorMl * peso * 10) / 10;
  }

  function mlAplicarDePeso(peso, dosisRef) {
    var p = parseDosisPauta(dosisRef);
    if (!p) return null;
    return mlDePeso(peso, p.factor);
  }

  function textoDosisSugerida(peso, dosisRef) {
    var p = parseDosisPauta(dosisRef);
    if (!p || !(peso > 0)) return '';
    var alta = mlDePeso(peso, p.factorMax);
    var baja = mlDePeso(peso, p.factorMin);
    if (alta == null) return '';
    var ref = _norm(dosisRef);
    if (p.rango && baja != null && baja !== alta) {
      return alta.toFixed(1) + ' mL (' + baja.toFixed(1) + '–' + alta.toFixed(1) + ') · ' + ref;
    }
    return alta.toFixed(1) + ' mL · ' + ref;
  }

  function dosisConocida(m) {
    var n = String((m && m.nombre) || '') + ' ' + String((m && (m.principio_activo || m.principio)) || '');
    if (/dilarvon|clozaval/i.test(n)) return '1 ml / 4 kg';
    if (/cydectin|moxidectin/i.test(n)) return '1 ml / 20 kg';
    return '';
  }

  function dosisRefDeMed(m) {
    var t = String((m && (m.dosis_sugerida || m.dosis_estandar)) || '').trim();
    if (t === '—' || t === '-') t = '';
    if (t && parseDosisMlPorKg(t) > 0) return t;
    return dosisConocida(m) || t;
  }

  function medsParaTratamiento(meds) {
    return (meds || []).filter(function (m) { return m && m.activo !== false; });
  }

  function medsListaTratamiento(cache, live) {
    if (live != null) return live;
    return cache || [];
  }

  root.Dosis = {
    parseDosisPauta: parseDosisPauta,
    parseDosisMlPorKg: parseDosisMlPorKg,
    mlDePeso: mlDePeso,
    mlAplicarDePeso: mlAplicarDePeso,
    textoDosisSugerida: textoDosisSugerida,
    dosisRefDeMed: dosisRefDeMed,
    dosisConocida: dosisConocida,
    medsParaTratamiento: medsParaTratamiento,
    medsListaTratamiento: medsListaTratamiento
  };
})(typeof window !== 'undefined' ? window : globalThis);
