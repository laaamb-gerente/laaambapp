-- ─────────────────────────────────────────────────────────────
-- 0040_sala_cuna.sql   (Módulo Sala Cuna · crianza artificial — Fase 1)
--
-- NOTA DE NUMERACIÓN: la plantilla original lo llamaba "#020", pero la
-- convención real de este repo es supabase/migrations/00XX_*.sql y vamos
-- por la 0039. Esta es la 0040.
--
-- FKs verificadas contra el schema real (REST):
--   animales.id ✓   fincas.id ✓
-- Los campos responsable* referencian perfiles(id) (NO auth.users) para poder
-- hacer el embedding de PostgREST responsable:perfiles(nombre) en Fase 2, igual
-- que tareas.asignado_a. Nota: perfiles.id = auth.users.id (ver 0008), así que
-- el uuid almacenado es el mismo; solo cambia la relación declarada.
--
-- Ejecutar en Supabase (SQL Editor). Idempotente: se puede re-ejecutar.
-- ─────────────────────────────────────────────────────────────

-- 1. corderos_crianza — cada cordero que entra a crianza artificial
CREATE TABLE IF NOT EXISTS corderos_crianza (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  cordero_id uuid NOT NULL REFERENCES animales(id) ON DELETE CASCADE,
  madre_id uuid REFERENCES animales(id) ON DELETE SET NULL,
  motivo text NOT NULL CHECK (motivo IN (
    'huerfano','mala_madre','sustituto_voluntario','baja_produccion_madre'
  )),
  metodo text NOT NULL DEFAULT 'tetero' CHECK (metodo IN (
    'tetero','balde_nipple','automatico'
  )),
  estado text NOT NULL DEFAULT 'activo' CHECK (estado IN (
    'activo','destetado','muerto'
  )),
  fecha_inicio date NOT NULL DEFAULT CURRENT_DATE,
  fecha_destete date,
  peso_inicio_kg numeric(5,2),
  responsable_default uuid REFERENCES perfiles(id) ON DELETE SET NULL,
  finca_id uuid REFERENCES fincas(id) ON DELETE CASCADE,
  notas text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. eventos_calostro — cada toma de calostro (crítico supervivencia)
CREATE TABLE IF NOT EXISTS eventos_calostro (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  cordero_id uuid NOT NULL REFERENCES animales(id) ON DELETE CASCADE,
  corderos_crianza_id uuid REFERENCES corderos_crianza(id) ON DELETE CASCADE,
  fecha_hora timestamptz NOT NULL DEFAULT now(),
  fuente text NOT NULL CHECK (fuente IN ('madre','otra_oveja','vaca','comercial')),
  cantidad_ml numeric(7,1) NOT NULL,
  via text NOT NULL DEFAULT 'biberon' CHECK (via IN ('biberon','sonda')),
  responsable uuid REFERENCES perfiles(id) ON DELETE SET NULL,
  observacion text,
  sincronizado boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- 3. tomas_programadas — agenda generada por el protocolo
CREATE TABLE IF NOT EXISTS tomas_programadas (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  corderos_crianza_id uuid NOT NULL REFERENCES corderos_crianza(id) ON DELETE CASCADE,
  fecha_hora_programada timestamptz NOT NULL,
  ventana_min integer NOT NULL DEFAULT 45,
  cantidad_ml_objetivo numeric(7,1) NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('calostro','sustituto')),
  responsable_asignado uuid REFERENCES perfiles(id) ON DELETE SET NULL,
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN (
    'pendiente','cumplida','perdida'
  )),
  toma_real_id uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 4. tomas_realizadas — lo que de verdad ocurrió (soporta offline → sync)
CREATE TABLE IF NOT EXISTS tomas_realizadas (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  corderos_crianza_id uuid NOT NULL REFERENCES corderos_crianza(id) ON DELETE CASCADE,
  fecha_hora timestamptz NOT NULL DEFAULT now(),
  tipo text NOT NULL CHECK (tipo IN ('calostro','sustituto')),
  cantidad_ml numeric(7,1) NOT NULL,
  temperatura_ok boolean DEFAULT true,
  responsable uuid REFERENCES perfiles(id) ON DELETE SET NULL,
  observacion text,
  sincronizado boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- 5. pesajes_corderos — para calcular GMD (ganancia media diaria)
CREATE TABLE IF NOT EXISTS pesajes_corderos (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  cordero_id uuid NOT NULL REFERENCES animales(id) ON DELETE CASCADE,
  corderos_crianza_id uuid REFERENCES corderos_crianza(id) ON DELETE SET NULL,
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  peso_kg numeric(5,2) NOT NULL,
  responsable uuid REFERENCES perfiles(id) ON DELETE SET NULL,
  notas text,
  created_at timestamptz DEFAULT now()
);

-- FK diferida: tomas_programadas.toma_real_id → tomas_realizadas
-- (la tabla destino ya existe arriba; idempotente con guard)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_toma_real'
  ) THEN
    ALTER TABLE tomas_programadas
      ADD CONSTRAINT fk_toma_real
      FOREIGN KEY (toma_real_id) REFERENCES tomas_realizadas(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Índices para rendimiento en móvil (queries frecuentes)
CREATE INDEX IF NOT EXISTS idx_corderos_crianza_estado
  ON corderos_crianza(estado) WHERE estado = 'activo';
CREATE INDEX IF NOT EXISTS idx_tomas_prog_estado_hora
  ON tomas_programadas(estado, fecha_hora_programada)
  WHERE estado = 'pendiente';
CREATE INDEX IF NOT EXISTS idx_tomas_prog_crianza
  ON tomas_programadas(corderos_crianza_id);
CREATE INDEX IF NOT EXISTS idx_tomas_real_crianza
  ON tomas_realizadas(corderos_crianza_id);
CREATE INDEX IF NOT EXISTS idx_pesajes_cordero
  ON pesajes_corderos(cordero_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_calostro_cordero
  ON eventos_calostro(cordero_id);

-- RLS: habilitar en todas las tablas nuevas
ALTER TABLE corderos_crianza   ENABLE ROW LEVEL SECURITY;
ALTER TABLE eventos_calostro   ENABLE ROW LEVEL SECURITY;
ALTER TABLE tomas_programadas  ENABLE ROW LEVEL SECURITY;
ALTER TABLE tomas_realizadas   ENABLE ROW LEVEL SECURITY;
ALTER TABLE pesajes_corderos   ENABLE ROW LEVEL SECURITY;

-- Políticas básicas (usuarios autenticados leen/escriben). Idempotentes.
DROP POLICY IF EXISTS "auth_all_corderos_crianza" ON corderos_crianza;
CREATE POLICY "auth_all_corderos_crianza" ON corderos_crianza
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_all_eventos_calostro" ON eventos_calostro;
CREATE POLICY "auth_all_eventos_calostro" ON eventos_calostro
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_all_tomas_programadas" ON tomas_programadas;
CREATE POLICY "auth_all_tomas_programadas" ON tomas_programadas
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_all_tomas_realizadas" ON tomas_realizadas;
CREATE POLICY "auth_all_tomas_realizadas" ON tomas_realizadas
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_all_pesajes_corderos" ON pesajes_corderos;
CREATE POLICY "auth_all_pesajes_corderos" ON pesajes_corderos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Updated_at automático
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_corderos_crianza_updated_at ON corderos_crianza;
CREATE TRIGGER trg_corderos_crianza_updated_at
  BEFORE UPDATE ON corderos_crianza
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_tomas_programadas_updated_at ON tomas_programadas;
CREATE TRIGGER trg_tomas_programadas_updated_at
  BEFORE UPDATE ON tomas_programadas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
