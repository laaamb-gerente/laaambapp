// ── alertas-motor.js ───────────────────────────────────
// El cerebro prescriptivo de LAAAMB.
// Genera alertas operacionales proactivas a partir de los
// datos reales en AppState y Supabase: ecografías pendientes,
// partos próximos, retiros sanitarios, sobrecarga de lotes,
// medicamentos por vencer y caída de GDP.

window.AlertasMotor = {

  // ── Generar todas las alertas activas ──────────────────
  async generar() {
    const alertas = [];
    const hoy = new Date();

    try {
      // 1. Hembras listas para ecografía (28-35 días post-monta)
      const enMonta = window.AppState.animales.filter(a =>
        a.estado_reproductivo === 'en_monta' &&
        a.fecha_ultima_monta
      );
      enMonta.forEach(a => {
        const diasMonta = Math.floor(
          (hoy - new Date(a.fecha_ultima_monta)) / 86400000
        );
        if (diasMonta >= 28 && diasMonta <= 35) {
          alertas.push({
            tipo: 'ecografia_pendiente',
            prioridad: 'alta',
            animal_id: a.id,
            animal_codigo: a.codigo,
            mensaje: `${a.codigo} lleva ${diasMonta} días post-monta — ventana de ecografía abierta`,
            accion_sugerida: 'Registrar ecografía',
            accion_url: 'reproduccion.html',
            datos: { diasMonta, fecha_monta: a.fecha_ultima_monta }
          });
        }
        if (diasMonta > 35) {
          alertas.push({
            tipo: 'ecografia_vencida',
            prioridad: 'media',
            animal_id: a.id,
            animal_codigo: a.codigo,
            mensaje: `${a.codigo} lleva ${diasMonta} días post-monta sin ecografía — ventana vencida`,
            accion_sugerida: 'Registrar ecografía tardía',
            accion_url: 'reproduccion.html',
            datos: { diasMonta }
          });
        }
      });

      // 2. Partos próximos (próximos 7 días)
      const gestantes = window.AppState.gestantes || [];
      gestantes.forEach(a => {
        if (!a.fecha_parto_esperado) return;
        const diasRestantes = Math.floor(
          (new Date(a.fecha_parto_esperado) - hoy) / 86400000
        );
        if (diasRestantes <= 7 && diasRestantes >= 0) {
          alertas.push({
            tipo: 'parto_proximo',
            prioridad: diasRestantes <= 2 ? 'critica' : 'alta',
            animal_id: a.id,
            animal_codigo: a.codigo,
            mensaje: `${a.codigo} pare en ${diasRestantes} días — preparar asistencia`,
            accion_sugerida: 'Revisar animal y preparar zona de partos',
            accion_url: 'reproduccion.html',
            datos: { diasRestantes, fecha_parto: a.fecha_parto_esperado }
          });
        }
      });

      // 3. Animales sin pesaje hace >30 días (sample top 10)
      const sinPesaje = window.AppState.animales
        .filter(a => a.estado === 'activo' && !a.peso_actual)
        .slice(0, 10);
      if (sinPesaje.length > 0) {
        alertas.push({
          tipo: 'pesajes_pendientes',
          prioridad: 'media',
          mensaje: `${window.AppState.animales.filter(a => a.estado === 'activo' && !a.peso_actual).length} animales sin pesaje registrado`,
          accion_sugerida: 'Programar día de pesajes',
          accion_url: 'animales.html',
          datos: { cantidad: sinPesaje.length }
        });
      }

      // 4. Retiros sanitarios venciendo (próximos 3 días)
      const { data: retiros } = await window._sb
        .from('tratamientos')
        .select('*, animales(codigo)')
        .eq('finca_id', window.AppState._finca_id)
        .not('fecha_fin_retiro', 'is', null)
        .gte('fecha_fin_retiro', hoy.toISOString().split('T')[0])
        .lte('fecha_fin_retiro',
          new Date(hoy.getTime() + 3 * 86400000)
            .toISOString().split('T')[0]);

      (retiros || []).forEach(t => {
        const dias = Math.floor(
          (new Date(t.fecha_fin_retiro) - hoy) / 86400000
        );
        alertas.push({
          tipo: 'retiro_venciendo',
          prioridad: dias === 0 ? 'critica' : 'alta',
          animal_id: t.animal_id,
          animal_codigo: t.animales?.codigo,
          mensaje: `Retiro sanitario de ${t.animales?.codigo} vence ${dias === 0 ? 'HOY' : `en ${dias} días`}`,
          accion_sugerida: 'Verificar aptitud para sacrificio',
          accion_url: 'salud.html',
          datos: { fecha_fin_retiro: t.fecha_fin_retiro }
        });
      });

      // 5. Lotes en sobrecarga — cálculo en kg/ha (biomasa por hectárea).
      // El conteo de animales se calcula desde AppState.animales por lote_actual_id
      // (no existe columna num_animales en la tabla lotes).
      const objetivoCarga = window.AppState.finca?.config?.carga_animal_kgha || 200000;
      window.AppState.lotes.forEach(l => {
        const ha = parseFloat(l.hectareas) || 0;
        if (ha <= 0) return;
        const animalesLote = window.AppState.animales.filter(a =>
          a.lote_actual_id === l.id && a.estado === 'activo'
        );
        if (animalesLote.length === 0) return;
        const pesoPromLote = animalesLote.reduce((s, a) => s + (parseFloat(a.peso_actual) || 25), 0)
          / animalesLote.length;
        const biomasaKg = animalesLote.length * pesoPromLote;
        const kgHa = biomasaKg / ha;
        if (kgHa > objetivoCarga * 0.9) {
          alertas.push({
            tipo: 'sobrecarga_lote',
            prioridad: kgHa > objetivoCarga ? 'critica' : 'alta',
            mensaje: `${l.nombre} con ${Math.round(kgHa).toLocaleString()} kg/ha — cerca del límite de ${objetivoCarga.toLocaleString()} kg/ha`,
            accion_sugerida: 'Rotar animales al siguiente potrero',
            accion_url: 'lotes.html',
            datos: { lote: l.nombre, kgHa: Math.round(kgHa), objetivo: objetivoCarga }
          });
        }
      });

      // 6. Medicamentos por vencer (<14 días)
      const { data: meds } = await window._sb
        .from('medicamentos')
        .select('nombre, fecha_vencimiento, stock_actual')
        .eq('finca_id', window.AppState._finca_id)
        .not('fecha_vencimiento', 'is', null)
        .lte('fecha_vencimiento',
          new Date(hoy.getTime() + 14 * 86400000)
            .toISOString().split('T')[0]);

      (meds || []).forEach(m => {
        const dias = Math.floor(
          (new Date(m.fecha_vencimiento) - hoy) / 86400000
        );
        alertas.push({
          tipo: 'medicamento_venciendo',
          prioridad: dias <= 3 ? 'alta' : 'media',
          mensaje: `${m.nombre} vence en ${dias} días — ${m.stock_actual} unidades restantes`,
          accion_sugerida: 'Usar o desechar el medicamento',
          accion_url: 'medicamentos.html',
          datos: { medicamento: m.nombre, dias, stock: m.stock_actual }
        });
      });

      // 7. GDP en caída (si hay datos históricos)
      // Comparar peso promedio últimas 2 semanas vs 4 semanas
      // (simplificado: alertar si GDP < meta * 0.7)
      const gdpMeta = window.AppState.finca?.config?.meta_gdp || 200;
      const gdpActual = window.AppState.gdpPromedio || 0;
      if (gdpActual > 0 && gdpActual < gdpMeta * 0.7) {
        alertas.push({
          tipo: 'gdp_critico',
          prioridad: 'alta',
          mensaje: `GDP promedio ${gdpActual}g/d está por debajo del 70% de la meta (${gdpMeta}g/d)`,
          accion_sugerida: 'Revisar alimentación, carga animal y sanidad',
          accion_url: 'okr.html',
          datos: { gdpActual, gdpMeta }
        });
      }

      // 8. Sin registros financieros este mes (después del día 10)
      const costosMes = window.AppState.getTotalCostosMes?.() || 0;
      const ingresosMes = window.AppState.getTotalIngresosMes?.() || 0;
      const hoyDia = new Date().getDate();
      if (costosMes === 0 && ingresosMes === 0 && hoyDia > 10) {
        alertas.push({
          tipo: 'sin_registros_financieros',
          prioridad: 'media',
          mensaje: `Sin registros financieros este mes — conecta Siigo o registra manualmente`,
          accion_sugerida: 'Registrar gastos e ingresos',
          accion_url: 'finanzas.html',
          datos: {}
        });
      }

      // 9. Margen bajo (solo si hay datos reales)
      if (ingresosMes > 0) {
        const margen = ((ingresosMes - costosMes) / ingresosMes) * 100;
        if (margen < 30) {
          alertas.push({
            tipo: 'margen_bajo',
            prioridad: margen < 15 ? 'critica' : 'alta',
            mensaje: `Margen del mes ${margen.toFixed(1)}% bajo la meta del 30%`,
            accion_sugerida: 'Revisar costos y estrategia de ingresos',
            accion_url: 'finanzas.html',
            datos: { margen, costosMes, ingresosMes }
          });
        }
      }

    } catch (e) {
      console.warn('[AlertasMotor] Error generando alertas:', e.message);
    }

    // ── 10. SALA CUNA — crianza artificial (Fase 3) ──────────────────────
    // Bloque INDEPENDIENTE: su propio try, FUERA del try anterior, para que un
    // fallo en cualquier bloque previo (p.ej. AppState aún no listo) no impida
    // estas alertas. Usa window._sb directo (no depende de que window.DB esté
    // cargado en la página). Sus errores se loguean, no rompen el ciclo.
    await this._alertasSalaCuna(alertas, hoy);

    // ── 11. LECHE — control lechero (Fase 4). Mismo patrón independiente.
    await this._alertasLeche(alertas, hoy);

    // ── 12. DESCARTE — score materno (Fase 6). Mismo patrón independiente.
    await this._alertasDescarte(alertas, hoy);

    // Ordenar por prioridad
    const orden = { critica: 0, alta: 1, media: 2, baja: 3 };
    alertas.sort((a, b) =>
      (orden[a.prioridad] || 3) - (orden[b.prioridad] || 3)
    );

    this._alertas = alertas;
    return alertas;
  },

  // ── 10. SALA CUNA — alertas de crianza artificial (Fase 3) ──
  // Independiente y defensivo: usa window._sb directo, no depende de window.DB.
  async _alertasSalaCuna(alertas, hoy) {
    try {
      const sb = window._sb;
      if (!sb) return;

      // Corderos activos en crianza
      const { data: corderosCC } = await sb
        .from('corderos_crianza')
        .select('id, cordero_id, fecha_inicio, estado, cordero:cordero_id(codigo, nombre)')
        .eq('estado', 'activo');
      const cc = corderosCC || [];
      const ccMap = {};
      cc.forEach(c => { ccMap[c.id] = c; });
      const nombreCC = (c) => (c && c.cordero && (c.cordero.nombre || c.cordero.codigo)) || 'cordero';

      // 10a. toma_pendiente (warning): pendiente con ≤15 min para vencer.
      const { data: pend } = await sb
        .from('tomas_programadas')
        .select('id, tipo, corderos_crianza_id, fecha_hora_programada')
        .eq('estado', 'pendiente');
      (pend || []).forEach(t => {
        const min = Math.round((new Date(t.fecha_hora_programada) - hoy) / 60000);
        if (min >= 0 && min <= 15) {
          alertas.push({
            tipo: 'toma_pendiente', prioridad: 'alta',
            mensaje: `Toma pendiente — ${nombreCC(ccMap[t.corderos_crianza_id])}, ${t.tipo}, en ${min} min`,
            accion_sugerida: 'Registrar la toma en Sala Cuna',
            accion_url: 'sala-cuna.html',
            datos: { toma_id: t.id, min }
          });
        }
      });

      // 10b. toma_perdida (danger): estado 'perdida' marcada en las últimas 24h.
      const ventana24h = new Date(hoy.getTime() - 24 * 3600000).toISOString();
      const { data: perdidas } = await sb
        .from('tomas_programadas')
        .select('id, tipo, corderos_crianza_id')
        .eq('estado', 'perdida')
        .gte('updated_at', ventana24h);
      (perdidas || []).forEach(t => {
        alertas.push({
          tipo: 'toma_perdida', prioridad: 'critica',
          mensaje: `Toma perdida — ${nombreCC(ccMap[t.corderos_crianza_id])}, ${t.tipo} no registrada`,
          accion_sugerida: 'Verificar al cordero y reforzar la siguiente toma',
          accion_url: 'sala-cuna.html',
          datos: { toma_id: t.id }
        });
      });

      // 10c/10d. Calostro faltante + bajo crecimiento, por cordero.
      for (const c of cc) {
        const animalId = c.cordero_id;

        // 10c. calostro_faltante (danger, máxima): >6h sin calostro en 24h.
        if (c.fecha_inicio) {
          const horas = Math.floor((hoy - new Date(c.fecha_inicio)) / 3600000);
          if (horas > 6) {
            const { data: cal } = await sb
              .from('eventos_calostro')
              .select('cantidad_ml, fecha_hora')
              .eq('cordero_id', animalId)
              .order('fecha_hora', { ascending: true });
            let total = 0;
            if (cal && cal.length) {
              const corte = new Date(cal[0].fecha_hora).getTime() + 24 * 3600 * 1000;
              total = cal
                .filter(e => new Date(e.fecha_hora).getTime() <= corte)
                .reduce((s, e) => s + (Number(e.cantidad_ml) || 0), 0);
            }
            if (!total) {
              alertas.push({
                tipo: 'calostro_faltante', prioridad: 'critica',
                mensaje: `⚠️ Sin calostro — ${nombreCC(c)} lleva ${horas}h sin calostro registrado`,
                accion_sugerida: 'Administrar calostro URGENTE',
                accion_url: 'sala-cuna.html',
                datos: { cordero_id: animalId, horas }
              });
            }
          }
        }

        // 10d. cordero_bajo_peso (warning): GMD < 100 g/día con ≥2 pesajes.
        const { data: pes } = await sb
          .from('pesajes_corderos')
          .select('peso_kg, fecha')
          .eq('cordero_id', animalId)
          .order('fecha', { ascending: true });
        if (pes && pes.length >= 2) {
          const dias = (new Date(pes[pes.length - 1].fecha) - new Date(pes[0].fecha)) / 86400000;
          if (dias > 0) {
            const gmd = (Number(pes[pes.length - 1].peso_kg) - Number(pes[0].peso_kg)) / dias; // kg/día
            if (gmd < 0.1) {
              alertas.push({
                tipo: 'cordero_bajo_peso', prioridad: 'media',
                mensaje: `Bajo crecimiento — ${nombreCC(c)}: GMD ${Math.round(gmd * 1000)} g/día (mín: 100)`,
                accion_sugerida: 'Revisar tomas, salud y temperatura del sustituto',
                accion_url: 'sala-cuna.html',
                datos: { cordero_id: animalId, gmd: Math.round(gmd * 1000) }
              });
            }
          }
        }
      }
    } catch (e) {
      console.warn('[AlertasMotor] Sala Cuna:', e && e.message);
    }
  },

  // ── 11. LECHE — alertas de control lechero (Fase 4) ──
  // Independiente y defensivo: usa window._sb directo, no depende de window.DB.
  async _alertasLeche(alertas, hoy) {
    try {
      const sb = window._sb;
      if (!sb) return;
      const { data: lacts } = await sb
        .from('lactancias')
        .select('id, animal:animal_id(codigo, nombre), controles:controles_lecheros(fecha, rcs)')
        .eq('estado', 'activa');
      (lacts || []).forEach(l => {
        const ctr = (l.controles || []).filter(c => c.rcs != null);
        if (!ctr.length) return;
        ctr.sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
        const rcs = Number(ctr[ctr.length - 1].rcs) || 0;
        // rcs_alto: umbral OVEJA (basal más alto que vaca). 1.000.000 = alerta.
        if (rcs > 1000000) {
          const nombre = (l.animal && (l.animal.nombre || l.animal.codigo)) || 'oveja';
          alertas.push({
            tipo: 'rcs_alto', prioridad: 'alta',
            mensaje: `⚠️ RCS alto — ${nombre}: ${rcs.toLocaleString('es-CO')} céls/mL (posible mastitis subclínica)`,
            accion_sugerida: 'Revisar la ubre y considerar cultivo / tratamiento',
            accion_url: 'leche.html',
            datos: { lactancia_id: l.id, rcs }
          });
        }
      });
    } catch (e) {
      console.warn('[AlertasMotor] Leche:', e && e.message);
    }
  },

  // ── 12. DESCARTE — nuevas candidatas a descarte (Fase 6) ──
  // Independiente y defensivo: usa window._sb directo. Solo alerta las
  // flaggeadas HOY (fecha_flag_descarte = hoy) para no repetir cada día.
  async _alertasDescarte(alertas, hoy) {
    try {
      const sb = window._sb;
      if (!sb) return;
      const hoyStr = hoy.toISOString().split('T')[0];
      const { data: cands } = await sb
        .from('animales')
        .select('id, codigo, nombre, motivo_descarte, fecha_flag_descarte')
        .eq('candidata_descarte', true)
        .eq('fecha_flag_descarte', hoyStr);
      (cands || []).forEach(a => {
        const nombre = a.nombre || a.codigo || 'oveja';
        alertas.push({
          tipo: 'nueva_candidata_descarte', prioridad: 'alta',
          mensaje: `⛔ Nueva candidata a descarte — ${nombre}: ${a.motivo_descarte || 'criterios de descarte cumplidos'}`,
          accion_sugerida: 'Revisar historial y decidir venta/sacrificio',
          accion_url: 'animales.html',
          datos: { animal_id: a.id }
        });
      });
    } catch (e) {
      console.warn('[AlertasMotor] Descarte:', e && e.message);
    }
  },

  // ── Generar resumen para el copiloto ───────────────────
  getResumenParaCopiloto() {
    if (!this._alertas?.length) return 'Sin alertas activas.';
    return this._alertas.map(a =>
      `[${a.prioridad.toUpperCase()}] ${a.mensaje}`
    ).join('\n');
  },

  // ── Contar alertas por prioridad ───────────────────────
  getCounts() {
    const counts = { critica: 0, alta: 0, media: 0, total: 0 };
    (this._alertas || []).forEach(a => {
      counts[a.prioridad] = (counts[a.prioridad] || 0) + 1;
      counts.total++;
    });
    return counts;
  },

  _alertas: []
};
