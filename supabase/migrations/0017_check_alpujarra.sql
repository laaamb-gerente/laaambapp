-- 0017_check_alpujarra.sql
-- DIAGNÓSTICO: Verificar si la segunda finca "La Alpujarra" es demo/sobrante.
-- NO ejecuta cambios destructivos. Revisar resultados antes de borrar.
-- Juan: corre primero el SELECT, revisa los conteos, y SOLO si confirmas que
-- "La Alpujarra" no tiene datos reales, descomenta el DELETE del final.

-- 1) Listar todas las fincas con sus conteos de animales y lotes
SELECT
  f.id,
  f.nombre,
  f.municipio,
  f.departamento,
  COALESCE(a.total_animales, 0)  AS total_animales,
  COALESCE(l.total_lotes, 0)     AS total_lotes,
  f.created_at
FROM fincas f
LEFT JOIN (
  SELECT finca_id, COUNT(*) AS total_animales
  FROM animales
  GROUP BY finca_id
) a ON a.finca_id = f.id
LEFT JOIN (
  SELECT finca_id, COUNT(*) AS total_lotes
  FROM lotes
  GROUP BY finca_id
) l ON l.finca_id = f.id
ORDER BY f.created_at;

-- 2) (OPCIONAL) Borrar "La Alpujarra" SOLO si confirmaste que es demo y no tiene datos.
--    Descomenta las siguientes líneas tras revisar el SELECT de arriba.
-- DELETE FROM fincas
-- WHERE nombre = 'La Alpujarra'
--   AND id <> 'a1b2c3d4-0000-0000-0000-000000000001';
