-- 0061_perfiles_aportante_y_rol.sql
-- Vincula un usuario (rol aportante) a un registro de aportantes.
-- Ejecutar MANUALMENTE en Supabase SQL Editor.
--
-- Tras correrlo:
--   1. Invitar usuario con rol "aportante" desde Ajustes → Equipo
--   2. Elegir el aportante (ej. JULIAN Y SALATIEL MORENO)
--   3. El usuario solo ve Aparcería de ese aportante

begin;

-- Columna de vínculo (nullable: solo aplica a rol aportante)
ALTER TABLE public.perfiles
  ADD COLUMN IF NOT EXISTS aportante_id uuid REFERENCES public.aportantes(id);

CREATE INDEX IF NOT EXISTS idx_perfiles_aportante
  ON public.perfiles (aportante_id)
  WHERE aportante_id IS NOT NULL;

-- Lectura de aportantes: el aportante solo ve SU fila
DROP POLICY IF EXISTS "aportantes_sel" ON public.aportantes;
CREATE POLICY "aportantes_sel" ON public.aportantes
  FOR SELECT TO authenticated
  USING (
    public.auth_rol() IN ('gerente','administrador','socio','veterinario','auxiliar')
    OR (
      public.auth_rol() = 'aportante'
      AND id = (SELECT p.aportante_id FROM public.perfiles p WHERE p.id = auth.uid())
    )
  );

-- Lectura de animales de aparcería: aportante solo los suyos
-- (si la policy se llama distinto en prod, el DROP IF EXISTS evita choque)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='aportantes_animales'
  ) THEN
    -- Ampliar select si hay política genérica; crear una dedicada para aportante
    EXECUTE 'DROP POLICY IF EXISTS "aportantes_animales_sel_aportante" ON public.aportantes_animales';
    EXECUTE $pol$
      CREATE POLICY "aportantes_animales_sel_aportante" ON public.aportantes_animales
        FOR SELECT TO authenticated
        USING (
          public.auth_rol() IN ('gerente','administrador','socio','veterinario','auxiliar')
          OR (
            public.auth_rol() = 'aportante'
            AND aportante_id = (SELECT p.aportante_id FROM public.perfiles p WHERE p.id = auth.uid())
          )
        )
    $pol$;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '0061: no se pudo ajustar policy aportantes_animales: %', SQLERRM;
END $$;

commit;
