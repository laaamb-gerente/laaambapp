-- 0017_fix_ubicacion.sql
-- Corrige la ubicación de "La Marinilla": vereda San Bernardo, Ibagué, Tolima.

-- Agregar columna vereda si no existe
ALTER TABLE fincas ADD COLUMN IF NOT EXISTS vereda text;

-- Corregir ubicación de La Marinilla
UPDATE fincas SET
  municipio = 'Ibagué',
  departamento = 'Tolima',
  vereda = 'San Bernardo'
WHERE id = 'a1b2c3d4-0000-0000-0000-000000000001';

-- Verificar La Alpujarra (ejecutar para diagnóstico)
SELECT
  f.nombre, f.municipio, f.departamento,
  COUNT(DISTINCT a.id) as animales,
  COUNT(DISTINCT l.id) as lotes
FROM fincas f
LEFT JOIN animales a ON a.finca_id = f.id
LEFT JOIN lotes l ON l.finca_id = f.id
GROUP BY f.id, f.nombre, f.municipio, f.departamento;
