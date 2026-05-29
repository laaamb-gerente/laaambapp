window.migrarASupabase = async function() {
  console.log('🐑 Iniciando migración LAAAMBAPP localStorage → Supabase...');
  const resultados = {};

  try {
    // Lee AppData del localStorage
    const raw = localStorage.getItem('laaambAppData');
    if (!raw) { console.error('❌ No se encontró laaambAppData en localStorage'); return; }
    const appData = JSON.parse(raw);
    console.log('📦 AppData encontrado:', Object.keys(appData));

    // 1. Migrar fincas
    if (appData.fincas?.length) {
      let ok = 0;
      for (const f of appData.fincas) {
        const { error } = await window.DB.saveFinca({
          nombre: f.nombre || f.name || 'Finca sin nombre',
          ubicacion: f.ubicacion || f.location || '',
          hectareas: parseFloat(f.hectareas || f.ha || 0) || null,
          propietario: f.propietario || f.owner || ''
        });
        if (!error) ok++;
        else console.warn('Finca error:', error.message, f);
      }
      resultados.fincas = ok;
      console.log(`✅ Fincas: ${ok}/${appData.fincas.length}`);
    }

    // Obtener finca_id para usar en el resto
    const { data: fincasDB } = await window.DB.getFincas();
    const finca_id = fincasDB?.[0]?.id;
    if (!finca_id) { console.error('❌ No hay finca en Supabase para continuar'); return; }
    console.log('🏡 Usando finca_id:', finca_id);

    // 2. Migrar lotes
    if (appData.lotes?.length) {
      let ok = 0;
      for (const l of appData.lotes) {
        const { error } = await window.DB.saveLote({
          finca_id,
          nombre: l.nombre || l.name || 'Lote sin nombre',
          hectareas: parseFloat(l.hectareas || l.ha || 0) || null,
          tipo_pastura: l.tipoPastura || l.tipo_pastura || l.pastura || '',
          capacidad_animal: parseInt(l.capacidadAnimal || l.capacidad || 0) || null,
          dias_descanso_objetivo: parseInt(l.diasDescanso || 21),
          dias_pastoreo_objetivo: parseInt(l.diasPastoreo || 7),
          notas: l.notas || ''
        });
        if (!error) ok++;
        else console.warn('Lote error:', error.message, l);
      }
      resultados.lotes = ok;
      console.log(`✅ Lotes: ${ok}/${appData.lotes.length}`);
    }

    // 3. Migrar animales
    if (appData.animales?.length) {
      let ok = 0;
      for (const a of appData.animales) {
        const { error } = await window.DB.saveAnimal({
          finca_id,
          codigo: a.codigo || a.id || a.arete || '',
          nombre: a.nombre || a.name || '',
          especie: a.especie || 'ovino',
          sexo: a.sexo || a.genero || '',
          raza: a.raza || '',
          fecha_nacimiento: a.fechaNacimiento || a.fecha_nacimiento || null,
          estado: a.estado || 'activo',
          peso_actual: parseFloat(a.pesoActual || a.peso || 0) || null,
          condicion_corporal: parseFloat(a.condicionCorporal || a.cc || 0) || null,
          notas: a.notas || ''
        });
        if (!error) ok++;
        else console.warn('Animal error:', error.message, a);
      }
      resultados.animales = ok;
      console.log(`✅ Animales: ${ok}/${appData.animales.length}`);
    }

    // 4. Migrar medicamentos
    if (appData.medicamentos?.length) {
      let ok = 0;
      for (const m of appData.medicamentos) {
        const { error } = await window.DB.saveMedicamento({
          finca_id,
          nombre: m.nombre || m.name || '',
          tipo: m.tipo || '',
          unidad: m.unidad || '',
          stock_actual: parseFloat(m.stockActual || m.stock || 0) || 0,
          stock_minimo: parseFloat(m.stockMinimo || m.minimo || 0) || 0,
          dias_retiro: parseInt(m.diasRetiro || m.retiro || 0) || 0,
          precio_unitario: parseFloat(m.precio || m.precioUnitario || 0) || 0
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
