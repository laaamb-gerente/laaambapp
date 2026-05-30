-- 0022_lineaje_crias.sql
-- Lineaje automático de crías: guarda el contexto de la monta (padres y razas)
-- en los eventos reproductivos para poder propagarlo a la cría al nacer y
-- calcular su raza (puro / F1 / cruzado).

ALTER TABLE eventos_reproductivos
  ADD COLUMN IF NOT EXISTS datos jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN eventos_reproductivos.datos IS
  'Contexto JSONB del evento reproductivo. Claves usadas: '
  'madre_id, padre_id, raza_madre, raza_padre, raza_cria, '
  'crias (array), ciclo (ok|fallido).';

-- Índice GIN para consultas eventuales sobre el contexto.
CREATE INDEX IF NOT EXISTS idx_eventos_rep_datos
  ON eventos_reproductivos USING gin (datos);
