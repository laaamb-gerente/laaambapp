-- ─────────────────────────────────────────────────────────────
-- 0036_movimientos_potrero.sql
-- Historial de rotación: ocupación y descanso de cada potrero.
-- Es el dato más valioso para gestión de pastoreo adaptativo.
-- SIEMPRE se hace INSERT/UPDATE, NUNCA DELETE.
-- Ejecutar en Supabase (SQL Editor).
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS movimientos_potrero (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id uuid REFERENCES fincas(id),

  -- Potrero
  lote_id text NOT NULL,
  lote_nombre text,
  pivote_id uuid REFERENCES pivotes(id),
  pivote_nombre text,

  -- Entrada de animales
  fecha_entrada date NOT NULL,
  num_animales int,
  peso_total_kg numeric,
  kg_ha numeric,            -- carga instantánea

  -- Salida
  fecha_salida date,
  dias_ocupacion int,       -- calculado al registrar salida

  -- Descanso posterior
  fecha_inicio_descanso date,        -- = fecha_salida
  fecha_fin_descanso date,           -- cuando vuelven animales
  dias_descanso_proyectado int DEFAULT 45,
  dias_descanso_real int,            -- calculado al re-entrar

  -- Estado
  estado text DEFAULT 'ocupado',
  -- 'ocupado' | 'en_descanso' | 'completado'

  notas text,
  registrado_por text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE movimientos_potrero ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_mov_potrero" ON movimientos_potrero;
CREATE POLICY "auth_mov_potrero" ON movimientos_potrero
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Índices para analytics
CREATE INDEX IF NOT EXISTS idx_mov_lote   ON movimientos_potrero(lote_id);
CREATE INDEX IF NOT EXISTS idx_mov_pivote ON movimientos_potrero(pivote_id);
CREATE INDEX IF NOT EXISTS idx_mov_finca  ON movimientos_potrero(finca_id, fecha_entrada);
