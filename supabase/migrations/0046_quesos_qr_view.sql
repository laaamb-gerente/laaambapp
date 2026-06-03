-- ─────────────────────────────────────────────────────────────
-- 0046_quesos_qr_view.sql   (Fase 8 · QR — vista pública sin costos)
--
-- Reemplaza la lectura anónima directa de quesos_lotes (0045) por una VISTA
-- que expone SOLO columnas públicas. Así el QR público (qr-queso.html) funciona
-- sin login y SIN filtrar costos/precios/márgenes.
--
-- Cómo protege: una vista normal (no security_invoker) corre con los permisos
-- de su dueño, por lo que anon puede leerla aunque NO tenga policy sobre la
-- tabla base. Por eso se ELIMINA la policy anon de 0045 y la tabla quesos_lotes
-- vuelve a ser solo TO authenticated.
--
-- Idempotente. Ejecutar en Supabase (SQL Editor).
-- ─────────────────────────────────────────────────────────────

-- 1. Quitar la lectura anónima directa sobre la tabla base (0045).
DROP POLICY IF EXISTS "anon_read_quesos_lotes" ON quesos_lotes;

-- 2. Vista pública con solo columnas no sensibles.
CREATE OR REPLACE VIEW quesos_lotes_publico AS
  SELECT id, fecha, tipo_queso, leche_usada_l, queso_kg,
         rendimiento_l_por_kg, maduracion_dias, notas, finca_id
  FROM quesos_lotes;

-- 3. Permitir lectura anónima SOLO de la vista.
GRANT SELECT ON quesos_lotes_publico TO anon;

NOTIFY pgrst, 'reload schema';
