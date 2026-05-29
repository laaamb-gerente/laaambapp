ALTER TABLE animales
ADD COLUMN IF NOT EXISTS estado_reproductivo text
  CHECK (estado_reproductivo IN (
    'vacia', 'en_monta', 'gestante', 'lactante', 'seca'
  ));

ALTER TABLE animales
ADD COLUMN IF NOT EXISTS fecha_ultima_monta date;

ALTER TABLE animales
ADD COLUMN IF NOT EXISTS fecha_parto_esperado date;

-- Tabla de eventos reproductivos
CREATE TABLE IF NOT EXISTS eventos_reproductivos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id uuid REFERENCES fincas(id),
  hembra_id uuid REFERENCES animales(id),
  macho_id uuid REFERENCES animales(id),
  tipo text NOT NULL CHECK (tipo IN (
    'monta','ecografia','parto','destete','secado'
  )),
  fecha date NOT NULL,
  resultado text,
  crias_vivas integer DEFAULT 0,
  crias_muertas integer DEFAULT 0,
  peso_cria numeric,
  notas text,
  registrado_por text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE eventos_reproductivos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_all_eventos_rep" ON eventos_reproductivos
  FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE INDEX idx_eventos_rep_hembra ON eventos_reproductivos(hembra_id);
CREATE INDEX idx_eventos_rep_finca_fecha ON eventos_reproductivos(finca_id, fecha DESC);
