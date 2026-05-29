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
  async saveAnimal(animal) {
    if (animal.id) {
      return await window._sb.from('animales').update({...animal, updated_at: new Date()}).eq('id', animal.id).select().single();
    }
    return await window._sb.from('animales').insert(animal).select().single();
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

  // ── LOTES ────────────────────────────────────────────
  async getLotes(finca_id) {
    return await window._sb.from('lotes').select('*').eq('finca_id', finca_id).order('nombre');
  },
  async saveLote(lote) {
    if (lote.id) {
      return await window._sb.from('lotes').update({...lote, updated_at: new Date()}).eq('id', lote.id).select().single();
    }
    return await window._sb.from('lotes').insert(lote).select().single();
  },

  // ── EVENTOS ──────────────────────────────────────────
  async getEventos(finca_id, limit = 100) {
    return await window._sb.from('eventos').select('*, animales(codigo, nombre)').eq('finca_id', finca_id).order('fecha', { ascending: false }).limit(limit);
  },
  async getEventosAnimal(animal_id) {
    return await window._sb.from('eventos').select('*').eq('animal_id', animal_id).order('fecha', { ascending: false });
  },
  async saveEvento(evento) {
    return await window._sb.from('eventos').insert(evento).select().single();
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
    let q = window._sb.from('tratamientos').select('*, animales(codigo, nombre), medicamentos(nombre)').eq('finca_id', finca_id);
    if (solo_activos) q = q.gte('fecha_fin_retiro', new Date().toISOString().split('T')[0]);
    return await q.order('fecha_inicio', { ascending: false });
  },
  async saveTratamiento(t) {
    return await window._sb.from('tratamientos').insert(t).select().single();
  },

  // ── PESAJES ──────────────────────────────────────────
  async getPesajes(finca_id, animal_id = null) {
    let q = window._sb.from('pesajes').select('*, animales(codigo, nombre)').eq('finca_id', finca_id);
    if (animal_id) q = q.eq('animal_id', animal_id);
    return await q.order('fecha', { ascending: false }).limit(200);
  },
  async savePesaje(p) {
    // Al guardar pesaje, actualizar peso_actual en el animal
    const { data, error } = await window._sb.from('pesajes').insert(p).select().single();
    if (!error && p.animal_id) {
      await window._sb.from('animales').update({
        peso_actual: p.peso,
        updated_at: new Date()
      }).eq('id', p.animal_id);
    }
    return { data, error };
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
      .select('*, animales(codigo, nombre, raza, especie)')
      .eq('finca_id', finca_id)
      .order('fecha', { ascending: false })
      .limit(limit);
  },
  async saveBaja(baja) {
    return await window._sb.from('bajas')
      .insert(baja).select().single();
  },

  // ── UTILIDADES ───────────────────────────────────────
  async testConnection() {
    const { data, error } = await window._sb.from('fincas').select('count').single();
    return { ok: !error, error };
  }
};
