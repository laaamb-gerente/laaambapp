CREATE TABLE IF NOT EXISTS recetas_nutricion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id uuid REFERENCES fincas(id),
  nombre text NOT NULL,
  tipo text NOT NULL,
  descripcion text,
  ingredientes jsonb NOT NULL DEFAULT '[]',
  activa boolean DEFAULT true,
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inventario_nutricion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id uuid REFERENCES fincas(id),
  ingrediente text NOT NULL,
  tipo text NOT NULL,
  stock_kg numeric DEFAULT 0,
  unidad text DEFAULT 'kg',
  kg_por_unidad numeric DEFAULT 1,
  costo_por_kg numeric DEFAULT 0,
  stock_minimo_kg numeric DEFAULT 0,
  proveedor text,
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS raciones_nutricion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id uuid REFERENCES fincas(id),
  categoria text NOT NULL,
  label text NOT NULL,
  grano_g_dia numeric DEFAULT 0,
  sal_g_dia numeric DEFAULT 0,
  heno_kg_dia numeric DEFAULT 0,
  notas text,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(finca_id, categoria)
);

CREATE TABLE IF NOT EXISTS registros_alimentacion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id uuid REFERENCES fincas(id),
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  lote_id uuid REFERENCES lotes(id),
  lote_nombre text,
  animales_count integer,
  categoria_predominante text,
  grano_kg_calculado numeric,
  grano_kg_entregado numeric,
  sal_kg_calculado numeric,
  sal_kg_entregado numeric,
  heno_kg_calculado numeric,
  heno_kg_entregado numeric,
  confirmado boolean DEFAULT false,
  confirmado_por text,
  hora_confirmacion timestamptz,
  observaciones text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE recetas_nutricion ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventario_nutricion ENABLE ROW LEVEL SECURITY;
ALTER TABLE raciones_nutricion ENABLE ROW LEVEL SECURITY;
ALTER TABLE registros_alimentacion ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_recetas" ON recetas_nutricion
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_inventario_nut" ON inventario_nutricion
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_raciones" ON raciones_nutricion
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_registros_alim" ON registros_alimentacion
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO raciones_nutricion
  (finca_id, categoria, label, grano_g_dia, sal_g_dia, heno_kg_dia)
VALUES
  ('a1b2c3d4-0000-0000-0000-000000000001',
   'levante','Cordero / Levante',150,8,0.3),
  ('a1b2c3d4-0000-0000-0000-000000000001',
   'vacia','Oveja vacía',100,8,0.5),
  ('a1b2c3d4-0000-0000-0000-000000000001',
   'gestante','Oveja gestante',200,10,0.6),
  ('a1b2c3d4-0000-0000-0000-000000000001',
   'lactando','Oveja lactando',300,12,0.7),
  ('a1b2c3d4-0000-0000-0000-000000000001',
   'reproductor','Carnero / Reproductor',200,10,0.5)
ON CONFLICT (finca_id, categoria) DO NOTHING;

INSERT INTO recetas_nutricion
  (finca_id, nombre, tipo, descripcion, ingredientes)
VALUES
  ('a1b2c3d4-0000-0000-0000-000000000001',
   'Mezcla de Grano','grano',
   'Suplemento energético-proteico. Base 100 kg.',
   '[
     {"nombre":"Maíz molido","porcentaje":53,
      "kg_por_100":53,"unidad":"kg",
      "beneficio":"Energía principal (almidón) + base económica"},
     {"nombre":"Torta de soya","porcentaje":25,
      "kg_por_100":25,"unidad":"kg",
      "beneficio":"Proteína alta (bypass) para producción de leche"},
     {"nombre":"Cascarilla de cacao molida","porcentaje":15,
      "kg_por_100":15,"unidad":"kg",
      "beneficio":"Fibra + taninos antiparasitarios + palatabilidad local"},
     {"nombre":"Glicerol","porcentaje":5,
      "kg_por_100":5,"unidad":"litros",
      "beneficio":"Energía rápida + mejora palatabilidad y reduce polvo"},
     {"nombre":"Tierra de diatomeas (grado alimenticio)",
      "porcentaje":2,"kg_por_100":2,"unidad":"kg",
      "beneficio":"Control mecánico de parásitos (nematodos y coccidia)"}
   ]'::jsonb),
  ('a1b2c3d4-0000-0000-0000-000000000001',
   'Mezcla de Sal Ovina Preventiva','sal',
   'Suplemento mineral-sanitario. Base 25 kg.',
   '[
     {"nombre":"Sal mineral base","porcentaje":93.6,
      "kg_por_25":23.4,"unidad":"kg",
      "beneficio":"Sodio y minerales base; vehículo de consumo diario"},
     {"nombre":"Ajo deshidratado en polvo","porcentaje":1.6,
      "kg_por_25":0.4,"unidad":"kg",
      "beneficio":"Alicina: antiparasitario, antibacteriano, estimulante ruminal"},
     {"nombre":"Orégano deshidratado molido","porcentaje":0.8,
      "kg_por_25":0.2,"unidad":"kg",
      "beneficio":"Carvacrol y timol: contra coccidia y bacterias intestinales"},
     {"nombre":"Cascarilla de cacao molida","porcentaje":4,
      "kg_por_25":1.0,"unidad":"kg",
      "beneficio":"Taninos antiparasitarios + palatabilidad"}
   ]'::jsonb),
  ('a1b2c3d4-0000-0000-0000-000000000001',
   'Heno','heno',
   'Forraje seco. Unidad en fardos (≈20 kg c/u).',
   '[{"nombre":"Heno","porcentaje":100,
     "unidad":"fardos","kg_por_fardo":20,
     "beneficio":"Fibra estructural base de la dieta"}]'::jsonb)
ON CONFLICT DO NOTHING;
