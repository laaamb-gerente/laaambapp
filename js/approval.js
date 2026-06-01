// ── approval.js ───────────────────────────────────────
// Helper de flujo de aprobación RBAC. Depende de window.AUTH_ROL
// y window.AUTH_PERFIL (los setea auth.js), por lo que debe cargarse
// DESPUÉS de auth.js y roles.js. Usa showToast() ya existente.

// Determina si la acción del usuario actual requiere
// aprobación o se auto-aprueba
function requiresApproval() {
  const rol = window.AUTH_ROL || '';
  return rol === 'auxiliar' || rol === 'veterinario';
}

// Devuelve el estado inicial según el rol
function getEstadoInicial() {
  return requiresApproval() ? 'pendiente' : 'aprobado';
}

// Datos de quien propone (para guardar en el registro)
function getPropuestoPor() {
  return {
    propuesto_por: window.AUTH_PERFIL?.email ||
                   window.AUTH_PERFIL?.nombre || '',
    propuesto_por_rol: window.AUTH_ROL || ''
  };
}

// Muestra toast diferenciado según si quedó pendiente
// o se aprobó automáticamente.
// NOTA: esta app expone `toast(msg, type)` con tipos ok|err|info
// (no existe `showToast`). Usamos esa función; si en el futuro se
// agrega showToast con tipos success/warning, también se soporta.
function _approvalToast(msg, kind) {
  // kind: 'ok' (éxito) | 'info' (pendiente/amarillo)
  if (typeof showToast === 'function') {
    return showToast(msg, kind === 'info' ? 'warning' : 'success');
  }
  var fn = (typeof toast === 'function') ? toast :
           (window && typeof window.toast === 'function') ? window.toast : null;
  if (fn) return fn(msg, kind);
  console.log('[approval]', msg);
}

function toastAprobacion(mensaje_aprobado,
                          mensaje_pendiente) {
  if (requiresApproval()) {
    // Toast amarillo (info) para acciones pendientes
    _approvalToast(mensaje_pendiente ||
      '⏳ Registrado. Pendiente de aprobación por el gerente.',
      'info');
  } else {
    _approvalToast(mensaje_aprobado, 'ok');
  }
}

window.Approval = {
  requiresApproval,
  getEstadoInicial,
  getPropuestoPor,
  toastAprobacion
};
