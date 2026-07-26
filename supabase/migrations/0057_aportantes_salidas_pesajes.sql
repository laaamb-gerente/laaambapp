-- ─────────────────────────────────────────────────────────────
-- 0057_aportantes_salidas_pesajes.sql   (Módulo Aparcería · parte 3)
--
-- Cierra el esquema ANTES de cargar un solo animal:
--   1. estado_salida como ÚNICA fuente de verdad del destino del animal.
--   2. aportantes_pesajes: historial de pesos, no un snapshot.
--
-- ── 1. POR QUÉ estado_salida Y NO 'vivo' ──
-- Un animal SACRIFICADO no es una baja por muerte: es el producto del
-- negocio. Con un booleano 'vivo' ambos colapsan en el mismo valor y la
-- mortalidad se dispara — el reporte miente en la dirección más cara,
-- porque un hato que vende corderos parecería un hato que los pierde.
--   hato_actual = count(origen='real' AND estado_salida='activo')
--   mortalidad  = count(estado_salida='muerte') / count(origen='real')
--   sacrificios = count(estado_salida='sacrificio')  ← línea propia,
--                 JAMÁS sumada a mortalidad
--
-- ⚠️ DECISIÓN: 'vivo' y 'localizado' se ELIMINAN, no se derivan.
--    Se evaluó dejarlas como columnas derivadas/generadas. Se descartó:
--    dos columnas que describen el mismo hecho pueden desincronizarse, y
--    ese es exactamente el tipo de bug que este módulo viene evitando
--    (una consulta lee 'vivo', otra lee estado_salida, y el reporte se
--    contradice consigo mismo). Con una sola columna eso es imposible.
--    El backfill de abajo preserva la semántica si ya hubiera datos.
--
-- ── VERIFICADO CONTRA EL ESQUEMA REAL ──
--   aportantes_animales(id, origen, vivo, localizado)  ✓ 0056
--   public.auth_rol() SECURITY DEFINER                 ✓ 0020
--
-- Idempotente. Ejecutar MANUALMENTE en Supabase (SQL Editor),
-- DESPUÉS de 0055 y 0056.
-- ─────────────────────────────────────────────────────────────

begin;

-- ── 0. CHAPETA ORIGINAL (desambiguación de duplicados) ───────
-- En el export hay 6 chapetas repetidas DENTRO del mismo hato (558 aparece
-- 3 veces en MAURICIO; 330, 432, 433, N55 en SALATIEL y 560 en PAOLA, 2
-- veces cada una). Son animales DISTINTOS que comparten la marca física.
--
-- Descartar los repetidos perdía animales reales. Quitar el UNIQUE rompía
-- la clave de idempotencia (finca_id, aportante_id, codigo) y volvía
-- ambiguo el UPDATE de la fase 3. La solución: sufijo numérico en 'codigo'
-- y la chapeta tal cual en 'codigo_original'.
--
--   codigo_original → SIEMPRE la chapeta del export, verbatim.
--   codigo          → único por aportante. Igual a codigo_original cuando la
--                     chapeta no se repite; '558-1','558-2','558-3' cuando sí.
--
-- Se sufijan TODAS las filas del grupo, ninguna conserva la chapeta pelada:
-- si una quedara como '558' parecería la "verdadera" y las otras derivadas.
-- Sufijo NUMÉRICO a propósito, no a/b/c, para no chocar con las marcas de
-- campo. Y un codigo con sufijo no puede confundirse con una chapeta del
-- hato propio de La Marinilla.
--
-- El reporte del aportante muestra codigo_original (él ve su chapeta limpia);
-- el listado operativo muestra codigo, que es el que distingue los animales.
ALTER TABLE aportantes_animales
  ADD COLUMN IF NOT EXISTS codigo_original text;

-- Backfill: en las filas ya existentes la chapeta es el propio codigo.
UPDATE aportantes_animales
  SET codigo_original = codigo
  WHERE codigo_original IS NULL;

CREATE INDEX IF NOT EXISTS idx_aportantes_animales_codigo_original
  ON aportantes_animales (finca_id, aportante_id, codigo_original);

-- ── 1. ESTADO DE SALIDA ──────────────────────────────────────
ALTER TABLE aportantes_animales
  ADD COLUMN IF NOT EXISTS estado_salida text NOT NULL DEFAULT 'activo',
  ADD COLUMN IF NOT EXISTS fecha_salida  date,
  ADD COLUMN IF NOT EXISTS peso_salida   numeric(6,2),
  ADD COLUMN IF NOT EXISTS motivo_salida text;

-- Backfill desde vivo/localizado ANTES de eliminarlas, para no perder
-- semántica si la 0056 ya se ejecutó y se cargaron filas.
-- Orden de precedencia: muerte gana sobre no_localizado.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='aportantes_animales'
      AND column_name='vivo'
  ) THEN
    UPDATE aportantes_animales
      SET estado_salida = 'muerte',
          fecha_salida  = COALESCE(fecha_salida, fecha_baja),
          motivo_salida = COALESCE(motivo_salida, causa_baja)
      WHERE vivo = false AND estado_salida = 'activo';

    UPDATE aportantes_animales
      SET estado_salida = 'no_localizado'
      WHERE vivo = true AND localizado = false AND estado_salida = 'activo';
  END IF;
END $$;

-- El CHECK se agrega DESPUÉS del backfill: si se agregara antes, el
-- DEFAULT 'activo' ya cumple, pero dejarlo aquí documenta el orden real.
ALTER TABLE aportantes_animales
  DROP CONSTRAINT IF EXISTS aportantes_animales_estado_salida_chk;
ALTER TABLE aportantes_animales
  ADD CONSTRAINT aportantes_animales_estado_salida_chk
  CHECK (estado_salida IN
    ('activo','muerte','sacrificio','venta','no_localizado'));

-- Eliminar las columnas superadas. Seguro: el backfill de arriba ya
-- trasladó toda su información a estado_salida.
ALTER TABLE aportantes_animales
  DROP COLUMN IF EXISTS vivo,
  DROP COLUMN IF EXISTS localizado;

-- Índice del filtro más frecuente del módulo: el hato activo por aportante.
CREATE INDEX IF NOT EXISTS idx_aportantes_animales_estado
  ON aportantes_animales (finca_id, aportante_id, origen, estado_salida);

-- ── 2. PESAJES (historial, no snapshot) ──────────────────────
-- ON DELETE CASCADE es CORRECTO aquí, al contrario que en el hato real:
-- aportantes_animales no tiene ninguna FK hacia animales(id), así que
-- borrar una carga se lleva sus pesajes y no puede tocar un solo
-- registro de La Marinilla. El CASCADE está contenido dentro del módulo.
CREATE TABLE IF NOT EXISTS aportantes_pesajes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aportante_animal_id uuid NOT NULL
                      REFERENCES aportantes_animales(id) ON DELETE CASCADE,
  fecha               date NOT NULL,
  peso_kg             numeric(6,2) NOT NULL,
  -- Jerarquía al elegir el peso vigente: sacrificio > real > estimado.
  -- Coexisten en fechas distintas sin sobrescribirse; el UNIQUE es por
  -- (animal, fecha, tipo), así que un mismo día admite un estimado y un
  -- real sin pisarse, y la UI muestra SIEMPRE el tipo junto al número.
  tipo                text NOT NULL CHECK (tipo IN ('real','estimado','sacrificio')),
  nota                text,
  carga_id            uuid,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_aportantes_pesajes
  ON aportantes_pesajes (aportante_animal_id, fecha, tipo);

CREATE INDEX IF NOT EXISTS idx_aportantes_pesajes_animal
  ON aportantes_pesajes (aportante_animal_id, fecha DESC);

-- Permite borrar los pesajes de una fase sin tocar las otras.
CREATE INDEX IF NOT EXISTS idx_aportantes_pesajes_carga
  ON aportantes_pesajes (carga_id) WHERE carga_id IS NOT NULL;

commit;

-- ── 3. RLS ───────────────────────────────────────────────────
-- Mismo patrón de 0055 / 0056. Nunca 'FOR ALL USING (true)' (lección 0031:
-- se combinaría con OR y anularía la restricción de escritura por rol).
ALTER TABLE aportantes_pesajes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "aportantes_pesajes_sel" ON public.aportantes_pesajes;
CREATE POLICY "aportantes_pesajes_sel" ON public.aportantes_pesajes
  FOR SELECT TO authenticated
  USING (public.auth_rol() IN
    ('gerente','administrador','socio','veterinario','auxiliar'));

DROP POLICY IF EXISTS "aportantes_pesajes_wr" ON public.aportantes_pesajes;
CREATE POLICY "aportantes_pesajes_wr" ON public.aportantes_pesajes
  FOR ALL TO authenticated
  USING (public.auth_rol() IN ('gerente','administrador'))
  WITH CHECK (public.auth_rol() IN ('gerente','administrador'));

NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────
-- REPARTO DE PESOS ENTRE LAS DOS TABLAS (resuelto — NO se eliminan las
-- columnas peso_* de aportantes_animales).
--
-- Se evaluó borrarlas por riesgo de doble verdad, como se hizo con 'vivo'.
-- No aplica: aquí no describen el mismo hecho, cubren dominios distintos
-- que este esquema separa por construcción.
--
--   aportantes_pesajes        → pesajes CON fecha. Historial, N por animal.
--                               'fecha' es NOT NULL y parte del índice único
--                               (aportante_animal_id, fecha, tipo).
--   aportantes_animales.peso_*→ el peso SIN fecha. Estructuralmente no cabe
--                               en la tabla hija, y la alternativa —ponerle
--                               la fecha de corte— produciría un dato falso
--                               etiquetado como 'real': en pantalla nadie lee
--                               la nota, lee "35 kg el 25-jul-2026".
--
-- Caso real en la carga de fase 1: la chapeta 235 de MAURICIO trae 35 kg de
-- balanza sin fecha en el origen. Va a peso_kg=35, peso_fecha=NULL,
-- peso_tipo='real', peso_nota='Pesaje de balanza sin fecha registrada en
-- origen.' Los otros 6 pesos reales sí traen fecha y van a la tabla hija.
--
-- Precedencia al mostrar (APARCERIA.pesoVigente): gana el pesaje fechado de
-- mayor jerarquía (sacrificio > real > estimado); si no hay ninguno, se usa
-- el snapshot sin fecha. La UI muestra SIEMPRE el tipo junto al número, y
-- una fecha nula se imprime como tal en vez de inventarse.
-- ─────────────────────────────────────────────────────────────
