-- ─────────────────────────────────────────────────────────────
-- 0012_flujo_caja.sql
-- Flujo de caja vivo: presupuesto mensual, aparcería y sus pagos.
-- Ejecutar en Supabase SQL Editor (NO se ejecuta automáticamente).
-- ─────────────────────────────────────────────────────────────

-- Tabla de presupuesto mensual por categoría
CREATE TABLE IF NOT EXISTS presupuesto (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id uuid REFERENCES fincas(id),
  año integer NOT NULL,
  mes integer NOT NULL CHECK (mes BETWEEN 1 AND 12),
  categoria text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('costo','ingreso')),
  valor_presupuestado numeric DEFAULT 0,
  notas text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(finca_id, año, mes, categoria, tipo)
);

-- Tabla de aparcería
CREATE TABLE IF NOT EXISTS aparceria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id uuid REFERENCES fincas(id),
  socio text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('fijo','variable','porcentaje')),
  valor numeric NOT NULL,
  porcentaje numeric,
  fecha_inicio date NOT NULL,
  fecha_fin date,
  descripcion text,
  activo boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Tabla de pagos de aparcería (cuenta 5305)
CREATE TABLE IF NOT EXISTS pagos_aparceria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id uuid REFERENCES fincas(id),
  aparceria_id uuid REFERENCES aparceria(id),
  mes integer NOT NULL,
  año integer NOT NULL,
  valor_pagado numeric NOT NULL,
  valor_provisionado numeric DEFAULT 0,
  fecha_pago date,
  notas text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE presupuesto ENABLE ROW LEVEL SECURITY;
ALTER TABLE aparceria ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagos_aparceria ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_all_presupuesto" ON presupuesto
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_aparceria" ON aparceria
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_pagos_aparceria" ON pagos_aparceria
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
