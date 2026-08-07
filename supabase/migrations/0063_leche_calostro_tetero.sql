-- 0063_leche_calostro_tetero.sql
-- Insumo leche en polvo (calostro/sustituto) + fórmula de reconstitución.
-- Cada toma de tetero descuenta gramos de polvo del inventario_nutricion.
-- Ejecutar en Supabase SQL Editor.

begin;

-- ── Fórmula reconstituible (ajustable cuando Juan dé la exacta) ──
-- g_polvo_por_litro: gramos de polvo para preparar 1 L de leche lista.
-- ml_agua_por_litro: agua aproximada (informativo; no se inventaría).
CREATE TABLE IF NOT EXISTS public.formula_tetero (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id uuid NOT NULL REFERENCES public.fincas(id),
  tipo text NOT NULL CHECK (tipo IN ('calostro','sustituto')),
  ingrediente text NOT NULL,          -- nombre en inventario_nutricion
  g_polvo_por_litro numeric NOT NULL DEFAULT 150,
  ml_agua_por_litro numeric NOT NULL DEFAULT 850,
  notas text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (finca_id, tipo)
);

ALTER TABLE public.formula_tetero ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS formula_tetero_all ON public.formula_tetero;
CREATE POLICY formula_tetero_all ON public.formula_tetero
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Movimientos de descuento (trazabilidad)
CREATE TABLE IF NOT EXISTS public.consumo_tetero_insumo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id uuid NOT NULL REFERENCES public.fincas(id),
  toma_realizada_id uuid,
  corderos_crianza_id uuid,
  tipo text,
  cantidad_ml numeric,
  g_polvo numeric NOT NULL,
  inventario_id uuid,
  ingrediente text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.consumo_tetero_insumo ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS consumo_tetero_all ON public.consumo_tetero_insumo;
DROP POLICY IF EXISTS consumo_tetero_insumo_all ON public.consumo_tetero_insumo;
CREATE POLICY consumo_tetero_insumo_all ON public.consumo_tetero_insumo
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Seed insumos (stock 0 hasta compra; mínimo de seguridad)
INSERT INTO public.inventario_nutricion
  (finca_id, ingrediente, tipo, stock_kg, unidad, kg_por_unidad, costo_por_kg, stock_minimo_kg, proveedor)
VALUES
  ('a1b2c3d4-0000-0000-0000-000000000001',
   'Leche en polvo calostro', 'tetero', 0, 'kg', 1, 0, 2, NULL),
  ('a1b2c3d4-0000-0000-0000-000000000001',
   'Leche en polvo sustituto', 'tetero', 0, 'kg', 1, 0, 5, NULL)
ON CONFLICT DO NOTHING;

-- Si no hay UNIQUE en (finca,ingrediente), el ON CONFLICT no aplica;
-- insert condicional por si ya existen:
INSERT INTO public.inventario_nutricion
  (finca_id, ingrediente, tipo, stock_kg, unidad, kg_por_unidad, costo_por_kg, stock_minimo_kg)
SELECT 'a1b2c3d4-0000-0000-0000-000000000001', 'Leche en polvo calostro', 'tetero', 0, 'kg', 1, 0, 2
WHERE NOT EXISTS (
  SELECT 1 FROM public.inventario_nutricion
  WHERE finca_id = 'a1b2c3d4-0000-0000-0000-000000000001'
    AND lower(ingrediente) = lower('Leche en polvo calostro')
);

INSERT INTO public.inventario_nutricion
  (finca_id, ingrediente, tipo, stock_kg, unidad, kg_por_unidad, costo_por_kg, stock_minimo_kg)
SELECT 'a1b2c3d4-0000-0000-0000-000000000001', 'Leche en polvo sustituto', 'tetero', 0, 'kg', 1, 0, 5
WHERE NOT EXISTS (
  SELECT 1 FROM public.inventario_nutricion
  WHERE finca_id = 'a1b2c3d4-0000-0000-0000-000000000001'
    AND lower(ingrediente) = lower('Leche en polvo sustituto')
);

-- Fórmula Juan: 130 g polvo por cada 1 L de agua
INSERT INTO public.formula_tetero (finca_id, tipo, ingrediente, g_polvo_por_litro, ml_agua_por_litro, notas)
VALUES
  ('a1b2c3d4-0000-0000-0000-000000000001', 'calostro',
   'Leche en polvo calostro', 130, 1000,
   '130 g polvo por cada 1 L de agua (definido por Juan).'),
  ('a1b2c3d4-0000-0000-0000-000000000001', 'sustituto',
   'Leche en polvo sustituto', 130, 1000,
   '130 g polvo por cada 1 L de agua (definido por Juan).')
ON CONFLICT (finca_id, tipo) DO UPDATE SET
  g_polvo_por_litro = EXCLUDED.g_polvo_por_litro,
  ml_agua_por_litro = EXCLUDED.ml_agua_por_litro,
  notas = EXCLUDED.notas,
  updated_at = now();

commit;
