-- ─────────────────────────────────────────────────────────────
-- 0059_dosis_sugerida_ovinos_oversel.sql
-- Completa dosis_sugerida (ovinos) donde falte y corrige nombre Oversel.
-- Idempotente. Juan ejecuta en Supabase SQL Editor (no aplicar desde el agente).
-- ─────────────────────────────────────────────────────────────

-- 0) Asegurar columnas usadas (por si una base vieja no las tiene)
ALTER TABLE medicamentos ADD COLUMN IF NOT EXISTS dosis_sugerida text;
ALTER TABLE medicamentos ADD COLUMN IF NOT EXISTS principio_activo text;
ALTER TABLE medicamentos ADD COLUMN IF NOT EXISTS dosis_estandar text;

-- 1) Arreglar nombre raro "Oversel" / variantes
--    Producto típico: selenio + vitamina E (marca Over-Sel / similares).
UPDATE medicamentos
SET
  nombre = 'Over-Sel (selenio + vit. E)',
  principio_activo = COALESCE(NULLIF(trim(principio_activo), ''), 'Selenio + vitamina E'),
  updated_at = now()
WHERE nombre ILIKE '%oversel%'
   OR nombre ILIKE '%over sel%'
   OR nombre ILIKE '%over-sel%'
   OR nombre ILIKE '%over_sel%';

-- 2) Dosis sugeridas ovinas por principio / nombre comercial
--    Solo rellena si dosis_sugerida está vacía (no pisa lo ya cargado a mano).
--    Formato preferido: "X ml / Y kg" para que la UI de HOY calcule mL.

UPDATE medicamentos SET dosis_sugerida = '0.2 ml / 10 kg', updated_at = now()
WHERE (dosis_sugerida IS NULL OR trim(dosis_sugerida) = '')
  AND (
    principio_activo ILIKE '%ivermectin%'
    OR nombre ILIKE '%ivermectin%'
    OR nombre ILIKE '%ivomec%'
    OR nombre ILIKE '%baymec%'
    OR nombre ILIKE '%master%lp%'
  );

UPDATE medicamentos SET dosis_sugerida = '1 ml / 50 kg', updated_at = now()
WHERE (dosis_sugerida IS NULL OR trim(dosis_sugerida) = '')
  AND (
    principio_activo ILIKE '%doramectin%'
    OR nombre ILIKE '%doramectin%'
    OR nombre ILIKE '%dectomax%'
  );

UPDATE medicamentos SET dosis_sugerida = '1 ml / 50 kg', updated_at = now()
WHERE (dosis_sugerida IS NULL OR trim(dosis_sugerida) = '')
  AND (
    principio_activo ILIKE '%moxidectin%'
    OR nombre ILIKE '%moxidectin%'
    OR nombre ILIKE '%cydectin%'
  );

UPDATE medicamentos SET dosis_sugerida = '1 ml / 10 kg', updated_at = now()
WHERE (dosis_sugerida IS NULL OR trim(dosis_sugerida) = '')
  AND (
    principio_activo ILIKE '%albendazol%'
    OR principio_activo ILIKE '%albendazole%'
    OR nombre ILIKE '%albendazol%'
    OR nombre ILIKE '%valbazen%'
  );

UPDATE medicamentos SET dosis_sugerida = '1 ml / 5 kg', updated_at = now()
WHERE (dosis_sugerida IS NULL OR trim(dosis_sugerida) = '')
  AND (
    principio_activo ILIKE '%fenbendazol%'
    OR principio_activo ILIKE '%fenbendazole%'
    OR nombre ILIKE '%fenbendazol%'
    OR nombre ILIKE '%panacur%'
  );

UPDATE medicamentos SET dosis_sugerida = '1 ml / 10 kg', updated_at = now()
WHERE (dosis_sugerida IS NULL OR trim(dosis_sugerida) = '')
  AND (
    principio_activo ILIKE '%levamisol%'
    OR principio_activo ILIKE '%levamisole%'
    OR nombre ILIKE '%levamisol%'
    OR nombre ILIKE '%ripercol%'
    OR nombre ILIKE '%levisol%'
  );

UPDATE medicamentos SET dosis_sugerida = '1 ml / 10 kg', updated_at = now()
WHERE (dosis_sugerida IS NULL OR trim(dosis_sugerida) = '')
  AND (
    principio_activo ILIKE '%closantel%'
    OR nombre ILIKE '%closantel%'
  );

UPDATE medicamentos SET dosis_sugerida = '1 ml / 25 kg', updated_at = now()
WHERE (dosis_sugerida IS NULL OR trim(dosis_sugerida) = '')
  AND (
    principio_activo ILIKE '%nitroxinil%'
    OR principio_activo ILIKE '%nitroxynil%'
    OR nombre ILIKE '%dovenix%'
    OR nombre ILIKE '%nitroxinil%'
  );

UPDATE medicamentos SET dosis_sugerida = '1 ml / 20 kg', updated_at = now()
WHERE (dosis_sugerida IS NULL OR trim(dosis_sugerida) = '')
  AND (
    principio_activo ILIKE '%rafoxanid%'
    OR nombre ILIKE '%rafenelle%'
    OR nombre ILIKE '%rafoxanid%'
  );

UPDATE medicamentos SET dosis_sugerida = '1 ml / 10 kg', updated_at = now()
WHERE (dosis_sugerida IS NULL OR trim(dosis_sugerida) = '')
  AND (
    principio_activo ILIKE '%oxitetraciclina%'
    OR principio_activo ILIKE '%oxytetracycline%'
    OR nombre ILIKE '%oxitetraciclina%'
    OR nombre ILIKE '%terramicina%'
    OR nombre ILIKE '%oxytet%'
  );

UPDATE medicamentos SET dosis_sugerida = '1 ml / 20 kg', updated_at = now()
WHERE (dosis_sugerida IS NULL OR trim(dosis_sugerida) = '')
  AND (
    principio_activo ILIKE '%penicilina%'
    OR principio_activo ILIKE '%penicillin%'
    OR nombre ILIKE '%penicilina%'
    OR nombre ILIKE '%penbiotic%'
  );

UPDATE medicamentos SET dosis_sugerida = '1 ml / 10 kg', updated_at = now()
WHERE (dosis_sugerida IS NULL OR trim(dosis_sugerida) = '')
  AND (
    principio_activo ILIKE '%enrofloxacina%'
    OR principio_activo ILIKE '%enrofloxacin%'
    OR nombre ILIKE '%enroflox%'
    OR nombre ILIKE '%baytril%'
  );

UPDATE medicamentos SET dosis_sugerida = '1–2 ml / animal adulto', updated_at = now()
WHERE (dosis_sugerida IS NULL OR trim(dosis_sugerida) = '')
  AND (
    principio_activo ILIKE '%vitamina%'
    OR principio_activo ILIKE '%complejo b%'
    OR nombre ILIKE '%vitamina%'
    OR nombre ILIKE '%complejo b%'
    OR nombre ILIKE '%ade%'
  );

UPDATE medicamentos SET dosis_sugerida = '1 ml / 10 kg', updated_at = now()
WHERE (dosis_sugerida IS NULL OR trim(dosis_sugerida) = '')
  AND (
    principio_activo ILIKE '%selenio%'
    OR principio_activo ILIKE '%selenium%'
    OR nombre ILIKE '%selenio%'
    OR nombre ILIKE '%over-sel%'
    OR nombre ILIKE '%over sel%'
  );

UPDATE medicamentos SET dosis_sugerida = '20–50 ml / oveja adulta (lento, SC o IV según producto)', updated_at = now()
WHERE (dosis_sugerida IS NULL OR trim(dosis_sugerida) = '')
  AND (
    principio_activo ILIKE '%calcio%'
    OR principio_activo ILIKE '%calcium%'
    OR nombre ILIKE '%calcio%'
    OR nombre ILIKE '%glucoborocalcio%'
    OR nombre ILIKE '%calfon%'
  );

UPDATE medicamentos SET dosis_sugerida = '1 ml / 10 kg', updated_at = now()
WHERE (dosis_sugerida IS NULL OR trim(dosis_sugerida) = '')
  AND (
    principio_activo ILIKE '%dexametasona%'
    OR principio_activo ILIKE '%dexamethasone%'
    OR nombre ILIKE '%dexametasona%'
    OR nombre ILIKE '%dexafort%'
  );

UPDATE medicamentos SET dosis_sugerida = '1 ml / 20 kg', updated_at = now()
WHERE (dosis_sugerida IS NULL OR trim(dosis_sugerida) = '')
  AND (
    principio_activo ILIKE '%meloxicam%'
    OR nombre ILIKE '%meloxicam%'
    OR nombre ILIKE '%metacam%'
  );

UPDATE medicamentos SET dosis_sugerida = '1 ml / 10 kg', updated_at = now()
WHERE (dosis_sugerida IS NULL OR trim(dosis_sugerida) = '')
  AND (
    principio_activo ILIKE '%ivermectin%+%'
    OR nombre ILIKE '%ivermectin%f%'
    OR nombre ILIKE '%ivomec f%'
  );

-- 3) Fallback genérico residual: lo que siga vacío
UPDATE medicamentos SET
  dosis_sugerida = 'Según etiqueta del frasco (completar en inventario)',
  updated_at = now()
WHERE dosis_sugerida IS NULL OR trim(dosis_sugerida) = '';

-- 4) También copiar a dosis_estandar si está vacía (calculadoras viejas)
UPDATE medicamentos SET
  dosis_estandar = dosis_sugerida,
  updated_at = now()
WHERE (dosis_estandar IS NULL OR trim(dosis_estandar) = '')
  AND dosis_sugerida IS NOT NULL
  AND trim(dosis_sugerida) <> '';

-- 5) Verificación
SELECT
  nombre,
  principio_activo,
  dosis_sugerida,
  dosis_estandar
FROM medicamentos
ORDER BY nombre;
