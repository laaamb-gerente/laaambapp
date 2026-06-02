-- ─────────────────────────────────────────────────────────────
-- 0030_b2b_cortes.sql
-- B2B: cortes seleccionados por pedido con precio por kg.
-- Se guardan como JSONB en pedidos_b2b.cortes, p.ej.:
--   [{"corte":"rack","nombre":"Rack Francés","precio_kg":85000}, ...]
--
-- NOTA: la tabla de pedidos B2B se llama 'pedidos_b2b' (no 'pedidos').
-- NO existe columna 'precio_unitario' en este esquema, por lo que no se
-- elimina nada: solo se AGREGA la columna 'cortes'. La tabla
-- 'items_pedido' (líneas con kg) se conserva intacta para compatibilidad.
-- Ejecutar en Supabase (SQL Editor).
-- ─────────────────────────────────────────────────────────────

ALTER TABLE pedidos_b2b
  ADD COLUMN IF NOT EXISTS cortes jsonb DEFAULT '[]'::jsonb;
