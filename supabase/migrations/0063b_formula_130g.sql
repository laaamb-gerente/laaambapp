-- 0063b: actualizar fórmula a 130 g polvo / 1 L agua (Juan)
UPDATE public.formula_tetero
SET g_polvo_por_litro = 130,
    ml_agua_por_litro = 1000,
    notas = '130 g polvo por cada 1 L de agua (definido por Juan).',
    updated_at = now()
WHERE finca_id = 'a1b2c3d4-0000-0000-0000-000000000001';
