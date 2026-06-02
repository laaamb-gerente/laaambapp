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

  // ── PIVOTES (división física permanente; nivel superior del potrero) ──
  async getPivotes(finca_id) {
    return await window._sb.from('pivotes')
      .select('*').eq('finca_id', finca_id).eq('activo', true).order('nombre');
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

  // ── UTILIDADES ───────────────────────────────────────
  async testConnection() {
    const { data, error } = await window._sb.from('fincas').select('count').single();
    return { ok: !error, error };
  }
};
