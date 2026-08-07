-- 0062_auditoria_hato.sql
-- Auditorías mensuales de hato (multi-día). Ejecutar en Supabase SQL Editor.
-- V1: solo hato LAAAMB (tabla animales). Inventario de cabezas NO se baja
-- sin aprobación del gerente (estado perdido).

begin;

-- Permitir estado 'perdido' en animales (además de activo/vendido/muerto/descartado)
ALTER TABLE public.animales DROP CONSTRAINT IF EXISTS animales_estado_check;
ALTER TABLE public.animales
  ADD CONSTRAINT animales_estado_check
  CHECK (estado IN ('activo','vendido','muerto','descartado','perdido'));

-- Baja tipo 'perdido' (no localizado en auditoría; inventario solo al aprobar)
ALTER TABLE public.bajas DROP CONSTRAINT IF EXISTS bajas_tipo_check;
ALTER TABLE public.bajas
  ADD CONSTRAINT bajas_tipo_check
  CHECK (tipo IN ('muerte','venta','descarte','robo','otro','perdido'));

-- ── Cabecera de auditoría ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.auditorias_hato (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finca_id uuid NOT NULL REFERENCES public.fincas(id),
  fecha_inicio date NOT NULL DEFAULT (CURRENT_DATE),
  fecha_fin date,
  estado text NOT NULL DEFAULT 'abierta'
    CHECK (estado IN ('abierta','en_campo','cerrada')),
  auditor_nombre text,
  auditor_perfil_id uuid REFERENCES public.perfiles(id),
  snapshot_total int NOT NULL DEFAULT 0,
  snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  vistos_count int NOT NULL DEFAULT 0,
  faltan_por_auditar boolean,
  grupos_pendientes text,
  alerta_umbral boolean NOT NULL DEFAULT false,
  informe_json jsonb,
  notas text,
  cerrado_por text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auditorias_hato_finca_estado
  ON public.auditorias_hato (finca_id, estado, fecha_inicio DESC);

-- ── Líneas (un animal visto en el corral) ────────────────────
CREATE TABLE IF NOT EXISTS public.auditoria_lineas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auditoria_id uuid NOT NULL REFERENCES public.auditorias_hato(id) ON DELETE CASCADE,
  animal_id uuid NOT NULL REFERENCES public.animales(id),
  chapeta text,
  grupo_operativo text NOT NULL DEFAULT 'otro'
    CHECK (grupo_operativo IN ('madres','levante','vacias','machos','crias','otro')),
  peso_kg numeric(8,2),
  cc numeric(3,1),
  famacha smallint CHECK (famacha IS NULL OR (famacha BETWEEN 1 AND 5)),
  trato boolean NOT NULL DEFAULT false,
  diagnostico text,
  tratamiento_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  notas text,
  registrado_por text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (auditoria_id, animal_id)
);

CREATE INDEX IF NOT EXISTS idx_auditoria_lineas_aud
  ON public.auditoria_lineas (auditoria_id, created_at DESC);

-- ── Faltantes / búsqueda post-cierre ─────────────────────────
CREATE TABLE IF NOT EXISTS public.auditoria_faltantes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auditoria_id uuid NOT NULL REFERENCES public.auditorias_hato(id) ON DELETE CASCADE,
  animal_id uuid NOT NULL REFERENCES public.animales(id),
  chapeta text,
  estado text NOT NULL DEFAULT 'pendiente_busqueda'
    CHECK (estado IN (
      'pendiente_busqueda','encontrado','no_encontrado',
      'baja_propuesta','cerrado'
    )),
  peso_kg numeric(8,2),
  cc numeric(3,1),
  famacha smallint,
  foto_url text,
  notas text,
  baja_id uuid,
  resuelto_por text,
  resuelto_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (auditoria_id, animal_id)
);

CREATE INDEX IF NOT EXISTS idx_auditoria_faltantes_pend
  ON public.auditoria_faltantes (estado)
  WHERE estado = 'pendiente_busqueda';

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE public.auditorias_hato ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auditoria_lineas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auditoria_faltantes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS auditorias_hato_sel ON public.auditorias_hato;
DROP POLICY IF EXISTS auditorias_hato_wr ON public.auditorias_hato;
CREATE POLICY auditorias_hato_sel ON public.auditorias_hato
  FOR SELECT TO authenticated
  USING (public.auth_rol() IN ('gerente','administrador','veterinario','auxiliar'));
CREATE POLICY auditorias_hato_wr ON public.auditorias_hato
  FOR ALL TO authenticated
  USING (public.auth_rol() IN ('gerente','administrador','veterinario','auxiliar'))
  WITH CHECK (public.auth_rol() IN ('gerente','administrador','veterinario','auxiliar'));

DROP POLICY IF EXISTS auditoria_lineas_sel ON public.auditoria_lineas;
DROP POLICY IF EXISTS auditoria_lineas_wr ON public.auditoria_lineas;
CREATE POLICY auditoria_lineas_sel ON public.auditoria_lineas
  FOR SELECT TO authenticated
  USING (public.auth_rol() IN ('gerente','administrador','veterinario','auxiliar'));
CREATE POLICY auditoria_lineas_wr ON public.auditoria_lineas
  FOR ALL TO authenticated
  USING (public.auth_rol() IN ('gerente','administrador','veterinario','auxiliar'))
  WITH CHECK (public.auth_rol() IN ('gerente','administrador','veterinario','auxiliar'));

DROP POLICY IF EXISTS auditoria_faltantes_sel ON public.auditoria_faltantes;
DROP POLICY IF EXISTS auditoria_faltantes_wr ON public.auditoria_faltantes;
CREATE POLICY auditoria_faltantes_sel ON public.auditoria_faltantes
  FOR SELECT TO authenticated
  USING (public.auth_rol() IN ('gerente','administrador','veterinario','auxiliar'));
CREATE POLICY auditoria_faltantes_wr ON public.auditoria_faltantes
  FOR ALL TO authenticated
  USING (public.auth_rol() IN ('gerente','administrador','veterinario','auxiliar'))
  WITH CHECK (public.auth_rol() IN ('gerente','administrador','veterinario','auxiliar'));

commit;
