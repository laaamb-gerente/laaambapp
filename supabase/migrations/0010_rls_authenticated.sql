-- ─────────────────────────────────────────────────────────────
-- 0010_rls_authenticated.sql
-- Las políticas RLS de las tablas principales se crearon para el rol
-- 'anon'. Con login real, los usuarios consultan como 'authenticated',
-- por lo que necesitan sus propias políticas o reciben todo en ceros.
-- Ejecutar en Supabase (SQL editor). Juan lo corre manualmente.
-- ─────────────────────────────────────────────────────────────

-- Agregar políticas para usuarios autenticados en tablas principales
CREATE POLICY "auth_all_animales" ON animales
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_lotes" ON lotes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_fincas" ON fincas
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_eventos" ON eventos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_medicamentos" ON medicamentos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_tratamientos" ON tratamientos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_pesajes" ON pesajes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_costos" ON costos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_ingresos" ON ingresos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_bajas" ON bajas
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_eventos_rep" ON eventos_reproductivos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
