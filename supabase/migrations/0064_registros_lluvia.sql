-- 0064_registros_lluvia.sql
-- Control simple de lluvias (finca o potrero opcional).
-- Ejecutar en Supabase SQL Editor.

begin;

CREATE TABLE IF NOT EXISTS public.registros_lluvia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id uuid NOT NULL REFERENCES public.fincas(id),
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  llovio boolean NOT NULL DEFAULT true,
  intensidad text CHECK (intensidad IS NULL OR intensidad IN ('leve','media','fuerte')),
  duracion_texto text,              -- ej. "2 horas", "toda la tarde"
  lote_id uuid REFERENCES public.lotes(id) ON DELETE SET NULL,
  notas text,
  registrado_por text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Un registro “del día” por finca sin lote (lluvia general de la finca)
CREATE UNIQUE INDEX IF NOT EXISTS uq_lluvia_finca_dia_sin_lote
  ON public.registros_lluvia (finca_id, fecha)
  WHERE lote_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_lluvia_finca_fecha
  ON public.registros_lluvia (finca_id, fecha DESC);

ALTER TABLE public.registros_lluvia ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS registros_lluvia_all ON public.registros_lluvia;
CREATE POLICY registros_lluvia_all ON public.registros_lluvia
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

commit;
