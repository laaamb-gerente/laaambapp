-- ─────────────────────────────────────────────────────────────
-- 0058_aportantes_reposicion_reetiquetado.sql  (Módulo Aparcería · parte 4)
--
-- Dos cosas que la carga de las 3 fases necesita:
--   1. 'reposicion' como valor de origen.
--   2. Marcador de reetiquetado (el arete físico no es la chapeta asignada).
--
-- Idempotente. Ejecutar MANUALMENTE en Supabase (SQL Editor), después de
-- 0055, 0056 y 0057.
-- ─────────────────────────────────────────────────────────────

begin;

-- ── 1. origen = 'reposicion' ─────────────────────────────────
-- Los vientres de reposición son STOCK DEL PROPIETARIO entregado para cubrir
-- la mortalidad que excede el 8% garantizado al aparcero. Están físicamente
-- en la finca y cuentan en el hato actual, pero NO los produjo el aparcero:
-- por eso salen del numerador del crecimiento.
--
--   hato_actual            = count(estado_salida='activo')   ← incluye reposición
--   reposicion_activa      = count(origen='reposicion' AND estado_salida='activo')
--   crecimiento_productivo = (hato_actual − reposicion_activa − hato_inicial)
--                            / hato_inicial
--
-- Si la reposición contara como crecimiento, el indicador PREMIARÍA la
-- mortalidad: mientras más animales se mueren, más reposición entra, más
-- "crece" el hato. Por eso las dos cifras van en líneas separadas y nunca
-- se mezclan en el porcentaje.
--
-- El valor crudo de ORIGEN del archivo (CONTRACTUAL / REAL / PROYECTADO /
-- REPOSICION) se conserva en notas: el mapeo a estos tres valores es una
-- interpretación, y el original debe seguir consultable.
ALTER TABLE aportantes_animales
  DROP CONSTRAINT IF EXISTS aportantes_animales_origen_chk;
ALTER TABLE aportantes_animales
  ADD CONSTRAINT aportantes_animales_origen_chk
  CHECK (origen IN ('real', 'proyectado', 'reposicion'));

-- ── 2. REETIQUETADO ──────────────────────────────────────────
-- 30 crías recibieron chapeta nueva, pero EL ANIMAL EN EL POTRERO SIGUE
-- LLEVANDO EL ARETE VIEJO. De ahí el reparto:
--
--   codigo_original  → el arete FÍSICO que hoy tiene puesto (el viejo).
--                      Si alguien va al potrero y lee 410, tiene que poder
--                      encontrar el animal. NUNCA se le pone la chapeta nueva.
--   chapeta_asignada → la chapeta nueva, PENDIENTE de re-etiquetado en campo.
--   codigo           → la clave estable (SAL-725), que no cambia.
--   reetiquetado     → true cuando CHAPETA ORIGINAL difiere de CHAPETA.
ALTER TABLE aportantes_animales
  ADD COLUMN IF NOT EXISTS reetiquetado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS chapeta_asignada text;

-- ── 3. PROPIEDAD EN VERIFICACIÓN ─────────────────────────────
-- Marca la cría cuya MADRE es un vientre contractual de OTRO hato. Es un
-- hecho observable, no una inferencia de propiedad: el reetiquetado les dio
-- identidad propia pero NO decidió a quién pertenecen.
-- Mientras esté en true, el crecimiento del aportante se reporta PROVISIONAL.
-- El cargador NUNCA mueve un animal de hato por esto.
ALTER TABLE aportantes_animales
  ADD COLUMN IF NOT EXISTS en_verificacion boolean NOT NULL DEFAULT false;

-- Buscar por la chapeta nueva también debe funcionar: en campo se va a
-- preguntar por las dos durante la transición.
CREATE INDEX IF NOT EXISTS idx_aportantes_animales_chapeta_asignada
  ON aportantes_animales (finca_id, aportante_id, chapeta_asignada)
  WHERE chapeta_asignada IS NOT NULL;

commit;

NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────
-- VALIDACIÓN DE NEGOCIO QUE LA BASE NO PUEDE EXPRESAR:
-- ninguna chapeta de cría puede coincidir con la de un vientre del MISMO
-- hato. El UNIQUE es (finca_id, aportante_id, codigo) y los codigos difieren
-- (MAU-558 vientre vs MAU-558 cría llevarían codigos distintos), así que la
-- base lo permite — pero en el potrero serían dos animales con el mismo
-- arete y nadie podría distinguirlos. Se valida en el cargador, que lo
-- reporta como error de negocio y no lo resuelve por inferencia.
--
-- Esta consulta lo detecta sobre datos ya cargados:
--   SELECT a.aportante_id, a.codigo_original, count(*) FILTER (WHERE a.tipo='cria') crias,
--          count(*) FILTER (WHERE a.tipo='madre_lote_inicial') vientres
--     FROM aportantes_animales a
--    GROUP BY 1,2
--   HAVING count(*) FILTER (WHERE a.tipo='cria') > 0
--      AND count(*) FILTER (WHERE a.tipo='madre_lote_inicial') > 0;
-- ─────────────────────────────────────────────────────────────
