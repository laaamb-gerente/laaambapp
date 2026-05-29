-- TABLA 1: fincas
CREATE TABLE fincas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  ubicacion text,
  hectareas numeric,
  propietario text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- TABLA 2: animales
CREATE TABLE animales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id uuid REFERENCES fincas(id),
  codigo text NOT NULL,
  nombre text,
  especie text NOT NULL CHECK (especie IN ('ovino','bovino')),
  sexo text CHECK (sexo IN ('macho','hembra')),
  raza text,
  fecha_nacimiento date,
  madre_id uuid REFERENCES animales(id),
  padre_id uuid REFERENCES animales(id),
  lote_actual_id uuid,
  estado text DEFAULT 'activo' CHECK (estado IN ('activo','vendido','muerto','descartado')),
  peso_actual numeric,
  condicion_corporal numeric,
  notas text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- TABLA 3: lotes
CREATE TABLE lotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id uuid REFERENCES fincas(id),
  nombre text NOT NULL,
  hectareas numeric,
  tipo_pastura text,
  capacidad_animal integer,
  dias_descanso_objetivo integer DEFAULT 21,
  dias_pastoreo_objetivo integer DEFAULT 7,
  fecha_inicio_descanso date,
  fecha_inicio_pastoreo date,
  poligono jsonb,
  notas text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- TABLA 4: eventos
CREATE TABLE eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id uuid REFERENCES fincas(id),
  animal_id uuid REFERENCES animales(id),
  tipo text NOT NULL,
  fecha timestamptz DEFAULT now(),
  datos jsonb,
  costo numeric DEFAULT 0,
  registrado_por text,
  notas text,
  created_at timestamptz DEFAULT now()
);

-- TABLA 5: medicamentos
CREATE TABLE medicamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id uuid REFERENCES fincas(id),
  nombre text NOT NULL,
  tipo text,
  unidad text,
  stock_actual numeric DEFAULT 0,
  stock_minimo numeric DEFAULT 0,
  dias_retiro integer DEFAULT 0,
  precio_unitario numeric DEFAULT 0,
  notas text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- TABLA 6: tratamientos
CREATE TABLE tratamientos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id uuid REFERENCES fincas(id),
  animal_id uuid REFERENCES animales(id),
  medicamento_id uuid REFERENCES medicamentos(id),
  fecha_inicio date NOT NULL,
  dosis numeric,
  unidad text,
  dias_retiro integer DEFAULT 0,
  fecha_fin_retiro date,
  registrado_por text,
  notas text,
  created_at timestamptz DEFAULT now()
);

-- TABLA 7: pesajes
CREATE TABLE pesajes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id uuid REFERENCES fincas(id),
  animal_id uuid REFERENCES animales(id),
  peso numeric NOT NULL,
  fecha date NOT NULL,
  tipo text DEFAULT 'rutina',
  registrado_por text,
  notas text,
  created_at timestamptz DEFAULT now()
);

-- FK diferida en animales para lote_actual_id
ALTER TABLE animales
  ADD CONSTRAINT fk_lote_actual
  FOREIGN KEY (lote_actual_id) REFERENCES lotes(id);

-- Índices críticos para performance
CREATE INDEX idx_animales_finca ON animales(finca_id);
CREATE INDEX idx_animales_lote ON animales(lote_actual_id);
CREATE INDEX idx_eventos_animal ON eventos(animal_id);
CREATE INDEX idx_eventos_finca_fecha ON eventos(finca_id, fecha DESC);
CREATE INDEX idx_tratamientos_animal ON tratamientos(animal_id);
CREATE INDEX idx_pesajes_animal_fecha ON pesajes(animal_id, fecha DESC);

-- RLS: habilitar en todas las tablas
ALTER TABLE fincas ENABLE ROW LEVEL SECURITY;
ALTER TABLE animales ENABLE ROW LEVEL SECURITY;
ALTER TABLE lotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE medicamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE tratamientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE pesajes ENABLE ROW LEVEL SECURITY;

-- Políticas permisivas temporales (anon puede todo hasta implementar auth)
CREATE POLICY "anon_all_fincas" ON fincas FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_animales" ON animales FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_lotes" ON lotes FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_eventos" ON eventos FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_medicamentos" ON medicamentos FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_tratamientos" ON tratamientos FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_pesajes" ON pesajes FOR ALL TO anon USING (true) WITH CHECK (true);
