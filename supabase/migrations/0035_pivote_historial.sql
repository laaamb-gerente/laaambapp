-- ─────────────────────────────────────────────────────────────
-- 0035_pivote_historial.sql
-- Soft-delete de pivotes: NUNCA se borran físicamente. Al "eliminar"
-- se marca eliminado=true y se conserva un snapshot de sus potreros
-- para referencia histórica.
-- Ejecutar en Supabase (SQL Editor).
-- ─────────────────────────────────────────────────────────────

ALTER TABLE pivotes
  ADD COLUMN IF NOT EXISTS eliminado boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS fecha_eliminacion timestamptz,
  ADD COLUMN IF NOT EXISTS motivo_eliminacion text,
  ADD COLUMN IF NOT EXISTS potreros_snapshot jsonb;
  -- potreros_snapshot: JSON con [{id, nombre, area_ha}, ...] que tenía
  -- el pivote antes de eliminar.
