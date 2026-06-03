-- ─────────────────────────────────────────────────────────────
-- 0045_quesos_qr.sql   (Fase 8 · QR público de trazabilidad de queso)
--
-- quesos_lotes (creada en 0043) ya tiene todos los campos necesarios para
-- la trazabilidad pública (fecha, tipo_queso, leche_usada_l, queso_kg,
-- rendimiento_l_por_kg, maduracion_dias, notas, finca_id). NO se añaden
-- columnas.
--
-- Única necesidad: permitir LECTURA ANÓNIMA para que qr-queso.html (página
-- pública, sin login) pueda mostrar el lote. La política existente
-- (auth_all_quesos_lotes) es solo TO authenticated.
--
-- ⚠️ NOTA DE PRIVACIDAD: esta política expone TODAS las columnas de
-- quesos_lotes a anon, incluidas costo_leche/costo_insumos/costo_mano_obra/
-- costo_total/precio_venta_kg/ingreso_total. La página qr-queso.html solo
-- muestra campos públicos, pero cualquiera con la anon key podría leer los
-- costos. Si la confidencialidad de costos importa, reemplazar por una VISTA
-- con solo columnas públicas (ver nota en el aviso de la fase).
--
-- Idempotente. Ejecutar en Supabase (SQL Editor).
-- ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "anon_read_quesos_lotes" ON quesos_lotes;
CREATE POLICY "anon_read_quesos_lotes" ON quesos_lotes
  FOR SELECT TO anon USING (true);

NOTIFY pgrst, 'reload schema';
