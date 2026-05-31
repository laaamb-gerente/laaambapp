-- 0027_medicamentos_compras.sql
-- Kardex de compras de medicamentos + acumuladores de uso/compra en medicamentos.
-- Cada compra registra cantidad, costo y datos de proveedor/lote/vencimiento.
-- El costo_unitario se calcula automáticamente (columna generada).

-- ── Tabla de compras (kardex) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS compras_medicamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id uuid REFERENCES fincas(id),
  medicamento_id uuid REFERENCES medicamentos(id),
  medicamento_nombre text,
  fecha_compra date NOT NULL DEFAULT CURRENT_DATE,
  cantidad numeric NOT NULL,
  unidad text NOT NULL, -- 'mL', 'g', 'unidades', 'dosis'
  costo_total_cop numeric DEFAULT 0,
  costo_unitario numeric GENERATED ALWAYS AS
    (CASE WHEN cantidad > 0 THEN costo_total_cop / cantidad ELSE 0 END) STORED,
  proveedor text,
  lote_proveedor text,
  fecha_vencimiento date,
  factura_numero text,
  notas text,
  created_at timestamptz DEFAULT now()
);

-- ── RLS + política (idempotente: drop + create) ─────────────────────
ALTER TABLE compras_medicamentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_compras_med" ON compras_medicamentos;
CREATE POLICY "auth_compras_med" ON compras_medicamentos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── Acumuladores en medicamentos ────────────────────────────────────
ALTER TABLE medicamentos ADD COLUMN IF NOT EXISTS uso_acumulado_unidades numeric DEFAULT 0;
ALTER TABLE medicamentos ADD COLUMN IF NOT EXISTS total_comprado_unidades numeric DEFAULT 0;
