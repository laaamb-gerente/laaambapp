-- ─────────────────────────────────────────────────────────────
-- 0065_pivotes_geo_riego_ortomosaico.sql
--
-- 1) Geo de pivotes en Supabase (mobile = desktop; fin del AppData-only)
-- 2) registros_riego por pivote (o potrero opcional)
-- 3) capa_mapa en fincas: listo para ortomosaico dron (2–3 semanas)
--
-- Ejecutar en Supabase SQL Editor. Idempotente.
-- ─────────────────────────────────────────────────────────────

begin;

-- ═══ 1 · Pivotes: geometría + área calculada ═══
ALTER TABLE public.pivotes
  ADD COLUMN IF NOT EXISTS geojson jsonb,
  ADD COLUMN IF NOT EXISTS area_ha_calc numeric(10,3),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_pivotes_geojson
  ON public.pivotes ((geojson IS NOT NULL))
  WHERE geojson IS NOT NULL;

COMMENT ON COLUMN public.pivotes.geojson IS
  'GeoJSON Polygon (EPSG:4326). Fuente de verdad del contorno; AppData es caché offline.';

-- ═══ 2 · Riego ═══
CREATE TABLE IF NOT EXISTS public.registros_riego (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id uuid NOT NULL REFERENCES public.fincas(id) ON DELETE CASCADE,
  pivote_id uuid REFERENCES public.pivotes(id) ON DELETE SET NULL,
  lote_id text,                          -- opcional: riego de un potrero
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  hora_inicio time,
  duracion_min integer NOT NULL CHECK (duracion_min > 0 AND duracion_min <= 24*60),
  metodo text CHECK (
    metodo IS NULL OR metodo IN (
      'aspersión','pivote_central','manguera','cinta','cañón','otro'
    )
  ),
  mm_estimados numeric(6,2),
  caudal_lpm numeric(10,2),
  volumen_m3 numeric(10,3),
  registrado_por text,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_riego_pivote_fecha
  ON public.registros_riego (pivote_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_riego_finca_fecha
  ON public.registros_riego (finca_id, fecha DESC);

ALTER TABLE public.registros_riego ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS registros_riego_all ON public.registros_riego;
CREATE POLICY registros_riego_all ON public.registros_riego
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMENT ON TABLE public.registros_riego IS
  'Eventos de riego por pivote/potrero. Cada fila = un riego (ej. 2 h aspersión).';

-- ═══ 3 · Capa de mapa / ortomosaico dron (config en finca) ═══
-- jsonb flexible; la app lee capa_mapa.base y capa_mapa.ortomosaico
ALTER TABLE public.fincas
  ADD COLUMN IF NOT EXISTS capa_mapa jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.fincas.capa_mapa IS
  'Config de capas Leaflet. Ej: {
    "base": "google_sat" | "orthomosaic" | "street",
    "ortomosaico": {
      "activo": true,
      "tipo": "xyz" | "image_overlay" | "cog",
      "url_template": "https://.../{z}/{x}/{y}.png",
      "image_url": "https://.../orto.jpg",
      "bounds": [[latS,lngW],[latN,lngE]],
      "opacity": 0.95,
      "survey_date": "2026-09-15",
      "rmse_m": 0.08,
      "crs": "EPSG:4326",
      "provider": "dron_local",
      "notas": "GeoTIFF procesado a tiles XYZ"
    },
    "notas": "Cuando el dron entregue, reemplaza Google como base de medición"
  }';

-- Seed default para La Marinilla (no pisa si ya hay config)
UPDATE public.fincas
SET capa_mapa = COALESCE(capa_mapa, '{}'::jsonb) || jsonb_build_object(
  'base', COALESCE(capa_mapa->>'base', 'google_sat'),
  'ortomosaico', COALESCE(capa_mapa->'ortomosaico', jsonb_build_object(
    'activo', false,
    'tipo', 'xyz',
    'url_template', null,
    'bounds', null,
    'opacity', 0.95,
    'survey_date', null,
    'rmse_m', null,
    'crs', 'EPSG:4326',
    'provider', null,
    'notas', 'Pendiente vuelo dron · ortomosaico GeoTIFF → tiles XYZ o image overlay'
  ))
)
WHERE id = 'a1b2c3d4-0000-0000-0000-000000000001'
  AND (capa_mapa IS NULL OR capa_mapa = '{}'::jsonb OR NOT (capa_mapa ? 'ortomosaico'));

-- Historial opcional de levantamientos (para cuando haya 2+ vuelos)
CREATE TABLE IF NOT EXISTS public.levantamientos_dron (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id uuid NOT NULL REFERENCES public.fincas(id) ON DELETE CASCADE,
  fecha_vuelo date,
  provider text,
  rms_m numeric(8,3),
  entregables text[],                 -- {'ortomosaico','dsm','dtm','nube_puntos','informe'}
  orto_url text,                      -- URL pública del tile o imagen
  orto_tipo text CHECK (orto_tipo IS NULL OR orto_tipo IN ('xyz','image_overlay','cog','geotiff_raw')),
  bounds jsonb,                       -- [[latS,lngW],[latN,lngE]]
  area_ha_medida numeric(10,3),
  notas text,
  activo boolean DEFAULT false,       -- true = capa base vigente en la app
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lev_dron_finca
  ON public.levantamientos_dron (finca_id, fecha_vuelo DESC);

ALTER TABLE public.levantamientos_dron ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS levantamientos_dron_all ON public.levantamientos_dron;
CREATE POLICY levantamientos_dron_all ON public.levantamientos_dron
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';

commit;
