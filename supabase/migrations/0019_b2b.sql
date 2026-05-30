-- ─────────────────────────────────────────────────────────────
-- 0019_b2b.sql
-- Módulo B2B (clientes corporativos, pedidos, items) + cadena de frío.
-- Ejecutar en Supabase SQL Editor (NO se ejecuta automáticamente).
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS clientes_b2b (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id uuid REFERENCES fincas(id),
  razon_social text NOT NULL,
  nit text,
  contacto_nombre text,
  contacto_email text,
  contacto_telefono text,
  ciudad text,
  tipo text DEFAULT 'restaurante' CHECK (tipo IN (
    'restaurante','hotel','supermercado',
    'distribuidor','exportador','otro'
  )),
  precio_negociado_kgha numeric,
  descuento_pct numeric DEFAULT 0,
  condicion_pago text DEFAULT '30_dias' CHECK (condicion_pago IN (
    'contado','15_dias','30_dias','45_dias','60_dias'
  )),
  limite_credito numeric DEFAULT 0,
  saldo_cartera numeric DEFAULT 0,
  activo boolean DEFAULT true,
  notas text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pedidos_b2b (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id uuid REFERENCES fincas(id),
  cliente_id uuid REFERENCES clientes_b2b(id),
  fecha_pedido date NOT NULL DEFAULT CURRENT_DATE,
  fecha_entrega date,
  estado text DEFAULT 'pendiente' CHECK (estado IN (
    'pendiente','confirmado','despachado',
    'entregado','cancelado'
  )),
  total_kg numeric DEFAULT 0,
  total_valor numeric DEFAULT 0,
  notas text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS items_pedido (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id uuid REFERENCES pedidos_b2b(id),
  tipo_corte text NOT NULL,
  kg_solicitados numeric NOT NULL,
  precio_kg numeric NOT NULL,
  subtotal numeric GENERATED ALWAYS AS (kg_solicitados * precio_kg) STORED,
  empaque_id uuid REFERENCES empaques(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE clientes_b2b ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedidos_b2b ENABLE ROW LEVEL SECURITY;
ALTER TABLE items_pedido ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_all_b2b" ON clientes_b2b
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_pedidos" ON pedidos_b2b
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_items" ON items_pedido
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_pedidos_cliente ON pedidos_b2b(cliente_id);
CREATE INDEX idx_pedidos_estado ON pedidos_b2b(estado);

-- ── CADENA DE FRÍO (PARTE 3) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS cadena_frio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empaque_id uuid REFERENCES empaques(id),
  fecha_hora timestamptz NOT NULL DEFAULT now(),
  temperatura_c numeric NOT NULL,
  ubicacion text,
  registrado_por text,
  observacion text
);

ALTER TABLE cadena_frio ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all_cadena_frio" ON cadena_frio
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_read_cadena_frio" ON cadena_frio
  FOR SELECT TO anon USING (true);

CREATE INDEX idx_cadena_frio_empaque ON cadena_frio(empaque_id);
