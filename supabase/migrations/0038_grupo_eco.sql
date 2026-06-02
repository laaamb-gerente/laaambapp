-- ─────────────────────────────────────────────────────────────
-- 0038_grupo_eco.sql
-- Fecha de ecografía a nivel de grupo de monta (se programa para todo
-- el grupo, ~30 días después del inicio).
-- Ejecutar en Supabase (SQL Editor).
-- ─────────────────────────────────────────────────────────────

ALTER TABLE grupos_monta
  ADD COLUMN IF NOT EXISTS fecha_ecografia date;
