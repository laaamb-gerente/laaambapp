window.AppState = {
  _loaded: false,
  _finca_id: 'a1b2c3d4-0000-0000-0000-000000000001',

  async init() {
    if (this._loaded) return;
    try {
      // Asegurar que _sb tiene la sesión activa antes de consultar
      // (RLS necesita el token de usuario autenticado, no solo la anon key)
      const { data: { session } } = await window._sb.auth.getSession();
      if (session) {
        // Refrescar el cliente con el token activo
        await window._sb.auth.setSession({
          access_token: session.access_token,
          refresh_token: session.refresh_token
        });
      }

      // Cargar en paralelo
      const [fincaRes, animalesRes, lotesRes, medRes, gestantesRes, eventosRepRes, costosRes, ingresosRes] =
        await Promise.all([
          window.DB.getFincas(),
          window.DB.getAnimales(this._finca_id),
          window.DB.getLotes(this._finca_id),
          window.DB.getMedicamentos(this._finca_id),
          window.DB.getGestantes(this._finca_id),
          window.DB.getEventosReproductivos(this._finca_id, 100),
          window.DB.getCostos(this._finca_id),
          window.DB.getIngresos(this._finca_id)
        ]);

      if (!fincaRes.error) window.AppState.finca = fincaRes.data?.[0] || null;
      if (!animalesRes.error) window.AppState.animales = animalesRes.data || [];
      if (!lotesRes.error) window.AppState.lotes = lotesRes.data || [];
      if (!medRes.error) window.AppState.medicamentos = medRes.data || [];
      if (!gestantesRes.error) window.AppState.gestantes = gestantesRes.data || [];
      if (!eventosRepRes.error) window.AppState.eventosReproductivos = eventosRepRes.data || [];
      if (!costosRes.error) window.AppState.costos = costosRes.data || [];
      if (!ingresosRes.error) window.AppState.ingresos = ingresosRes.data || [];

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

      // Marcar AppData para que use AppState como fuente
      if (window.AppData) {
        window.AppData._useSupabase = true;
      }

      // Actualizar badge sidebar y pill finca con el conteo real
      this._updateSidebar();
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
      this.gestantes = d.gestantes || [];
      this.eventosReproductivos = d.eventosReproductivos || [];
      this.costos = d.costos || [];
      this.ingresos = d.ingresos || [];
      this._loaded = true;
      document.dispatchEvent(new CustomEvent('appstate:ready', {
        detail: { source: 'localStorage' }
      }));
      this._updateSidebar();
    } catch(e) {
      console.error('[AppState] Error en fallback:', e);
    }
  },

  // Actualiza el badge del sidebar (link Animales) y el pill de finca.
  // Selectores REALES verificados en el markup:
  //  - badge: <span class="nav-badge"> dentro de <a href="animales.html"> (en algunas páginas con id="sb-count")
  //  - pill finca: #sb-farm-name (nombre) y #sb-farm-sub (formato "X ha · N animales")
  _updateSidebar() {
    const total = this.getAnimalesActivos().length;

    // Badge del link de Animales (universal en todas las páginas)
    document.querySelectorAll('a[href="animales.html"] .nav-badge')
      .forEach(el => { el.textContent = total; });

    // Pill de finca: reemplaza solo el conteo de animales preservando el resto ("X ha · ")
    const sub = document.getElementById('sb-farm-sub');
    if (sub) {
      sub.textContent = /\d+\s*animales/.test(sub.textContent)
        ? sub.textContent.replace(/\d+\s*animales/, total + ' animales')
        : total + ' animales';
    }

    // Nombre de finca en el pill
    const nameEl = document.getElementById('sb-farm-name');
    if (nameEl && this.finca && this.finca.nombre) nameEl.textContent = this.finca.nombre;
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
  },
  getGestantes() {
    return this.gestantes || [];
  },
  // Helpers de finanzas
  getCostosMes() {
    const hoy = new Date();
    const inicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1)
      .toISOString().split('T')[0];
    return (this.costos || []).filter(c => c.fecha >= inicio);
  },
  getIngresosMes() {
    const hoy = new Date();
    const inicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1)
      .toISOString().split('T')[0];
    return (this.ingresos || []).filter(i => i.fecha >= inicio);
  },
  getTotalCostosMes() {
    return this.getCostosMes().reduce((s, c) => s + (c.valor||0), 0);
  },
  getTotalIngresosMes() {
    return this.getIngresosMes().reduce((s, i) => s + (i.valor||0), 0);
  }
};

// Auto-inicializar cuando el DOM esté listo, pero ESPERANDO a que
// Auth establezca la sesión primero (evita consultar con anon key y
// recibir todo en ceros por RLS).
async function initAppWhenReady() {
  // Esperar a que Auth verifique la sesión primero.
  // Auth.init() setea window.AUTH_READY = true cuando termina.
  let intentos = 0;
  while (!window.AUTH_READY && intentos < 20) {
    await new Promise(r => setTimeout(r, 100));
    intentos++;
  }
  window.AppState.init();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAppWhenReady);
} else {
  initAppWhenReady();
}
