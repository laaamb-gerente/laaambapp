-- ─────────────────────────────────────────────────────────────
-- 0060_fix_nombres_medicamentos.sql
-- Corrige nombres mal escritos en inventario.
-- Juan ejecuta en Supabase SQL Editor.
-- ─────────────────────────────────────────────────────────────

-- Ovaxel ADE → Oversel ADE (producto selenio / ADE de la finca)
UPDATE medicamentos
SET
  nombre = 'Oversel ADE',
  principio_activo = COALESCE(
    NULLIF(trim(principio_activo), ''),
    'Selenio + vitaminas A, D y E'
  ),
  updated_at = now()
WHERE nombre ILIKE '%ovaxel%'
   OR nombre ILIKE 'oversel ade'
   OR (nombre ILIKE '%over-sel%' AND nombre ILIKE '%ade%');

-- También unificar "Over-Sel (selenio + vit. E)" si se creó en 0059 y era el ADE
UPDATE medicamentos
SET
  nombre = 'Oversel ADE',
  principio_activo = COALESCE(NULLIF(trim(principio_activo), ''), 'Selenio + vitaminas A, D y E'),
  updated_at = now()
WHERE nombre ILIKE 'over-sel (selenio%'
   OR nombre ILIKE 'over sel (selenio%';

-- Vetbistam / Vetbista → Vethistam (marca comercial)
UPDATE medicamentos
SET
  nombre = CASE
    WHEN nombre ~* '2s' OR nombre ILIKE '%2 s%' THEN 'Vethistam 2S'
    ELSE 'Vethistam'
  END,
  updated_at = now()
WHERE nombre ILIKE '%vetbistam%'
   OR nombre ILIKE '%vetbista%'
   OR nombre ILIKE '%vethistam%';

-- Verificación
SELECT id, nombre, principio_activo, dosis_sugerida
FROM medicamentos
WHERE nombre ILIKE '%oversel%'
   OR nombre ILIKE '%ovaxel%'
   OR nombre ILIKE '%vet%'
   OR nombre ILIKE '%histam%'
ORDER BY nombre;
