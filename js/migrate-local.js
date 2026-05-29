// ── Helpers de mapeo (estructura real de AppData.js → schema Supabase) ──────────

// 'H' → 'hembra', 'M' → 'macho', cualquier otro → null
function mapSexo(sexo) {
  if (sexo === 'H') return 'hembra';
  if (sexo === 'M') return 'macho';
  return null;
}

// Mapea los estados libres de AppData a los 4 estados permitidos por el CHECK.
// 'Vendido'/'Baja' → 'vendido'; 'Muerto'/'Muerte' → 'muerto';
// cualquier otro (Gestante, Activa, Reproductor, En tratamiento, Vacía, ...) → 'activo'.
function mapEstado(estado) {
  const e = (estado || '').toString().trim().toLowerCase();
  if (e === 'vendido' || e === 'baja') return 'vendido';
  if (e === 'muerto' || e === 'muerte') return 'muerto';
  return 'activo';
}

window.migrarASupabase = async function() {
  console.log('🐑 Iniciando migración LAAAMBAPP localStorage → Supabase...');
  const resultados = {};

  try {
    // Lee AppData del localStorage (clave real definida en AppData.js)
    const raw = localStorage.getItem('laaamb_data');
    if (!raw) { console.error('❌ No se encontró laaamb_data en localStorage'); return; }
    const appData = JSON.parse(raw);
    console.log('📦 AppData encontrado:', Object.keys(appData));

    // 1. Migrar finca (objeto único, NO array)
    const f = appData.finca;
    if (f && (f.nombre || f.empresa)) {
      const ubicacionPartes = [f.municipio, f.departamento].filter(Boolean);
      const { error } = await window.DB.saveFinca({
        nombre: f.nombre || f.empresa || 'Finca sin nombre',
        ubicacion: ubicacionPartes.join(', '),
        hectareas: parseFloat(f.area_ha || 0) || null,
        propietario: f.empresa || ''
      });
      if (!error) { resultados.fincas = 1; console.log('✅ Finca: 1/1'); }
      else console.warn('Finca error:', error.message, f);
    }

    // Obtener finca_id para usar en el resto
    const { data: fincasDB } = await window.DB.getFincas();
    const finca_id = fincasDB?.[0]?.id;
    if (!finca_id) { console.error('❌ No hay finca en Supabase para continuar'); return; }
    console.log('🏡 Usando finca_id:', finca_id);

    // 2. Migrar lotes (campos reales: area_ha, capacidad_max, tipo_pasto)
    if (appData.lotes?.length) {
      let ok = 0;
      for (const l of appData.lotes) {
        const notas = [l.descripcion, l.fuente_agua ? `Agua: ${l.fuente_agua}` : null]
          .filter(Boolean).join(' · ');
        const { error } = await window.DB.saveLote({
          finca_id,
          nombre: l.nombre || 'Lote sin nombre',
          hectareas: parseFloat(l.area_ha || 0) || null,
          tipo_pastura: l.tipo_pasto || '',
          capacidad_animal: parseInt(l.capacidad_max || 0) || null,
          dias_descanso_objetivo: 21,
          dias_pastoreo_objetivo: 7,
          notas
        });
        if (!error) ok++;
        else console.warn('Lote error:', error.message, l);
      }
      resultados.lotes = ok;
      console.log(`✅ Lotes: ${ok}/${appData.lotes.length}`);
    }

    // 3. Migrar animales (sexo H/M → hembra/macho; estado libre → CHECK válido)
    if (appData.animales?.length) {
      let ok = 0;
      for (const a of appData.animales) {
        const { error } = await window.DB.saveAnimal({
          finca_id,
          codigo: a.id || a.codigo || a.arete || '',
          nombre: a.nombre || '',
          especie: a.especie || 'ovino',
          sexo: mapSexo(a.sexo),
          raza: a.raza || '',
          fecha_nacimiento: a.fecha_nacimiento || null,
          estado: mapEstado(a.estado),
          peso_actual: parseFloat(a.peso_inicial || a.peso || 0) || null,
          condicion_corporal: parseFloat(a.condicion_corporal || a.cc || 0) || null,
          notas: a.observaciones || ''
        });
        if (!error) ok++;
        else console.warn('Animal error:', error.message, a);
      }
      resultados.animales = ok;
      console.log(`✅ Animales: ${ok}/${appData.animales.length}`);
    }

    // 4. Migrar medicamentos (campos reales: stock_maximo, costo_por_unidad, principio_activo)
    if (appData.medicamentos?.length) {
      let ok = 0;
      for (const m of appData.medicamentos) {
        const notas = [
          m.principio_activo ? `Principio activo: ${m.principio_activo}` : null,
          m.stock_maximo ? `Stock máx: ${m.stock_maximo}` : null,
          m.observaciones || null
        ].filter(Boolean).join(' · ');
        const { error } = await window.DB.saveMedicamento({
          finca_id,
          nombre: m.nombre || '',
          tipo: m.categoria || m.tipo || '',
          unidad: m.presentacion || m.unidad || '',
          stock_actual: parseFloat(m.stock_actual || 0) || 0,
          stock_minimo: parseFloat(m.stock_minimo || 0) || 0,
          dias_retiro: parseInt(m.dias_retiro || 0) || 0,
          precio_unitario: parseFloat(m.costo_por_unidad || 0) || 0,
          notas
        });
        if (!error) ok++;
        else console.warn('Medicamento error:', error.message, m);
      }
      resultados.medicamentos = ok;
      console.log(`✅ Medicamentos: ${ok}/${appData.medicamentos.length}`);
    }

    console.log('\n🎉 MIGRACIÓN COMPLETADA');
    console.log('📊 Resumen:', resultados);
    console.log('⚠️  localStorage NO fue modificado — tus datos originales siguen intactos');
    return resultados;

  } catch (e) {
    console.error('❌ Error general en migración:', e);
  }
};
