-- ─────────────────────────────────────────────────────────────
-- 0032_pivotes.sql
-- Concepto de PIVOTE como nivel superior del POTRERO (tabla 'lotes').
--   · PIVOTE  = división física permanente de la finca (nombre, área,
--               tipo de pasto, capacidad).
--   · POTRERO = marcación temporal dentro de un pivote (tabla 'lotes')
--               donde se cargan animales durante la rotación; hereda
--               área y pasto del pivote.
-- ORDEN IMPORTANTE: se crea la tabla 'pivotes' ANTES de agregar la FK
-- en 'lotes' (de lo contrario el REFERENCES fallaría).
-- Ejecutar en Supabase (SQL Editor).
-- ─────────────────────────────────────────────────────────────

-- 1) Tabla de pivotes (PRIMERO, para que exista antes del FK).
CREATE TABLE IF NOT EXISTS pivotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id uuid REFERENCES fincas(id),
  nombre text NOT NULL,
  area_ha numeric,
  tipo_pasto text,
  capacidad_animales int,
  notas text,
  activo boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- 2) Vincular lotes (potreros) a su pivote.
ALTER TABLE lotes
  ADD COLUMN IF NOT EXISTS pivote_id uuid
    REFERENCES pivotes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS es_pivote boolean
    DEFAULT false;

-- 3) RLS de pivotes (acceso a autenticados; el control fino por rol se
--    maneja en la capa de roles del frontend, igual que 'lotes').
ALTER TABLE pivotes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_pivotes" ON pivotes;
CREATE POLICY "auth_pivotes" ON pivotes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 4) Índices de apoyo.
CREATE INDEX IF NOT EXISTS idx_pivotes_finca ON pivotes(finca_id);
CREATE INDEX IF NOT EXISTS idx_lotes_pivote ON lotes(pivote_id);
