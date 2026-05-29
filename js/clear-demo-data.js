// Ejecutar UNA SOLA VEZ para limpiar datos de ejemplo
// Solo elimina si los datos parecen ser de ejemplo (IDs tipo OV-XXXX)
window.clearDemoData = function() {
  const raw = localStorage.getItem('laaamb_data');
  if (!raw) { console.log('localStorage ya vacío'); return; }

  const d = JSON.parse(raw);
  const esDemo = (arr) => arr?.some(a =>
    String(a.id || '').startsWith('OV-') ||
    String(a.id || '').startsWith('RE-') ||
    String(a.id || '').startsWith('BO-')
  );

  if (esDemo(d.animales)) {
    // Limpiar arrays de ejemplo pero mantener configuración de finca
    const finca = d.finca;
    const lotes = d.lotes;
    const geo = d.geo;
    localStorage.setItem('laaamb_data', JSON.stringify({
      finca, lotes, geo,
      animales: [], pesajes: [], montas: [], partos: [],
      crias_parto: [], ecografias: [], tratamientos: [],
      medicamentos: [], costos: [], ingresos: [],
      bajas: [], movimientos: [], meta: d.meta,
      fincas: d.fincas
    }));
    console.log('✅ Datos de ejemplo eliminados. Finca y lotes preservados.');
  } else {
    console.log('ℹ️ No se detectaron datos de ejemplo. Sin cambios.');
  }
};

// Auto-ejecutar si AppState está disponible y Supabase tiene datos
document.addEventListener('appstate:ready', function() {
  if (window.AppState?.animales?.length > 10) {
    window.clearDemoData();
    console.log('[ClearDemo] Supabase tiene datos reales — localStorage limpiado');
  }
});
