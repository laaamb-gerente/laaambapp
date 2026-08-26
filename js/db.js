window.DB = {

  // ── FINCAS ──────────────────────────────────────────
  async getFincas() {
    return await window._sb.from('fincas').select('*').order('nombre');
  },
  async saveFinca(finca) {
    if (finca.id) {
      return await window._sb.from('fincas').update({...finca, updated_at: new Date()}).eq('id', finca.id).select().single();
    }
    return await window._sb.from('fincas').insert(finca).select().single();
  },
  // Perímetro de finca persistente (migración 0034). Fuente de verdad.
  async getFincaPerimetro(finca_id) {
    return await window._sb.from('fincas')
      .select('perimetro_geojson, perimetro_area_ha, perimetro_centro_lat, perimetro_centro_lng')
      .eq('id', finca_id).single();
  },
  async saveFincaPerimetro(finca_id, geojson, area_ha, centro_lat, centro_lng) {
    return await window._sb.from('fincas').update({
      perimetro_geojson: geojson,
      perimetro_area_ha: area_ha,
      perimetro_centro_lat: centro_lat,
      perimetro_centro_lng: centro_lng
    }).eq('id', finca_id);
  },

  // ── ANIMALES ─────────────────────────────────────────
  async getAnimales(finca_id, filters = {}) {
    let q = window._sb.from('animales').select('*, lotes(nombre)').eq('finca_id', finca_id);
    if (filters.especie) q = q.eq('especie', filters.especie);
    if (filters.estado) q = q.eq('estado', filters.estado);
    if (filters.lote_id) q = q.eq('lote_actual_id', filters.lote_id);
    return await q.order('codigo');
  },
  async getAnimal(id) {
    return await window._sb.from('animales').select('*').eq('id', id).single();
  },
  // Crías de un animal: hijos donde figura como madre o como padre
  async getCrias(animal_id) {
    return await window._sb.from('animales')
      .select('id, codigo, nombre, raza, fecha_nacimiento, peso_actual, estado, sexo')
      .or('madre_id.eq.' + animal_id + ',padre_id.eq.' + animal_id)
      .order('fecha_nacimiento', { ascending: false });
  },
  async saveAnimal(animal) {
    const res = animal.id
      ? await window._sb.from('animales').update({...animal, updated_at: new Date()}).eq('id', animal.id).select().single()
      : await window._sb.from('animales').insert(animal).select().single();
    // Si falla por red, encolar para sync posterior
    if (res.error && !navigator.onLine && window.OfflineDB) {
      await window.OfflineDB.encolar({
        tabla: 'animales',
        accion: animal.id ? 'update' : 'insert',
        datos: animal
      });
      return { data: animal, error: null, offline: true };
    }
    return res;
  },
  async deleteAnimal(id) {
    return await window._sb.from('animales').update({ estado: 'descartado', updated_at: new Date() }).eq('id', id);
  },
  // Solo los animales activos que tienen peso_actual real (para enriquecer la tabla)
  async getAnimalesConPeso(finca_id) {
    return await window._sb.from('animales')
      .select('id, codigo, peso_actual')
      .eq('finca_id', finca_id)
      .not('peso_actual', 'is', null)
      .eq('estado', 'activo');
  },

  // ── COLABORADORES (equipo, tabla perfiles) ──────────
  // Nota: 'perfiles' es de finca única (no tiene columna finca_id); se listan
  // los perfiles activos. RLS limita: gerente/admin ven todos; otros roles ven
  // solo su propio perfil (política rls_perfiles_rol).
  async getColaboradores(finca_id) {
    return await window._sb
      .from('perfiles')
      .select('id, nombre, email, rol')
      .eq('activo', true)
      .order('nombre');
  },

  // ── PIVOTES (pastoreo) vs ESTABLOS ────────────────────
  // Misma tabla `pivotes`, discriminados por columna `tipo`:
  //   · pivote de pastoreo: tipo IS NULL | 'pivote' | ''  → riego, potreros, mapa de carga
  //   · establo:            tipo = 'establo'             → cubículos (lotes tipo cubiculo), NO se riega
  // getPivotes() NUNCA devuelve establos. getEstablos() solo establos.
  _esEstabloPivote(p) {
    if (!p) return false;
    const t = String(p.tipo || '').toLowerCase().trim();
    if (t === 'establo' || t === 'estabulacion' || t === 'estabulación') return true;
    // Heurística de nombre (datos viejos sin tipo)
    const n = String(p.nombre || '').toLowerCase();
    if (/\bestablo\b|\bcub[ií]culo\b|\bcobertizo\b/.test(n) && t !== 'pivote') return true;
    return false;
  },
  _filtrarSoloPivotesPastoreo(rows) {
    return (rows || []).filter((p) => !this._esEstabloPivote(p));
  },
  /** Orden 1, 2, 11 (no 1, 11, 2). */
  _cmpNombreNatural(a, b) {
    return String(a == null ? '' : a).localeCompare(String(b == null ? '' : b), 'es', {
      numeric: true,
      sensitivity: 'base'
    });
  },
  _ordenarPorNombreNatural(rows, key) {
    const k = key || 'nombre';
    return (rows || []).slice().sort((a, b) => this._cmpNombreNatural(a && a[k], b && b[k]));
  },
  /**
   * Cubículo / lote de establo (no es potrero de pastoreo).
   * establoPivoteIds: Set, mapa {id:true} o array de ids de pivotes tipo establo.
   */
  _esLoteEstablo(l, establoPivoteIds) {
    if (!l) return false;
    const t = String(l.tipo || '').toLowerCase().trim();
    if (t === 'cubiculo' || t === 'cubículo' || t === 'establo'
        || t === 'estabulacion' || t === 'estabulación') return true;
    if (l.pivote_id && establoPivoteIds) {
      const id = String(l.pivote_id);
      if (typeof establoPivoteIds.has === 'function') {
        if (establoPivoteIds.has(id)) return true;
      } else if (Array.isArray(establoPivoteIds)) {
        if (establoPivoteIds.map(String).indexOf(id) >= 0) return true;
      } else if (establoPivoteIds[id]) return true;
    }
    const n = String(l.nombre || '').toLowerCase().trim();
    if (/^(establo|cub[ií]culo|cobertizo)\b/.test(n) && t !== 'potrero') return true;
    return false;
  },
  _isoLocal(d) {
    const x = d instanceof Date ? d : new Date(d);
    return x.getFullYear() + '-' + ('0' + (x.getMonth() + 1)).slice(-2) + '-' + ('0' + x.getDate()).slice(-2);
  },
  /** Ids de pivotes-establo (tipo o nombre), para excluir cubículos del tab Potreros. */
  async getIdsPivotesEstablo(finca_id) {
    const ids = {};
    let r = await window._sb.from('pivotes')
      .select('id,nombre,tipo')
      .eq('finca_id', finca_id);
    if (r.error && /column|tipo/i.test(String(r.error.message || r.error))) {
      r = await window._sb.from('pivotes').select('id,nombre').eq('finca_id', finca_id);
    }
    if (r.error) return { data: ids, error: r.error };
    (r.data || []).forEach((p) => {
      if (this._esEstabloPivote(p)) ids[String(p.id)] = true;
    });
    return { data: ids, error: null };
  },

  async getPivotes(finca_id) {
    // Preferir columnas con geo (0065) + tipo; fallback si faltan columnas.
    let r = await window._sb.from('pivotes')
      .select('id,finca_id,nombre,area_ha,area_ha_calc,tipo_pasto,capacidad_animales,notas,activo,geojson,tipo,created_at,updated_at')
      .eq('finca_id', finca_id).eq('activo', true).order('nombre');
    if (r.error && /geojson|area_ha_calc|column|tipo/i.test(String(r.error.message || r.error))) {
      r = await window._sb.from('pivotes')
        .select('*').eq('finca_id', finca_id).eq('activo', true).order('nombre');
    }
    if (r && !r.error && Array.isArray(r.data)) {
      // Excluir establos siempre (riego / pastoreo / mapa de pivotes de forraje)
      r = { data: this._ordenarPorNombreNatural(this._filtrarSoloPivotesPastoreo(r.data)), error: null };
    }
    return r;
  },
  async getPivotesEliminados(finca_id) {
    return await window._sb.from('pivotes')
      .select('*').eq('finca_id', finca_id).eq('eliminado', true)
      .order('fecha_eliminacion', { ascending: false });
  },
  // Borra los potreros (lotes) de un pivote — usado al reconfigurar/eliminar.
  async deleteLotesByPivote(pivote_id) {
    return await window._sb.from('lotes').delete().eq('pivote_id', pivote_id);
  },
  async savePivote(pivote) {
    // Solo columnas conocidas (evita fallos si el payload trae basura)
    const id = pivote.id || null;
    const geo = pivote.geojson;
    const row = {
      finca_id: pivote.finca_id || null,
      nombre: pivote.nombre,
      area_ha: pivote.area_ha != null && pivote.area_ha !== '' ? Number(pivote.area_ha) : null,
      tipo_pasto: pivote.tipo_pasto != null && pivote.tipo_pasto !== '' ? String(pivote.tipo_pasto) : null,
      capacidad_animales: pivote.capacidad_animales != null && pivote.capacidad_animales !== ''
        ? parseInt(pivote.capacidad_animales, 10) : null,
      notas: pivote.notas != null && pivote.notas !== '' ? String(pivote.notas) : null,
      updated_at: new Date().toISOString()
    };
    // limpiar NaN
    if (row.area_ha != null && isNaN(row.area_ha)) row.area_ha = null;
    if (row.capacidad_animales != null && isNaN(row.capacidad_animales)) row.capacidad_animales = null;
    if (!id) {
      // insert: no mandar updated_at si la col no existe en prod vieja
      delete row.updated_at;
      if (!row.finca_id) row.finca_id = 'a1b2c3d4-0000-0000-0000-000000000001';
      if (row.activo == null) row.activo = true;
    }
    let res;
    if (id) {
      // update: no reescribir finca_id a null
      if (!row.finca_id) delete row.finca_id;
      res = await window._sb.from('pivotes')
        .update(row).eq('id', id).select().single();
      // fallback si updated_at no existe
      if (res.error && /updated_at|column/i.test(String(res.error.message || res.error))) {
        const { updated_at, ...row2 } = row;
        res = await window._sb.from('pivotes')
          .update(row2).eq('id', id).select().single();
      }
    } else {
      res = await window._sb.from('pivotes').insert(row).select().single();
    }
    // Persist geo aparte (best-effort)
    if (!res.error && res.data && res.data.id && geo) {
      try { await this.savePivoteGeo(res.data.id, geo, row.area_ha); } catch (_) {}
    }
    return res;
  },
  async deletePivote(id) {
    return await window._sb.from('pivotes').update({ activo: false }).eq('id', id);
  },
  // Soft-delete con historial: marca eliminado + snapshot de potreros (0035).
  async softDeletePivote(id, motivo, potreros_snapshot) {
    return await window._sb.from('pivotes').update({
      eliminado: true,
      fecha_eliminacion: new Date().toISOString(),
      motivo_eliminacion: motivo || null,
      potreros_snapshot: potreros_snapshot || [],
      activo: false
    }).eq('id', id);
  },
  /** Persiste contorno del pivote (GeoJSON) — fuente de verdad multi-dispositivo. */
  async savePivoteGeo(pivote_id, geojson, area_ha) {
    const patch = {
      geojson: geojson,
      updated_at: new Date().toISOString()
    };
    if (area_ha != null && !isNaN(area_ha)) {
      patch.area_ha = Math.round(Number(area_ha) * 100) / 100;
      patch.area_ha_calc = patch.area_ha;
    }
    return await window._sb.from('pivotes')
      .update(patch).eq('id', pivote_id).select().single();
  },
  async getPivote(id) {
    return await window._sb.from('pivotes').select('*').eq('id', id).maybeSingle();
  },

  // ── RIEGO (0065) · pivote y/o potrero (lote_id) ──
  async getRiegos(filtros = {}) {
    let q = window._sb.from('registros_riego')
      .select('*, pivotes(nombre, area_ha, tipo_pasto)')
      .order('fecha', { ascending: false });
    if (filtros.finca_id) q = q.eq('finca_id', filtros.finca_id);
    if (filtros.pivote_id) q = q.eq('pivote_id', filtros.pivote_id);
    if (filtros.lote_id) q = q.eq('lote_id', filtros.lote_id);
    if (filtros.desde) q = q.gte('fecha', filtros.desde);
    if (filtros.hasta) q = q.lte('fecha', filtros.hasta);
    if (filtros.limit) q = q.limit(filtros.limit);
    else q = q.limit(50);
    return await q;
  },
  async getUltimoRiego(pivote_id) {
    return await window._sb.from('registros_riego')
      .select('*')
      .eq('pivote_id', pivote_id)
      .order('fecha', { ascending: false })
      .limit(1)
      .maybeSingle();
  },
  /** Último riego de un potrero concreto (lote_id). */
  async getUltimoRiegoLote(lote_id) {
    if (!lote_id) return { data: null, error: null };
    return await window._sb.from('registros_riego')
      .select('*')
      .eq('lote_id', String(lote_id))
      .order('fecha', { ascending: false })
      .limit(1)
      .maybeSingle();
  },
  /**
   * Potreros de pastoreo (excluye cubículos de establo) con polígono.
   * Para mapa de riego por potrero.
   */
  async getPotrerosRiego(finca_id) {
    const r = await window._sb.from('lotes')
      .select('id,nombre,hectareas,area_ha,pivote_id,poligono,tipo,tipo_pastura,capacidad_animal')
      .eq('finca_id', finca_id)
      .order('nombre');
    if (r.error) return r;
    let estIds = {};
    try {
      const er = await this.getIdsPivotesEstablo(finca_id);
      if (er && er.data) estIds = er.data;
    } catch (_) {}
    const rows = (r.data || []).filter((l) => !this._esLoteEstablo(l, estIds));
    return { data: this._ordenarPorNombreNatural(rows), error: null };
  },
  async saveRiego(data) {
    const finca_id = data.finca_id || 'a1b2c3d4-0000-0000-0000-000000000001';
    const dur = parseInt(data.duracion_min, 10);
    if (!dur || dur <= 0) return { data: null, error: { message: 'Duración inválida' } };
    const payload = {
      finca_id,
      pivote_id: data.pivote_id || null,
      lote_id: data.lote_id != null && data.lote_id !== '' ? String(data.lote_id) : null,
      fecha: data.fecha || new Date().toISOString().slice(0, 10),
      hora_inicio: data.hora_inicio || null,
      duracion_min: dur,
      metodo: data.metodo || 'aspersión',
      mm_estimados: data.mm_estimados != null ? Number(data.mm_estimados) : null,
      caudal_lpm: data.caudal_lpm != null ? Number(data.caudal_lpm) : null,
      volumen_m3: data.volumen_m3 != null ? Number(data.volumen_m3) : null,
      registrado_por: data.registrado_por || null,
      notas: data.notas || null
    };
    return await window._sb.from('registros_riego').insert(payload).select().single();
  },
  async deleteRiego(id) {
    return await window._sb.from('registros_riego').delete().eq('id', id);
  },

  // ── CAPA MAPA / ORTOMOSAICO DRON (0065) ──
  async getCapaMapa(finca_id) {
    const r = await window._sb.from('fincas')
      .select('id, capa_mapa, perimetro_geojson, perimetro_area_ha')
      .eq('id', finca_id).maybeSingle();
    if (r.error) return r;
    const capa = (r.data && r.data.capa_mapa) || {};
    return {
      data: {
        finca_id,
        capa_mapa: capa,
        base: capa.base || 'google_sat',
        ortomosaico: capa.ortomosaico || null,
        perimetro_geojson: r.data && r.data.perimetro_geojson,
        perimetro_area_ha: r.data && r.data.perimetro_area_ha
      },
      error: null
    };
  },
  async saveCapaMapa(finca_id, capa_mapa) {
    return await window._sb.from('fincas')
      .update({ capa_mapa: capa_mapa })
      .eq('id', finca_id)
      .select('id, capa_mapa')
      .single();
  },
  /** Activa ortomosaico como base y guarda metadatos del vuelo. */
  async activarOrtomosaico(finca_id, ortoConfig) {
    const cur = await this.getCapaMapa(finca_id);
    const prev = (cur.data && cur.data.capa_mapa) || {};
    const capa = Object.assign({}, prev, {
      base: 'orthomosaic',
      ortomosaico: Object.assign({}, prev.ortomosaico || {}, ortoConfig || {}, { activo: true })
    });
    return await this.saveCapaMapa(finca_id, capa);
  },
  async getLevantamientosDron(finca_id) {
    return await window._sb.from('levantamientos_dron')
      .select('*')
      .eq('finca_id', finca_id)
      .order('fecha_vuelo', { ascending: false });
  },
  async saveLevantamientoDron(data) {
    if (data.id) {
      return await window._sb.from('levantamientos_dron')
        .update(data).eq('id', data.id).select().single();
    }
    return await window._sb.from('levantamientos_dron').insert(data).select().single();
  },

  // ── MOVIMIENTOS DE POTRERO (rotación: ocupación + descanso) (0036) ──
  async saveMovimientoPotrero(data) {
    return await window._sb.from('movimientos_potrero')
      .insert({ ...data, finca_id: 'a1b2c3d4-0000-0000-0000-000000000001' });
  },
  async updateMovimientoPotrero(lote_id, updates) {
    var buscar = updates._estado_buscar || 'ocupado';
    var patch = { ...updates }; delete patch._estado_buscar;
    return await window._sb.from('movimientos_potrero')
      .update(patch)
      .eq('lote_id', lote_id)
      .eq('estado', buscar);
  },
  async getHistorialRotacion(finca_id) {
    return await window._sb.from('movimientos_potrero')
      .select('*')
      .eq('finca_id', finca_id)
      .order('fecha_entrada', { ascending: false });
  },

  // ── ESTABULACIÓN (establos = pivotes tipo='establo'; cubículos = lotes tipo='cubiculo') ──
  async getEstablos(finca_id) {
    const r = await window._sb.from('pivotes')
      .select('id,nombre,capacidad_animales')
      .eq('finca_id', finca_id).eq('tipo','establo').order('nombre');
    if (r.error || !Array.isArray(r.data)) return r;
    return { data: this._ordenarPorNombreNatural(r.data), error: null };
  },
  async getCubiculos(finca_id) {
    const r = await window._sb.from('lotes')
      .select('id,nombre,pivote_id,tipo')
      .eq('finca_id', finca_id)
      .order('nombre');
    if (r.error) return r;
    let estIds = {};
    try {
      const er = await this.getIdsPivotesEstablo(finca_id);
      if (er && er.data) estIds = er.data;
    } catch (_) {}
    const rows = (r.data || []).filter((l) => this._esLoteEstablo(l, estIds));
    return { data: this._ordenarPorNombreNatural(rows), error: null };
  },
  // Cuántos animales activos hay en cada lote (cubículo o potrero)
  async getConteoPorLote(finca_id) {
    const r = await window._sb.from('animales')
      .select('lote_actual_id').eq('finca_id', finca_id).eq('estado','activo');
    const conteo = {};
    (r.data||[]).forEach(a=>{ if(a.lote_actual_id){ conteo[a.lote_actual_id]=(conteo[a.lote_actual_id]||0)+1; } });
    return { conteo, error: r.error };
  },
  // Mover TODOS los animales activos de un lote origen a un lote destino
  async moverAnimalesDeLote(finca_id, lote_origen_id, lote_destino_id) {
    const upd = await window._sb.from('animales')
      .update({ lote_actual_id: lote_destino_id, updated_at: new Date() })
      .eq('finca_id', finca_id).eq('estado','activo').eq('lote_actual_id', lote_origen_id)
      .select('id');
    return { movidos: upd.data ? upd.data.length : 0, error: upd.error };
  },
  // Mover un set específico de animales a un lote destino
  async asignarAnimalesALote(finca_id, animal_ids, lote_destino_id) {
    const upd = await window._sb.from('animales')
      .update({ lote_actual_id: lote_destino_id, updated_at: new Date() })
      .in('id', animal_ids).select('id');
    return { movidos: upd.data ? upd.data.length : 0, error: upd.error };
  },

  // ── LOTES ────────────────────────────────────────────
  async getLotes(finca_id) {
    const r = await window._sb.from('lotes').select('*').eq('finca_id', finca_id).order('nombre');
    if (r.error || !Array.isArray(r.data)) return r;
    return { data: this._ordenarPorNombreNatural(r.data), error: null };
  },
  async saveLote(lote) {
    const id = lote.id || null;
    // Campos permitidos (no esparcir basura / ids locales)
    const row = {};
    if (lote.finca_id != null) row.finca_id = lote.finca_id;
    if (lote.nombre != null) row.nombre = lote.nombre;
    if (lote.hectareas != null) row.hectareas = lote.hectareas;
    if (lote.area_ha != null && row.hectareas == null) row.hectareas = lote.area_ha;
    if (lote.capacidad_animal != null) row.capacidad_animal = lote.capacidad_animal;
    if (lote.tipo_pastura != null) row.tipo_pastura = lote.tipo_pastura;
    if (lote.tipo_pasto != null && row.tipo_pastura == null) row.tipo_pastura = lote.tipo_pasto;
    if (lote.dias_descanso_objetivo != null) row.dias_descanso_objetivo = lote.dias_descanso_objetivo;
    if (lote.dias_pastoreo_objetivo != null) row.dias_pastoreo_objetivo = lote.dias_pastoreo_objetivo;
    if (lote.pivote_id != null && lote.pivote_id !== '') row.pivote_id = lote.pivote_id;
    if (lote.poligono != null) row.poligono = lote.poligono;
    if (lote.color != null) row.color = lote.color;
    if (lote.tipo != null) row.tipo = lote.tipo;
    row.updated_at = new Date().toISOString();

    if (id) {
      let res = await window._sb.from('lotes').update(row).eq('id', id).select().single();
      if (res.error && /updated_at|column/i.test(String(res.error.message || res.error))) {
        const { updated_at, ...row2 } = row;
        res = await window._sb.from('lotes').update(row2).eq('id', id).select().single();
      }
      return res;
    }
    const { updated_at, ...ins } = row;
    return await window._sb.from('lotes').insert(ins).select().single();
  },

  // ── EVENTOS ──────────────────────────────────────────
  async getEventos(finca_id, limit = 100) {
    return await window._sb.from('eventos').select('*, animales(codigo, nombre)').eq('finca_id', finca_id).order('fecha', { ascending: false }).limit(limit);
  },
  async getEventosAnimal(animal_id) {
    return await window._sb.from('eventos').select('*').eq('animal_id', animal_id).order('fecha', { ascending: false });
  },
  async saveEvento(evento) {
    const res = await window._sb.from('eventos').insert(evento).select().single();
    // Si falla por red, encolar para sync posterior
    if (res.error && !navigator.onLine && window.OfflineDB) {
      await window.OfflineDB.encolar({
        tabla: 'eventos',
        accion: 'insert',
        datos: evento
      });
      return { data: evento, error: null, offline: true };
    }
    return res;
  },

  // ── MEDICAMENTOS ─────────────────────────────────────
  async getMedicamentos(finca_id) {
    return await window._sb.from('medicamentos').select('*').eq('finca_id', finca_id).order('nombre');
  },
  async saveMedicamento(med) {
    if (med.id) {
      return await window._sb.from('medicamentos').update({...med, updated_at: new Date()}).eq('id', med.id).select().single();
    }
    return await window._sb.from('medicamentos').insert(med).select().single();
  },

  // ── TRATAMIENTOS ─────────────────────────────────────
  async getTratamientos(finca_id, solo_activos = false) {
    let q = window._sb.from('tratamientos').select('*, animales(codigo, nombre, estado), medicamentos(nombre)').eq('finca_id', finca_id);
    if (solo_activos) q = q.gte('fecha_fin_retiro', new Date().toISOString().split('T')[0]);
    return await q.order('fecha_inicio', { ascending: false });
  },
  async saveTratamiento(t) {
    return await window._sb.from('tratamientos').insert(t).select().single();
  },
  // Tratamientos de un animal concreto (para su ficha individual)
  async getTratamientosAnimal(animal_id) {
    return await window._sb.from('tratamientos')
      .select('*, medicamentos(nombre)')
      .eq('animal_id', animal_id)
      .order('fecha_inicio', { ascending: false });
  },
  async updateTratamiento(id, patch) {
    return await window._sb.from('tratamientos').update(patch).eq('id', id).select().single();
  },
  // Eliminar un tratamiento completo por grupo_id: borra sus dosis_programadas y
  // todas las filas del grupo. Si no hay grupo_id, borra por id individual.
  async eliminarTratamientoGrupo(grupo_id, tratamiento_ids) {
    // tratamiento_ids: array de ids de las filas del grupo (para borrar dosis)
    if (tratamiento_ids && tratamiento_ids.length) {
      await window._sb.from('dosis_programadas').delete().in('tratamiento_id', tratamiento_ids);
    }
    let q = window._sb.from('tratamientos').delete();
    if (grupo_id) { q = q.eq('grupo_id', grupo_id); }
    else if (tratamiento_ids && tratamiento_ids.length) { q = q.in('id', tratamiento_ids); }
    else { return { error: { message: 'Sin grupo ni ids para eliminar.' } }; }
    const r = await q.select('id');
    return { data: r.data, error: r.error };
  },
  // Traer las filas de un grupo (para editar)
  async getTratamientoGrupo(grupo_id) {
    return await window._sb.from('tratamientos').select('*').eq('grupo_id', grupo_id).order('created_at');
  },

  // ── PESAJES ──────────────────────────────────────────
  async getPesajes(finca_id, animal_id = null) {
    let q = window._sb.from('pesajes').select('*, animales(codigo, nombre)').eq('finca_id', finca_id);
    if (animal_id) q = q.eq('animal_id', animal_id);
    return await q.order('fecha', { ascending: false }).limit(200);
  },
  async savePesaje(p) {
    // Inserta el pesaje. Si queda pendiente de aprobación, NO toca peso_actual
    // del animal (solo al aprobar el gerente se actualiza el inventario).
    const { data, error } = await window._sb.from('pesajes').insert(p).select().single();
    const pendiente = (p.estado_aprobacion === 'pendiente');
    if (!error && p.animal_id && !pendiente) {
      await window._sb.from('animales').update({
        peso_actual: p.peso,
        updated_at: new Date()
      }).eq('id', p.animal_id);
    }
    // Si falla por red, encolar para sync posterior
    if (error && !navigator.onLine && window.OfflineDB) {
      await window.OfflineDB.encolar({
        tabla: 'pesajes',
        accion: 'insert',
        datos: p
      });
      return { data: p, error: null, offline: true };
    }
    return { data, error };
  },

  // Aplica peso_actual al animal (llamar SOLO al aprobar un pesaje pendiente).
  async aplicarPesoAnimal(animal_id, peso) {
    if (!animal_id || peso == null) return { data: null, error: null };
    return await window._sb.from('animales').update({
      peso_actual: peso,
      updated_at: new Date()
    }).eq('id', animal_id).select().single();
  },

  // Marca animal muerto/vendido (llamar SOLO al aprobar una baja pendiente).
  async aplicarEstadoBajaAnimal(animal_id, estado) {
    if (!animal_id || !estado) return { data: null, error: null };
    return await window._sb.from('animales').update({
      estado: estado,
      updated_at: new Date()
    }).eq('id', animal_id).select().single();
  },

  // ── REPRODUCCIÓN ─────────────────────────────────────
  async getEventosReproductivos(finca_id, limit = 200) {
    return await window._sb.from('eventos_reproductivos')
      .select('*, hembra:hembra_id(codigo, nombre), macho:macho_id(codigo, nombre)')
      .eq('finca_id', finca_id)
      .order('fecha', { ascending: false })
      .limit(limit);
  },
  async saveEventoReproductivo(evento) {
    return await window._sb.from('eventos_reproductivos')
      .insert(evento).select().single();
  },

  // ── TAREAS (crear, asignar, finalizar) (0039) ──
  async getTareas(finca_id, filters = {}) {
    let q = window._sb.from('tareas').select('*').eq('finca_id', finca_id);
    if (filters.asignado_a) q = q.eq('asignado_a', filters.asignado_a);
    if (filters.fecha) q = q.eq('fecha_vencimiento', filters.fecha);
    if (filters.estado) q = q.eq('estado', filters.estado);
    if (filters.vencidas_hasta) q = q.lte('fecha_vencimiento', filters.vencidas_hasta);
    return await q.order('fecha_vencimiento', { ascending: true });
  },
  async saveTarea(data) {
    return await window._sb.from('tareas')
      .insert({ ...data, finca_id: 'a1b2c3d4-0000-0000-0000-000000000001' })
      .select().single();
  },
  async updateTarea(id, updates) {
    return await window._sb.from('tareas')
      .update({ ...updates, updated_at: new Date() })
      .eq('id', id).select().single();
  },

  // ── GRUPOS DE MONTA (un macho + N hembras, período conjunto) (0037) ──
  async getGruposMonta(finca_id) {
    return await window._sb.from('grupos_monta')
      .select('*')
      .eq('finca_id', finca_id)
      .order('fecha_inicio', { ascending: false });
  },
  async saveGrupoMonta(data) {
    return await window._sb.from('grupos_monta')
      .insert({ ...data, finca_id: 'a1b2c3d4-0000-0000-0000-000000000001' })
      .select().single();
  },
  async updateGrupoMonta(id, updates) {
    return await window._sb.from('grupos_monta')
      .update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id);
  },
  async updateEventoReproductivo(id, patch) {
    return await window._sb.from('eventos_reproductivos')
      .update(patch).eq('id', id).select().single();
  },
  // Marca como ciclo fallido la última monta de una hembra (ecografía vacía).
  async marcarMontaFallida(hembra_id) {
    const { data } = await window._sb.from('eventos_reproductivos')
      .select('id, datos').eq('hembra_id', hembra_id).eq('tipo', 'monta')
      .order('fecha', { ascending: false }).limit(1);
    if (!data || !data.length) return { data: null, error: null };
    const ev = data[0];
    const datos = Object.assign({}, ev.datos || {}, { ciclo: 'fallido' });
    return await window._sb.from('eventos_reproductivos')
      .update({ datos }).eq('id', ev.id).select().single();
  },
  // Última monta de una hembra (para heredar lineaje aunque el ciclo haya fallado).
  async getUltimaMonta(hembra_id) {
    return await window._sb.from('eventos_reproductivos')
      .select('*, macho:macho_id(codigo, nombre, raza)')
      .eq('hembra_id', hembra_id).eq('tipo', 'monta')
      .order('fecha', { ascending: false }).limit(1);
  },
  async getGestantes(finca_id) {
    return await window._sb.from('animales')
      .select('id, codigo, nombre, fecha_ultima_monta, fecha_parto_esperado, lotes(nombre)')
      .eq('finca_id', finca_id)
      .eq('estado_reproductivo', 'gestante')
      .eq('estado', 'activo');
  },
  async updateEstadoReproductivo(animal_id, estado_rep, fecha_monta, fecha_parto_esperado) {
    return await window._sb.from('animales')
      .update({
        estado_reproductivo: estado_rep,
        fecha_ultima_monta: fecha_monta || null,
        fecha_parto_esperado: fecha_parto_esperado || null,
        updated_at: new Date()
      })
      .eq('id', animal_id);
  },

  // ── BAJAS & VENTAS ───────────────────────────────────
  async getBajas(finca_id, limit = 200) {
    return await window._sb.from('bajas')
      .select('*, animales(codigo, nombre, raza, especie, fecha_nacimiento, lote_actual_id)')
      .eq('finca_id', finca_id)
      .order('fecha', { ascending: false })
      .limit(limit);
  },
  async saveBaja(baja) {
    return await window._sb.from('bajas')
      .insert(baja).select().single();
  },

  // ── COSTOS & INGRESOS ────────────────────────────────
  async getCostos(finca_id, limit = 500) {
    return await window._sb.from('costos')
      .select('*')
      .eq('finca_id', finca_id)
      .order('fecha', { ascending: false })
      .limit(limit);
  },

  async saveCosto(costo) {
    return await window._sb.from('costos')
      .insert(costo).select().single();
  },

  async getIngresos(finca_id, limit = 500) {
    return await window._sb.from('ingresos')
      .select('*')
      .eq('finca_id', finca_id)
      .order('fecha', { ascending: false })
      .limit(limit);
  },

  async saveIngreso(ingreso) {
    return await window._sb.from('ingresos')
      .insert(ingreso).select().single();
  },

  // ── FLUJO DE CAJA · PRESUPUESTO & APARCERÍA ──────────
  async getPresupuesto(finca_id, año, mes) {
    return await window._sb.from('presupuesto')
      .select('*')
      .eq('finca_id', finca_id)
      .eq('año', año)
      .eq('mes', mes);
  },

  async savePresupuesto(p) {
    return await window._sb.from('presupuesto')
      .upsert(p, { onConflict: 'finca_id,año,mes,categoria,tipo' })
      .select().single();
  },

  async getAparceria(finca_id) {
    return await window._sb.from('aparceria')
      .select('*')
      .eq('finca_id', finca_id)
      .eq('activo', true);
  },

  async saveAparceria(a) {
    return await window._sb.from('aparceria')
      .insert(a).select().single();
  },

  async getPagosAparceria(finca_id, año, mes) {
    return await window._sb.from('pagos_aparceria')
      .select('*, aparceria(socio, tipo)')
      .eq('finca_id', finca_id)
      .eq('año', año)
      .eq('mes', mes);
  },

  async savePagoAparceria(p) {
    return await window._sb.from('pagos_aparceria')
      .insert(p).select().single();
  },

  // ── NÓMINA · EMPLEADOS, ASISTENCIA, LIQUIDACIONES ────
  async getEmpleados(finca_id) {
    return await window._sb.from('empleados')
      .select('*')
      .eq('finca_id', finca_id)
      .eq('activo', true)
      .order('nombre');
  },

  async saveEmpleado(e) {
    if (e.id) {
      return await window._sb.from('empleados')
        .update({...e, updated_at: new Date()})
        .eq('id', e.id).select().single();
    }
    return await window._sb.from('empleados')
      .insert(e).select().single();
  },

  async getAsistencia(finca_id, año, mes) {
    const inicio = `${año}-${String(mes).padStart(2,'0')}-01`;
    const fin = new Date(año, mes, 0).toISOString().split('T')[0];
    return await window._sb.from('asistencia')
      .select('*, empleados(nombre, cargo)')
      .eq('finca_id', finca_id)
      .gte('fecha', inicio)
      .lte('fecha', fin)
      .order('fecha');
  },

  async saveAsistencia(a) {
    return await window._sb.from('asistencia')
      .upsert(a, { onConflict: 'empleado_id,fecha' })
      .select().single();
  },

  async getLiquidacion(finca_id, año, mes, quincena) {
    return await window._sb.from('liquidaciones')
      .select('*, empleados(nombre, cargo, salario_base)')
      .eq('finca_id', finca_id)
      .eq('año', año)
      .eq('mes', mes)
      .eq('quincena', quincena);
  },

  async saveLiquidacion(l) {
    return await window._sb.from('liquidaciones')
      .upsert(l, { onConflict: 'empleado_id,quincena,mes,año' })
      .select().single();
  },

  // ── CIERRES DE ASISTENCIA · historial mes a mes (0054) ──
  async getCierreAsistencia(finca_id, anio, mes) {
    return await window._sb.from('cierres_asistencia')
      .select('*').eq('finca_id', finca_id).eq('anio', anio).eq('mes', mes)
      .maybeSingle();
  },
  async listCierresAsistencia(finca_id, limit = 36) {
    return await window._sb.from('cierres_asistencia')
      .select('anio, mes, total_dias_trabajados, total_fi, total_fj, fecha_cierre, reabierto')
      .eq('finca_id', finca_id).eq('reabierto', false)
      .order('anio', { ascending: false }).order('mes', { ascending: false })
      .limit(limit);
  },
  async cerrarMesAsistencia(payload) {
    // payload: {finca_id, anio, mes, resumen[], total_*, cerrado_por}
    return await window._sb.from('cierres_asistencia')
      .upsert(Object.assign({ reabierto: false, fecha_cierre: new Date().toISOString() }, payload),
              { onConflict: 'finca_id,anio,mes' })
      .select().single();
  },
  async reabrirMesAsistencia(finca_id, anio, mes) {
    return await window._sb.from('cierres_asistencia')
      .update({ reabierto: true })
      .eq('finca_id', finca_id).eq('anio', anio).eq('mes', mes);
  },

  // ── ICA / SIGMA · MOVILIZACIONES ─────────────────────
  async getMovilizaciones(finca_id, limit = 100) {
    return await window._sb.from('movilizaciones')
      .select('*')
      .eq('finca_id', finca_id)
      .order('fecha', { ascending: false })
      .limit(limit);
  },

  async saveMovilizacion(m) {
    return await window._sb.from('movilizaciones')
      .insert(m).select().single();
  },

  // ── BENEFICIO & TRAZABILIDAD ─────────────────────────
  async saveBeneficio(b) {
    return await window._sb.from('beneficios').insert(b).select().single();
  },
  async getCortesByBeneficio(beneficio_id) {
    return await window._sb.from('cortes').select('*').eq('beneficio_id', beneficio_id);
  },
  async saveCorte(c) {
    return await window._sb.from('cortes').insert(c).select().single();
  },
  async getCanalesConSaldo(finca_id) {
    // Canales (beneficios) aprobados con su kg_disponible
    return await window._sb.from('beneficios')
      .select('id,animal_id,fecha,peso_canal,kg_disponible,estado_aprobacion,animales(codigo,nombre)')
      .eq('finca_id', finca_id)
      .eq('estado_aprobacion','aprobado')
      .order('fecha', { ascending: false });
  },
  async getCortesConUnidades(beneficio_id) {
    const cortes = await window._sb.from('cortes')
      .select('*').eq('beneficio_id', beneficio_id).order('created_at');
    const unidades = await window._sb.from('unidades_corte')
      .select('*').eq('beneficio_id', beneficio_id).order('numero');
    return { cortes: cortes.data||[], unidades: unidades.data||[] };
  },
  // Todas las unidades de corte de la finca, con su corte y canal, para el
  // inventario de cortes agrupado por tipo.
  async getInventarioCortes(finca_id) {
    const unidades = await window._sb.from('unidades_corte')
      .select('id,corte_id,beneficio_id,numero,peso_kg,estado,cliente_id,precio_venta,fecha_venta,' +
              'cortes(tipo_corte),beneficios(animales(codigo))')
      .eq('finca_id', finca_id)
      .order('created_at');
    return { unidades: unidades.data || [], error: unidades.error };
  },
  // Registra un ajuste de inventario. Si estado='aprobado', aplica el cambio.
  // Si queda 'pendiente', solo registra (el cambio real se aplica al aprobar).
  async registrarAjusteInventario({finca_id, beneficio_id, unidad_id, tipo, causal, kg_antes, kg_despues, estado, propuesto_por, propuesto_por_rol, notas}) {
    // 1. Insertar el registro de ajuste
    const ins = await window._sb.from('ajustes_inventario').insert({
      finca_id, beneficio_id: beneficio_id||null, unidad_id: unidad_id||null,
      tipo, causal: causal||null, kg_antes: kg_antes!=null?kg_antes:null,
      kg_despues: kg_despues!=null?kg_despues:null,
      estado_aprobacion: estado, propuesto_por: propuesto_por||null,
      propuesto_por_rol: propuesto_por_rol||null, notas: notas||null
    }).select().single();
    if (ins.error) return { error: ins.error };
    // 2. Si está aprobado, aplicar el cambio real
    if (estado === 'aprobado') {
      if (beneficio_id && kg_despues != null) {
        // ajuste de kg de la canal
        const upd = await window._sb.from('beneficios')
          .update({ kg_disponible: kg_despues }).eq('id', beneficio_id);
        if (upd.error) return { data: ins.data, error: upd.error };
      }
      if (unidad_id && tipo === 'descarte') {
        // dar de baja la unidad: estado='baja' (requiere migración 0052) + causal en notas.
        const upd = await window._sb.from('unidades_corte')
          .update({ estado: 'baja', notas: 'BAJA: '+(causal||'descarte') }).eq('id', unidad_id);
        if (upd.error) return { data: ins.data, error: upd.error };
      }
    }
    return { data: ins.data, error: null };
  },
  async getClientesActivos(finca_id) {
    return await window._sb.from('clientes_b2b')
      .select('id,razon_social')
      .eq('finca_id', finca_id).eq('activo', true)
      .order('razon_social');
  },
  // Vende una unidad: marca vendida + liga cliente + registra ingreso.
  // Solo aplica si estado='aprobado'. Si 'pendiente', NO toca nada (futuro: bandeja).
  async venderUnidad({finca_id, unidad_id, cliente_id, cliente_nombre, precio_venta, tipo_corte_label, animal_codigo, estado}) {
    if (estado !== 'aprobado') {
      // Persistir la venta propuesta: unidad queda 'pendiente_venta' con cliente y
      // precio guardados; el ingreso se registra al aprobar (en la bandeja).
      const prop = window.Approval ? window.Approval.getPropuestoPor() : {propuesto_por:null, propuesto_por_rol:null};
      const upd = await window._sb.from('unidades_corte').update({
        estado: 'pendiente_venta',
        cliente_id: cliente_id||null,
        precio_venta: Number(precio_venta)||0,
        venta_propuesta_por: prop.propuesto_por,
        venta_propuesta_rol: prop.propuesto_por_rol
      }).eq('id', unidad_id).select().single();
      return { data: { diferido: true, unidad: upd.data }, error: upd.error };
    }
    // 1. Registrar ingreso
    const ing = await window._sb.from('ingresos').insert({
      finca_id, tipo: 'venta_animal',
      descripcion: 'Venta '+(tipo_corte_label||'corte')+(animal_codigo?(' · canal '+animal_codigo):'')+(cliente_nombre?(' · '+cliente_nombre):''),
      valor: Number(precio_venta)||0,
      fecha: new Date().toISOString().split('T')[0],
      cliente: cliente_nombre||null,
      especie: 'ovino', fuente: 'manual'
    }).select().single();
    if (ing.error) return { error: ing.error };
    // 2. Marcar la unidad vendida
    const upd = await window._sb.from('unidades_corte').update({
      estado: 'vendida', cliente_id: cliente_id||null,
      precio_venta: Number(precio_venta)||0,
      fecha_venta: new Date().toISOString(),
      ingreso_id: ing.data.id
    }).eq('id', unidad_id).select().single();
    if (upd.error) return { data: ing.data, error: upd.error };
    return { data: { ingreso: ing.data, unidad: upd.data }, error: null };
  },
  // Vende la canal completa (kg restante) a un cliente, reutilizando venderUnidad.
  async venderCanalCompleta({finca_id, beneficio_id, cliente_id, cliente_nombre, precio_venta, animal_codigo, estado}) {
    // 1. Traer el saldo de la canal
    const b = await window._sb.from('beneficios').select('id,kg_disponible,animal_id').eq('id', beneficio_id).single();
    if (b.error) return { error: b.error };
    const kg = Number(b.data.kg_disponible)||0;
    if (kg <= 0) return { error: { message: 'La canal no tiene kg disponibles.' } };
    // 2. Crear un corte 'canal_completa' + una unidad con todo el kg.
    //    (cortes NO tiene finca_id; se replica el insert real de sacarCorteDeCanal.)
    const corte = await window._sb.from('cortes').insert({
      beneficio_id, animal_id: b.data.animal_id, tipo_corte: 'canal_completa',
      peso_kg: kg, num_unidades: 1, kg_vendidos: 0
    }).select().single();
    if (corte.error) return { error: corte.error };
    const unidad = await window._sb.from('unidades_corte').insert({
      finca_id, corte_id: corte.data.id, beneficio_id, numero: 1, peso_kg: kg,
      estado: 'disponible'
    }).select().single();
    if (unidad.error) return { error: unidad.error };
    // 3. Vender esa unidad por la vía existente (maneja aprobación + ingreso)
    const venta = await this.venderUnidad({
      finca_id, unidad_id: unidad.data.id, cliente_id, cliente_nombre,
      precio_venta, tipo_corte_label: 'Canal completa', animal_codigo, estado
    });
    if (venta.error) return { error: venta.error };
    // 4. Si la venta se aplicó (aprobada), la canal queda en 0 kg.
    if (!(venta.data && venta.data.diferido)) {
      await window._sb.from('beneficios').update({ kg_disponible: 0 }).eq('id', beneficio_id);
    }
    return { data: { diferido: venta.data && venta.data.diferido }, error: null };
  },
  // Vende varias unidades a un cliente reutilizando venderUnidad (1 ingreso por unidad).
  async venderUnidadesACliente({finca_id, cliente_id, cliente_nombre, items, estado}) {
    // items: [{unidad_id, precio_venta, tipo_corte_label, animal_codigo}]
    var resultados = [];
    for (var i=0;i<items.length;i++){
      var it = items[i];
      var r = await this.venderUnidad({
        finca_id, unidad_id: it.unidad_id, cliente_id, cliente_nombre,
        precio_venta: it.precio_venta, tipo_corte_label: it.tipo_corte_label,
        animal_codigo: it.animal_codigo, estado
      });
      resultados.push({ unidad_id: it.unidad_id, error: r.error ? r.error.message : null, diferido: r.data && r.data.diferido });
    }
    return { resultados };
  },
  // Crea un corte + sus unidades y descuenta kg de la canal (transaccional a nivel app)
  async sacarCorteDeCanal({finca_id, beneficio_id, animal_id, tipo_corte, unidades}) {
    // unidades: [{peso_kg}, ...]
    const kgTotal = unidades.reduce((s,u)=> s + (Number(u.peso_kg)||0), 0);
    // 1. crear el corte
    const cRes = await window._sb.from('cortes').insert({
      beneficio_id, animal_id, tipo_corte, peso_kg: kgTotal,
      num_unidades: unidades.length, kg_vendidos: 0
    }).select().single();
    if (cRes.error) return { error: cRes.error };
    const corte = cRes.data;
    // 2. crear las unidades
    const filas = unidades.map((u,i)=>({
      finca_id, corte_id: corte.id, beneficio_id, numero: i+1,
      peso_kg: Number(u.peso_kg)||0, estado: 'disponible'
    }));
    const uRes = await window._sb.from('unidades_corte').insert(filas).select();
    if (uRes.error) return { error: uRes.error };
    // 3. descontar kg de la canal
    const bRes = await window._sb.from('beneficios')
      .select('kg_disponible').eq('id', beneficio_id).single();
    const nuevoDisp = Math.max(0, (Number(bRes.data?.kg_disponible)||0) - kgTotal);
    const upd = await window._sb.from('beneficios')
      .update({ kg_disponible: nuevoDisp }).eq('id', beneficio_id).select().single();
    return { data: { corte, unidades: uRes.data, kg_disponible: nuevoDisp }, error: upd.error };
  },
  async saveEmpaque(e) {
    return await window._sb.from('empaques').insert(e).select().single();
  },
  async getEmpaques(finca_id) {
    return await window._sb.from('empaques')
      .select('*, cortes(tipo_corte), animales(codigo, nombre, raza)')
      .eq('estado', 'disponible')
      .order('fecha_limite_consumo');
  },
  async marcarVendido(empaque_id, cliente, precio) {
    return await window._sb.from('empaques')
      .update({ estado: 'vendido', cliente, precio_venta: precio })
      .eq('id', empaque_id);
  },

  // ── B2B: clientes corporativos, pedidos, cartera ─────
  async getClientesB2B(finca_id) {
    return await window._sb.from('clientes_b2b')
      .select('*')
      .eq('finca_id', finca_id)
      .eq('activo', true)
      .order('razon_social');
  },
  async saveClienteB2B(c) {
    if (c.id) {
      return await window._sb.from('clientes_b2b')
        .update(c).eq('id', c.id).select().single();
    }
    return await window._sb.from('clientes_b2b')
      .insert(c).select().single();
  },
  async getPedidosB2B(finca_id, estado) {
    let q = window._sb.from('pedidos_b2b')
      .select('*, clientes_b2b(razon_social, condicion_pago)')
      .eq('finca_id', finca_id);
    if (estado) q = q.eq('estado', estado);
    return await q.order('fecha_pedido', { ascending: false });
  },
  async savePedidoB2B(p) {
    return await window._sb.from('pedidos_b2b')
      .insert(p).select().single();
  },

  // ── CADENA DE FRÍO ───────────────────────────────────
  async saveCadenaFrio(registro) {
    return await window._sb.from('cadena_frio')
      .insert(registro).select().single();
  },
  async getCadenaFrio(empaque_id) {
    return await window._sb.from('cadena_frio')
      .select('*')
      .eq('empaque_id', empaque_id)
      .order('fecha_hora', { ascending: false });
  },

  // ── METAS OKR ─────────────────────────────────────────
  async getOkrMetas(finca_id) {
    return await window._sb.from('okr_metas')
      .select('*')
      .eq('finca_id', finca_id)
      .order('departamento');
  },
  async saveOkrMetas(rows) {
    return await window._sb.from('okr_metas')
      .upsert(rows, { onConflict: 'finca_id,departamento,clave' })
      .select();
  },

  // ── NUTRICIÓN & ALIMENTACIÓN ─────────────────────────
  async getRaciones(finca_id) {
    return await window._sb.from('raciones_nutricion')
      .select('*')
      .eq('finca_id', finca_id)
      .order('categoria');
  },
  async getRecetasNutricion(finca_id) {
    return await window._sb.from('recetas_nutricion')
      .select('*')
      .eq('finca_id', finca_id)
      .eq('activa', true)
      .order('tipo');
  },
  async getInventarioNutricion(finca_id) {
    return await window._sb.from('inventario_nutricion')
      .select('*')
      .eq('finca_id', finca_id)
      .order('tipo');
  },
  async getRegistrosAlimentacion(finca_id, fecha) {
    let q = window._sb.from('registros_alimentacion')
      .select('*')
      .eq('finca_id', finca_id);
    if (fecha) q = q.eq('fecha', fecha);
    return await q.order('created_at', { ascending: false });
  },
  async saveRegistroAlimentacion(data) {
    // Upsert por lote+fecha: si ya existe, actualizar; si no, insertar
    const finca_id = data.finca_id;
    const lote_id = data.lote_id || null;
    const fecha = data.fecha;
    let existing = null;
    try {
      let q = window._sb.from('registros_alimentacion')
        .select('id').eq('finca_id', finca_id).eq('fecha', fecha);
      q = lote_id ? q.eq('lote_id', lote_id) : q.is('lote_id', null);
      const res = await q.maybeSingle();
      existing = res && res.data;
    } catch (e) { existing = null; }
    if (existing && existing.id) {
      return await window._sb.from('registros_alimentacion')
        .update(data).eq('id', existing.id).select().single();
    }
    return await window._sb.from('registros_alimentacion')
      .insert(data).select().single();
  },
  async updateInventarioStock(id, delta_kg) {
    // Lee el stock actual y suma delta (negativo para consumo)
    const cur = await window._sb.from('inventario_nutricion')
      .select('stock_kg').eq('id', id).single();
    const actual = (cur && cur.data && parseFloat(cur.data.stock_kg)) || 0;
    const nuevo = actual + (parseFloat(delta_kg) || 0);
    return await window._sb.from('inventario_nutricion')
      .update({ stock_kg: nuevo, updated_at: new Date() }).eq('id', id).select().single();
  },
  async saveRaciones(finca_id, raciones) {
    const rows = (raciones || []).map(r => Object.assign({ finca_id: finca_id }, r));
    return await window._sb.from('raciones_nutricion')
      .upsert(rows, { onConflict: 'finca_id,categoria' })
      .select();
  },
  async saveReceta(receta) {
    return await window._sb.from('recetas_nutricion')
      .update({
        nombre: receta.nombre,
        descripcion: receta.descripcion,
        ingredientes: receta.ingredientes,
        updated_at: new Date()
      })
      .eq('id', receta.id).select().single();
  },

  // ── EVIDENCIAS (Supabase Storage · bucket privado 'evidencias') ──
  // Sube un archivo y devuelve una URL firmada con 1 año de validez.
  async uploadEvidencia(file, path) {
    const { data, error } = await window._sb.storage.from('evidencias')
      .upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type });
    if (error) throw error;
    const { data: signed } = await window._sb.storage.from('evidencias')
      .createSignedUrl(path, 365 * 24 * 3600);
    return signed?.signedUrl || null;
  },
  // Regenera una URL firmada (1 año) a partir del path almacenado.
  async getSignedUrl(path) {
    const { data } = await window._sb.storage.from('evidencias')
      .createSignedUrl(path, 365 * 24 * 3600);
    return data?.signedUrl || null;
  },

  // ── COMPRAS DE MEDICAMENTOS (kardex) ─────────────────
  async getComprasMedicamentos(finca_id) {
    return await window._sb.from('compras_medicamentos')
      .select('*').eq('finca_id', finca_id)
      .order('fecha_compra', { ascending: false });
  },
  async saveCompraMedicamento(data) {
    return await window._sb.from('compras_medicamentos')
      .insert(data).select().single();
  },
  async getTratamientosPorMedicamento(finca_id, medicamento_id) {
    return await window._sb.from('tratamientos')
      .select('*').eq('finca_id', finca_id)
      .eq('medicamento_id', medicamento_id)
      .order('fecha_inicio', { ascending: false });
  },

  // ── AUDIT & APROBACIONES ─────────────────────────────

  async logAudit(finca_id, accion, modulo,
                 registro_id, datos_antes, datos_despues,
                 nota) {
    const email = window.AUTH_PERFIL?.email ||
                  window.AUTH_PERFIL?.nombre || 'desconocido';
    const rol = window.AUTH_ROL || 'desconocido';
    return await window._sb.from('audit_log').insert({
      finca_id, timestamp: new Date().toISOString(),
      usuario_email: email, usuario_rol: rol,
      accion, modulo, registro_id,
      datos_antes: datos_antes || null,
      datos_despues: datos_despues || null,
      nota: nota || null
    });
  },

  async getPendingApprovals(finca_id) {
    // Trae todos los registros pendientes de todas las
    // tablas críticas en una sola llamada usando Promise.all
    const [bajas, tratos, pesajes, eventos, beneficios, ventasUnidad, ajustes] =
      await Promise.all([
        window._sb.from('bajas')
          .select('id,animal_id,tipo,causa,fecha,peso_salida,' +
                  'propuesto_por,propuesto_por_rol,' +
                  'datos_clinicos,foto_evidencia_url,created_at,' +
                  'animales(codigo)')
          .eq('finca_id', finca_id)
          .eq('estado_aprobacion', 'pendiente')
          .order('created_at', { ascending: false }),
        window._sb.from('tratamientos')
          .select('id,animal_id,medicamento_id,dosis,unidad,' +
                  'notas,fecha_inicio,propuesto_por,' +
                  'propuesto_por_rol,created_at,' +
                  'animales(codigo),medicamentos(nombre)')
          .eq('finca_id', finca_id)
          .eq('estado_aprobacion', 'pendiente')
          .order('created_at', { ascending: false }),
        window._sb.from('pesajes')
          .select('id,animal_id,peso,fecha,' +
                  'propuesto_por,propuesto_por_rol,' +
                  'created_at,animales(codigo)')
          .eq('finca_id', finca_id)
          .eq('estado_aprobacion', 'pendiente')
          .order('created_at', { ascending: false }),
        window._sb.from('eventos_reproductivos')
          .select('id,hembra_id,tipo,fecha,resultado,notas,' +
                  'propuesto_por,propuesto_por_rol,' +
                  'datos,created_at,animales:hembra_id(codigo)')
          .eq('finca_id', finca_id)
          .eq('estado_aprobacion', 'pendiente')
          .order('created_at', { ascending: false }),
        window._sb.from('beneficios')
          .select('id,animal_id,fecha,peso_canal,peso_vivo_entrada,frigorifico,' +
                  'propuesto_por,propuesto_por_rol,created_at,animales(codigo)')
          .eq('finca_id', finca_id)
          .eq('estado_aprobacion', 'pendiente')
          .order('created_at', { ascending: false }),
        // unidades con venta pendiente
        window._sb.from('unidades_corte')
          .select('id,numero,peso_kg,cliente_id,precio_venta,venta_propuesta_por,venta_propuesta_rol,created_at,cortes(tipo_corte),beneficios(animales(codigo)),clientes_b2b(razon_social)')
          .eq('finca_id', finca_id)
          .eq('estado', 'pendiente_venta')
          .order('created_at', { ascending: false }),
        // ajustes de inventario pendientes
        window._sb.from('ajustes_inventario')
          .select('id,beneficio_id,unidad_id,tipo,causal,kg_antes,kg_despues,propuesto_por,propuesto_por_rol,created_at')
          .eq('finca_id', finca_id)
          .eq('estado_aprobacion', 'pendiente')
          .order('created_at', { ascending: false })
      ]);
    return {
      bajas: bajas.data || [],
      tratamientos: tratos.data || [],
      pesajes: pesajes.data || [],
      eventos: eventos.data || [],
      beneficios: beneficios.data || [],
      ventasUnidad: ventasUnidad.data || [],
      ajustes: ajustes.data || []
    };
  },

  async aprobarRegistro(tabla, id, nota) {
    const email = window.AUTH_PERFIL?.email ||
                  window.AUTH_PERFIL?.nombre || '';
    const { data, error } = await window._sb
      .from(tabla)
      .update({
        estado_aprobacion: 'aprobado',
        aprobado_por: email,
        fecha_aprobacion: new Date().toISOString()
      })
      .eq('id', id)
      .select().single();
    if (!error) {
      await this.logAudit(
        data.finca_id, 'APPROVE', tabla, id,
        null, { estado_aprobacion: 'aprobado' }, nota
      );
    }
    return { data, error };
  },

  async rechazarRegistro(tabla, id, nota_rechazo) {
    const email = window.AUTH_PERFIL?.email ||
                  window.AUTH_PERFIL?.nombre || '';
    const { data, error } = await window._sb
      .from(tabla)
      .update({
        estado_aprobacion: 'rechazado',
        aprobado_por: email,
        fecha_aprobacion: new Date().toISOString(),
        nota_rechazo
      })
      .eq('id', id)
      .select().single();
    if (!error) {
      await this.logAudit(
        data.finca_id, 'REJECT', tabla, id,
        null, { estado_aprobacion: 'rechazado', nota_rechazo },
        nota_rechazo
      );
    }
    return { data, error };
  },

  // Aprobar una venta pendiente: registra ingreso y marca unidad vendida.
  async aprobarVentaUnidad(unidad_id) {
    // Traer la unidad con su info para el ingreso
    const u = await window._sb.from('unidades_corte')
      .select('id,finca_id,precio_venta,cliente_id,peso_kg,cortes(tipo_corte),beneficios(animales(codigo)),clientes_b2b(razon_social)')
      .eq('id', unidad_id).single();
    if (u.error) return { error: u.error };
    const unidad = u.data;
    const tipo = (unidad.cortes && unidad.cortes.tipo_corte) || 'corte';
    const animal = (unidad.beneficios && unidad.beneficios.animales && unidad.beneficios.animales.codigo) || '';
    const cliente = (unidad.clientes_b2b && unidad.clientes_b2b.razon_social) || '';
    // 1. Registrar ingreso
    const ing = await window._sb.from('ingresos').insert({
      finca_id: unidad.finca_id, tipo: 'venta_animal',
      descripcion: 'Venta '+tipo+(animal?(' · canal '+animal):'')+(cliente?(' · '+cliente):''),
      valor: Number(unidad.precio_venta)||0,
      fecha: new Date().toISOString().split('T')[0],
      cliente: cliente||null, especie: 'ovino', fuente: 'manual'
    }).select().single();
    if (ing.error) return { error: ing.error };
    // 2. Marcar unidad vendida
    const upd = await window._sb.from('unidades_corte').update({
      estado: 'vendida', fecha_venta: new Date().toISOString(), ingreso_id: ing.data.id
    }).eq('id', unidad_id).select().single();
    if (!upd.error) await this.logAudit(unidad.finca_id, 'APPROVE', 'unidades_corte', unidad_id, null, {estado:'vendida'}, 'venta aprobada');
    return { data: upd.data, error: upd.error };
  },

  // Rechazar venta pendiente: la unidad vuelve a 'disponible'.
  async rechazarVentaUnidad(unidad_id, nota) {
    const upd = await window._sb.from('unidades_corte').update({
      estado: 'disponible', cliente_id: null, precio_venta: null,
      venta_propuesta_por: null, venta_propuesta_rol: null
    }).eq('id', unidad_id).select().single();
    if (!upd.error) await this.logAudit(upd.data.finca_id, 'REJECT', 'unidades_corte', unidad_id, null, {estado:'disponible'}, nota||'venta rechazada');
    return { data: upd.data, error: upd.error };
  },

  // Aprobar un ajuste de inventario: aplica el efecto diferido.
  async aprobarAjusteInventario(ajuste_id) {
    const a = await window._sb.from('ajustes_inventario').select('*').eq('id', ajuste_id).single();
    if (a.error) return { error: a.error };
    const aj = a.data;
    // Aplicar efecto según tipo
    if (aj.beneficio_id && aj.kg_despues != null) {
      const upd = await window._sb.from('beneficios').update({ kg_disponible: aj.kg_despues }).eq('id', aj.beneficio_id);
      if (upd.error) return { error: upd.error };
    }
    if (aj.unidad_id && aj.tipo === 'descarte') {
      const upd = await window._sb.from('unidades_corte').update({ estado: 'baja', notas: 'BAJA: '+(aj.causal||'descarte') }).eq('id', aj.unidad_id);
      if (upd.error) return { error: upd.error };
    }
    // Marcar el ajuste aprobado
    const email = window.AUTH_PERFIL?.email || window.AUTH_PERFIL?.nombre || '';
    const upd2 = await window._sb.from('ajustes_inventario').update({
      estado_aprobacion: 'aprobado', aprobado_por: email, fecha_aprobacion: new Date().toISOString()
    }).eq('id', ajuste_id).select().single();
    if (!upd2.error) await this.logAudit(aj.finca_id, 'APPROVE', 'ajustes_inventario', ajuste_id, null, {estado_aprobacion:'aprobado'}, 'ajuste aprobado');
    return { data: upd2.data, error: upd2.error };
  },

  async rechazarAjusteInventario(ajuste_id, nota) {
    const email = window.AUTH_PERFIL?.email || window.AUTH_PERFIL?.nombre || '';
    const upd = await window._sb.from('ajustes_inventario').update({
      estado_aprobacion: 'rechazado', aprobado_por: email, fecha_aprobacion: new Date().toISOString(), nota_rechazo: nota||null
    }).eq('id', ajuste_id).select().single();
    if (!upd.error) await this.logAudit(upd.data.finca_id, 'REJECT', 'ajustes_inventario', ajuste_id, null, {estado_aprobacion:'rechazado'}, nota||'ajuste rechazado');
    return { data: upd.data, error: upd.error };
  },

  async getAuditLog(finca_id, limit) {
    return await window._sb.from('audit_log')
      .select('*')
      .eq('finca_id', finca_id)
      .order('timestamp', { ascending: false })
      .limit(limit || 100);
  },

  // Descuenta `cantidad` del stock de un medicamento (medicamentos.stock_actual).
  // Se invoca SOLO al aprobar un tratamiento — nunca al proponer.
  async descontarStockMedicamento(medicamento_id, cantidad) {
    if (!medicamento_id) return { data: null, error: null };
    const cur = await window._sb.from('medicamentos')
      .select('stock_actual').eq('id', medicamento_id).single();
    const actual = (cur && cur.data && parseFloat(cur.data.stock_actual)) || 0;
    const nuevo = Math.max(0, actual - (parseFloat(cantidad) || 0));
    return await window._sb.from('medicamentos')
      .update({ stock_actual: nuevo, updated_at: new Date() })
      .eq('id', medicamento_id).select().single();
  },

  // ── SALA CUNA · crianza artificial (migración 0040) ──────────────────

  // Corderos en crianza artificial. soloActivos=true → solo estado='activo'.
  async getCorderosCrianza(soloActivos = true) {
    let q = window._sb.from('corderos_crianza')
      .select('*, cordero:cordero_id(codigo, nombre, sexo, fecha_nacimiento), madre:madre_id(codigo, nombre), responsable:responsable_default(id, nombre)');
    if (soloActivos) q = q.eq('estado', 'activo');
    return await q.order('fecha_inicio', { ascending: false });
  },
  // datos = { cordero_id, madre_id?, motivo, metodo, peso_inicio_kg?,
  //           responsable_default?, finca_id?, notas? }
  async createCorderoCrianza(datos) {
    return await window._sb.from('corderos_crianza')
      .insert(datos).select().single();
  },

  // Crías activas de una madre que aún no han sido destetadas
  // (fecha_destete IS NULL y peso < 20 kg o sin peso)
  async getCriasNoDestetadas(madreAnimalId) {
    return await window._sb.from('animales')
      .select('id, codigo, nombre, sexo, peso_actual, fecha_nacimiento')
      .eq('madre_id', madreAnimalId)
      .eq('estado', 'activo')
      .is('fecha_destete', null)
      .or('peso_actual.is.null,peso_actual.lt.20');
  },

  // Marca crías como en_sala_cuna y crea su registro en corderos_crianza.
  // FIX 0053: antes los errores se tragaban en silencio (el CHECK de motivo
  // rechazaba 'muerte_madre' y en_sala_cuna no existía), por lo que el toast
  // decía "enviadas" sin haberse creado nada. Ahora devuelve
  // { creados:[ids], errores:[mensajes] } y el caller DEBE revisarlos.
  async enviarCriasASalaCuna(criasIds, motivo, fincaId, madreId) {
    const FINCA = fincaId || 'a1b2c3d4-0000-0000-0000-000000000001';
    const creados = [];
    const errores = [];
    // 1. Marcar en animales (columna creada en 0053)
    const upd = await window._sb.from('animales')
      .update({ en_sala_cuna: true })
      .in('id', criasIds);
    if (upd.error) errores.push('animales.en_sala_cuna: ' + upd.error.message);
    // 2. Crear entrada en corderos_crianza si no tiene una activa
    for (const criaId of criasIds) {
      try {
        const existing = await window._sb.from('corderos_crianza')
          .select('id').eq('cordero_id', criaId).eq('estado', 'activo')
          .maybeSingle();
        if (existing.error) { errores.push(criaId + ': ' + existing.error.message); continue; }
        if (!existing.data) {
          // Peso de ingreso si existe (mejor ml objetivo del protocolo)
          let pesoIni = null;
          try {
            const an = await window._sb.from('animales')
              .select('peso_actual, peso_nacimiento').eq('id', criaId).maybeSingle();
            pesoIni = (an && an.data && (an.data.peso_actual || an.data.peso_nacimiento)) || null;
          } catch (_) {}
          const fechaIni = new Date().toISOString().slice(0, 10);
          const cc = await this.createCorderoCrianza({
            cordero_id: criaId,
            madre_id: madreId || null,
            motivo: motivo || 'muerte_madre',
            finca_id: FINCA,
            fecha_inicio: fechaIni,
            peso_inicio_kg: pesoIni
          });
          if (cc && cc.error) { errores.push(criaId + ': ' + cc.error.message); }
          else if (cc && cc.data) {
            creados.push(cc.data.id);
            // Sin protocolo no aparecen en HOY ni en Tomas pendientes
            try {
              await this.asegurarProtocoloCrianza(cc.data.id, {
                pesoKg: pesoIni || 0,
                fechaInicio: fechaIni,
                diasAdelante: 3
              });
            } catch (pe) {
              errores.push(criaId + ' (protocolo): ' + (pe && pe.message));
            }
          }
        }
      } catch (e) { errores.push(criaId + ': ' + (e && e.message)); }
    }
    if (errores.length) console.error('[DB] enviarCriasASalaCuna errores:', errores);
    return { creados, errores };
  },

  async updateCorderoCrianza(id, cambios) {
    return await window._sb.from('corderos_crianza')
      .update({ ...cambios, updated_at: new Date() })
      .eq('id', id).select().single();
  },

  /**
   * Cierra crianza artificial.
   * motivoCierre: 'destete' | 'prueba' | 'muerte'
   * Schema CHECK: estado ∈ activo|destetado|muerto
   */
  async cerrarCorderoCrianza(id, { motivoCierre = 'destete', fecha = null, notas = null, cordero_id = null } = {}) {
    const hoy = fecha || new Date().toISOString().slice(0, 10);
    const estado = motivoCierre === 'muerte' ? 'muerto' : 'destetado';
    const notaExtra = motivoCierre === 'prueba'
      ? 'Cancelado: prueba / falsa creación (' + hoy + ')'
      : (motivoCierre === 'destete' ? 'Destete sala cuna (' + hoy + ')' : 'Cerrado por muerte (' + hoy + ')');
    const patch = {
      estado,
      fecha_destete: estado === 'destetado' ? hoy : null,
      notas: notas ? (String(notas) + ' · ' + notaExtra) : notaExtra,
      updated_at: new Date()
    };
    const res = await window._sb.from('corderos_crianza')
      .update(patch).eq('id', id).select().single();
    // Flag en animales
    let animalId = cordero_id;
    if (!animalId && res && res.data) animalId = res.data.cordero_id;
    if (animalId) {
      try {
        await window._sb.from('animales').update({ en_sala_cuna: false }).eq('id', animalId);
      } catch (_) {}
    }
    // Cancelar tomas pendientes futuras (no borrar historial)
    try {
      await window._sb.from('tomas_programadas')
        .update({ estado: 'perdida', updated_at: new Date() })
        .eq('corderos_crianza_id', id)
        .eq('estado', 'pendiente')
        .gte('fecha_hora_programada', new Date().toISOString());
    } catch (_) {}
    return res;
  },

  // ── Protocolo de tomas (motor central — usado por Sala Cuna, partos, bajas) ──
  // Día de crianza → horarios + ventana + factor ml (peso*factor/n_tomas)
  planProtocoloPorDia(dia) {
    const d = Number(dia) || 0;
    if (d <= 0) return { horas: [6, 11, 17, 22], ventana: 45, factor: 200, tipo: 'calostro', label: 'Día 0 · calostro/arranque' };
    if (d >= 1 && d <= 3) return { horas: [6, 11, 17, 22], ventana: 45, factor: 200, tipo: 'sustituto', label: 'Días 1–3 · 4 tomas' };
    if (d >= 4 && d <= 7) return { horas: [7, 13, 20], ventana: 60, factor: 220, tipo: 'sustituto', label: 'Días 4–7 · 3 tomas' };
    if (d >= 8 && d <= 14) return { horas: [7, 14, 21], ventana: 60, factor: 240, tipo: 'sustituto', label: 'Días 8–14 · 3 tomas' };
    if (d >= 15 && d <= 28) return { horas: [8, 18], ventana: 90, factor: 220, tipo: 'sustituto', label: 'Días 15–28 · 2 tomas' };
    if (d >= 29 && d <= 56) return { horas: [8], ventana: 120, factor: 200, tipo: 'sustituto', label: 'Días 29–56 · 1 toma (pre-destete)' };
    return null; // post-destete
  },

  _midLocal(d) {
    const x = (d instanceof Date) ? d : new Date(d);
    return new Date(x.getFullYear(), x.getMonth(), x.getDate());
  },

  diaCrianzaEnFecha(fechaInicio, targetDate) {
    const ing = this._midLocal(fechaInicio || new Date());
    const tgt = this._midLocal(targetDate || new Date());
    return Math.floor((tgt - ing) / 86400000);
  },

  /**
   * Genera tomas de un día concreto si aún no existen (idempotente).
   * opts.soloFuturas: si true y es hoy, omite horas ya pasadas (salvo la más cercana).
   */
  async generarProtocoloDia(corderosCrianzaId, pesoKg, fechaInicio, targetDate, opts = {}) {
    const soloFuturas = opts.soloFuturas !== false;
    const peso = (+pesoKg > 0) ? +pesoKg : 0;
    const tgt = this._midLocal(targetDate || new Date());
    const dia = this.diaCrianzaEnFecha(fechaInicio, tgt);
    if (dia > 56) return { data: [], error: null, skipped: 'post_destete' };

    const plan = this.planProtocoloPorDia(Math.max(0, dia));
    if (!plan) return { data: [], error: null, skipped: 'sin_plan' };

    const s = new Date(tgt.getFullYear(), tgt.getMonth(), tgt.getDate(), 0, 0, 0).toISOString();
    const e = new Date(tgt.getFullYear(), tgt.getMonth(), tgt.getDate(), 23, 59, 59, 999).toISOString();
    try {
      const ex = await this.getTomasProgramadasRango({
        corderosCrianzaId: corderosCrianzaId,
        desde: s,
        hasta: e
      });
      if (ex && ex.data && ex.data.length) {
        return { data: [], error: null, skipped: 'ya_existe', existentes: ex.data.length };
      }
    } catch (err) {
      return { data: null, error: err };
    }

    const mlPorToma = peso > 0 ? Math.round(peso * plan.factor / plan.horas.length) : 100;
    const now = Date.now();
    let horas = plan.horas.slice();
    if (soloFuturas) {
      const isToday = this._midLocal(new Date()).getTime() === tgt.getTime();
      if (isToday) {
        const futuras = horas.filter(function (hr) {
          const dt = new Date(tgt.getFullYear(), tgt.getMonth(), tgt.getDate(), hr, 0, 0, 0);
          return dt.getTime() + 30 * 60000 >= now; // margen 30 min
        });
        // Si todas pasaron, deja 1 toma "ahora + 15 min" para no dejar el día vacío
        if (!futuras.length) {
          const dt = new Date(now + 15 * 60000);
          horas = null;
          const tomas = [{
            corderos_crianza_id: corderosCrianzaId,
            fecha_hora_programada: dt.toISOString(),
            ventana_min: plan.ventana,
            cantidad_ml_objetivo: mlPorToma,
            tipo: plan.tipo === 'calostro' && dia <= 0 ? 'calostro' : 'sustituto'
          }];
          return await this.createTomasProgramadas(tomas);
        }
        horas = futuras;
      }
    }

    const tomas = horas.map(function (hr) {
      const dt = new Date(tgt.getFullYear(), tgt.getMonth(), tgt.getDate(), hr, 0, 0, 0);
      return {
        corderos_crianza_id: corderosCrianzaId,
        fecha_hora_programada: dt.toISOString(),
        ventana_min: plan.ventana,
        cantidad_ml_objetivo: mlPorToma,
        tipo: (plan.tipo === 'calostro' && dia <= 0) ? 'calostro' : 'sustituto'
      };
    });
    return await this.createTomasProgramadas(tomas);
  },

  /**
   * Asegura protocolo desde HOY hasta hoy+diasAdelante (idempotente por día).
   * Es lo que hace que el cordero aparezca en HOY → Teteros.
   */
  async asegurarProtocoloCrianza(corderosCrianzaId, { pesoKg = 0, fechaInicio = null, diasAdelante = 3 } = {}) {
    let peso = +pesoKg || 0;
    let fi = fechaInicio;
    if (!fi || !peso) {
      try {
        const r = await window._sb.from('corderos_crianza')
          .select('fecha_inicio, peso_inicio_kg, cordero_id')
          .eq('id', corderosCrianzaId).maybeSingle();
        if (r && r.data) {
          fi = fi || r.data.fecha_inicio;
          if (!peso) peso = +r.data.peso_inicio_kg || 0;
          if (!peso && r.data.cordero_id) {
            const an = await window._sb.from('animales')
              .select('peso_actual').eq('id', r.data.cordero_id).maybeSingle();
            peso = (an && an.data && +an.data.peso_actual) || 0;
          }
        }
      } catch (_) {}
    }
    fi = fi || new Date().toISOString().slice(0, 10);
    const n = Math.max(0, Math.min(14, Number(diasAdelante) || 3));
    const generados = [];
    const saltados = [];
    for (let i = 0; i <= n; i++) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() + i);
      const res = await this.generarProtocoloDia(corderosCrianzaId, peso, fi, d, { soloFuturas: i === 0 });
      if (res && res.skipped) saltados.push({ offset: i, reason: res.skipped });
      else if (res && res.data && res.data.length) generados.push({ offset: i, n: res.data.length });
      else if (res && res.error) saltados.push({ offset: i, reason: res.error.message || 'error' });
    }
    return { generados, saltados, peso, fechaInicio: fi };
  },

  // Compat: 2 días iniciales (día 0 calostro + día 1 sustituto) — partos
  async generarProtocoloInicial(corderosCrianzaId, pesoInicioKg, fechaInicioISO) {
    return await this.asegurarProtocoloCrianza(corderosCrianzaId, {
      pesoKg: pesoInicioKg,
      fechaInicio: fechaInicioISO,
      diasAdelante: 2
    });
  },

  // Eventos de calostro de un cordero, ordenados por fecha_hora ascendente.
  async getEventosCalostro(corderoId) {
    return await window._sb.from('eventos_calostro')
      .select('*')
      .eq('cordero_id', corderoId)
      .order('fecha_hora', { ascending: true });
  },
  // datos = { cordero_id, corderos_crianza_id?, fuente, cantidad_ml,
  //           via, responsable?, observacion? }
  async createEventoCalostro(datos) {
    return await window._sb.from('eventos_calostro')
      .insert(datos).select().single();
  },

  // Tomas programadas pendientes. filtros = { corderosCrianzaId, desde, hasta }.
  async getTomasPendientes(filtros = {}) {
    let q = window._sb.from('tomas_programadas')
      .select('*, responsable:responsable_asignado(id, nombre)')
      .eq('estado', 'pendiente');
    if (filtros.corderosCrianzaId) q = q.eq('corderos_crianza_id', filtros.corderosCrianzaId);
    if (filtros.desde) q = q.gte('fecha_hora_programada', filtros.desde);
    if (filtros.hasta) q = q.lte('fecha_hora_programada', filtros.hasta);
    return await q.order('fecha_hora_programada', { ascending: true });
  },
  // Todas las tomas del rango (cualquier estado) — para numerar DOSIS n/N del día.
  async getTomasProgramadasRango(filtros = {}) {
    let q = window._sb.from('tomas_programadas')
      .select('id, corderos_crianza_id, fecha_hora_programada, cantidad_ml_objetivo, tipo, estado, ventana_min');
    if (filtros.corderosCrianzaId) q = q.eq('corderos_crianza_id', filtros.corderosCrianzaId);
    if (filtros.desde) q = q.gte('fecha_hora_programada', filtros.desde);
    if (filtros.hasta) q = q.lte('fecha_hora_programada', filtros.hasta);
    if (filtros.estado) q = q.eq('estado', filtros.estado);
    return await q.order('fecha_hora_programada', { ascending: true });
  },
  // Tomas pendientes cuya ventana ya venció: (programada + ventana_min) < ahora.
  // La ventana es por fila, así que se filtra en cliente.
  async getTomasVencidas() {
    const { data, error } = await window._sb.from('tomas_programadas')
      .select('*, responsable:responsable_asignado(id, nombre)')
      .eq('estado', 'pendiente')
      .order('fecha_hora_programada', { ascending: true });
    if (error) return { data: null, error };
    const ahora = Date.now();
    const vencidas = (data || []).filter(t => {
      const limite = new Date(t.fecha_hora_programada).getTime() + (Number(t.ventana_min) || 0) * 60000;
      return limite < ahora;
    });
    return { data: vencidas, error: null };
  },
  // Insert en lote de varias tomas (crea el protocolo completo de golpe).
  async createTomasProgramadas(tomasArray) {
    return await window._sb.from('tomas_programadas')
      .insert(tomasArray).select();
  },
  // estado: 'cumplida' | 'perdida'. tomaRealId opcional para enlazar la real.
  async marcarTomaEstado(id, estado, tomaRealId = null) {
    const patch = { estado, updated_at: new Date() };
    if (tomaRealId) patch.toma_real_id = tomaRealId;
    return await window._sb.from('tomas_programadas')
      .update(patch).eq('id', id).select().single();
  },

  // Toma realizada. Online → insert; offline → cola IndexedDB (patrón existente).
  // datos = { corderos_crianza_id, tipo, cantidad_ml, temperatura_ok?,
  //           responsable?, observacion?, finca_id? }
  // NOTA: tomas_realizadas NO tiene columna finca_id (schema 0040). finca_id
  // solo se usa para descontar polvo en inventario_nutricion.
  async createTomaRealizada(datos) {
    const fincaId = datos.finca_id || 'a1b2c3d4-0000-0000-0000-000000000001';
    const payload = {
      corderos_crianza_id: datos.corderos_crianza_id,
      tipo: datos.tipo || 'sustituto',
      cantidad_ml: Number(datos.cantidad_ml) || 0,
      temperatura_ok: datos.temperatura_ok != null ? datos.temperatura_ok : true,
      responsable: datos.responsable || null,
      observacion: datos.observacion || null,
      sincronizado: true
    };
    if (datos.fecha_hora) payload.fecha_hora = datos.fecha_hora;
    const res = await window._sb.from('tomas_realizadas')
      .insert(payload).select().single();
    if (res.error && !navigator.onLine && window.OfflineDB) {
      await window.OfflineDB.encolar({
        tabla: 'tomas_realizadas',
        accion: 'insert',
        datos: payload
      });
      return { data: { ...payload, sincronizado: false }, error: null, offline: true };
    }
    // Descontar polvo (best-effort; no tumba el registro de la toma)
    if (!res.error && res.data) {
      try {
        await this.descontarPolvoTetero({
          finca_id: fincaId,
          tipo: payload.tipo,
          cantidad_ml: payload.cantidad_ml,
          toma_realizada_id: res.data.id,
          corderos_crianza_id: payload.corderos_crianza_id
        });
      } catch (e) {
        console.warn('[DB] descontarPolvoTetero:', e && e.message);
      }
    }
    return res;
  },

  /**
   * Fórmula: g_polvo = ml * (g_polvo_por_litro / 1000).
   * Default provisional 150 g/L si no hay fila en formula_tetero.
   */
  async getFormulaTetero(finca_id, tipo) {
    const t = (tipo === 'calostro') ? 'calostro' : 'sustituto';
    try {
      const r = await window._sb.from('formula_tetero')
        .select('*')
        .eq('finca_id', finca_id)
        .eq('tipo', t)
        .maybeSingle();
      if (r && r.data) return r.data;
    } catch (e) { /* tabla aún no migrada */ }
    return {
      tipo: t,
      ingrediente: t === 'calostro' ? 'Leche en polvo calostro' : 'Leche en polvo sustituto',
      g_polvo_por_litro: 130,
      ml_agua_por_litro: 1000,
      notas: '130 g polvo por cada 1 L de agua (Juan)'
    };
  },

  async descontarPolvoTetero({ finca_id, tipo, cantidad_ml, toma_realizada_id, corderos_crianza_id }) {
    const ml = Number(cantidad_ml) || 0;
    if (ml <= 0) return { data: null, error: null };
    const form = await this.getFormulaTetero(finca_id, tipo);
    // 130 g polvo por 1000 ml de agua → ~0.13 g polvo por ml de tetero entregado
    const gPorL = Number(form.g_polvo_por_litro) || 130;
    const mlAguaBase = Number(form.ml_agua_por_litro) || 1000;
    const gPolvo = Math.round(ml * (gPorL / mlAguaBase) * 1000) / 1000; // gramos
    const kg = gPolvo / 1000;

    // Buscar insumo por nombre
    const inv = await window._sb.from('inventario_nutricion')
      .select('id, ingrediente, stock_kg')
      .eq('finca_id', finca_id)
      .ilike('ingrediente', form.ingrediente)
      .limit(1)
      .maybeSingle();

    let invRow = inv && inv.data;
    // Crear si no existe (migración no corrida o nombre distinto)
    if (!invRow) {
      const ins = await window._sb.from('inventario_nutricion').insert({
        finca_id: finca_id,
        ingrediente: form.ingrediente,
        tipo: 'tetero',
        stock_kg: 0,
        unidad: 'kg',
        kg_por_unidad: 1,
        costo_por_kg: 0,
        stock_minimo_kg: tipo === 'calostro' ? 2 : 5
      }).select().single();
      invRow = ins && ins.data;
    }
    if (invRow && invRow.id) {
      await this.updateInventarioStock(invRow.id, -kg);
    }

    try {
      await window._sb.from('consumo_tetero_insumo').insert({
        finca_id: finca_id,
        toma_realizada_id: toma_realizada_id || null,
        corderos_crianza_id: corderos_crianza_id || null,
        tipo: form.tipo || tipo,
        cantidad_ml: ml,
        g_polvo: gPolvo,
        inventario_id: invRow ? invRow.id : null,
        ingrediente: form.ingrediente
      });
    } catch (e) { /* tabla puede no existir */ }

    return { data: { g_polvo: gPolvo, kg: kg, ingrediente: form.ingrediente }, error: null };
  },

  /**
   * Proyección de agotamiento de leche en polvo (calostro + sustituto).
   * Retorna alertas si quedan < 8 días de stock al ritmo de corderos en crianza.
   */
  async getAlertaLecheTetero(finca_id) {
    const FINCA = finca_id || 'a1b2c3d4-0000-0000-0000-000000000001';
    const alertas = [];
    let nCrias = 0;
    try {
      const cc = await this.getCorderosCrianza(true);
      nCrias = ((cc && cc.data) || []).length;
    } catch (e) { nCrias = 0; }
    if (nCrias <= 0) return { data: [], nCrias: 0, error: null };

    // Estimar ml/día: promedio de tomas realizadas últimos 7d, o default 400 ml/cordero
    let mlDiaTotal = 0;
    try {
      const desde = new Date(Date.now() - 7 * 86400000).toISOString();
      const tr = await window._sb.from('tomas_realizadas')
        .select('cantidad_ml, tipo, fecha_hora')
        .gte('fecha_hora', desde)
        .limit(500);
      const rows = (tr && tr.data) || [];
      if (rows.length) {
        const sum = rows.reduce((s, r) => s + (Number(r.cantidad_ml) || 0), 0);
        const diasObs = Math.max(1, Math.min(7, Math.ceil(rows.length / Math.max(1, nCrias * 3))));
        mlDiaTotal = sum / Math.max(1, Math.min(7, diasObs));
        // Si el promedio es irrealmente bajo, usa default
        if (mlDiaTotal < nCrias * 50) mlDiaTotal = nCrias * 400;
      } else {
        mlDiaTotal = nCrias * 400; // 4 tomas × 100 ml aprox.
      }
    } catch (e) {
      mlDiaTotal = nCrias * 400;
    }

    // Un insumo por tipo; si comparten nombre o hay filas duplicadas, deduplicar.
    const fracciones = [
      { tipo: 'calostro', fraccion: 0.25 },
      { tipo: 'sustituto', fraccion: 0.75 }
    ];
    const vistosIng = {};

    for (const fr of fracciones) {
      const form = await this.getFormulaTetero(FINCA, fr.tipo);
      const ingKey = String(form.ingrediente || fr.tipo).trim().toLowerCase();
      if (vistosIng[ingKey]) continue; // evita banner duplicado del mismo polvo
      vistosIng[ingKey] = true;

      const mlDia = mlDiaTotal * fr.fraccion;
      const gPorL = Number(form.g_polvo_por_litro) || 130;
      const mlAgua = Number(form.ml_agua_por_litro) || 1000;
      const gDia = mlDia * (gPorL / mlAgua);
      const inv = await window._sb.from('inventario_nutricion')
        .select('id, ingrediente, stock_kg, stock_minimo_kg')
        .eq('finca_id', FINCA)
        .ilike('ingrediente', form.ingrediente)
        .limit(1)
        .maybeSingle();
      const stockKg = (inv && inv.data && parseFloat(inv.data.stock_kg)) || 0;
      const stockG = stockKg * 1000;
      const dias = gDia > 0 ? Math.floor(stockG / gDia) : 999;
      const critico = dias < 8 || stockKg <= 0;
      if (critico) {
        alertas.push({
          tipo: fr.tipo,
          ingrediente: form.ingrediente,
          stock_kg: Math.round(stockKg * 1000) / 1000,
          g_dia: Math.round(gDia * 10) / 10,
          ml_dia: Math.round(mlDia),
          dias_restantes: stockKg <= 0 ? 0 : dias,
          n_corderos: nCrias,
          g_polvo_por_litro: form.g_polvo_por_litro,
          urgente: true,
          mensaje: stockKg <= 0
            ? `URGENTE: ${form.ingrediente} SIN STOCK (${nCrias} corderos en tetero)`
            : `URGENTE: ${form.ingrediente} se agota en ~${dias} día(s) (${nCrias} corderos · ~${Math.round(gDia)} g/día)`
        });
      }
    }
    return { data: alertas, nCrias: nCrias, mlDiaTotal: Math.round(mlDiaTotal), error: null };
  },
  async getTomasRealizadas(corderosCrianzaId) {
    return await window._sb.from('tomas_realizadas')
      .select('*, responsable_perfil:responsable(id, nombre)')
      .eq('corderos_crianza_id', corderosCrianzaId)
      .order('fecha_hora', { ascending: false });
  },

  // Pesajes de corderos.
  // datos = { cordero_id, corderos_crianza_id?, fecha?, peso_kg, responsable?, notas? }
  async createPesaje(datos) {
    return await window._sb.from('pesajes_corderos')
      .insert(datos).select().single();
  },
  // Nota: NO se llama getPesajes() para no colisionar con el getPesajes(finca_id,
  // animal_id) existente del módulo de pesajes de animales (misma clave de objeto
  // → la última ganaría y rompería el otro módulo). Por eso getPesajesCordero().
  async getPesajesCordero(corderoId) {
    return await window._sb.from('pesajes_corderos')
      .select('*')
      .eq('cordero_id', corderoId)
      .order('fecha', { ascending: false });
  },
  // Ganancia media diaria (kg/día): (peso_actual - peso_inicio) / días.
  // Retorna null si hay menos de 2 pesajes. Devuelve el número directamente.
  async calcularGMD(corderoId) {
    const { data, error } = await window._sb.from('pesajes_corderos')
      .select('peso_kg, fecha')
      .eq('cordero_id', corderoId)
      .order('fecha', { ascending: true });
    if (error || !data || data.length < 2) return null;
    const primero = data[0];
    const ultimo = data[data.length - 1];
    const dias = (new Date(ultimo.fecha) - new Date(primero.fecha)) / 86400000;
    if (!dias || dias <= 0) return null;
    const gmd = (Number(ultimo.peso_kg) - Number(primero.peso_kg)) / dias;
    return Math.round(gmd * 1000) / 1000;
  },
  // Calostro total (ml) recibido en las primeras 24h desde el primer evento.
  // Devuelve el número directamente (0 si no hay eventos).
  async getCalostroTotal24h(corderoId) {
    const { data, error } = await window._sb.from('eventos_calostro')
      .select('cantidad_ml, fecha_hora')
      .eq('cordero_id', corderoId)
      .order('fecha_hora', { ascending: true });
    if (error || !data || !data.length) return 0;
    const inicio = new Date(data[0].fecha_hora).getTime();
    const corte = inicio + 24 * 3600 * 1000;
    return data
      .filter(e => new Date(e.fecha_hora).getTime() <= corte)
      .reduce((sum, e) => sum + (Number(e.cantidad_ml) || 0), 0);
  },

  // ── LECHE / LACTANCIAS (migración 0042) ──────────────────────────────

  // Lactancias con animal y sus controles embebidos (para último control +
  // sparkline). soloActivas=true → solo estado='activa'.
  async getLactancias(soloActivas = true) {
    let q = window._sb.from('lactancias')
      .select('*, animal:animal_id(codigo, nombre, raza), controles:controles_lecheros(id, fecha, leche_dia_l, grasa_pct, proteina_pct, caseina_pct, rcs)');
    if (soloActivas) q = q.eq('estado', 'activa');
    const res = await q.order('fecha_parto', { ascending: false });
    // Ordenar los controles embebidos por fecha ASC en cada lactancia
    if (res.data) res.data.forEach(l => {
      if (Array.isArray(l.controles)) l.controles.sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
    });
    return res;
  },
  // Una lactancia con TODOS sus controles, ordenados por fecha ASC.
  async getLactancia(id) {
    const res = await window._sb.from('lactancias')
      .select('*, animal:animal_id(codigo, nombre, raza), controles:controles_lecheros(*)')
      .eq('id', id).single();
    if (res.data && Array.isArray(res.data.controles)) {
      res.data.controles.sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
    }
    return res;
  },
  // datos = { animal_id, parto_id?, finca_id?, fecha_parto, destino?, notas? }
  async createLactancia(datos) {
    return await window._sb.from('lactancias')
      .insert({ ...datos, finca_id: datos.finca_id || 'a1b2c3d4-0000-0000-0000-000000000001' })
      .select().single();
  },
  async updateLactancia(id, cambios) {
    return await window._sb.from('lactancias')
      .update({ ...cambios, updated_at: new Date() })
      .eq('id', id).select().single();
  },
  // datos = { lactancia_id, fecha?, leche_dia_l, n_ordenos_dia?, grasa_pct?,
  //           proteina_pct?, caseina_pct?, lactosa_pct?, solidos_pct?, rcs?,
  //           ufc?, ph?, notas?, capturado_por? }
  async createControlLechero(datos) {
    return await window._sb.from('controles_lecheros')
      .insert(datos).select().single();
  },
  // Todos los controles de una lactancia, fecha ASC (para la curva).
  async getControlesLecheros(lactanciaId) {
    return await window._sb.from('controles_lecheros')
      .select('*')
      .eq('lactancia_id', lactanciaId)
      .order('fecha', { ascending: true });
  },
  // datos = { fecha?, leche_total_l, n_ovejas_ordenadas?, lote_id?, responsable?, notas? }
  async createOrdeno(datos) {
    return await window._sb.from('ordenos')
      .insert(datos).select().single();
  },
  // Últimos N ordeños del rebaño, fecha DESC.
  async getOrdenos(limite = 30) {
    return await window._sb.from('ordenos')
      .select('*')
      .order('fecha', { ascending: false })
      .limit(limite);
  },

  // ── Cálculos de lactancia (en cliente; devuelven el valor directo) ──

  // Suma de leche_dia_l de todos los controles de la lactancia.
  async calcularLecheTotal(lactanciaId) {
    const cr = await this.getControlesLecheros(lactanciaId);
    const controles = (cr && cr.data) || [];
    const total = controles.reduce((s, c) => s + (Number(c.leche_dia_l) || 0), 0);
    return Math.round(total * 100) / 100;
  },
  // { pico_l, dia_al_pico, persistencia_pct }. null si < 3 controles.
  async calcularPicoPersistencia(lactanciaId) {
    const cr = await this.getControlesLecheros(lactanciaId);
    const controles = (cr && cr.data) || [];   // ya viene fecha ASC
    if (controles.length < 3) return null;
    let picoVal = 0, picoFecha = controles[0].fecha;
    controles.forEach(c => { const v = Number(c.leche_dia_l) || 0; if (v > picoVal) { picoVal = v; picoFecha = c.fecha; } });
    const lr = await window._sb.from('lactancias').select('fecha_parto').eq('id', lactanciaId).single();
    const fp = lr && lr.data && lr.data.fecha_parto;
    const dia_al_pico = fp ? Math.round((new Date(picoFecha) - new Date(fp)) / 86400000) : null;
    // persistencia: promedio de la segunda mitad vs el pico
    const mitad = Math.floor(controles.length / 2);
    const segunda = controles.slice(mitad);
    const promSegunda = segunda.reduce((s, c) => s + (Number(c.leche_dia_l) || 0), 0) / segunda.length;
    const persistencia_pct = picoVal > 0 ? Math.round((promSegunda / picoVal) * 100) : null;
    return { pico_l: Math.round(picoVal * 100) / 100, dia_al_pico, persistencia_pct };
  },
  // { rendimiento_l_kg, fuente }. Usa grasa+caseína del último control si existen.
  async rendimientoQueseroTeorico(lactanciaId) {
    const cr = await this.getControlesLecheros(lactanciaId);
    const controles = (cr && cr.data) || [];
    const ult = controles.length ? controles[controles.length - 1] : null;
    const grasa = ult && ult.grasa_pct != null ? Number(ult.grasa_pct) : null;
    const caseina = ult && ult.caseina_pct != null ? Number(ult.caseina_pct) : null;
    const denom = (grasa || 0) * 1.2 + (caseina || 0) * 2.0;
    if (grasa != null && caseina != null && denom > 0) {
      return { rendimiento_l_kg: Math.round((100 / denom) * 100) / 100, fuente: 'calculado' };
    }
    return { rendimiento_l_kg: 3.9, fuente: 'referencia' };
  },

  // ── QUESERÍA (migración 0043) ────────────────────────────────────────

  // Últimos N lotes de queso, fecha DESC.
  async getQuesosLotes(limite = 50) {
    return await window._sb.from('quesos_lotes')
      .select('*')
      .order('fecha', { ascending: false })
      .limit(limite);
  },
  async getQuesoLote(id) {
    return await window._sb.from('quesos_lotes').select('*').eq('id', id).single();
  },
  // datos = { fecha?, tipo_queso, leche_usada_l, queso_kg, maduracion_dias?,
  //           costo_leche?, costo_insumos?, costo_mano_obra?, precio_venta_kg?,
  //           rendimiento_teorico_l_por_kg?, lote_pastoreo_id?, responsable?,
  //           notas?, finca_id? }
  // rendimiento_l_por_kg / costo_total / ingreso_total los calcula la BD.
  async createQuesoLote(datos) {
    return await window._sb.from('quesos_lotes')
      .insert({ ...datos, finca_id: datos.finca_id || 'a1b2c3d4-0000-0000-0000-000000000001' })
      .select().single();
  },
  async updateQuesoLote(id, cambios) {
    return await window._sb.from('quesos_lotes')
      .update({ ...cambios, updated_at: new Date() })
      .eq('id', id).select().single();
  },
  // Rendimiento quesero teórico (L de leche por kg de queso) desde composición.
  // composicionPromedio = { grasa_pct, caseina_pct }. Devuelve el objeto directo.
  async calcularRendimientoTeorico(litros, composicionPromedio) {
    const comp = composicionPromedio || {};
    const grasa = comp.grasa_pct != null ? Number(comp.grasa_pct) : null;
    const caseina = comp.caseina_pct != null ? Number(comp.caseina_pct) : null;
    const denom = (grasa || 0) * 1.2 + (caseina || 0) * 2.0;
    if (grasa != null && caseina != null && denom > 0) {
      return { rendimiento_l_kg: Math.round((100 / denom) * 100) / 100, fuente: 'calculado', eficiencia_pct: null };
    }
    return { rendimiento_l_kg: 3.9, fuente: 'referencia', eficiencia_pct: null };
  },
  // Agrega los últimos N meses de quesos_lotes.
  async getResumenQueseria(meses = 3) {
    const desde = new Date();
    desde.setMonth(desde.getMonth() - meses);
    const desdeISO = desde.toISOString().split('T')[0];
    const { data, error } = await window._sb.from('quesos_lotes')
      .select('*')
      .gte('fecha', desdeISO)
      .order('fecha', { ascending: false });
    if (error) return { data: null, error };
    const lotes = data || [];
    let total_leche_l = 0, total_queso_kg = 0, costo_total = 0, ingreso_total = 0;
    let sumaRendReal = 0, nRendReal = 0, sumaRendTeo = 0, nRendTeo = 0;
    const lotes_por_tipo = {};
    lotes.forEach(l => {
      total_leche_l += Number(l.leche_usada_l) || 0;
      total_queso_kg += Number(l.queso_kg) || 0;
      costo_total += Number(l.costo_total) || 0;
      ingreso_total += Number(l.ingreso_total) || 0;
      if (l.rendimiento_l_por_kg != null) { sumaRendReal += Number(l.rendimiento_l_por_kg); nRendReal++; }
      if (l.rendimiento_teorico_l_por_kg != null) { sumaRendTeo += Number(l.rendimiento_teorico_l_por_kg); nRendTeo++; }
      const t = l.tipo_queso || 'otro';
      lotes_por_tipo[t] = (lotes_por_tipo[t] || 0) + 1;
    });
    return {
      data: {
        total_leche_l: Math.round(total_leche_l * 100) / 100,
        total_queso_kg: Math.round(total_queso_kg * 1000) / 1000,
        rendimiento_promedio_real: nRendReal ? Math.round((sumaRendReal / nRendReal) * 100) / 100 : null,
        rendimiento_promedio_teorico: nRendTeo ? Math.round((sumaRendTeo / nRendTeo) * 100) / 100 : null,
        margen_total_cop: Math.round(ingreso_total - costo_total),
        lotes_por_tipo
      },
      error: null
    };
  },

  // ── EVALUACIONES MATERNAS / SCORE (migración 0044) ───────────────────

  async getEvaluacionesMaternas(animalId) {
    return await window._sb.from('evaluaciones_maternas')
      .select('*')
      .eq('animal_id', animalId)
      .order('fecha', { ascending: false });
  },
  // datos = { animal_id, lactancia_id?, fecha?, acepto_corderos,
  //           leche_suficiente, mastitis, corderos_nacidos,
  //           corderos_destetados_vivos, observacion?, evaluado_por? }
  async createEvaluacionMaterna(datos) {
    const res = await window._sb.from('evaluaciones_maternas')
      .insert(datos).select().single();
    if (!res.error && datos.animal_id) {
      try { await this.recalcularScoreMaterno(datos.animal_id); } catch (e) { /* no romper el insert */ }
    }
    return res;
  },
  // Recalcula score 0-100 + candidata_descarte + motivo, y lo graba en animales.
  async recalcularScoreMaterno(animalId) {
    const ev = await this.getEvaluacionesMaternas(animalId);
    const evals = (ev && ev.data) || [];
    let score = 100;
    let nRechazo = 0, nMastitis = 0;
    let sumSurv = 0, nSurv = 0;
    evals.forEach(e => {
      // Penalizaciones
      if (e.acepto_corderos === false) { score -= 20; nRechazo++; }
      if (e.mastitis === true) { score -= 15; nMastitis++; }
      if (e.leche_suficiente === false) score -= 8;
      const nac = Number(e.corderos_nacidos) || 0;
      const dest = Number(e.corderos_destetados_vivos) || 0;
      const surv = nac > 0 ? (dest / nac) : null;
      if (surv != null) {
        sumSurv += surv; nSurv++;
        if (surv < 0.5) score -= 12;
        else if (surv < 0.8) score -= 5;
        // Bonificaciones
        if (surv >= 1) score += 5;
      }
      if (e.acepto_corderos === true && e.leche_suficiente === true) score += 3;
    });
    score = Math.max(0, Math.min(100, score));
    const promSurv = nSurv ? (sumSurv / nSurv) : null;

    // Criterios de descarte (≥1 activa la candidatura)
    const motivos = [];
    if (score < 40) motivos.push('Score ' + score + '/100');
    if (nRechazo >= 2) motivos.push('Rechazo reiterado (' + nRechazo + ' episodios)');
    if (nMastitis >= 3) motivos.push('Mastitis crónica (' + nMastitis + ' episodios)');
    if (nSurv >= 2 && promSurv != null && promSurv < 0.5) motivos.push('Baja supervivencia (' + Math.round(promSurv * 100) + '%)');
    const candidata = motivos.length > 0;
    const motivo = candidata ? motivos.join('; ') : null;

    // Solo poner fecha_flag_descarte cuando se ACTIVA (si ya estaba flaggeada, no
    // pisar la fecha original; si se desactiva, limpiar).
    let fechaFlag;
    if (candidata) {
      const cur = await window._sb.from('animales')
        .select('candidata_descarte, fecha_flag_descarte').eq('id', animalId).single();
      const yaFlag = cur && cur.data && cur.data.candidata_descarte;
      fechaFlag = yaFlag && cur.data.fecha_flag_descarte
        ? cur.data.fecha_flag_descarte
        : new Date().toISOString().split('T')[0];
    } else {
      fechaFlag = null;
    }

    await window._sb.from('animales').update({
      score_materno: score,
      candidata_descarte: candidata,
      motivo_descarte: motivo,
      fecha_flag_descarte: fechaFlag,
      updated_at: new Date()
    }).eq('id', animalId);

    return { score, candidata_descarte: candidata, motivo_descarte: motivo };
  },
  // Ovejas marcadas candidatas a descarte, peores primero.
  async getCandidatasDescarte() {
    return await window._sb.from('animales')
      .select('id, codigo, nombre, raza, sexo, estado, score_materno, candidata_descarte, motivo_descarte, fecha_flag_descarte')
      .eq('candidata_descarte', true)
      .order('score_materno', { ascending: true });
  },
  // Resumen para la ficha de la oveja.
  async getEvaluacionesResumen(animalId) {
    const ev = await this.getEvaluacionesMaternas(animalId);
    const evals = (ev && ev.data) || [];
    let nRechazo = 0, nMastitis = 0, sumSurv = 0, nSurv = 0;
    evals.forEach(e => {
      if (e.acepto_corderos === false) nRechazo++;
      if (e.mastitis === true) nMastitis++;
      const nac = Number(e.corderos_nacidos) || 0;
      if (nac > 0) { sumSurv += (Number(e.corderos_destetados_vivos) || 0) / nac; nSurv++; }
    });
    const an = await window._sb.from('animales')
      .select('score_materno, candidata_descarte').eq('id', animalId).single();
    return {
      total_partos_evaluados: evals.length,
      episodios_rechazo: nRechazo,
      episodios_mastitis: nMastitis,
      promedio_supervivencia_pct: nSurv ? Math.round((sumSurv / nSurv) * 100) : null,
      score_actual: an && an.data ? an.data.score_materno : null,
      candidata: an && an.data ? !!an.data.candidata_descarte : false
    };
  },

  // ── PARTOS (migración 0047) ──────────────────────────────────────────

  async getPartos(finca_id, limite = 50) {
    return await window._sb.from('partos')
      .select('*, madre:madre_id(codigo, nombre, raza), padre:padre_id(codigo, nombre), corderos_nacidos(*)')
      .eq('finca_id', finca_id)
      .order('fecha_parto', { ascending: false })
      .limit(limite);
  },
  async getParto(id) {
    return await window._sb.from('partos')
      .select('*, madre:madre_id(codigo, nombre, raza), padre:padre_id(codigo, nombre), corderos_nacidos(*)')
      .eq('id', id).single();
  },
  async getPartosPorAnimal(animalId) {
    return await window._sb.from('partos')
      .select('*, padre:padre_id(codigo, nombre), corderos_nacidos(*, cria:animal_id(id, codigo, sexo, peso_actual, estado, fecha_nacimiento))')
      .eq('madre_id', animalId)
      .order('fecha_parto', { ascending: false });
  },
  // Flujo completo: parto → corderos_nacidos → (sala cuna) → lactancia.
  // datosParto = { madre_id, padre_id?, fecha_parto, tipo_parto,
  //   num_corderos_nacidos, num_corderos_vivos, estado_madre,
  //   complicaciones?, responsable?, finca_id?, notas? }
  // corderos = [{ sexo, peso_nacimiento_kg?, estado_al_nacer, destino_crianza, notas?, animal_id? }]
  // v2 - fixed _animal_ids exclusion from INSERT
  async createParto(datosParto, corderos) {
    const FINCA = datosParto.finca_id || 'a1b2c3d4-0000-0000-0000-000000000001';
    // Destructure internal fields that should NOT go to Supabase
    const { _animal_ids: _aids, finca_id: _fid, ...partoInsert } = datosParto;
    // 1. INSERT parto
    const pr = await window._sb.from('partos')
      .insert({ ...partoInsert, finca_id: FINCA }).select().single();
    if (pr.error) { console.error('[DB] createParto INSERT error:', pr.error); return { error: pr.error }; }
    const parto = pr.data;
    // 2. INSERT corderos_nacidos
    const filas = (corderos || []).map(c => ({
      parto_id: parto.id,
      animal_id: c.animal_id || null,
      sexo: c.sexo || 'H',
      peso_nacimiento_kg: (c.peso_nacimiento_kg != null && c.peso_nacimiento_kg !== '') ? c.peso_nacimiento_kg : null,
      estado_al_nacer: c.estado_al_nacer || 'vivo',
      destino_crianza: c.destino_crianza || 'pie_madre',
      notas: c.notas || null
    }));
    let nacidos = [];
    if (filas.length) {
      const cnr = await window._sb.from('corderos_nacidos').insert(filas).select();
      // Link animal_ids if provided (set by saveParto after creating each cría as an animal)
      if(cnr && cnr.data && _aids && _aids.length) {
        for(let i=0; i<cnr.data.length && i<_aids.length; i++){
          if(_aids[i]) {
            await window._sb.from('corderos_nacidos').update({animal_id: _aids[i]}).eq('id', cnr.data[i].id);
          }
        }
      }
      nacidos = (cnr && cnr.data) || [];
    }
    // 3. Crianza artificial para destino != pie_madre (y cordero no muerto)
    let crianzas_creadas = 0;
    for (let i = 0; i < nacidos.length; i++) {
      const cn = nacidos[i];
      if (cn.destino_crianza && cn.destino_crianza !== 'pie_madre' && cn.estado_al_nacer !== 'muerto') {
        try {
          const cc = await this.createCorderoCrianza({
            cordero_id: cn.animal_id || null,
            parto_id: parto.id,
            madre_id: datosParto.madre_id,
            motivo: cn.destino_crianza,
            peso_inicio_kg: cn.peso_nacimiento_kg != null ? cn.peso_nacimiento_kg : null,
            finca_id: FINCA,
            fecha_inicio: datosParto.fecha_parto
          });
          if (cc && cc.data) {
            crianzas_creadas++;
            await window._sb.from('corderos_nacidos')
              .update({ corderos_crianza_id: cc.data.id }).eq('id', cn.id);
            // Protocolo de tomas (motor en DB; fallback a window si hay override en sala-cuna)
            try {
              if (typeof this.generarProtocoloInicial === 'function') {
                await this.generarProtocoloInicial(cc.data.id, cn.peso_nacimiento_kg || 0, datosParto.fecha_parto);
              } else if (typeof window.generarProtocoloInicial === 'function') {
                await window.generarProtocoloInicial(cc.data.id, cn.peso_nacimiento_kg || 0, datosParto.fecha_parto);
              }
            } catch (e) { console.warn('[DB] protocolo parto:', e && e.message); }
          }
        } catch (e) { /* continuar con los demás corderos */ }
      }
    }
    // 4. Lactancia de la madre (enlazar la activa o crear una nueva)
    let lactancia_id = null;
    try {
      const lr = await this.getLactancias(true);
      const lact = ((lr && lr.data) || []).find(l => l.animal_id === datosParto.madre_id);
      if (lact) { await this.updateLactancia(lact.id, { parto_id: parto.id }); lactancia_id = lact.id; }
      else {
        const nl = await this.createLactancia({
          animal_id: datosParto.madre_id, parto_id: parto.id,
          fecha_parto: datosParto.fecha_parto, finca_id: FINCA, destino: 'cria_natural'
        });
        lactancia_id = (nl && nl.data) ? nl.data.id : null;
      }
    } catch (e) {}
    return { parto, corderos_nacidos: nacidos, crianzas_creadas, lactancia_id };
  },
  // Cambia el destino de un cordero nacido; si pasa a crianza, crea su registro.
  async updateCorderoDestino(corderosNacidosId, destino, animalId) {
    const patch = { destino_crianza: destino };
    if (animalId) patch.animal_id = animalId;
    const upd = await window._sb.from('corderos_nacidos')
      .update(patch).eq('id', corderosNacidosId)
      .select('*, partos(madre_id, fecha_parto, finca_id)').single();
    if (upd.error) return upd;
    const cn = upd.data;
    if (destino && destino !== 'pie_madre' && !cn.corderos_crianza_id) {
      const p = cn.partos || {};
      const cc = await this.createCorderoCrianza({
        cordero_id: cn.animal_id || null, parto_id: cn.parto_id, madre_id: p.madre_id,
        motivo: destino, peso_inicio_kg: cn.peso_nacimiento_kg,
        finca_id: p.finca_id || 'a1b2c3d4-0000-0000-0000-000000000001', fecha_inicio: p.fecha_parto
      });
      if (cc && cc.data) {
        await window._sb.from('corderos_nacidos').update({ corderos_crianza_id: cc.data.id }).eq('id', corderosNacidosId);
        try {
          if (typeof this.generarProtocoloInicial === 'function') {
            await this.generarProtocoloInicial(cc.data.id, cn.peso_nacimiento_kg || 0, p.fecha_parto);
          } else if (typeof window.generarProtocoloInicial === 'function') {
            await window.generarProtocoloInicial(cc.data.id, cn.peso_nacimiento_kg || 0, p.fecha_parto);
          }
        } catch (e) { console.warn('[DB] protocolo crianza:', e && e.message); }
      }
    }
    return upd;
  },

  // ── DOSIS PROGRAMADAS (tratamientos multi-dosis · migración 0048) ────
  async crearDosisProgramadas(tratamientoId, animalId, fechaInicio, totalDias, fincaId) {
    var total = parseInt(totalDias, 10) || 1;
    if (total <= 1) return { data: [], error: null };   // dosis única → sin agenda
    var FINCA = fincaId || 'a1b2c3d4-0000-0000-0000-000000000001';
    var base = new Date((fechaInicio || new Date().toISOString().slice(0,10)) + 'T00:00:00');
    var filas = [];
    for (var i = 1; i <= total; i++) {
      var d = new Date(base.getTime() + (i - 1) * 86400000);
      filas.push({
        tratamiento_id: String(tratamientoId),
        animal_id: animalId || null,
        numero_dosis: i,
        total_dosis: total,
        fecha_programada: d.toISOString().slice(0, 10),
        hora_objetivo: '08:00',
        estado: 'pendiente',
        finca_id: FINCA
      });
    }
    return await window._sb.from('dosis_programadas').insert(filas).select();
  },
  // ── SEGUIMIENTOS POST-TRATAMIENTO (migración 0053) ────────────────────
  // Días configurables en fincas.config.dias_seguimiento_tratamiento
  // (default [3,5,7,15,30]). Cada tratamiento genera N chequeos que
  // aparecen en HOY preguntando cómo sigue el animal.
  _diasSeguimientoConfig() {
    try {
      var cfg = (window.AppState && window.AppState.finca && window.AppState.finca.config) || {};
      var d = cfg.dias_seguimiento_tratamiento;
      if (Array.isArray(d) && d.length) {
        return d.map(function (x) { return parseInt(x, 10); })
                .filter(function (x) { return x > 0; })
                .sort(function (a, b) { return a - b; });
      }
    } catch (e) { }
    return [3, 5, 7, 15, 30];
  },
  async crearSeguimientosTratamiento(tratamientoId, animalId, fechaInicio, fincaId, medicamentoNombre, dias) {
    var lista = (Array.isArray(dias) && dias.length) ? dias : this._diasSeguimientoConfig();
    if (!lista.length) return { data: [], error: null };
    var FINCA = fincaId || 'a1b2c3d4-0000-0000-0000-000000000001';
    var base = new Date((fechaInicio || new Date().toISOString().slice(0, 10)) + 'T00:00:00');
    var filas = lista.map(function (dia) {
      var d = new Date(base.getTime() + dia * 86400000);
      return {
        tratamiento_id: String(tratamientoId),
        animal_id: animalId || null,
        medicamento_nombre: medicamentoNombre || null,
        dia_seguimiento: dia,
        fecha_programada: d.toISOString().slice(0, 10),
        estado: 'pendiente',
        finca_id: FINCA
      };
    });
    return await window._sb.from('seguimientos_tratamiento').insert(filas).select();
  },
  async getSeguimientosPendientesHoy(fincaId) {
    var hoy = new Date().toISOString().slice(0, 10);
    var q = window._sb.from('seguimientos_tratamiento')
      .select('*, animales(codigo, nombre, estado)')
      .eq('estado', 'pendiente')
      .lte('fecha_programada', hoy);
    if (fincaId) q = q.eq('finca_id', fincaId);
    return await q.order('fecha_programada', { ascending: true });
  },
  async responderSeguimiento(id, respuesta, observacion, respondidoPor) {
    return await window._sb.from('seguimientos_tratamiento').update({
      estado: 'respondido',
      respuesta: respuesta,
      observacion: observacion || null,
      respondido_por: respondidoPor || null,
      fecha_respuesta: new Date().toISOString()
    }).eq('id', id).select().single();
  },
  // Cierra los seguimientos futuros de un animal (p. ej. si murió).
  async omitirSeguimientosAnimal(animalId, motivo) {
    return await window._sb.from('seguimientos_tratamiento')
      .update({ estado: 'omitido', observacion: motivo || 'Cerrado automáticamente' })
      .eq('animal_id', animalId).eq('estado', 'pendiente');
  },

  async getDosisPendientesHoy(fincaId) {
    var hoy = new Date().toISOString().slice(0, 10);
    var q = window._sb.from('dosis_programadas')
      .select('*, animales(codigo, nombre, peso_actual)')
      .eq('estado', 'pendiente')
      .lte('fecha_programada', hoy);
    if (fincaId) q = q.eq('finca_id', fincaId);
    const res = await q.order('fecha_programada', { ascending: true });
    if (res.error || !res.data || !res.data.length) return res;

    // Enriquecer con nombre de medicamento y dosis sugerida (tratamiento_id es text, sin FK).
    const ids = [...new Set(res.data.map(d => d.tratamiento_id).filter(Boolean))];
    const medByTrat = {};
    try {
      // Intentamos cast uuid: solo filas con id uuid válido en tratamientos
      const { data: trts } = await window._sb
        .from('tratamientos')
        .select('id, medicamento_id, dosis_aplicada, medicamentos(nombre, dosis_sugerida, dosis_estandar, principio_activo, unidad, dias_retiro)')
        .in('id', ids);
      (trts || []).forEach(t => {
        const m = t.medicamentos || {};
        medByTrat[t.id] = {
          medicamento_nombre: m.nombre || null,
          dosis_sugerida: m.dosis_sugerida || m.dosis_estandar || t.dosis_aplicada || null,
          principio_activo: m.principio_activo || null,
          unidad_med: m.unidad || null,
          dias_retiro: m.dias_retiro != null ? m.dias_retiro : null
        };
      });
    } catch (e) { /* best-effort */ }

    // Si no hubo match por id (ids locales AppData), intentar por columna texto en tratamientos si existe
    res.data = res.data.map(d => {
      const extra = medByTrat[d.tratamiento_id] || {};
      return Object.assign({}, d, extra);
    });
    return res;
  },
  async registrarDosis(dosisId, datos) {
    datos = datos || {};
    return await window._sb.from('dosis_programadas').update({
      estado: 'aplicada',
      fecha_hora_aplicacion: new Date().toISOString(),
      dosis_aplicada: datos.dosis_aplicada || null,
      colaborador: datos.colaborador || null,
      foto_url: datos.foto_url || null,
      observacion: datos.observacion || null,
      updated_at: new Date()
    }).eq('id', dosisId).select().single();
  },
  async saltarDosis(dosisId, observacion) {
    return await window._sb.from('dosis_programadas').update({
      estado: 'saltada',
      observacion: observacion || null,
      fecha_hora_aplicacion: new Date().toISOString(),
      updated_at: new Date()
    }).eq('id', dosisId).select().single();
  },
  async getDosisPorTratamiento(tratamientoId) {
    return await window._sb.from('dosis_programadas')
      .select('*')
      .eq('tratamiento_id', String(tratamientoId))
      .order('numero_dosis', { ascending: true });
  },

  // Tratamientos cuya última dosis se aplicó HOY (medicamento recién terminado).
  async getMedicamentosTerminadosHoy(finca_id) {
    const hoy = new Date().toISOString().split('T')[0];
    // dosis aplicadas hoy que son la última (numero_dosis = total_dosis)
    const d = await window._sb.from('dosis_programadas')
      .select('tratamiento_id,numero_dosis,total_dosis,fecha_hora_aplicacion,estado')
      .eq('finca_id', finca_id).eq('estado','aplicada');
    if (d.error) return { data: [], error: d.error };
    const terminadosHoy = (d.data||[]).filter(x =>
      x.numero_dosis === x.total_dosis &&
      x.fecha_hora_aplicacion && x.fecha_hora_aplicacion.split('T')[0] === hoy
    );
    const tratIds = [...new Set(terminadosHoy.map(x=>x.tratamiento_id))];
    if (!tratIds.length) return { data: [], error: null };
    const t = await window._sb.from('tratamientos')
      .select('id,medicamento_nombre,fecha_fin_retiro,dias_retiro,animal_id,animales(codigo)')
      .in('id', tratIds);
    return { data: t.data || [], error: t.error };
  },

  // Tratamientos cuyo retiro ya se cumplió y siguen en_retiro (carne apta).
  async getRetiroCumplido(finca_id) {
    const hoy = new Date().toISOString().split('T')[0];
    const r = await window._sb.from('tratamientos')
      .select('id,medicamento_nombre,fecha_fin_retiro,animal_id,animales(codigo,estado)')
      .eq('finca_id', finca_id).eq('estado','en_retiro')
      .lte('fecha_fin_retiro', hoy)
      .order('fecha_fin_retiro');
    // Excluir tratamientos de animales que ya no están activos (murieron/vendidos):
    // no tiene sentido pedir "confirmar apto" de un animal que murió en retiro.
    if (r.data) {
      r.data = r.data.filter(t => !t.animales || t.animales.estado === 'activo');
    }
    return r;
  },

  // Confirmar apto TODOS los tratamientos en retiro cumplido de un animal
  // en una sola acción (evita confirmar medicamento por medicamento).
  async marcarAnimalApto(animal_id, finca_id) {
    const hoy = new Date().toISOString().split('T')[0];
    const upd = await window._sb.from('tratamientos')
      .update({ estado: 'completado' })
      .eq('finca_id', finca_id).eq('animal_id', animal_id)
      .eq('estado', 'en_retiro').lte('fecha_fin_retiro', hoy)
      .select();
    if (!upd.error && upd.data && upd.data.length) {
      await this.logAudit(finca_id, 'UPDATE', 'tratamientos', animal_id, null,
        {estado:'completado', n:upd.data.length}, 'apto confirmado (todos los medicamentos del animal)');
    }
    return upd;
  },

  // Marcar un tratamiento como completado (botón "Confirmar apto").
  async marcarTratamientoCompletado(tratamiento_id) {
    const upd = await window._sb.from('tratamientos')
      .update({ estado: 'completado' }).eq('id', tratamiento_id).select().single();
    if (!upd.error && upd.data) {
      await this.logAudit(upd.data.finca_id, 'UPDATE', 'tratamientos', tratamiento_id, null, {estado:'completado'}, 'apto confirmado manualmente');
    }
    return upd;
  },

  // ── AUDITORÍA MENSUAL DE HATO ────────────────────────
  async listAuditorias(finca_id, limit) {
    return await window._sb.from('auditorias_hato')
      .select('*')
      .eq('finca_id', finca_id)
      .order('fecha_inicio', { ascending: false })
      .limit(limit || 24);
  },
  async getAuditoria(id) {
    return await window._sb.from('auditorias_hato')
      .select('*').eq('id', id).single();
  },
  async getAuditoriaAbierta(finca_id) {
    return await window._sb.from('auditorias_hato')
      .select('*')
      .eq('finca_id', finca_id)
      .in('estado', ['abierta', 'en_campo'])
      .order('fecha_inicio', { ascending: false })
      .limit(1)
      .maybeSingle();
  },
  /** Abre auditoría multi-día con snapshot de activos del hato LAAAMB. */
  async abrirAuditoria(finca_id, auditor_nombre) {
    const act = await window._sb.from('animales')
      .select('id, codigo, nombre, sexo, lote_actual_id, peso_actual, estado')
      .eq('finca_id', finca_id)
      .eq('estado', 'activo');
    if (act.error) return act;
    const rows = act.data || [];
    const bySexo = {};
    rows.forEach(function (a) {
      var k = a.sexo || 'sin_sexo';
      bySexo[k] = (bySexo[k] || 0) + 1;
    });
    const snapshot = {
      animal_ids: rows.map(function (a) { return a.id; }),
      codigos: rows.map(function (a) { return { id: a.id, codigo: a.codigo }; }),
      by_sexo: bySexo,
      total: rows.length,
      tomado_en: new Date().toISOString()
    };
    const perfil = window.AUTH_PERFIL || {};
    return await window._sb.from('auditorias_hato').insert({
      finca_id: finca_id,
      fecha_inicio: new Date().toISOString().slice(0, 10),
      estado: 'en_campo',
      auditor_nombre: auditor_nombre || perfil.nombre || null,
      auditor_perfil_id: perfil.id || null,
      snapshot_total: rows.length,
      snapshot_json: snapshot,
      vistos_count: 0
    }).select().single();
  },
  async getLineasAuditoria(auditoria_id) {
    return await window._sb.from('auditoria_lineas')
      .select('*, animales(codigo, nombre, sexo, peso_actual)')
      .eq('auditoria_id', auditoria_id)
      .order('created_at', { ascending: false });
  },
  async getLineaAuditoriaAnimal(auditoria_id, animal_id) {
    return await window._sb.from('auditoria_lineas')
      .select('*')
      .eq('auditoria_id', auditoria_id)
      .eq('animal_id', animal_id)
      .maybeSingle();
  },
  /**
   * Registra animal visto: upsert línea + pesaje (si hay peso) + opcional tratamiento.
   * Pesos y tratamientos se aplican YA (auditor = vet). Inventario de cabezas no se toca.
   */
  async registrarLineaAuditoria(payload) {
    // payload: { auditoria_id, finca_id, animal_id, chapeta, grupo_operativo,
    //   peso_kg, cc, famacha, trato, diagnostico, tratamiento_ids, notas, registrado_por }
    const line = {
      auditoria_id: payload.auditoria_id,
      animal_id: payload.animal_id,
      chapeta: payload.chapeta || null,
      grupo_operativo: payload.grupo_operativo || 'otro',
      peso_kg: payload.peso_kg != null ? payload.peso_kg : null,
      cc: payload.cc != null ? payload.cc : null,
      famacha: payload.famacha != null ? payload.famacha : null,
      trato: !!payload.trato,
      diagnostico: payload.diagnostico || null,
      tratamiento_ids: payload.tratamiento_ids || [],
      notas: payload.notas || null,
      registrado_por: payload.registrado_por || null
    };
    const up = await window._sb.from('auditoria_lineas')
      .upsert(line, { onConflict: 'auditoria_id,animal_id' })
      .select().single();
    if (up.error) return up;

    // Peso: aplica directo (auditor vet) — sin bandeja
    if (payload.peso_kg != null && payload.peso_kg > 0 && payload.finca_id) {
      await this.savePesaje({
        finca_id: payload.finca_id,
        animal_id: payload.animal_id,
        peso: payload.peso_kg,
        fecha: new Date().toISOString().slice(0, 10),
        tipo: 'auditoria',
        registrado_por: payload.registrado_por || 'auditoria',
        estado_aprobacion: 'aprobado'
      });
    }
    // CC / FAMACHA en animal si hay columnas (best-effort)
    const patch = { updated_at: new Date() };
    if (payload.cc != null) patch.condicion_corporal = payload.cc;
    // famacha no siempre existe en animales; se guarda en la línea
    if (payload.cc != null) {
      await window._sb.from('animales').update(patch).eq('id', payload.animal_id);
    }

    // Contador vistos
    const cnt = await window._sb.from('auditoria_lineas')
      .select('id', { count: 'exact', head: true })
      .eq('auditoria_id', payload.auditoria_id);
    if (cnt.count != null) {
      await window._sb.from('auditorias_hato')
        .update({ vistos_count: cnt.count, updated_at: new Date().toISOString(), estado: 'en_campo' })
        .eq('id', payload.auditoria_id);
    }
    return up;
  },
  async getFaltantesAuditoria(auditoria_id, soloPendientes) {
    let q = window._sb.from('auditoria_faltantes')
      .select('*, animales(codigo, nombre, sexo, lote_actual_id, peso_actual, estado)')
      .eq('auditoria_id', auditoria_id)
      .order('chapeta');
    if (soloPendientes) q = q.eq('estado', 'pendiente_busqueda');
    return await q;
  },
  async getFaltantesPendientesHoy(finca_id) {
    // Faltantes de auditorías abiertas o recién cerradas aún en búsqueda
    return await window._sb.from('auditoria_faltantes')
      .select('*, animales(codigo, nombre, sexo, peso_actual), auditorias_hato!inner(id, finca_id, fecha_inicio, estado)')
      .eq('estado', 'pendiente_busqueda')
      .eq('auditorias_hato.finca_id', finca_id)
      .order('created_at', { ascending: true })
      .limit(40);
  },
  /** Cierra auditoría: genera faltantes = snapshot − vistos, informe, umbral 2%. */
  async cerrarAuditoria(auditoria_id, opts) {
    // opts: { faltan_por_auditar, grupos_pendientes, cerrado_por, notas }
    const aud = await this.getAuditoria(auditoria_id);
    if (aud.error || !aud.data) return aud;
    const A = aud.data;
    if (A.estado === 'cerrada') return { data: A, error: null };

    const lineas = await this.getLineasAuditoria(auditoria_id);
    const vistos = new Set((lineas.data || []).map(function (l) { return l.animal_id; }));
    const snap = A.snapshot_json || {};
    const ids = snap.animal_ids || [];
    const codMap = {};
    (snap.codigos || []).forEach(function (c) { codMap[c.id] = c.codigo; });

    const faltantes = ids.filter(function (id) { return !vistos.has(id); });
    if (faltantes.length) {
      const rows = faltantes.map(function (id) {
        return {
          auditoria_id: auditoria_id,
          animal_id: id,
          chapeta: codMap[id] || null,
          estado: 'pendiente_busqueda'
        };
      });
      // insert ignore duplicates
      await window._sb.from('auditoria_faltantes').upsert(rows, {
        onConflict: 'auditoria_id,animal_id',
        ignoreDuplicates: true
      });
    }

    const vistosN = vistos.size;
    const total = A.snapshot_total || ids.length || 0;
    const pctFalta = total > 0 ? (faltantes.length / total) * 100 : 0;
    const alerta = pctFalta > 2;

    // Métricas de lo visto
    const L = lineas.data || [];
    const conTrato = L.filter(function (l) { return l.trato; }).length;
    const famachaAlto = L.filter(function (l) { return l.famacha != null && l.famacha >= 4; }).length;
    const ccBaja = L.filter(function (l) { return l.cc != null && l.cc <= 2; }).length;
    const porDx = {};
    L.forEach(function (l) {
      if (!l.diagnostico) return;
      porDx[l.diagnostico] = (porDx[l.diagnostico] || 0) + 1;
    });
    const pesos = L.map(function (l) { return Number(l.peso_kg); }).filter(function (n) { return n > 0; });
    const pesoProm = pesos.length
      ? Math.round((pesos.reduce(function (s, n) { return s + n; }, 0) / pesos.length) * 10) / 10
      : null;

    const informe = {
      snapshot_total: total,
      vistos: vistosN,
      no_vistos: faltantes.length,
      pct_cobertura: total ? Math.round((vistosN / total) * 1000) / 10 : 0,
      pct_faltantes: Math.round(pctFalta * 10) / 10,
      alerta_umbral_2pct: alerta,
      tratados: conTrato,
      famacha_ge4: famachaAlto,
      cc_le2: ccBaja,
      peso_promedio_kg: pesoProm,
      tratamientos_por_sintoma: porDx,
      faltan_por_auditar: !!(opts && opts.faltan_por_auditar),
      grupos_pendientes: (opts && opts.grupos_pendientes) || null,
      cerrado_en: new Date().toISOString()
    };

    const upd = await window._sb.from('auditorias_hato').update({
      estado: 'cerrada',
      fecha_fin: new Date().toISOString().slice(0, 10),
      vistos_count: vistosN,
      faltan_por_auditar: !!(opts && opts.faltan_por_auditar),
      grupos_pendientes: (opts && opts.grupos_pendientes) || null,
      alerta_umbral: alerta,
      informe_json: informe,
      notas: (opts && opts.notas) || A.notas || null,
      cerrado_por: (opts && opts.cerrado_por) || null,
      updated_at: new Date().toISOString()
    }).eq('id', auditoria_id).select().single();

    return { data: upd.data, error: upd.error, informe: informe, faltantes: faltantes.length };
  },
  /** Resolución en HOY: encontrado → línea + cierra faltante; no → baja pendiente tipo perdido. */
  async resolverFaltanteAuditoria(faltante_id, resolucion) {
    // resolucion: { existe: bool, peso_kg, cc, famacha, foto_url, notas, finca_id, registrado_por }
    const f = await window._sb.from('auditoria_faltantes')
      .select('*, auditorias_hato(id, finca_id)')
      .eq('id', faltante_id).single();
    if (f.error || !f.data) return f;
    const row = f.data;
    const finca_id = resolucion.finca_id ||
      (row.auditorias_hato && row.auditorias_hato.finca_id);

    if (resolucion.existe) {
      await this.registrarLineaAuditoria({
        auditoria_id: row.auditoria_id,
        finca_id: finca_id,
        animal_id: row.animal_id,
        chapeta: row.chapeta,
        grupo_operativo: 'otro',
        peso_kg: resolucion.peso_kg,
        cc: resolucion.cc,
        famacha: resolucion.famacha,
        trato: false,
        notas: resolucion.notas || 'Encontrado en búsqueda post-auditoría',
        registrado_por: resolucion.registrado_por
      });
      return await window._sb.from('auditoria_faltantes').update({
        estado: 'encontrado',
        peso_kg: resolucion.peso_kg != null ? resolucion.peso_kg : null,
        cc: resolucion.cc != null ? resolucion.cc : null,
        famacha: resolucion.famacha != null ? resolucion.famacha : null,
        foto_url: resolucion.foto_url || null,
        notas: resolucion.notas || null,
        resuelto_por: resolucion.registrado_por || null,
        resuelto_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }).eq('id', faltante_id).select().single();
    }

    // No existe → propuesta de baja tipo perdido (NO saca del inventario hasta aprobar)
    let bajaId = null;
    if (finca_id) {
      const baja = await this.saveBaja({
        finca_id: finca_id,
        animal_id: row.animal_id,
        tipo: 'perdido',
        fecha: new Date().toISOString().slice(0, 10),
        causa: 'No localizado en auditoría mensual',
        notas: resolucion.notas || 'Búsqueda post-auditoría: no existe',
        foto_evidencia_url: resolucion.foto_url || null,
        registrado_por: resolucion.registrado_por || null,
        estado_aprobacion: (window.Approval && window.Approval.getEstadoInicial)
          ? window.Approval.getEstadoInicial()
          : 'pendiente',
        ...(window.Approval && window.Approval.getPropuestoPor
          ? window.Approval.getPropuestoPor()
          : {})
      });
      if (baja && baja.data) bajaId = baja.data.id;
    }
    return await window._sb.from('auditoria_faltantes').update({
      estado: bajaId ? 'baja_propuesta' : 'no_encontrado',
      foto_url: resolucion.foto_url || null,
      notas: resolucion.notas || null,
      baja_id: bajaId,
      resuelto_por: resolucion.registrado_por || null,
      resuelto_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }).eq('id', faltante_id).select().single();
  },

  // ── LLUVIA (control simple finca / potrero) ──────────
  async getLluviaHoy(finca_id, fecha) {
    const f = fecha || new Date().toISOString().slice(0, 10);
    return await window._sb.from('registros_lluvia')
      .select('*, lotes(nombre)')
      .eq('finca_id', finca_id)
      .eq('fecha', f)
      .order('created_at', { ascending: false });
  },
  /**
   * Historial de lluvias.
   * getLluvias(fincaId, 30)  — compat (limit numérico)
   * getLluvias(fincaId, { desde, hasta, limit, soloLlovio })
   */
  async getLluvias(finca_id, opts) {
    const o = (typeof opts === 'number') ? { limit: opts } : (opts || {});
    let q = window._sb.from('registros_lluvia')
      .select('*, lotes(nombre)')
      .eq('finca_id', finca_id)
      .order('fecha', { ascending: false });
    if (o.desde) q = q.gte('fecha', o.desde);
    if (o.hasta) q = q.lte('fecha', o.hasta);
    if (o.soloLlovio) q = q.eq('llovio', true);
    if (o.limit) q = q.limit(o.limit);
    else if (!o.desde && !o.hasta) q = q.limit(60);
    return await q;
  },
  /** Último día con llovio=true (para “hace X días”). */
  async getUltimaLluvia(finca_id) {
    return await window._sb.from('registros_lluvia')
      .select('fecha, intensidad, duracion_texto, notas, registrado_por')
      .eq('finca_id', finca_id)
      .eq('llovio', true)
      .order('fecha', { ascending: false })
      .limit(1)
      .maybeSingle();
  },
  /**
   * Resumen de un rango [desde, hasta] (fechas YYYY-MM-DD).
   * Nota: solo cuenta días CON registro; días sin tocar la app no son “secos” seguros.
   */
  async getResumenLluvia(finca_id, desde, hasta) {
    const r = await this.getLluvias(finca_id, { desde, hasta, limit: 500 });
    if (r.error) return { data: null, error: r.error };
    const rows = r.data || [];
    // 1 registro por fecha (preferir finca general sin lote)
    const byFecha = {};
    rows.forEach(function (row) {
      const k = row.fecha;
      if (!byFecha[k] || !row.lote_id) byFecha[k] = row;
    });
    const fechas = Object.keys(byFecha).sort();
    let diasLlovio = 0, diasSecoReg = 0, leve = 0, media = 0, fuerte = 0;
    fechas.forEach(function (f) {
      const row = byFecha[f];
      if (row.llovio) {
        diasLlovio++;
        if (row.intensidad === 'leve') leve++;
        else if (row.intensidad === 'fuerte') fuerte++;
        else media++;
      } else diasSecoReg++;
    });
    // Días calendario del rango
    let diasRango = 0;
    try {
      const a = new Date(desde + 'T12:00:00');
      const b = new Date(hasta + 'T12:00:00');
      diasRango = Math.max(1, Math.round((b - a) / 86400000) + 1);
    } catch (e) { diasRango = fechas.length || 1; }

    const ultima = await this.getUltimaLluvia(finca_id);
    let diasSinLluvia = null;
    let fechaUltima = null;
    if (ultima && ultima.data && ultima.data.fecha) {
      fechaUltima = ultima.data.fecha;
      const hoy = new Date(); hoy.setHours(12, 0, 0, 0);
      const u = new Date(fechaUltima + 'T12:00:00');
      diasSinLluvia = Math.max(0, Math.round((hoy - u) / 86400000));
    }

    return {
      data: {
        desde, hasta,
        dias_rango: diasRango,
        dias_con_registro: fechas.length,
        dias_llovio: diasLlovio,
        dias_seco_registrado: diasSecoReg,
        dias_sin_registro: Math.max(0, diasRango - fechas.length),
        pct_lluvia: diasRango > 0 ? Math.round((diasLlovio / diasRango) * 100) : 0,
        intensidad: { leve, media, fuerte },
        dias_sin_lluvia: diasSinLluvia,
        fecha_ultima_lluvia: fechaUltima,
        ultima: (ultima && ultima.data) || null,
        por_fecha: byFecha,
        registros: rows
      },
      error: null
    };
  },
  /** Upsert lluvia del día a nivel finca (lote_id null). */
  async saveLluvia(data) {
    const finca_id = data.finca_id || 'a1b2c3d4-0000-0000-0000-000000000001';
    const fecha = data.fecha || new Date().toISOString().slice(0, 10);
    const lote_id = data.lote_id || null;
    const payload = {
      finca_id,
      fecha,
      llovio: data.llovio !== false,
      intensidad: data.intensidad || null,
      duracion_texto: data.duracion_texto || null,
      lote_id,
      notas: data.notas || null,
      registrado_por: data.registrado_por || null
    };
    // Buscar existente del día (misma finca + mismo lote o sin lote)
    let q = window._sb.from('registros_lluvia')
      .select('id')
      .eq('finca_id', finca_id)
      .eq('fecha', fecha);
    q = lote_id ? q.eq('lote_id', lote_id) : q.is('lote_id', null);
    const ex = await q.maybeSingle();
    if (ex && ex.data && ex.data.id) {
      return await window._sb.from('registros_lluvia')
        .update(payload)
        .eq('id', ex.data.id)
        .select().single();
    }
    return await window._sb.from('registros_lluvia')
      .insert(payload).select().single();
  },
  /**
   * Marca SECO (sequía) todos los días SIN registro a nivel finca
   * entre `desde` y `hasta` (inclusive, no futuro). No pisa lluvia ni secos ya guardados.
   */
  async rellenarSecosHastaHoy(finca_id, opts) {
    const o = opts || {};
    const fid = finca_id || 'a1b2c3d4-0000-0000-0000-000000000001';
    const hoy = this._isoLocal(new Date());
    let desde = o.desde;
    if (!desde) {
      const d = new Date();
      d.setDate(d.getDate() - 89);
      desde = this._isoLocal(d);
    }
    let hasta = o.hasta || hoy;
    if (hasta > hoy) hasta = hoy;
    if (desde > hasta) return { data: { inserted: 0 }, error: null };

    const exist = await this.getLluvias(fid, { desde, hasta, limit: 500 });
    if (exist.error) return { data: null, error: exist.error };
    const have = {};
    (exist.data || []).forEach((row) => {
      const k = String(row.fecha).slice(0, 10);
      if (!have[k] || !row.lote_id) have[k] = true;
    });
    const missing = [];
    const cur = new Date(desde + 'T12:00:00');
    const end = new Date(hasta + 'T12:00:00');
    while (cur <= end) {
      const f = this._isoLocal(cur);
      if (!have[f]) missing.push(f);
      cur.setDate(cur.getDate() + 1);
    }
    if (!missing.length) return { data: { inserted: 0 }, error: null };

    const who = o.registrado_por || 'campo/seco';
    const rows = missing.map((fecha) => ({
      finca_id: fid,
      fecha,
      llovio: false,
      intensidad: null,
      duracion_texto: null,
      lote_id: null,
      notas: 'Sequía · día vacío hasta hoy',
      registrado_por: who
    }));
    let inserted = 0;
    for (let i = 0; i < rows.length; i += 80) {
      const chunk = rows.slice(i, i + 80);
      const ins = await window._sb.from('registros_lluvia').insert(chunk).select('id');
      if (ins.error) {
        for (const row of chunk) {
          const one = await this.saveLluvia(Object.assign({}, row, { llovio: false }));
          if (!one.error) inserted += 1;
        }
      } else {
        inserted += (ins.data || []).length;
      }
    }
    return { data: { inserted }, error: null };
  },

  // ── UTILIDADES ───────────────────────────────────────
  async testConnection() {
    const { data, error } = await window._sb.from('fincas').select('count').single();
    return { ok: !error, error };
  }
};
