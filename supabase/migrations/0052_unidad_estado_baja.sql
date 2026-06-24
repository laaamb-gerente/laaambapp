-- 0052_unidad_estado_baja.sql
-- Añade el estado 'baja' a unidades_corte para poder dar de baja unidades
-- (descarte) sin venderlas. El CHECK previo solo permitía 'disponible'|'vendida'.
ALTER TABLE unidades_corte DROP CONSTRAINT IF EXISTS unidades_corte_estado_check;
ALTER TABLE unidades_corte ADD CONSTRAINT unidades_corte_estado_check
  CHECK (estado IN ('disponible','vendida','baja'));
