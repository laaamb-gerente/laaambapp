CREATE TABLE IF NOT EXISTS costos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id uuid REFERENCES fincas(id),
  categoria text NOT NULL CHECK (categoria IN (
    'alimentacion','sanidad','mano_obra','infraestructura',
    'transporte','genetica','administrativo','otro'
  )),
  descripcion text NOT NULL,
  valor numeric NOT NULL,
  fecha date NOT NULL,
  proveedor text,
  factura text,
  especie text CHECK (especie IN ('ovino','bovino','ambos')),
  notas text,
  fuente text DEFAULT 'manual'
    CHECK (fuente IN ('manual','siigo','excel')),
  siigo_id text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ingresos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id uuid REFERENCES fincas(id),
  tipo text NOT NULL CHECK (tipo IN (
    'venta_animal','venta_lana','venta_leche',
    'subsidio','aparceria','otro'
  )),
  descripcion text NOT NULL,
  valor numeric NOT NULL,
  fecha date NOT NULL,
  cliente text,
  factura text,
  especie text CHECK (especie IN ('ovino','bovino','ambos')),
  notas text,
  fuente text DEFAULT 'manual'
    CHECK (fuente IN ('manual','siigo','excel')),
  siigo_id text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE costos ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingresos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_all_costos" ON costos
  FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_ingresos" ON ingresos
  FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE INDEX idx_costos_finca_fecha ON costos(finca_id, fecha DESC);
CREATE INDEX idx_ingresos_finca_fecha ON ingresos(finca_id, fecha DESC);
