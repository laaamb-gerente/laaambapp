INSERT INTO lotes (id, finca_id, nombre, hectareas, tipo_pastura, capacidad_animal, dias_descanso_objetivo, dias_pastoreo_objetivo, poligono) VALUES
(
  'b1000001-0000-0000-0000-000000000001',
  'a1b2c3d4-0000-0000-0000-000000000001',
  'Pivote 1', 4.4, 'Mulato II', 400, 45, 10, NULL
),
(
  'b1000002-0000-0000-0000-000000000002',
  'a1b2c3d4-0000-0000-0000-000000000001',
  'Pivote 2', 1.7, 'Kikuyo', 14, 21, 7, NULL
),
(
  'b1000003-0000-0000-0000-000000000003',
  'a1b2c3d4-0000-0000-0000-000000000001',
  'Logte', 1.6, 'Kikuyo', 13, 21, 7, NULL
),
(
  'b1000004-0000-0000-0000-000000000004',
  'a1b2c3d4-0000-0000-0000-000000000001',
  'Cacao', 1.2, 'Camello', 100, 30, 7, NULL
),
(
  'b1000005-0000-0000-0000-000000000005',
  'a1b2c3d4-0000-0000-0000-000000000001',
  'Potrero 18', 2.2, 'Kikuyo', 17, 21, 7, NULL
)
ON CONFLICT (id) DO NOTHING;
