-- ─────────────────────────────────────────────────────────────
-- 0054_cierres_asistencia.sql
--
-- Cierre de mes de asistencia + historial mes a mes.
--
-- Al cerrar un mes se congela un snapshot con el resumen por empleado
-- (días trabajados, FI, FJ, incapacidades, festivos) para poder
-- revisitarlo aunque la asistencia diaria cambie después. El mes cerrado
-- queda marcado y la grilla se muestra en solo-lectura hasta reabrirlo.
--
-- NOTA sobre etiquetas FI/FJ: la columna asistencia.tipo NO cambia
-- (sigue 'ausente_injustificado' / 'ausente_justificado'); FI y FJ son
-- solo las etiquetas visibles en la UI. Por eso esta migración no toca
-- el CHECK de asistencia.
--
-- FKs verificadas: fincas.id ✓  (empleado en el snapshot JSONB, sin FK dura).
-- Idempotente. Ejecutar en Supabase SQL Editor.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cierres_asistencia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id uuid REFERENCES fincas(id) ON DELETE CASCADE,
  anio integer NOT NULL,
  mes integer NOT NULL CHECK (mes BETWEEN 1 AND 12),
  -- resumen[] = [{empleado_id, nombre, cargo, dias_trabajados,
  --              fi (injustificadas), fj (justificadas), incapacidades,
  --              festivos, medio_dia}]
  resumen jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_dias_trabajados numeric DEFAULT 0,
  total_fi numeric DEFAULT 0,
  total_fj numeric DEFAULT 0,
  cerrado_por text,
  fecha_cierre timestamptz DEFAULT now(),
  reabierto boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(finca_id, anio, mes)
);

CREATE INDEX IF NOT EXISTS idx_cierres_asis_periodo
  ON cierres_asistencia(finca_id, anio DESC, mes DESC);

ALTER TABLE cierres_asistencia ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_all_cierres_asistencia" ON cierres_asistencia;
CREATE POLICY "auth_all_cierres_asistencia" ON cierres_asistencia
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Reutiliza update_updated_at() (creada en 0040)
DROP TRIGGER IF EXISTS trg_cierres_asis_updated_at ON cierres_asistencia;
CREATE TRIGGER trg_cierres_asis_updated_at
  BEFORE UPDATE ON cierres_asistencia
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

NOTIFY pgrst, 'reload schema';
