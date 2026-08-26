-- ─────────────────────────────────────────────────────────────
-- 0068_dosis_pauta_e_omitida.sql
-- Pauta de dosis: única | continua (días seguidos) | intervalos (a los X días).
-- Resultado omitida + motivo buen_estado (animal bien → no aplicar refuerzo).
-- Idempotente. Juan lo corre en SQL Editor. No aplica el agente.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE dosis_programadas
  ADD COLUMN IF NOT EXISTS pauta text;

ALTER TABLE dosis_programadas
  ADD COLUMN IF NOT EXISTS dia_offset integer;

ALTER TABLE dosis_programadas
  ADD COLUMN IF NOT EXISTS motivo text;

UPDATE dosis_programadas
   SET pauta = COALESCE(NULLIF(trim(pauta), ''), 'continua')
 WHERE pauta IS NULL OR trim(pauta) = '';

UPDATE dosis_programadas
   SET dia_offset = COALESCE(dia_offset, GREATEST(0, numero_dosis - 1))
 WHERE dia_offset IS NULL;

ALTER TABLE dosis_programadas
  DROP CONSTRAINT IF EXISTS dosis_programadas_estado_check;

ALTER TABLE dosis_programadas
  ADD CONSTRAINT dosis_programadas_estado_check
  CHECK (estado IN ('pendiente', 'aplicada', 'saltada', 'omitida'));

ALTER TABLE dosis_programadas
  DROP CONSTRAINT IF EXISTS dosis_programadas_pauta_check;

ALTER TABLE dosis_programadas
  ADD CONSTRAINT dosis_programadas_pauta_check
  CHECK (pauta IS NULL OR pauta IN ('unica', 'continua', 'intervalos'));

CREATE INDEX IF NOT EXISTS idx_dosis_prog_animal_fecha
  ON dosis_programadas(animal_id, fecha_programada);

COMMENT ON COLUMN dosis_programadas.pauta IS 'unica | continua (q24h) | intervalos (refuerzo a los X días desde dosis 0)';
COMMENT ON COLUMN dosis_programadas.dia_offset IS 'Días desde la 1.ª dosis (0, 7, 15, 21…)';
COMMENT ON COLUMN dosis_programadas.motivo IS 'buen_estado cuando estado=omitida; otro texto libre si aplica';

NOTIFY pgrst, 'reload schema';
