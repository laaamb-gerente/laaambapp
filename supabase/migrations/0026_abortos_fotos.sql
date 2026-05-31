-- 0026_abortos_fotos.sql
-- Registro de abortos (eventos_reproductivos.tipo='aborto') + fotos de evidencia.
-- Añade columnas de foto a eventos_reproductivos y bajas, y asegura el bucket
-- privado 'evidencias' con políticas de upload/lectura para usuarios autenticados.

-- ── Columnas de foto ────────────────────────────────────────────────
ALTER TABLE eventos_reproductivos ADD COLUMN IF NOT EXISTS foto_url text;
ALTER TABLE bajas ADD COLUMN IF NOT EXISTS foto_evidencia_url text;

-- ── Bucket privado de evidencias ────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('evidencias', 'evidencias', false)
ON CONFLICT (id) DO NOTHING;

-- ── Políticas de Storage (idempotentes: drop + create) ──────────────
-- Nota: Postgres no soporta "CREATE POLICY IF NOT EXISTS", por eso se
-- eliminan primero si existen y luego se vuelven a crear.
DROP POLICY IF EXISTS "auth_upload_evidencias" ON storage.objects;
CREATE POLICY "auth_upload_evidencias"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'evidencias');

DROP POLICY IF EXISTS "auth_read_evidencias" ON storage.objects;
CREATE POLICY "auth_read_evidencias"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'evidencias');
