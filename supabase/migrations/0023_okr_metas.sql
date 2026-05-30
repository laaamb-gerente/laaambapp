CREATE TABLE IF NOT EXISTS okr_metas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id uuid REFERENCES fincas(id),
  departamento text NOT NULL,
  clave text NOT NULL,
  valor numeric NOT NULL,
  unidad text,
  label text,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(finca_id, departamento, clave)
);
ALTER TABLE okr_metas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all_okr_metas" ON okr_metas
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO okr_metas
  (finca_id, departamento, clave, valor, unidad, label)
VALUES
  ('a1b2c3d4-0000-0000-0000-000000000001','levante','gdp_diario',200,'g/día','GDP diario meta'),
  ('a1b2c3d4-0000-0000-0000-000000000001','levante','peso_sacrificio',48,'kg','Peso objetivo sacrificio'),
  ('a1b2c3d4-0000-0000-0000-000000000001','levante','dias_nacimiento_sacrificio',180,'días','Días nacimiento→sacrificio'),
  ('a1b2c3d4-0000-0000-0000-000000000001','reproduccion','fertilidad',85,'%','Meta fertilidad'),
  ('a1b2c3d4-0000-0000-0000-000000000001','reproduccion','intervalo_partos',7,'meses','Intervalo entre partos'),
  ('a1b2c3d4-0000-0000-0000-000000000001','reproduccion','prolificidad',1.8,'crías/parto','Prolificidad meta'),
  ('a1b2c3d4-0000-0000-0000-000000000001','sanidad','mortalidad_total',3,'%','Mortalidad total meta'),
  ('a1b2c3d4-0000-0000-0000-000000000001','sanidad','mortalidad_crias',5,'%','Mortalidad crías meta'),
  ('a1b2c3d4-0000-0000-0000-000000000001','pastoreo','carga_instantanea',200000,'kg/ha','Carga instantánea objetivo'),
  ('a1b2c3d4-0000-0000-0000-000000000001','pastoreo','dias_descanso',45,'días','Días descanso potrero'),
  ('a1b2c3d4-0000-0000-0000-000000000001','financiero','ingreso_por_animal',750000,'COP','Ingreso por animal'),
  ('a1b2c3d4-0000-0000-0000-000000000001','financiero','margen_bruto',35,'%','Margen bruto meta'),
  ('a1b2c3d4-0000-0000-0000-000000000001','financiero','costo_por_kg',8000,'COP/kg','Costo por kg producido')
ON CONFLICT (finca_id, departamento, clave) DO NOTHING;
