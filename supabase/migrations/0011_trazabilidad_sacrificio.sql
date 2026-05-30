-- ─────────────────────────────────────────────────────────────
-- 0011_trazabilidad_sacrificio.sql
-- Trazabilidad post-sacrificio: del animal al beneficio, al
-- despiece (cortes) y al empaque al vacío con QR público.
-- Ejecutar en Supabase SQL Editor (NO se ejecuta automáticamente).
-- ─────────────────────────────────────────────────────────────

-- TABLA: beneficios (registro del sacrificio de un animal)
CREATE TABLE IF NOT EXISTS beneficios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id uuid REFERENCES fincas(id),
  animal_id uuid REFERENCES animales(id),
  fecha date NOT NULL,
  frigorifico text,
  peso_vivo_entrada numeric,
  peso_canal numeric,
  rendimiento_canal numeric GENERATED ALWAYS AS (
    CASE WHEN peso_vivo_entrada > 0
      THEN ROUND((peso_canal / peso_vivo_entrada * 100)::numeric, 1)
      ELSE NULL
    END
  ) STORED,
  costo_beneficio numeric DEFAULT 0,
  registrado_por text,
  notas text,
  created_at timestamptz DEFAULT now()
);

-- TABLA: cortes (despiece de la canal)
CREATE TABLE IF NOT EXISTS cortes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beneficio_id uuid REFERENCES beneficios(id),
  animal_id uuid REFERENCES animales(id),
  tipo_corte text CHECK (tipo_corte IN (
    'canal_completa','cuarto_delantero','cuarto_trasero','rack',
    'paleta','pierna','costillar','lomo','cuello','menudencias','otro'
  )),
  peso_kg numeric NOT NULL,
  notas text,
  created_at timestamptz DEFAULT now()
);

-- TABLA: empaques (producto final al vacío con QR)
CREATE TABLE IF NOT EXISTS empaques (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  corte_id uuid REFERENCES cortes(id),
  animal_id uuid REFERENCES animales(id),
  beneficio_id uuid REFERENCES beneficios(id),
  qr_code text UNIQUE NOT NULL DEFAULT 'LAAAMB-' || upper(substring(gen_random_uuid()::text, 1, 8)),
  peso_neto numeric NOT NULL,
  fecha_empaque date NOT NULL,
  fecha_limite_consumo date,
  ubicacion_frigorifico text,
  estado text DEFAULT 'disponible' CHECK (estado IN (
    'disponible','vendido','vencido','descartado'
  )),
  precio_venta numeric,
  cliente text,
  created_at timestamptz DEFAULT now()
);

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE beneficios ENABLE ROW LEVEL SECURITY;
ALTER TABLE cortes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE empaques   ENABLE ROW LEVEL SECURITY;

-- Usuarios autenticados: acceso total
CREATE POLICY auth_all_beneficios ON beneficios
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY auth_all_cortes ON cortes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY auth_all_empaques ON empaques
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Público anónimo: solo lectura de empaques (micrositio QR público)
CREATE POLICY anon_read_empaques ON empaques
  FOR SELECT TO anon USING (true);

-- ── ÍNDICES ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_beneficios_animal ON beneficios(animal_id);
CREATE INDEX IF NOT EXISTS idx_cortes_beneficio  ON cortes(beneficio_id);
CREATE INDEX IF NOT EXISTS idx_empaques_qr        ON empaques(qr_code);
CREATE INDEX IF NOT EXISTS idx_empaques_estado    ON empaques(estado);
