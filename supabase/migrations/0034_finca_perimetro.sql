-- ─────────────────────────────────────────────────────────────
-- 0034_finca_perimetro.sql
-- Perímetro de la finca PERSISTENTE en Supabase (fuente de verdad).
-- Antes vivía solo en localStorage (AppData) y se perdía al limpiar caché.
-- Guarda el GeoJSON del polígono, área en ha y el centroide.
-- Ejecutar en Supabase (SQL Editor).
-- ─────────────────────────────────────────────────────────────

ALTER TABLE fincas
  ADD COLUMN IF NOT EXISTS perimetro_geojson jsonb,
  ADD COLUMN IF NOT EXISTS perimetro_area_ha numeric,
  ADD COLUMN IF NOT EXISTS perimetro_centro_lat numeric,
  ADD COLUMN IF NOT EXISTS perimetro_centro_lng numeric;
