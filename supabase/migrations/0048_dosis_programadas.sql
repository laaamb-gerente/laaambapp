-- ─────────────────────────────────────────────────────────────
-- 0048_dosis_programadas.sql   (Tratamientos multi-dosis · agenda diaria)
--
-- tratamiento_id es TEXT: el tratamiento puede venir de Supabase (uuid) o del
-- sistema local (AppData). Se guarda el id como texto para no acoplar la FK.
-- FKs verificadas: animales.id ✓  perfiles.id ✓  fincas.id ✓.
-- Reutiliza update_updated_at() (creada en 0040).
--
-- Idempotente. Ejecutar en Supabase (SQL Editor).
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dosis_programadas (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tratamiento_id text NOT NULL,
  animal_id uuid REFERENCES animales(id) ON DELETE CASCADE,
  numero_dosis integer NOT NULL,
  total_dosis integer NOT NULL,
  fecha_programada date NOT NULL,
  hora_objetivo time,
  estado text NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente','aplicada','saltada')),
  fecha_hora_aplicacion timestamptz,
  colaborador uuid REFERENCES perfiles(id) ON DELETE SET NULL,
  foto_url text,
  dosis_aplicada text,
  observacion text,
  finca_id uuid REFERENCES fincas(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dosis_prog_estado
  ON dosis_programadas(estado, fecha_programada)
  WHERE estado = 'pendiente';
CREATE INDEX IF NOT EXISTS idx_dosis_prog_animal
  ON dosis_programadas(animal_id);
CREATE INDEX IF NOT EXISTS idx_dosis_prog_tratamiento
  ON dosis_programadas(tratamiento_id);

ALTER TABLE dosis_programadas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_all_dosis_programadas" ON dosis_programadas;
CREATE POLICY "auth_all_dosis_programadas" ON dosis_programadas
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS trg_dosis_prog_updated_at ON dosis_programadas;
CREATE TRIGGER trg_dosis_prog_updated_at
  BEFORE UPDATE ON dosis_programadas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

NOTIFY pgrst, 'reload schema';
