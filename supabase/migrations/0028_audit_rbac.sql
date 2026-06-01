-- ── AUDIT LOG (inmutable) ──────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id uuid REFERENCES fincas(id),
  timestamp timestamptz DEFAULT now(),
  usuario_email text NOT NULL,
  usuario_rol text NOT NULL,
  accion text NOT NULL,
  -- 'INSERT' | 'UPDATE' | 'DELETE' | 'APPROVE' | 'REJECT'
  modulo text NOT NULL,
  -- 'bajas' | 'tratamientos' | 'pesajes' |
  -- 'eventos_reproductivos' | 'compras_medicamentos'
  registro_id uuid,
  datos_antes jsonb,
  datos_despues jsonb,
  aprobado_por_email text,
  nota text
);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
-- Solo lectura para autenticados; nadie puede editar
CREATE POLICY "auth_read_audit" ON audit_log
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_audit" ON audit_log
  FOR INSERT TO authenticated WITH CHECK (true);
-- NO hay UPDATE ni DELETE policy = inmutable

-- ── ESTADO DE APROBACIÓN en tablas críticas ───────────
ALTER TABLE bajas
  ADD COLUMN IF NOT EXISTS estado_aprobacion text
    DEFAULT 'aprobado',
  -- 'pendiente' | 'aprobado' | 'rechazado'
  ADD COLUMN IF NOT EXISTS aprobado_por text,
  ADD COLUMN IF NOT EXISTS fecha_aprobacion timestamptz,
  ADD COLUMN IF NOT EXISTS nota_rechazo text,
  ADD COLUMN IF NOT EXISTS propuesto_por text,
  ADD COLUMN IF NOT EXISTS propuesto_por_rol text;

ALTER TABLE tratamientos
  ADD COLUMN IF NOT EXISTS estado_aprobacion text
    DEFAULT 'aprobado',
  ADD COLUMN IF NOT EXISTS aprobado_por text,
  ADD COLUMN IF NOT EXISTS fecha_aprobacion timestamptz,
  ADD COLUMN IF NOT EXISTS nota_rechazo text,
  ADD COLUMN IF NOT EXISTS propuesto_por text,
  ADD COLUMN IF NOT EXISTS propuesto_por_rol text;

ALTER TABLE pesajes
  ADD COLUMN IF NOT EXISTS estado_aprobacion text
    DEFAULT 'aprobado',
  ADD COLUMN IF NOT EXISTS aprobado_por text,
  ADD COLUMN IF NOT EXISTS fecha_aprobacion timestamptz,
  ADD COLUMN IF NOT EXISTS nota_rechazo text,
  ADD COLUMN IF NOT EXISTS propuesto_por text,
  ADD COLUMN IF NOT EXISTS propuesto_por_rol text;

ALTER TABLE eventos_reproductivos
  ADD COLUMN IF NOT EXISTS estado_aprobacion text
    DEFAULT 'aprobado',
  ADD COLUMN IF NOT EXISTS aprobado_por text,
  ADD COLUMN IF NOT EXISTS fecha_aprobacion timestamptz,
  ADD COLUMN IF NOT EXISTS nota_rechazo text,
  ADD COLUMN IF NOT EXISTS propuesto_por text,
  ADD COLUMN IF NOT EXISTS propuesto_por_rol text;

-- Registros existentes quedan como 'aprobado' (retroactivo)
UPDATE bajas SET estado_aprobacion = 'aprobado'
  WHERE estado_aprobacion IS NULL;
UPDATE tratamientos SET estado_aprobacion = 'aprobado'
  WHERE estado_aprobacion IS NULL;
UPDATE pesajes SET estado_aprobacion = 'aprobado'
  WHERE estado_aprobacion IS NULL;
UPDATE eventos_reproductivos SET estado_aprobacion = 'aprobado'
  WHERE estado_aprobacion IS NULL;
