CREATE TABLE IF NOT EXISTS bajas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id uuid REFERENCES fincas(id),
  animal_id uuid REFERENCES animales(id),
  tipo text NOT NULL CHECK (tipo IN ('muerte','venta','descarte','robo','otro')),
  fecha date NOT NULL,
  causa text,
  peso_salida numeric,
  precio_venta numeric,
  comprador text,
  destino text,
  notas text,
  registrado_por text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE bajas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_all_bajas" ON bajas
  FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE INDEX idx_bajas_finca_fecha ON bajas(finca_id, fecha DESC);
CREATE INDEX idx_bajas_animal ON bajas(animal_id);
