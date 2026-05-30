// ── mobile-nav.js ──────────────────────────────────────
// Sidebar hamburger reutilizable para móvil.
// Se auto-inicializa en pantallas ≤ 768px y SOLO si la página
// no trae ya su propio hamburger (#lham) o un #menu-toggle,
// para no duplicar la navegación en las páginas que ya lo tienen.
window.MobileNav = {
  init() {
    if (window.innerWidth > 768) return;
    // Si la página ya tiene un hamburger propio, no hacer nada.
    if (document.getElementById('lham') || document.getElementById('menu-toggle')) return;
    // Necesita un <aside> para alternar.
    if (!document.querySelector('aside')) return;

    // Crear overlay
    const overlay = document.createElement('div');
    overlay.id = 'sidebar-overlay';
    overlay.style.cssText =
      'display:none;position:fixed;inset:0;' +
      'background:rgba(0,0,0,0.5);z-index:999;';
    overlay.onclick = () => this.close();
    document.body.appendChild(overlay);

    // Crear botón hamburger
    const btn = document.createElement('button');
    btn.id = 'menu-toggle';
    btn.setAttribute('aria-label', 'Menú');
    btn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" ' +
      'fill="none" stroke="white" stroke-width="2">' +
      '<line x1="3" y1="6" x2="21" y2="6"/>' +
      '<line x1="3" y1="12" x2="21" y2="12"/>' +
      '<line x1="3" y1="18" x2="21" y2="18"/></svg>';
    btn.style.cssText =
      'position:fixed;top:16px;left:16px;z-index:1001;' +
      'background:#00AFB6;border:none;border-radius:8px;' +
      'padding:10px;cursor:pointer;width:44px;height:44px;' +
      'display:flex;align-items:center;justify-content:center;' +
      'box-shadow:0 2px 8px rgba(0,0,0,0.2);';
    btn.onclick = () => this.toggle();
    document.body.appendChild(btn);

    // Cerrar con swipe left
    let touchStartX = 0;
    document.addEventListener('touchstart', e => {
      touchStartX = e.touches[0].clientX;
    }, { passive: true });
    document.addEventListener('touchend', e => {
      const dx = touchStartX - e.changedTouches[0].clientX;
      if (dx > 60) this.close(); // swipe left cierra
    }, { passive: true });
  },

  toggle() {
    const sb = document.querySelector('aside');
    const overlay = document.getElementById('sidebar-overlay');
    sb && sb.classList.toggle('open');
    if (overlay) overlay.style.display =
      sb && sb.classList.contains('open') ? 'block' : 'none';
  },

  close() {
    const sb = document.querySelector('aside');
    sb && sb.classList.remove('open');
    const overlay = document.getElementById('sidebar-overlay');
    if (overlay) overlay.style.display = 'none';
  }
};

// Auto-init cuando DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
  window.MobileNav && window.MobileNav.init();
});
