-- ─────────────────────────────────────────────────────────────
-- 0047_partos.sql   (Módulo Partos · reproducción → sala cuna → leche)
--
-- Verificado contra el schema real (REST):
--   animales.id ✓  perfiles.id ✓  fincas.id ✓  corderos_crianza ✓ (0040)
--   lactancias.parto_id YA existe (0042, sin FK) → el ADD IF NOT EXISTS es no-op.
--   corderos_crianza.parto_id NO existe → se añade con FK.
--   partos / corderos_nacidos NO existen → se crean.
--
-- ⚠️ CAMBIO NECESARIO: corderos_crianza.cordero_id era NOT NULL (0040). Al
-- registrar un parto, el cordero aún NO es un animal registrado, así que la
-- crianza se crea con cordero_id = NULL (se enlaza después). Por eso se hace
-- la columna nullable. No afecta filas existentes.
--
-- Idempotente. Ejecutar en Supabase (SQL Editor).
-- ─────────────────────────────────────────────────────────────

-- 1. partos
CREATE TABLE IF NOT EXISTS partos (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  madre_id uuid NOT NULL REFERENCES animales(id) ON DELETE CASCADE,
  padre_id uuid REFERENCES animales(id) ON DELETE SET NULL,
  fecha_parto date NOT NULL DEFAULT CURRENT_DATE,
  tipo_parto text NOT NULL DEFAULT 'simple'
    CHECK (tipo_parto IN ('simple','doble','triple','cuadruple')),
  num_corderos_nacidos integer NOT NULL DEFAULT 1,
  num_corderos_vivos integer NOT NULL DEFAULT 1,
  estado_madre text NOT NULL DEFAULT 'bien'
    CHECK (estado_madre IN ('bien','complicaciones','muerta')),
  complicaciones text,
  responsable uuid REFERENCES perfiles(id) ON DELETE SET NULL,
  finca_id uuid REFERENCES fincas(id) ON DELETE CASCADE,
  notas text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. corderos_nacidos (uno por cordero de cada parto)
CREATE TABLE IF NOT EXISTS corderos_nacidos (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  parto_id uuid NOT NULL REFERENCES partos(id) ON DELETE CASCADE,
  animal_id uuid REFERENCES animales(id) ON DELETE SET NULL,
  sexo text NOT NULL DEFAULT 'H' CHECK (sexo IN ('M','H')),
  peso_nacimiento_kg numeric(5,2),
  estado_al_nacer text NOT NULL DEFAULT 'vivo'
    CHECK (estado_al_nacer IN ('vivo','muerto','debil')),
  destino_crianza text NOT NULL DEFAULT 'pie_madre'
    CHECK (destino_crianza IN (
      'pie_madre','huerfano','mala_madre',
      'sustituto_voluntario','baja_produccion_madre'
    )),
  corderos_crianza_id uuid REFERENCES corderos_crianza(id) ON DELETE SET NULL,
  notas text,
  created_at timestamptz DEFAULT now()
);

-- 3. parto_id en lactancias (ya existe como uuid desde 0042 → no-op)
ALTER TABLE lactancias
  ADD COLUMN IF NOT EXISTS parto_id uuid REFERENCES partos(id) ON DELETE SET NULL;

-- 4. parto_id en corderos_crianza (nuevo) + cordero_id nullable
ALTER TABLE corderos_crianza
  ADD COLUMN IF NOT EXISTS parto_id uuid REFERENCES partos(id) ON DELETE SET NULL;
ALTER TABLE corderos_crianza
  ALTER COLUMN cordero_id DROP NOT NULL;

-- Índices
CREATE INDEX IF NOT EXISTS idx_partos_madre ON partos(madre_id);
CREATE INDEX IF NOT EXISTS idx_partos_fecha ON partos(fecha_parto DESC);
CREATE INDEX IF NOT EXISTS idx_corderos_nacidos_parto ON corderos_nacidos(parto_id);
CREATE INDEX IF NOT EXISTS idx_corderos_nacidos_animal ON corderos_nacidos(animal_id);

-- RLS
ALTER TABLE partos ENABLE ROW LEVEL SECURITY;
ALTER TABLE corderos_nacidos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_all_partos" ON partos;
CREATE POLICY "auth_all_partos" ON partos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_all_corderos_nacidos" ON corderos_nacidos;
CREATE POLICY "auth_all_corderos_nacidos" ON corderos_nacidos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Updated_at (reutiliza función de 0040)
DROP TRIGGER IF EXISTS trg_partos_updated_at ON partos;
CREATE TRIGGER trg_partos_updated_at
  BEFORE UPDATE ON partos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

NOTIFY pgrst, 'reload schema';
