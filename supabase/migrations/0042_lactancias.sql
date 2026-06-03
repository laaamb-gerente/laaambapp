-- ─────────────────────────────────────────────────────────────
-- 0042_lactancias.sql   (Fase 4 · Producción de leche)
--
-- FKs verificadas contra el schema real (REST/OpenAPI):
--   animales.id ✓   fincas.id ✓   perfiles.id ✓   lotes.id ✓
--   partos: NO existe (HTTP 404) → parto_id queda uuid SIN FK (nullable).
--
-- NOTA (cambio vs la plantilla): la columna `dias_lactancia` que pedía la
-- plantilla usaba CURRENT_DATE dentro de un GENERATED ALWAYS … STORED. Postgres
-- RECHAZA eso (las columnas generadas requieren expresiones IMMUTABLE y
-- CURRENT_DATE es STABLE → "generation expression is not immutable"). Por eso NO
-- se crea esa columna; los días de lactancia se calculan en el cliente como
-- (COALESCE(fecha_secado, hoy) - fecha_parto).
--
-- Idempotente. Ejecutar en Supabase (SQL Editor).
-- ─────────────────────────────────────────────────────────────

-- 1. lactancias — una por oveja por ciclo productivo
CREATE TABLE IF NOT EXISTS lactancias (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  animal_id uuid NOT NULL REFERENCES animales(id) ON DELETE CASCADE,
  parto_id uuid,                       -- sin FK: la tabla partos no existe aún
  finca_id uuid REFERENCES fincas(id) ON DELETE CASCADE,
  fecha_parto date NOT NULL,
  fecha_secado date,
  destino text NOT NULL DEFAULT 'cria_natural' CHECK (destino IN (
    'cria_natural', 'ordeño_100', 'mixto'
  )),
  leche_total_l numeric(8,2),          -- calculado periódicamente desde controles
  estado text NOT NULL DEFAULT 'activa' CHECK (estado IN (
    'activa', 'secada', 'destetada'
  )),
  notas text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. controles_lecheros — registro test-day por oveja (el dato crudo)
CREATE TABLE IF NOT EXISTS controles_lecheros (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  lactancia_id uuid NOT NULL REFERENCES lactancias(id) ON DELETE CASCADE,
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  leche_dia_l numeric(5,2),            -- litros ese día (suma de ordeños)
  n_ordenos_dia integer DEFAULT 2,     -- número de ordeños en el día
  -- composición (resultados de análisis de laboratorio; opcionales)
  grasa_pct numeric(4,2),              -- % grasa (~6-7.5 en oveja)
  proteina_pct numeric(4,2),           -- % proteína (~5-6.5)
  caseina_pct numeric(4,2),            -- % caseína (~4.5; mejor predictor queso)
  lactosa_pct numeric(4,2),            -- % lactosa (~4.5)
  solidos_pct numeric(4,2),            -- % sólidos totales (~17-18)
  rcs bigint,                          -- células somáticas/mL (basal oveja > vaca)
  ufc bigint,                          -- UFC/mL (higiene de ordeño)
  punto_crioscopico numeric(5,3),      -- °C (adulteración con agua)
  ph numeric(3,2),
  notas text,
  capturado_por uuid REFERENCES perfiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

-- 3. ordenos — log diario agregado de sala de ordeño
CREATE TABLE IF NOT EXISTS ordenos (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  leche_total_l numeric(8,2) NOT NULL,
  n_ovejas_ordenadas integer,
  lote_id uuid REFERENCES lotes(id) ON DELETE SET NULL,   -- lotes sí existe
  responsable uuid REFERENCES perfiles(id) ON DELETE SET NULL,
  notas text,
  created_at timestamptz DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_lactancias_animal
  ON lactancias(animal_id);
CREATE INDEX IF NOT EXISTS idx_lactancias_estado
  ON lactancias(estado) WHERE estado = 'activa';
CREATE INDEX IF NOT EXISTS idx_controles_lactancia
  ON controles_lecheros(lactancia_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_ordenos_fecha
  ON ordenos(fecha DESC);

-- RLS
ALTER TABLE lactancias         ENABLE ROW LEVEL SECURITY;
ALTER TABLE controles_lecheros ENABLE ROW LEVEL SECURITY;
ALTER TABLE ordenos            ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_all_lactancias" ON lactancias;
CREATE POLICY "auth_all_lactancias" ON lactancias
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_all_controles_lecheros" ON controles_lecheros;
CREATE POLICY "auth_all_controles_lecheros" ON controles_lecheros
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_all_ordenos" ON ordenos;
CREATE POLICY "auth_all_ordenos" ON ordenos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Updated_at (reutiliza la función update_updated_at() creada en 0040)
DROP TRIGGER IF EXISTS trg_lactancias_updated_at ON lactancias;
CREATE TRIGGER trg_lactancias_updated_at
  BEFORE UPDATE ON lactancias
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- NOTIFY para que PostgREST reconozca el embedding inmediatamente
NOTIFY pgrst, 'reload schema';
