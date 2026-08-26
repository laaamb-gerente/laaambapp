-- ─────────────────────────────────────────────────────────────
-- 0069_dosis_clozaval_dilarvon_cydectin.sql
-- Fórmulas de La Marinilla (oral 1 ml / 4 kg Clozaval y Dilarvon;
-- Cydectin 1 ml / 20 kg). Pisa valores previos de 0059 si hace falta.
-- Idempotente. Juan corre en SQL Editor.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE medicamentos ADD COLUMN IF NOT EXISTS dosis_sugerida text;
ALTER TABLE medicamentos ADD COLUMN IF NOT EXISTS dosis_estandar text;
ALTER TABLE medicamentos ADD COLUMN IF NOT EXISTS via_administracion text;

-- Clozaval y Dilarvon: orales, 1 ml / 4 kg
UPDATE medicamentos SET
  dosis_sugerida = '1 ml / 4 kg',
  dosis_estandar = '1 ml / 4 kg',
  via_administracion = 'VO',
  updated_at = now()
WHERE nombre ILIKE '%clozaval%'
   OR nombre ILIKE '%dilarvon%'
   OR principio_activo ILIKE '%clozaval%'
   OR principio_activo ILIKE '%dilarvon%';

-- Cydectin (moxidectina): 1 ml / 20 kg  (= 0,5 ml / 10 kg)
UPDATE medicamentos SET
  dosis_sugerida = '1 ml / 20 kg',
  dosis_estandar = '1 ml / 20 kg',
  updated_at = now()
WHERE nombre ILIKE '%cydectin%'
   OR principio_activo ILIKE '%moxidectin%';

SELECT nombre, principio_activo, dosis_sugerida, dosis_estandar, via_administracion
FROM medicamentos
WHERE nombre ILIKE '%clozaval%'
   OR nombre ILIKE '%dilarvon%'
   OR nombre ILIKE '%cydectin%'
   OR principio_activo ILIKE '%moxidectin%'
ORDER BY nombre;
