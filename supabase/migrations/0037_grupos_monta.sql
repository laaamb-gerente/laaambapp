-- ─────────────────────────────────────────────────────────────
-- 0037_grupos_monta.sql
-- Grupos de monta: un macho con N hembras que inician el período
-- de monta juntos. Las montas individuales se registran día a día
-- en eventos_reproductivos, vinculadas por grupo_monta_id.
-- Ejecutar en Supabase (SQL Editor).
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS grupos_monta (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id uuid REFERENCES fincas(id),
  nombre text NOT NULL,              -- ej: "Grupo Monta Jun-2026"
  macho_id uuid REFERENCES animales(id),
  macho_codigo text,
  fecha_inicio date NOT NULL,
  fecha_fin date NOT NULL,           -- inicio + 35 días por defecto
  dias_duracion int DEFAULT 35,
  hembras_ids jsonb DEFAULT '[]',    -- array de UUIDs
  hembras_codigos jsonb DEFAULT '[]',-- array de códigos
  num_hembras int DEFAULT 0,
  estado text DEFAULT 'activo',      -- activo | cerrado | cancelado
  notas text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE grupos_monta ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_grupos_monta" ON grupos_monta;
CREATE POLICY "auth_grupos_monta" ON grupos_monta
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Vínculo grupo → monta individual en eventos_reproductivos.
ALTER TABLE eventos_reproductivos
  ADD COLUMN IF NOT EXISTS grupo_monta_id uuid
    REFERENCES grupos_monta(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_grupos_monta_finca ON grupos_monta(finca_id, estado);
CREATE INDEX IF NOT EXISTS idx_ev_rep_grupo ON eventos_reproductivos(grupo_monta_id);
