-- ─────────────────────────────────────────────────────────────
-- 0009_deshabilitar_signup.sql
-- Nota: el signup público ya está deshabilitado en el dashboard.
-- Este archivo documenta la configuración de seguridad.
--
-- Para invitar usuarios:
--   Supabase Dashboard > Authentication > Users > Add user
--   (define email + contraseña inicial; el usuario la usa para entrar)
--
-- Luego el trigger on_auth_user_created (migración 0008) crea el
-- perfil automáticamente con rol por defecto 'auxiliar'.
--
-- Para asignar el rol correcto, ejecutar:
--   UPDATE perfiles SET rol = 'veterinario' WHERE email = 'email@ejemplo.com';
-- ─────────────────────────────────────────────────────────────

SELECT 'Configuración de seguridad documentada' as status;
