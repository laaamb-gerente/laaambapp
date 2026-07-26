-- ─────────────────────────────────────────────────────────────
-- 0056_aportantes_animales.sql   (Módulo Aportantes · parte 2/2)
--
-- Animales en aparcería, en tabla PROPIA y AISLADA. Cero FKs hacia
-- animales(id). Su único consumidor es el Reporte Aportantes.
--
-- Alcance de la primera carga (Export_25_julio.xlsx, hoja 'EXPORT LAAAMB'):
-- 281 filas de 3 hatos — MAURICIO 129, SALATIEL 106, PAOLA 46; 228 reales
-- y 53 proyectadas. Vitrina para inversionistas, no inventario de manejo.
--
-- ── POR QUÉ AISLADO (auditoría del esquema real, no supuesto) ──
-- Se evaluó meter estos animales en 'animales' con una marca de carga.
-- El grep de FKs mostró 23 referencias a animales(id) que NO se comportan
-- de forma uniforme al borrar:
--   · ON DELETE CASCADE (borra callado): corderos_crianza.cordero_id 0040:21,
--     eventos_calostro.cordero_id 0040:45, pesajes_corderos.cordero_id 0040:91,
--     lactancias.animal_id 0042:21, evaluaciones_maternas.animal_id 0044:16,
--     partos.madre_id 0047:21 (→ arrastra corderos_nacidos vía parto_id),
--     dosis_programadas.animal_id 0048:15,
--     seguimientos_tratamiento.animal_id 0053:32
--   · ON DELETE SET NULL (corrompe callado registros REALES):
--     corderos_crianza.madre_id 0040:22, partos.padre_id 0047:22,
--     corderos_nacidos.animal_id 0047:42
--   · Sin cláusula (sí falla duro): eventos, pesajes, tratamientos, bajas,
--     eventos_reproductivos, beneficios, cortes, empaques, grupos_monta,
--     animales.madre_id/padre_id
-- Es decir: un DELETE por marca de carga habría borrado partos y anulado
-- corderos_nacidos.animal_id de ovejas REALES, sin lanzar un solo error.
-- Además habría obligado a filtrar los agregados del hato en AppState y en
-- 13 archivos del frontend.
-- Con tabla aparte y sin FKs entrantes, el borrado es trivial y el radio de
-- explosión es cero. 'animales' no se toca en ninguna ruta de este módulo.
--
-- ── VERIFICADO CONTRA EL ESQUEMA REAL ──
--   fincas(id)     ✓ 0001
--   aportantes(id) ✓ 0055
--   perfiles(id)   ✓ 0008 · perfiles.id = auth.users.id
--   public.auth_rol() SECURITY DEFINER ✓ 0020
--
-- ⚠️ created_by / ejecutada_por referencian perfiles(id), NO auth.users(id).
--    No existe una sola FK a auth.users en todo el historial: la 0041 tuvo
--    que corregir las 5 que dejó la 0040 porque PostgREST no expone
--    auth.users y el embedding no resuelve. Con perfiles(id) el uuid
--    almacenado es idéntico (perfiles.id = auth.users.id) y además permite
--    ejecutada_por:perfiles(nombre) para mostrar QUIÉN corrió la carga —
--    que es el punto de una tabla de auditoría.
--
-- Idempotente. Ejecutar MANUALMENTE en Supabase (SQL Editor), después de 0055.
-- ─────────────────────────────────────────────────────────────

begin;

-- ── 1. ANIMALES DEL APORTANTE ────────────────────────────────
CREATE TABLE IF NOT EXISTS aportantes_animales (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id                  uuid NOT NULL REFERENCES fincas(id),
  aportante_id              uuid NOT NULL REFERENCES aportantes(id) ON DELETE CASCADE,
  -- Lote de carga: un uuid nuevo por ejecución del cargador. Es la clave
  -- del "deshacer": DELETE ... WHERE carga_id = $1.
  carga_id                  uuid NOT NULL,
  codigo                    text NOT NULL,   -- chapeta del aportante, tal cual
  criadero_origen           text,
  raza                      text,
  sexo                      text NOT NULL,
  tipo                      text NOT NULL,   -- 'madre_lote_inicial' | 'cria'
  -- madre_codigo es TEXTO LIBRE a propósito: jamás una FK, ni a animales
  -- ni a aportantes_animales. La prolificidad se calcula agrupando este
  -- texto. Una FK aquí reintroduciría el acoplamiento que este diseño evita.
  madre_codigo              text,
  fecha_nacimiento          date,
  vivo                      boolean NOT NULL DEFAULT true,
  causa_baja                text,
  fecha_baja                date,
  estado_reproductivo       text,            -- 'prenada'|'vacia'|'madre'|'sin_dato'
  fecha_estado_reproductivo date,            -- fecha de la ecografía
  notas                     text,
  -- ── Vitrina inversionistas (carga del export consolidado) ──
  -- origen: 'proyectado' son filas SIMULADAS. Viven aquí sin contaminar
  -- nada porque toda esta tabla está fuera del inventario real, pero el
  -- reporte y el listado DEBEN marcarlas visiblemente como simulación.
  origen                    text NOT NULL DEFAULT 'real',
  grupo                     text,            -- lote de manejo normalizado
  -- Los dos ESTADO crudos se guardan SIEMPRE, además del normalizado.
  -- Si el parseo interpreta mal, el original sigue aquí y se corrige con
  -- un UPDATE en vez de recargar. No son redundantes: son la fuente.
  estado_origen             text,            -- ESTADO crudo (foto 09-abr-2026)
  estado_actualizado        text,            -- ESTADO ACTUALIZADO crudo (manda)
  -- localizado=false → 'No existe' / 'No esta' / 'Moved off': el animal
  -- sigue vivo pero no está ubicado. Queda FUERA del conteo de hato activo
  -- del reporte, que por tanto es count(vivo AND localizado), no count(vivo).
  localizado                boolean NOT NULL DEFAULT true,
  -- Peso como snapshot de vitrina, en columnas: no hay tabla de pesajes.
  -- peso_tipo='estimado' viene del modelo lineal (sobreestima adultos);
  -- 'real' es peso embebido en el texto de ESTADO. El reporte debe mostrar
  -- el tipo de forma visible para no presentar estimados como pesajes.
  peso_kg                   numeric(6,2),
  peso_fecha                date,
  peso_tipo                 text,
  peso_nota                 text,
  created_at                timestamptz NOT NULL DEFAULT now(),
  created_by                uuid REFERENCES perfiles(id) ON DELETE SET NULL,
  CONSTRAINT aportantes_animales_sexo_chk
    CHECK (sexo IN ('hembra','macho')),
  CONSTRAINT aportantes_animales_tipo_chk
    CHECK (tipo IN ('madre_lote_inicial','cria')),
  CONSTRAINT aportantes_animales_estado_rep_chk
    CHECK (estado_reproductivo IS NULL
           OR estado_reproductivo IN ('prenada','vacia','madre','sin_dato')),
  CONSTRAINT aportantes_animales_origen_chk
    CHECK (origen IN ('real','proyectado')),
  CONSTRAINT aportantes_animales_peso_tipo_chk
    CHECK (peso_tipo IS NULL OR peso_tipo IN ('real','estimado'))
);

-- Re-run safety: si una versión anterior de esta migración ya creó la tabla,
-- el CREATE TABLE IF NOT EXISTS de arriba es no-op y estas columnas no
-- llegarían. Mismo patrón que 0044 / 0053.
ALTER TABLE aportantes_animales
  ADD COLUMN IF NOT EXISTS origen             text NOT NULL DEFAULT 'real',
  ADD COLUMN IF NOT EXISTS grupo              text,
  ADD COLUMN IF NOT EXISTS estado_origen      text,
  ADD COLUMN IF NOT EXISTS estado_actualizado text,
  ADD COLUMN IF NOT EXISTS localizado         boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS peso_kg            numeric(6,2),
  ADD COLUMN IF NOT EXISTS peso_fecha         date,
  ADD COLUMN IF NOT EXISTS peso_tipo          text,
  ADD COLUMN IF NOT EXISTS peso_nota          text;

-- Aquí SÍ va el UNIQUE: tabla nueva, sin datos heredados de FlockFinder.
-- Bloquea el mismo codigo dos veces para el mismo aportante (carga repetida).
-- NO bloquea el mismo codigo bajo aportantes distintos: eso lo valida el
-- pre-flight del cargador, que necesita nombrar al otro aportante en el
-- mensaje (las 21 chapetas en disputa Salatiel/Mauricio).
CREATE UNIQUE INDEX IF NOT EXISTS uq_aportantes_animales_codigo
  ON aportantes_animales (finca_id, aportante_id, codigo);

CREATE INDEX IF NOT EXISTS idx_aportantes_animales_aportante
  ON aportantes_animales (finca_id, aportante_id);

CREATE INDEX IF NOT EXISTS idx_aportantes_animales_carga
  ON aportantes_animales (carga_id);

-- Índice para la validación cruzada del pre-flight: "¿este codigo ya está
-- cargado bajo OTRO aportante?" barre por (finca_id, codigo).
CREATE INDEX IF NOT EXISTS idx_aportantes_animales_finca_codigo
  ON aportantes_animales (finca_id, codigo);

-- ── 2. AUDITORÍA DE CARGAS ───────────────────────────────────
-- Una fila por ejecución del cargador. animales_creados se escribe al
-- terminar el INSERT; revertida_at / animales_borrados al deshacer.
CREATE TABLE IF NOT EXISTS aportantes_cargas (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id          uuid NOT NULL REFERENCES fincas(id),
  aportante_id      uuid NOT NULL REFERENCES aportantes(id) ON DELETE CASCADE,
  -- carga_id: el mismo uuid estampado en aportantes_animales.carga_id.
  -- No es FK (aportantes_animales.carga_id no es único: N filas por carga);
  -- el UNIQUE de aquí evita registrar dos veces la misma ejecución.
  carga_id          uuid NOT NULL UNIQUE,
  -- etiqueta: nombre legible de la carga ('DEMO INVERSIONISTAS 25-jul-2026').
  -- La UI la muestra en cada lote para saber de qué carga vino.
  etiqueta          text,
  ejecutada_por     uuid REFERENCES perfiles(id) ON DELETE SET NULL,
  ejecutada_at      timestamptz NOT NULL DEFAULT now(),
  animales_creados  int NOT NULL,
  codigos_omitidos  text[],
  revertida_at      timestamptz,
  animales_borrados int
);

-- Re-run safety (ver nota en aportantes_animales).
ALTER TABLE aportantes_cargas
  ADD COLUMN IF NOT EXISTS etiqueta text;

CREATE INDEX IF NOT EXISTS idx_aportantes_cargas_aportante
  ON aportantes_cargas (finca_id, aportante_id, ejecutada_at DESC);

commit;

-- ── 3. RLS ───────────────────────────────────────────────────
-- Mismo patrón que 0055 / 0020 / 0021: '<t>_sel' de lectura para los 5
-- roles + '<t>_wr' FOR ALL solo gerente/administrador.
-- Nunca 'FOR ALL USING (true)': por la lección de 0031, esa política se
-- combinaría con OR y anularía la restricción de escritura por rol.
ALTER TABLE aportantes_animales ENABLE ROW LEVEL SECURITY;
ALTER TABLE aportantes_cargas   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "aportantes_animales_sel" ON public.aportantes_animales;
CREATE POLICY "aportantes_animales_sel" ON public.aportantes_animales
  FOR SELECT TO authenticated
  USING (public.auth_rol() IN
    ('gerente','administrador','socio','veterinario','auxiliar'));

DROP POLICY IF EXISTS "aportantes_animales_wr" ON public.aportantes_animales;
CREATE POLICY "aportantes_animales_wr" ON public.aportantes_animales
  FOR ALL TO authenticated
  USING (public.auth_rol() IN ('gerente','administrador'))
  WITH CHECK (public.auth_rol() IN ('gerente','administrador'));

DROP POLICY IF EXISTS "aportantes_cargas_sel" ON public.aportantes_cargas;
CREATE POLICY "aportantes_cargas_sel" ON public.aportantes_cargas
  FOR SELECT TO authenticated
  USING (public.auth_rol() IN
    ('gerente','administrador','socio','veterinario','auxiliar'));

DROP POLICY IF EXISTS "aportantes_cargas_wr" ON public.aportantes_cargas;
CREATE POLICY "aportantes_cargas_wr" ON public.aportantes_cargas
  FOR ALL TO authenticated
  USING (public.auth_rol() IN ('gerente','administrador'))
  WITH CHECK (public.auth_rol() IN ('gerente','administrador'));

NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────
-- DESHACER UNA CARGA (referencia — lo ejecuta la app):
--   DELETE FROM aportantes_animales
--     WHERE carga_id = :carga AND finca_id = :finca;
--   UPDATE aportantes_cargas
--     SET revertida_at = now(), animales_borrados = :n
--     WHERE carga_id = :carga;
-- Sin riesgo: no existe ninguna FK entrante a aportantes_animales, así que
-- el DELETE no puede arrastrar ni anular nada. La tabla 'animales' del hato
-- no participa en ninguna de las dos sentencias.
-- ─────────────────────────────────────────────────────────────
