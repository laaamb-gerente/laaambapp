-- 0024_bajas_datos_clinicos.sql
-- Información clínica de la muerte + cierre de tratamiento por muerte.
--
-- 1) Captura completa de la causa clínica al registrar una baja tipo 'muerte'.
--    Estructura JSONB esperada en bajas.datos_clinicos:
--    {
--      "fecha_real_muerte": "YYYY-MM-DD",
--      "tenia_tratamiento_previo": true|false|null,
--      "tratamiento_relacionado_id": "uuid"|null,
--      "causa_muerte": "string (categoría PASO 2)",
--      "signos_clinicos": "string",
--      "dias_evolucion": number|null,
--      "necropsia": true|false,
--      "hallazgos_necropsia": "string"|null
--    }
ALTER TABLE bajas ADD COLUMN IF NOT EXISTS datos_clinicos jsonb DEFAULT '{}';

-- 2) Cierre del tratamiento relacionado cuando el animal muere bajo tratamiento.
--    'estado' permite distinguir tratamientos activos/cerrados/cerrados por muerte
--    (clave para la métrica "mortalidad bajo tratamiento"). 'fecha_fin' guarda
--    la fecha real de muerte cuando estado='cerrado_muerte'.
ALTER TABLE tratamientos ADD COLUMN IF NOT EXISTS estado text DEFAULT 'activo';
ALTER TABLE tratamientos ADD COLUMN IF NOT EXISTS fecha_fin date;
