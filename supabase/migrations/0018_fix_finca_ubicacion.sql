-- supabase/migrations/0018_fix_finca_ubicacion.sql
-- NOTA: Ya ejecutada en producción. Solo para historial del repo.
-- Contexto: La migración 0017 actualizó la ubicación de La Marinilla
-- a 'San Bernardo, Ibagué, Tolima, Colombia' usando la columna
-- real 'ubicacion' (la tabla no tiene municipio/departamento separados).
-- Este archivo documenta que no hubo una 0018 separada —
-- el fix de ubicación quedó en 0017.
SELECT 'migracion 0018 no aplica - fix de ubicacion incluido en 0017' as status;
