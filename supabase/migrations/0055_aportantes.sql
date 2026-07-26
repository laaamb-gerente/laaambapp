-- ─────────────────────────────────────────────────────────────
-- 0055_aportantes.sql   (Módulo Aportantes · aparcería — parte 1/2)
--
-- Registro de los terceros que aportan animales en aparcería:
-- 'JULIAN Y SALATIEL MORENO', 'MAURICIO FAJARDO', 'PAOLA MORENO'.
-- Los animales de cada aportante viven en aportantes_animales (0056),
-- NO en la tabla animales del hato.
--
-- ── VERIFICADO CONTRA EL ESQUEMA REAL DEL REPO (no asumido) ──
--   fincas(id)                          ✓ 0001
--   perfiles(id, nombre, email, rol)    ✓ 0008 · perfiles.id = auth.users.id
--   public.auth_rol() SECURITY DEFINER  ✓ 0020
--
-- ⚠️ ARQUITECTURA: esta migración NO toca la tabla 'animales'.
--    Auditoría previa (ver 0056) encontró 23 FKs hacia animales(id), de las
--    cuales 8 son ON DELETE CASCADE y 3 ON DELETE SET NULL silenciosos
--    (partos.madre_id, corderos_nacidos.animal_id, lactancias.animal_id…).
--    Meter animales de aparcería en 'animales' habría obligado a filtrar
--    todos los agregados del hato (AppState.animales y 13 archivos) y habría
--    puesto en riesgo registros reales al revertir una carga. Por eso los
--    aportantes son un módulo aislado, sin una sola FK hacia el hato.
--
-- Idempotente. Ejecutar MANUALMENTE en Supabase (SQL Editor).
-- Nota: 0054 ya está tomado por 0054_cierres_asistencia.sql.
-- ─────────────────────────────────────────────────────────────

begin;

-- ── 1. TABLA aportantes ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS aportantes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id uuid NOT NULL REFERENCES fincas(id),
  nombre text NOT NULL,              -- 'JULIAN Y SALATIEL MORENO'
  -- Meta de crecimiento anual pactada en el contrato de aparcería
  -- (Salatiel 113.4 · Mauricio 189 · Paola 64.8). Columna propia en vez
  -- de enterrarla en notas: el reporte la usa para % cumplimiento.
  meta_anual numeric,
  -- hato_inicial = MADRES APORTADAS al firmar el contrato. Cifra
  -- CONTRACTUAL que Juan mantiene a mano.
  -- ⚠️ NUNCA derivarla de las filas cargadas: no es
  --    count(tipo='madre_lote_inicial'). Los aportantes pusieron solo
  --    madres; todo lo nacido después es crecimiento del proyecto, no
  --    aporte. El registro del lote inicial NO coincide con el contrato
  --    (Salatiel 52 reg vs 42 contr, Paola 26 vs 24, Mauricio 67 vs 70)
  --    porque el contrato contó madres adultas y el registro incluye
  --    hembras jóvenes del mismo lote. El reporte muestra ese gap como
  --    nota al pie; es una conciliación pendiente, no un error a ajustar.
  hato_inicial integer,
  fecha_inicio date,
  notas text,
  creado_en timestamptz DEFAULT now()
);

-- Columnas agregadas por separado: si la tabla ya existía de una corrida
-- anterior de esta migración, el CREATE TABLE IF NOT EXISTS es no-op y
-- estas columnas no llegarían.
ALTER TABLE aportantes
  ADD COLUMN IF NOT EXISTS meta_anual numeric,
  ADD COLUMN IF NOT EXISTS hato_inicial integer,
  ADD COLUMN IF NOT EXISTS fecha_inicio date;

-- Un mismo nombre no debe cargarse dos veces en la misma finca: evita
-- aportantes duplicados por un doble clic en "Guardar".
CREATE UNIQUE INDEX IF NOT EXISTS idx_aportantes_finca_nombre
  ON aportantes(finca_id, lower(nombre));

commit;

-- ── 2. RLS ───────────────────────────────────────────────────
-- Patrón real de las tablas recientes (0020/0021): un policy '<t>_sel'
-- de lectura y un '<t>_wr' FOR ALL para gerente/administrador.
-- Lección de 0031: varias políticas PERMISIVAS sobre el mismo comando se
-- combinan con OR → gana la más permisiva. Por eso NO se crea aquí
-- ninguna política 'FOR ALL USING (true)': anularía la restricción de
-- escritura por rol. Solo estas dos.
ALTER TABLE aportantes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "aportantes_sel" ON public.aportantes;
CREATE POLICY "aportantes_sel" ON public.aportantes
  FOR SELECT TO authenticated
  USING (public.auth_rol() IN
    ('gerente','administrador','socio','veterinario','auxiliar'));

DROP POLICY IF EXISTS "aportantes_wr" ON public.aportantes;
CREATE POLICY "aportantes_wr" ON public.aportantes
  FOR ALL TO authenticated
  USING (public.auth_rol() IN ('gerente','administrador'))
  WITH CHECK (public.auth_rol() IN ('gerente','administrador'));

-- ── 3. SEED de los tres aportantes del contrato ──────────────
-- hato_inicial = madres aportadas al firmar.
--   SALATIEL 42 → CONFIRMADO contra contrato.
--   PAOLA 24 y MAURICIO 70 → PROVISIONALES.
-- ON CONFLICT DO NOTHING a propósito: hato_inicial y meta_anual los
-- mantiene Juan a mano, así que re-ejecutar esta migración NUNCA debe
-- pisar un valor ya corregido en producción. Para ajustar un provisional:
--   UPDATE aportantes SET hato_inicial = <n>
--     WHERE nombre = 'MAURICIO FAJARDO'
--       AND finca_id = 'a1b2c3d4-0000-0000-0000-000000000001';
INSERT INTO aportantes (finca_id, nombre, meta_anual, hato_inicial, notas) VALUES
  ('a1b2c3d4-0000-0000-0000-000000000001', 'JULIAN Y SALATIEL MORENO', 113.4, 42, 'Aparcería · hato_inicial confirmado contra contrato'),
  ('a1b2c3d4-0000-0000-0000-000000000001', 'MAURICIO FAJARDO',         189,   70, 'Aparcería · hato_inicial PROVISIONAL'),
  ('a1b2c3d4-0000-0000-0000-000000000001', 'PAOLA MORENO',              64.8, 24, 'Aparcería · hato_inicial PROVISIONAL')
ON CONFLICT DO NOTHING;

-- ── 4. FECHA DE INICIO DEL CONTRATO ──────────────────────────
-- Viene de la columna INICIO CONTRATO de la hoja de carga de fase 1.
-- Solo se fija cuando está NULL: re-ejecutar la migración no pisa un valor
-- corregido a mano, igual que hato_inicial y meta_anual.
UPDATE aportantes SET fecha_inicio = '2025-06-01'
  WHERE finca_id = 'a1b2c3d4-0000-0000-0000-000000000001'
    AND nombre = 'JULIAN Y SALATIEL MORENO' AND fecha_inicio IS NULL;
UPDATE aportantes SET fecha_inicio = '2025-08-31'
  WHERE finca_id = 'a1b2c3d4-0000-0000-0000-000000000001'
    AND nombre = 'PAOLA MORENO' AND fecha_inicio IS NULL;
UPDATE aportantes SET fecha_inicio = '2025-10-01'
  WHERE finca_id = 'a1b2c3d4-0000-0000-0000-000000000001'
    AND nombre = 'MAURICIO FAJARDO' AND fecha_inicio IS NULL;

NOTIFY pgrst, 'reload schema';
