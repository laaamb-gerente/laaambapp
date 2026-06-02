-- ─────────────────────────────────────────────────────────────
-- 0039_tareas.sql
-- Módulo de tareas: crear, asignar a un colaborador, y finalizar.
-- Aparecen en la agenda del día (hoy.html) hasta que se cierran.
-- Ejecutar en Supabase (SQL Editor).
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tareas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id uuid REFERENCES fincas(id),

  -- Creación
  titulo text NOT NULL,
  descripcion text,
  area text NOT NULL,
  -- 'reproduccion','salud','lotes','nutricion',
  -- 'animales','finanzas','general','mantenimiento'
  fecha_vencimiento date NOT NULL,
  prioridad text DEFAULT 'normal',
  -- 'urgente','alta','normal','baja'

  -- Asignación
  asignado_a uuid REFERENCES perfiles(id),
  asignado_nombre text,
  creado_por uuid REFERENCES perfiles(id),
  creado_nombre text,

  -- Estado
  estado text DEFAULT 'pendiente',
  -- 'pendiente' | 'en_progreso' | 'finalizada'
  fecha_finalizacion timestamptz,
  comentario_finalizacion text,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE tareas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_tareas" ON tareas;
CREATE POLICY "auth_tareas" ON tareas
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_tareas_finca
  ON tareas(finca_id, fecha_vencimiento);
CREATE INDEX IF NOT EXISTS idx_tareas_asignado
  ON tareas(asignado_a, estado);
