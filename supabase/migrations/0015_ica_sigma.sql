-- ─────────────────────────────────────────────────────────────
-- 0015_ica_sigma.sql
-- Movilizaciones ICA/SIGMA (GSMI, RSPP). Registro de entradas,
-- salidas y traslados internos de animales.
-- Ejecutar en Supabase SQL Editor (NO se ejecuta automáticamente).
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS movilizaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id uuid REFERENCES fincas(id),
  tipo text NOT NULL CHECK (tipo IN (
    'entrada','salida','interno'
  )),
  fecha date NOT NULL,
  origen text,
  destino text NOT NULL,
  cantidad_animales integer NOT NULL,
  especie text DEFAULT 'ovino',
  motivo text CHECK (motivo IN (
    'venta','sacrificio','feria','traslado',
    'prestamo_semental','devolucion','otro'
  )),
  guia_numero text,
  guia_fecha date,
  transportador text,
  placa_vehiculo text,
  gsmi_generado boolean DEFAULT false,
  gsmi_numero text,
  animal_ids uuid[],
  notas text,
  registrado_por text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE movilizaciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all_movilizaciones" ON movilizaciones
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX idx_movilizaciones_finca_fecha
  ON movilizaciones(finca_id, fecha DESC);
