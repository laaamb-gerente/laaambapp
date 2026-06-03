-- ─────────────────────────────────────────────────────────────
-- 0044_evaluaciones_maternas.sql   (Fase 6 · Score materno + descarte)
--
-- FKs/columnas verificadas contra el schema real (REST):
--   animales.id ✓   lactancias.id ✓   perfiles.id ✓
--   animales.score_materno / candidata_descarte / motivo_descarte /
--     fecha_flag_descarte → NO existían (HTTP 400) → seguro añadirlas.
--   evaluaciones_maternas → NO existía (HTTP 404).
--
-- Idempotente. Ejecutar en Supabase (SQL Editor).
-- ─────────────────────────────────────────────────────────────

-- ── PARTE A — Tabla evaluaciones_maternas ──
CREATE TABLE IF NOT EXISTS evaluaciones_maternas (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  animal_id uuid NOT NULL REFERENCES animales(id) ON DELETE CASCADE,
  lactancia_id uuid REFERENCES lactancias(id) ON DELETE SET NULL,
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  acepto_corderos boolean NOT NULL DEFAULT true,
  leche_suficiente boolean NOT NULL DEFAULT true,
  mastitis boolean NOT NULL DEFAULT false,
  corderos_nacidos integer NOT NULL DEFAULT 1,
  corderos_destetados_vivos integer NOT NULL DEFAULT 1,
  observacion text,
  evaluado_por uuid REFERENCES perfiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_eval_maternas_animal
  ON evaluaciones_maternas(animal_id);
CREATE INDEX IF NOT EXISTS idx_eval_maternas_fecha
  ON evaluaciones_maternas(fecha DESC);

ALTER TABLE evaluaciones_maternas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_all_eval_maternas" ON evaluaciones_maternas;
CREATE POLICY "auth_all_eval_maternas" ON evaluaciones_maternas
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── PARTE B — Columnas de score/descarte en animales ──
ALTER TABLE animales
  ADD COLUMN IF NOT EXISTS score_materno integer DEFAULT 100
    CHECK (score_materno >= 0 AND score_materno <= 100),
  ADD COLUMN IF NOT EXISTS candidata_descarte boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS motivo_descarte text,
  ADD COLUMN IF NOT EXISTS fecha_flag_descarte date;

NOTIFY pgrst, 'reload schema';
