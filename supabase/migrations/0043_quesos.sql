-- ─────────────────────────────────────────────────────────────
-- 0043_quesos.sql   (Fase 5 · Quesería: rendimiento y costeo)
--
-- FKs verificadas contra el schema real (REST): lotes.id ✓ perfiles.id ✓
--   fincas.id ✓. quesos_lotes NO existía (HTTP 404).
-- controles_lecheros.leche_ordeno1_l / leche_ordeno2_l ya existían en la BD
--   (añadidas manualmente) → el ALTER de la PARTE A es no-op idempotente,
--   solo deja el repo en sync.
--
-- Las columnas generadas de quesos_lotes son válidas: usan únicamente
-- aritmética sobre columnas de la MISMA fila (IMMUTABLE). No usan CURRENT_DATE
-- ni funciones STABLE (a diferencia del caso de 0042).
--
-- Idempotente. Ejecutar en Supabase (SQL Editor).
-- ─────────────────────────────────────────────────────────────

-- ── PARTE A — Sincronizar columnas de ordeño en controles_lecheros ──
ALTER TABLE controles_lecheros
  ADD COLUMN IF NOT EXISTS leche_ordeno1_l numeric(5,2),
  ADD COLUMN IF NOT EXISTS leche_ordeno2_l numeric(5,2);
-- leche_dia_l = ordeno1 + ordeno2 cuando se registra desde equipo.
-- Cuando se registra manual sigue usando leche_dia_l directo.

-- ── PARTE B — Tabla quesos_lotes ──
CREATE TABLE IF NOT EXISTS quesos_lotes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  tipo_queso text NOT NULL,
    -- ej: 'fresco', 'semicurado', 'curado', 'manchego', 'otro'
  leche_usada_l numeric(8,2) NOT NULL,
  queso_kg numeric(6,3) NOT NULL,
  rendimiento_l_por_kg numeric(5,2)
    GENERATED ALWAYS AS (leche_usada_l / NULLIF(queso_kg, 0)) STORED,
  maduracion_dias integer DEFAULT 0,
  costo_leche numeric(10,2),          -- costo imputado de la leche (COP)
  costo_insumos numeric(10,2),        -- cuajo, sal, cultivos, empaques (COP)
  costo_mano_obra numeric(10,2),      -- horas quesero × tarifa (COP)
  costo_total numeric(10,2)
    GENERATED ALWAYS AS (
      COALESCE(costo_leche, 0) +
      COALESCE(costo_insumos, 0) +
      COALESCE(costo_mano_obra, 0)
    ) STORED,
  precio_venta_kg numeric(10,2),      -- precio de venta del queso (COP/kg)
  ingreso_total numeric(10,2)
    GENERATED ALWAYS AS (
      queso_kg * COALESCE(precio_venta_kg, 0)
    ) STORED,
  rendimiento_teorico_l_por_kg numeric(5,2),
    -- calculado desde composición de la leche usada; guardado al crear el lote
  lote_pastoreo_id uuid REFERENCES lotes(id) ON DELETE SET NULL,
  responsable uuid REFERENCES perfiles(id) ON DELETE SET NULL,
  notas text,
  finca_id uuid REFERENCES fincas(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quesos_fecha
  ON quesos_lotes(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_quesos_tipo
  ON quesos_lotes(tipo_queso);

ALTER TABLE quesos_lotes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_all_quesos_lotes" ON quesos_lotes;
CREATE POLICY "auth_all_quesos_lotes" ON quesos_lotes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Updated_at (reutiliza la función update_updated_at() creada en 0040)
DROP TRIGGER IF EXISTS trg_quesos_lotes_updated_at ON quesos_lotes;
CREATE TRIGGER trg_quesos_lotes_updated_at
  BEFORE UPDATE ON quesos_lotes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

NOTIFY pgrst, 'reload schema';
