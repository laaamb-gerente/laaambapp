window.AppState = {
  _loaded: false,
  _finca_id: 'a1b2c3d4-0000-0000-0000-000000000001',

  async init() {
    if (this._loaded) return;
    try {
      // Cargar en paralelo
      const [fincaRes, animalesRes, lotesRes, medRes] = await Promise.all([
        window.DB.getFincas(),
        window.DB.getAnimales(this._finca_id),
        window.DB.getLotes(this._finca_id),
        window.DB.getMedicamentos(this._finca_id)
      ]);

      if (!fincaRes.error) window.AppState.finca = fincaRes.data?.[0] || null;
      if (!animalesRes.error) window.AppState.animales = animalesRes.data || [];
      if (!lotesRes.error) window.AppState.lotes = lotesRes.data || [];
      if (!medRes.error) window.AppState.medicamentos = medRes.data || [];

      this._loaded = true;
      console.log('[AppState] Supabase cargado:', {
        animales: this.animales.length,
        lotes: this.lotes.length,
        medicamentos: this.medicamentos.length
      });

      // Disparar evento para que los módulos se actualicen
      document.dispatchEvent(new CustomEvent('appstate:ready', {
        detail: { source: 'supabase' }
      }));
    } catch(e) {
      console.warn('[AppState] Fallback a localStorage:', e.message);
      this._loadFromLocalStorage();
    }
  },

  _loadFromLocalStorage() {
    try {
      const d = JSON.parse(localStorage.getItem('laaamb_data') || '{}');
      this.finca = d.finca || null;
      this.animales = d.animales || [];
      this.lotes = d.lotes || [];
      this.medicamentos = d.medicamentos || [];
      this._loaded = true;
      document.dispatchEvent(new CustomEvent('appstate:ready', {
        detail: { source: 'localStorage' }
      }));
    } catch(e) {
      console.error('[AppState] Error en fallback:', e);
    }
  },

  // Helpers de conteo para el dashboard
  getAnimalesActivos() {
    return this.animales.filter(a => a.estado === 'activo');
  },
  getAnimalesPorEspecie(especie) {
    return this.getAnimalesActivos().filter(a => a.especie === especie);
  },
  getAnimalesMachos() {
    return this.getAnimalesActivos().filter(a => a.sexo === 'macho');
  },
  getAnimalesHembras() {
    return this.getAnimalesActivos().filter(a => a.sexo === 'hembra');
  },
  getTotalAnimales() {
    return this.getAnimalesActivos().length;
  }
};

// Auto-inicializar cuando el DOM esté listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => window.AppState.init());
} else {
  window.AppState.init();
}
