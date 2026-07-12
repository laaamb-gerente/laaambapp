-- ─────────────────────────────────────────────────────────────
-- 0053_seguimientos_y_fix_sala_cuna.sql
--
-- PARTE A — Seguimiento post-tratamiento (días 3, 5, 7, 15, 30
--           configurables en fincas.config.dias_seguimiento_tratamiento).
--           Cada tratamiento genera N chequeos que aparecen en HOY
--           preguntando cómo está el animal.
--
-- PARTE B — FIX DE RAÍZ · Sala Cuna:
--   Bug 1: enviarCriasASalaCuna insertaba motivo='muerte_madre' pero el
--          CHECK de corderos_crianza.motivo NO lo permitía → el INSERT
--          fallaba y el error se tragaba en un try/catch vacío.
--   Bug 2: el código actualizaba animales.en_sala_cuna, columna que
--          NUNCA existió en el schema → update fallaba en silencio.
--   Resultado: el toast decía "enviadas a Sala Cuna" pero el módulo
--   quedaba vacío (caso hembra 343 muerta → cría 700 nunca apareció).
--
-- PARTE C — Corrección retroactiva: enrolar en corderos_crianza las
--           crías activas cuya madre murió y que quedaron por fuera
--           por el bug anterior.
--
-- FKs verificadas contra schema real: animales.id ✓ fincas.id ✓ perfiles.id ✓
-- Idempotente. Ejecutar en Supabase (SQL Editor).
-- ─────────────────────────────────────────────────────────────

-- ══════════ PARTE A · seguimientos_tratamiento ══════════
-- tratamiento_id es TEXT (mismo criterio que dosis_programadas 0048):
-- el tratamiento puede venir de Supabase (uuid) o del sistema local.
CREATE TABLE IF NOT EXISTS seguimientos_tratamiento (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tratamiento_id text NOT NULL,
  animal_id uuid REFERENCES animales(id) ON DELETE CASCADE,
  medicamento_nombre text,
  dia_seguimiento integer NOT NULL,            -- 3, 5, 7, 15, 30…
  fecha_programada date NOT NULL,
  estado text NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente','respondido','omitido')),
  respuesta text
    CHECK (respuesta IS NULL OR respuesta IN ('bien','regular','mal','muerto')),
  observacion text,
  respondido_por text,
  fecha_respuesta timestamptz,
  finca_id uuid REFERENCES fincas(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_seg_trat_estado
  ON seguimientos_tratamiento(estado, fecha_programada)
  WHERE estado = 'pendiente';
CREATE INDEX IF NOT EXISTS idx_seg_trat_animal
  ON seguimientos_tratamiento(animal_id);
CREATE INDEX IF NOT EXISTS idx_seg_trat_tratamiento
  ON seguimientos_tratamiento(tratamiento_id);

ALTER TABLE seguimientos_tratamiento ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_all_seguimientos_tratamiento" ON seguimientos_tratamiento;
CREATE POLICY "auth_all_seguimientos_tratamiento" ON seguimientos_tratamiento
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Reutiliza update_updated_at() (creada en 0040)
DROP TRIGGER IF EXISTS trg_seg_trat_updated_at ON seguimientos_tratamiento;
CREATE TRIGGER trg_seg_trat_updated_at
  BEFORE UPDATE ON seguimientos_tratamiento
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Días de seguimiento por defecto en la config de la finca
-- (editable desde Ajustes → Producción). Solo agrega la clave si no existe.
UPDATE fincas
SET config = COALESCE(config, '{}'::jsonb)
          || '{"dias_seguimiento_tratamiento":[3,5,7,15,30]}'::jsonb
WHERE id = 'a1b2c3d4-0000-0000-0000-000000000001'
  AND (config IS NULL OR NOT (config ? 'dias_seguimiento_tratamiento'));

-- ══════════ PARTE B · FIX SALA CUNA ══════════

-- Bug 2: crear la columna que el código siempre asumió.
ALTER TABLE animales
  ADD COLUMN IF NOT EXISTS en_sala_cuna boolean DEFAULT false;

-- Bug 1: ampliar el CHECK de motivo para aceptar 'muerte_madre'
-- (semánticamente distinto de 'huerfano' genérico: preserva la causa real).
DO $$
DECLARE
  v_conname text;
BEGIN
  SELECT conname INTO v_conname
  FROM pg_constraint
  WHERE conrelid = 'corderos_crianza'::regclass
    AND contype  = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%motivo%';
  IF v_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE corderos_crianza DROP CONSTRAINT %I', v_conname);
  END IF;
  ALTER TABLE corderos_crianza
    ADD CONSTRAINT corderos_crianza_motivo_check
    CHECK (motivo IN (
      'huerfano','mala_madre','sustituto_voluntario',
      'baja_produccion_madre','muerte_madre'
    ));
END $$;

-- ══════════ PARTE C · CORRECCIÓN RETROACTIVA ══════════
-- Enrola en corderos_crianza las crías ACTIVAS sin destetar cuya madre
-- ya no está activa (murió), que quedaron por fuera por el bug.
-- Previsualiza primero con este SELECT si quieres revisar:
--
--   SELECT c.id, c.codigo, c.nombre, m.codigo AS madre, m.estado AS estado_madre
--   FROM animales c
--   JOIN animales m ON m.id = c.madre_id
--   WHERE c.estado = 'activo'
--     AND c.fecha_destete IS NULL
--     AND (c.peso_actual IS NULL OR c.peso_actual < 20)
--     AND m.estado <> 'activo'
--     AND NOT EXISTS (
--       SELECT 1 FROM corderos_crianza cc
--       WHERE cc.cordero_id = c.id AND cc.estado = 'activo'
--     );

INSERT INTO corderos_crianza
  (cordero_id, madre_id, motivo, metodo, estado, fecha_inicio, peso_inicio_kg, finca_id, notas)
SELECT
  c.id,
  c.madre_id,
  'muerte_madre',
  'tetero',
  'activo',
  CURRENT_DATE,
  c.peso_actual,
  c.finca_id,
  'Enrolada retroactivamente (fix 0053): la madre '||COALESCE(m.codigo,'?')||' murió y el bug impidió el registro original.'
FROM animales c
JOIN animales m ON m.id = c.madre_id
WHERE c.estado = 'activo'
  AND c.fecha_destete IS NULL
  AND (c.peso_actual IS NULL OR c.peso_actual < 20)
  AND m.estado <> 'activo'
  AND NOT EXISTS (
    SELECT 1 FROM corderos_crianza cc
    WHERE cc.cordero_id = c.id AND cc.estado = 'activo'
  );

-- Marcar el flag en animales para las crías con crianza activa
UPDATE animales a
SET en_sala_cuna = true
WHERE EXISTS (
  SELECT 1 FROM corderos_crianza cc
  WHERE cc.cordero_id = a.id AND cc.estado = 'activo'
);

NOTIFY pgrst, 'reload schema';
