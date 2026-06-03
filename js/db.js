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

  // ── PIVOTES (división física permanente; nivel superior del potrero) ──
  async getPivotes(finca_id) {
    return await window._sb.from('pivotes')
      .select('*').eq('finca_id', finca_id).eq('activo', true).order('nombre');
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
    if (pivote.id) {
      return await window._sb.from('pivotes')
        .update(pivote).eq('id', pivote.id).select().single();
    }
    return await window._sb.from('pivotes').insert(pivote).select().single();
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
    const [bajas, tratos, pesajes, eventos] =
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
          .order('created_at', { ascending: false })
      ]);
    return {
      bajas: bajas.data || [],
      tratamientos: tratos.data || [],
      pesajes: pesajes.data || [],
      eventos: eventos.data || []
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
  async updateCorderoCrianza(id, cambios) {
    return await window._sb.from('corderos_crianza')
      .update({ ...cambios, updated_at: new Date() })
      .eq('id', id).select().single();
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
  //           responsable?, observacion? }
  async createTomaRealizada(datos) {
    const payload = { ...datos, sincronizado: true };
    const res = await window._sb.from('tomas_realizadas')
      .insert(payload).select().single();
    if (res.error && !navigator.onLine && window.OfflineDB) {
      await window.OfflineDB.encolar({
        tabla: 'tomas_realizadas',
        accion: 'insert',
        datos: { ...datos, sincronizado: false }
      });
      return { data: { ...datos, sincronizado: false }, error: null, offline: true };
    }
    return res;
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

  // ── UTILIDADES ───────────────────────────────────────
  async testConnection() {
    const { data, error } = await window._sb.from('fincas').select('count').single();
    return { ok: !error, error };
  }
};
