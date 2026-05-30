-- ─────────────────────────────────────────────────────────────
-- 0013_nomina.sql
-- Nómina y asistencia: empleados, asistencia diaria y liquidaciones
-- quincenales. Ejecutar en Supabase SQL Editor (NO automático).
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS empleados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id uuid REFERENCES fincas(id),
  nombre text NOT NULL,
  cargo text NOT NULL CHECK (cargo IN (
    'auxiliar_campo','veterinario','administrador',
    'mayordomo','otro'
  )),
  salario_base numeric NOT NULL,
  subsidio_transporte numeric DEFAULT 0,
  fecha_ingreso date NOT NULL,
  activo boolean DEFAULT true,
  telefono text,
  notas text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS asistencia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id uuid REFERENCES fincas(id),
  empleado_id uuid REFERENCES empleados(id),
  fecha date NOT NULL,
  tipo text NOT NULL CHECK (tipo IN (
    'completo','medio_dia','ausente_justificado',
    'ausente_injustificado','incapacidad','festivo'
  )),
  horas_trabajadas numeric DEFAULT 8,
  horas_extra numeric DEFAULT 0,
  notas text,
  registrado_por text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(empleado_id, fecha)
);

CREATE TABLE IF NOT EXISTS liquidaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id uuid REFERENCES fincas(id),
  empleado_id uuid REFERENCES empleados(id),
  quincena integer NOT NULL CHECK (quincena IN (1,2)),
  mes integer NOT NULL,
  año integer NOT NULL,
  dias_trabajados numeric DEFAULT 0,
  dias_ausentes_injustificados numeric DEFAULT 0,
  horas_extra numeric DEFAULT 0,
  salario_base numeric NOT NULL,
  subsidio_transporte numeric DEFAULT 0,
  deducciones numeric DEFAULT 0,
  total_pagar numeric NOT NULL,
  pagado boolean DEFAULT false,
  fecha_pago date,
  created_at timestamptz DEFAULT now(),
  UNIQUE(empleado_id, quincena, mes, año)
);

ALTER TABLE empleados ENABLE ROW LEVEL SECURITY;
ALTER TABLE asistencia ENABLE ROW LEVEL SECURITY;
ALTER TABLE liquidaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_all_empleados" ON empleados
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_asistencia" ON asistencia
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_liquidaciones" ON liquidaciones
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_asistencia_empleado_fecha
  ON asistencia(empleado_id, fecha DESC);
CREATE INDEX idx_liquidaciones_empleado
  ON liquidaciones(empleado_id, año DESC, mes DESC);
