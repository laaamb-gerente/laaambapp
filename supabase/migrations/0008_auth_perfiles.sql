-- ─────────────────────────────────────────────────────────────
-- 0008_auth_perfiles.sql
-- Autenticación: creación automática de perfiles + vista de equipo
-- Ejecutar en Supabase (SQL editor). Juan lo corre manualmente.
-- ─────────────────────────────────────────────────────────────

-- Trigger para crear perfil automáticamente cuando un usuario
-- acepta una invitación / se registra vía magic link.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  -- Solo crear perfil si no existe
  INSERT INTO public.perfiles (id, nombre, email, rol)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nombre',
             split_part(NEW.email, '@', 1)),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'rol', 'auxiliar')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Vista para que el gerente vea todos los perfiles del equipo
-- junto con datos de actividad de auth.users.
CREATE OR REPLACE VIEW perfiles_equipo AS
SELECT
  p.id, p.nombre, p.email, p.rol, p.activo, p.created_at,
  u.last_sign_in_at,
  u.created_at as fecha_registro
FROM perfiles p
JOIN auth.users u ON p.id = u.id;
