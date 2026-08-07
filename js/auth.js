// ── auth.js ───────────────────────────────────────────
// Middleware de autenticación de LAAAMBAPP.
// Se incluye en TODOS los HTML excepto login.html.
// Protege cada página verificando sesión activa de Supabase,
// carga el perfil del usuario y aplica restricciones por rol.

window.Auth = {
  _session: null,
  _perfil: null,

  // Base de la app según el host:
  //  - GitHub Pages: la app vive en /laaambapp/ → base '/laaambapp/'
  //  - Vercel / raíz: base '/' (login en la raíz del dominio)
  _base() {
    return window.location.pathname.includes('/laaambapp/') ? '/laaambapp/' : '/';
  },

  async init() {
    // Verificar sesión de Supabase
    const { data: { session } } = await window._sb.auth.getSession();

    if (!session) {
      // No hay sesión — redirigir a login (preservando el #access_token del
      // invite si llegó primero a otra página).
      window.location.href = this._base() + 'login.html' + window.location.hash;
      return false;
    }

    this._session = session;

    // Cargar perfil del usuario
    const { data: perfil } = await window._sb.from('perfiles')
      .select('*')
      .eq('id', session.user.id)
      .single();

    if (!perfil) {
      // Usuario sin perfil — redirigir a login con mensaje
      await window._sb.auth.signOut();
      window.location.href = this._base() + 'login.html?error=sin_acceso';
      return false;
    }

    this._perfil = perfil;

    // Redirección por rol: veterinario y auxiliar arrancan en "Hoy"
    // (su agenda de campo), no en el Dashboard gerencial.
    const path = window.location.pathname;
    const enIndex = /\/index\.html$/.test(path) ||
                    path === '/' ||
                    /\/laaambapp\/?$/.test(path);
    if ((perfil.rol === 'veterinario' || perfil.rol === 'auxiliar') && enIndex) {
      window.location.href = this._base() + 'hoy.html';
      return false;
    }

    // Aplicar restricciones por rol
    this._aplicarRol(perfil.rol);

    // Actualizar UI con nombre del usuario
    this._actualizarUI(perfil);

    // Marcar sesión como lista para AppState
    window.AUTH_SESSION = session;
    window.AUTH_READY = true;

    return true;
  },

  _aplicarRol(rol) {
    // Ocultar secciones según rol
    const esGerente = rol === 'gerente';
    const esAdmin = rol === 'administrador';
    const esVet = rol === 'veterinario';
    const esAuxiliar = rol === 'auxiliar';
    const esSocio = rol === 'socio';

    // Finanzas: solo gerente, administrador, socio
    if (!esGerente && !esAdmin && !esSocio) {
      document.querySelectorAll(
        'a[href="finanzas.html"], a[href*="finanzas"]'
      ).forEach(el => el.closest('li, .nav-item, a')?.remove());
    }

    // Ajustes: solo gerente, administrador
    if (!esGerente && !esAdmin) {
      document.querySelectorAll(
        'a[href="ajustes.html"], a[href*="ajustes"]'
      ).forEach(el => el.closest('li, .nav-item, a')?.remove());
    }

    // Bajas: auxiliar/vet pueden REGISTRAR (muertes, salidas); quedan
    // pendientes de aprobación del gerente (js/approval.js). No es solo lectura.

    // Guardar rol en window para uso en páginas
    window.AUTH_ROL = rol;
    window.AUTH_PERFIL = this._perfil;

    // Control de acceso por rol a nivel de UI (js/roles.js).
    // Se aplica aquí (antes de restaurar la visibilidad) para que un
    // redirect por página no autorizada ocurra sin flash de contenido.
    if (window.Roles && typeof window.Roles.apply === 'function') {
      window.__rolesApplied = true;
      window.Roles.apply(rol);
    }
  },

  _actualizarUI(perfil) {
    // Nombre del usuario en el sidebar.
    // El markup real es: <div class="user-name">Juan García</div>
    const nameEl = document.querySelector(
      '#sb-user-name, .user-name, [data-user-name]'
    );
    if (nameEl && perfil.nombre) nameEl.textContent = perfil.nombre;

    // Rol del usuario en el sidebar.
    // El markup real es: <div class="user-role">Administrador</div>
    const roleEl = document.querySelector(
      '#sb-user-role, .user-role, [data-user-role]'
    );
    if (roleEl && perfil.rol) {
      roleEl.textContent = perfil.rol.charAt(0).toUpperCase() + perfil.rol.slice(1);
    }

    // Iniciales en el avatar (.avatar muestra "JG" por defecto)
    const avatarEl = document.querySelector('.user-row .avatar, .avatar[data-user-avatar]');
    if (avatarEl && perfil.nombre) {
      const ini = perfil.nombre.trim().split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase();
      if (ini) avatarEl.textContent = ini;
    }
  },

  async signOut() {
    await window._sb.auth.signOut();
    window.location.href = this._base() + 'login.html';
  },

  getRol() { return this._perfil?.rol; },
  getNombre() { return this._perfil?.nombre; },
  isGerente() { return this._perfil?.rol === 'gerente'; },
  isVet() { return this._perfil?.rol === 'veterinario'; },
  isAuxiliar() { return this._perfil?.rol === 'auxiliar'; },
};

// Auto-inicializar — bloquea la página hasta verificar sesión.
// Ocultar el documento hasta confirmar auth para evitar flash de contenido.
document.documentElement.style.visibility = 'hidden';
Auth.init().then(ok => {
  // Restaurar visibilidad SIEMPRE que haya sesión válida.
  // Si no hay sesión, init() ya disparó el redirect a login.
  if (ok) document.documentElement.style.visibility = 'visible';
}).catch(err => {
  // Ante cualquier error inesperado, no dejar la página oculta para siempre.
  console.error('[Auth] Error al inicializar:', err);
  document.documentElement.style.visibility = 'visible';
});
