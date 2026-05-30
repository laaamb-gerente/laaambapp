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

  // ── UTILIDADES ───────────────────────────────────────
  async testConnection() {
    const { data, error } = await window._sb.from('fincas').select('count').single();
    return { ok: !error, error };
  }
};
