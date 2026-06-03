-- ─────────────────────────────────────────────────────────────
-- 0041_sala_cuna_fk_perfiles.sql   (correctivo de 0040)
--
-- La 0040 se ejecutó con los campos responsable* apuntando a auth.users(id).
-- PostgREST no expone auth.users, así que el embedding responsable:perfiles(nombre)
-- (que usa la pantalla móvil de Fase 2) no resolvería. Esta migración cambia las
-- 5 FK para que referencien perfiles(id).
--
-- SIN migración de datos: perfiles.id = auth.users.id (ver 0008), el uuid
-- almacenado es el mismo; solo cambia la relación declarada.
--
-- Idempotente: se puede re-ejecutar. Ejecutar en Supabase (SQL Editor).
-- ─────────────────────────────────────────────────────────────

-- corderos_crianza.responsable_default
ALTER TABLE corderos_crianza
  DROP CONSTRAINT IF EXISTS corderos_crianza_responsable_default_fkey;
ALTER TABLE corderos_crianza
  ADD  CONSTRAINT corderos_crianza_responsable_default_fkey
  FOREIGN KEY (responsable_default) REFERENCES perfiles(id) ON DELETE SET NULL;

-- eventos_calostro.responsable
ALTER TABLE eventos_calostro
  DROP CONSTRAINT IF EXISTS eventos_calostro_responsable_fkey;
ALTER TABLE eventos_calostro
  ADD  CONSTRAINT eventos_calostro_responsable_fkey
  FOREIGN KEY (responsable) REFERENCES perfiles(id) ON DELETE SET NULL;

-- tomas_programadas.responsable_asignado
ALTER TABLE tomas_programadas
  DROP CONSTRAINT IF EXISTS tomas_programadas_responsable_asignado_fkey;
ALTER TABLE tomas_programadas
  ADD  CONSTRAINT tomas_programadas_responsable_asignado_fkey
  FOREIGN KEY (responsable_asignado) REFERENCES perfiles(id) ON DELETE SET NULL;

-- tomas_realizadas.responsable
ALTER TABLE tomas_realizadas
  DROP CONSTRAINT IF EXISTS tomas_realizadas_responsable_fkey;
ALTER TABLE tomas_realizadas
  ADD  CONSTRAINT tomas_realizadas_responsable_fkey
  FOREIGN KEY (responsable) REFERENCES perfiles(id) ON DELETE SET NULL;

-- pesajes_corderos.responsable
ALTER TABLE pesajes_corderos
  DROP CONSTRAINT IF EXISTS pesajes_corderos_responsable_fkey;
ALTER TABLE pesajes_corderos
  ADD  CONSTRAINT pesajes_corderos_responsable_fkey
  FOREIGN KEY (responsable) REFERENCES perfiles(id) ON DELETE SET NULL;

-- Refrescar el cache de esquema de PostgREST (para que reconozca el nuevo
-- embedding responsable:perfiles(...) sin esperar al refresco automático).
NOTIFY pgrst, 'reload schema';
