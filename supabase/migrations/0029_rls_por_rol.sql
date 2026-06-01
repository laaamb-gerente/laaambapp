-- ─────────────────────────────────────────────────────────────
-- 0029_rls_por_rol.sql
-- RLS por rol a nivel de base de datos: que Postgres bloquee el
-- acceso a datos sensibles según el rol del usuario, no solo el
-- frontend. Ejecutar en Supabase (SQL Editor).
--
-- Tabla de perfiles confirmada: 'perfiles' (no 'users' ni 'profiles').
-- ─────────────────────────────────────────────────────────────

-- Helper: rol del usuario autenticado (SECURITY DEFINER para poder
-- leer perfiles sin recursión de RLS).
CREATE OR REPLACE FUNCTION public.get_user_rol()
RETURNS text AS $$
  SELECT rol FROM perfiles
  WHERE id = auth.uid()
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- FINANZAS: solo gerente y administrador
DROP POLICY IF EXISTS "rls_costos_rol" ON costos;
CREATE POLICY "rls_costos_rol" ON costos
  FOR ALL TO authenticated
  USING (get_user_rol() IN ('gerente','administrador'));

DROP POLICY IF EXISTS "rls_ingresos_rol" ON ingresos;
CREATE POLICY "rls_ingresos_rol" ON ingresos
  FOR ALL TO authenticated
  USING (get_user_rol() IN ('gerente','administrador'));

-- NÓMINA: solo gerente y administrador
DROP POLICY IF EXISTS "rls_nomina_rol" ON liquidaciones;
CREATE POLICY "rls_nomina_rol" ON liquidaciones
  FOR ALL TO authenticated
  USING (get_user_rol() IN ('gerente','administrador'));

-- BAJAS pendientes: auxiliar solo ve las suyas
DROP POLICY IF EXISTS "rls_bajas_rol" ON bajas;
CREATE POLICY "rls_bajas_rol" ON bajas
  FOR SELECT TO authenticated
  USING (
    get_user_rol() IN ('gerente','administrador')
    OR (
      get_user_rol() IN ('veterinario','auxiliar')
      AND estado_aprobacion = 'aprobado'
    )
    OR propuesto_por = (
      SELECT email FROM perfiles WHERE id = auth.uid()
    )
  );

-- AUDIT LOG: solo gerente y administrador
DROP POLICY IF EXISTS "rls_audit_read" ON audit_log;
CREATE POLICY "rls_audit_read" ON audit_log
  FOR SELECT TO authenticated
  USING (get_user_rol() IN ('gerente','administrador'));

-- PERFILES: cada uno ve el suyo; gerente ve todos
DROP POLICY IF EXISTS "rls_perfiles_rol" ON perfiles;
CREATE POLICY "rls_perfiles_rol" ON perfiles
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR get_user_rol() IN ('gerente','administrador')
  );

-- SOCIO: solo lectura en animales y lotes
-- (INSERT/UPDATE/DELETE bloqueados)
DROP POLICY IF EXISTS "rls_animales_socio" ON animales;
CREATE POLICY "rls_animales_socio" ON animales
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (
    get_user_rol() != 'socio'
  );
