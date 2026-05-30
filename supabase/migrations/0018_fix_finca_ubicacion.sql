-- 0018_fix_finca_ubicacion.sql
-- Corrige la ubicación de "La Marinilla": vereda San Bernardo, Ibagué, Tolima.
-- (Antes estaba marcada incorrectamente en Antioquia.)

-- 1) Asegurar que exista la columna vereda
ALTER TABLE fincas ADD COLUMN IF NOT EXISTS vereda text;

-- 2) Actualizar municipio y departamento
UPDATE fincas
SET municipio = 'Ibagué',
    departamento = 'Tolima'
WHERE nombre = 'La Marinilla'
  AND id = 'a1b2c3d4-0000-0000-0000-000000000001';

-- 3) Actualizar vereda
UPDATE fincas
SET vereda = 'San Bernardo'
WHERE nombre = 'La Marinilla'
  AND id = 'a1b2c3d4-0000-0000-0000-000000000001';
