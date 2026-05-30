-- ─────────────────────────────────────────────────────────────
-- 0014_siigo_integration.sql
-- Integración contable Siigo: configuración/token y mapeo de
-- cuentas Siigo → categorías LAAAMB.
-- Ejecutar en Supabase SQL Editor (NO se ejecuta automáticamente).
-- ─────────────────────────────────────────────────────────────

-- Tabla de configuración Siigo
CREATE TABLE IF NOT EXISTS siigo_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id uuid REFERENCES fincas(id),
  username text NOT NULL,
  access_token text,
  token_expires_at timestamptz,
  ultimo_sync timestamptz,
  activo boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Tabla de mapeo de cuentas Siigo → categorías LAAAMB
CREATE TABLE IF NOT EXISTS siigo_mapeo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id uuid REFERENCES fincas(id),
  cuenta_siigo text NOT NULL,
  nombre_siigo text,
  categoria_laaamb text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('costo','ingreso')),
  activo boolean DEFAULT true
);

ALTER TABLE siigo_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE siigo_mapeo ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_all_siigo_config" ON siigo_config
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_siigo_mapeo" ON siigo_mapeo
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Mapeo inicial de cuentas comunes
INSERT INTO siigo_mapeo
  (finca_id, cuenta_siigo, nombre_siigo, categoria_laaamb, tipo)
VALUES
  ('a1b2c3d4-0000-0000-0000-000000000001',
   '7102', 'Venta de animales', 'venta_animal', 'ingreso'),
  ('a1b2c3d4-0000-0000-0000-000000000001',
   '7135', 'Venta de subproductos', 'otro', 'ingreso'),
  ('a1b2c3d4-0000-0000-0000-000000000001',
   '5202', 'Alimentación y forrajes', 'alimentacion', 'costo'),
  ('a1b2c3d4-0000-0000-0000-000000000001',
   '5205', 'Medicamentos y sanidad', 'sanidad', 'costo'),
  ('a1b2c3d4-0000-0000-0000-000000000001',
   '5101', 'Nómina y prestaciones', 'mano_obra', 'costo'),
  ('a1b2c3d4-0000-0000-0000-000000000001',
   '5305', 'Gastos financieros aparcería', 'otro', 'costo')
ON CONFLICT DO NOTHING;
