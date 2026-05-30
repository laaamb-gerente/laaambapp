ALTER TABLE fincas ADD COLUMN IF NOT EXISTS config jsonb
  DEFAULT '{}'::jsonb;

UPDATE fincas SET config = '{
  "dias_gestacion_ovino": 147,
  "dias_gestacion_bovino": 283,
  "edad_destete_dias": 60,
  "peso_objetivo_sacrificio": 48,
  "precio_objetivo_venta": 15000,
  "carga_animal_objetivo": 8,
  "meta_fertilidad": 90,
  "meta_gdp": 200,
  "dias_descanso_default": 21,
  "dias_pastoreo_default": 7
}'::jsonb
WHERE id = 'a1b2c3d4-0000-0000-0000-000000000001';
