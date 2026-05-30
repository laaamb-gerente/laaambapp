-- ─────────────────────────────────────────────────────────────
-- 0020_rls_por_rol.sql
-- RLS REAL POR ROL (Sprint 0 de seguridad — Acción 1)
--
-- Problema: las migraciones 0001/0005/0006/0007 dejaron políticas
-- "anon_all_*" (la anon key es PÚBLICA en el JS del cliente → cualquiera
-- puede leer/escribir TODO sin login) y la 0010/0011/0012/0013/0014/
-- 0015/0019 dejaron "auth_all_*" FOR ALL USING(true) (cualquier usuario
-- logueado lee/escribe TODO, incluyendo finanzas y nómina).
--
-- Esta migración:
--   1. Crea auth_rol() SECURITY DEFINER (lee perfiles.rol del auth.uid()
--      sin disparar RLS → evita recursión).
--   2. Elimina TODAS las políticas anon_all_* y auth_all_* permisivas
--      (conserva los 2 lectores públicos legítimos del QR:
--       anon_read_empaques y anon_read_cadena_frio).
--   3. Crea políticas por rol según la matriz:
--      · GESTIÓN  (gerente, administrador): lectura + escritura de TODO.
--      · SOCIO:    lectura de TODO (incl. finanzas). Sin escritura.
--      · OPERATIVO (veterinario, auxiliar): lectura+escritura SOLO en
--        tablas operativas; SIN acceso (ni lectura) a finanzas/comercial.
--      · fincas:   lectura todos los autenticados; escritura gestión.
--      · perfiles: cada quien lee el suyo; gestión lee/escribe todos.
--
-- Ejecutar en Supabase SQL Editor (NO se ejecuta automáticamente).
-- ─────────────────────────────────────────────────────────────

-- ── 1. FUNCIÓN HELPER ────────────────────────────────────────
-- SECURITY DEFINER: corre como dueño de la función, ignora RLS sobre
-- perfiles. Imprescindible para no caer en recursión cuando una política
-- sobre perfiles llama a auth_rol().
CREATE OR REPLACE FUNCTION public.auth_rol()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT rol FROM public.perfiles WHERE id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.auth_rol() FROM public;
GRANT EXECUTE ON FUNCTION public.auth_rol() TO authenticated;

-- ── 2. ELIMINAR POLÍTICAS PERMISIVAS VIEJAS ──────────────────
-- anon_all_* (acceso público total — brecha grave)
DROP POLICY IF EXISTS "anon_all_fincas"        ON fincas;
DROP POLICY IF EXISTS "anon_all_animales"      ON animales;
DROP POLICY IF EXISTS "anon_all_lotes"         ON lotes;
DROP POLICY IF EXISTS "anon_all_eventos"       ON eventos;
DROP POLICY IF EXISTS "anon_all_medicamentos"  ON medicamentos;
DROP POLICY IF EXISTS "anon_all_tratamientos"  ON tratamientos;
DROP POLICY IF EXISTS "anon_all_pesajes"       ON pesajes;
DROP POLICY IF EXISTS "anon_all_eventos_rep"   ON eventos_reproductivos;
DROP POLICY IF EXISTS "anon_all_bajas"         ON bajas;
DROP POLICY IF EXISTS "anon_all_costos"        ON costos;
DROP POLICY IF EXISTS "anon_all_ingresos"      ON ingresos;

-- auth_all_* (cualquier autenticado todo)
DROP POLICY IF EXISTS "auth_all_animales"        ON animales;
DROP POLICY IF EXISTS "auth_all_lotes"           ON lotes;
DROP POLICY IF EXISTS "auth_all_fincas"          ON fincas;
DROP POLICY IF EXISTS "auth_all_eventos"         ON eventos;
DROP POLICY IF EXISTS "auth_all_medicamentos"    ON medicamentos;
DROP POLICY IF EXISTS "auth_all_tratamientos"    ON tratamientos;
DROP POLICY IF EXISTS "auth_all_pesajes"         ON pesajes;
DROP POLICY IF EXISTS "auth_all_costos"          ON costos;
DROP POLICY IF EXISTS "auth_all_ingresos"        ON ingresos;
DROP POLICY IF EXISTS "auth_all_bajas"           ON bajas;
DROP POLICY IF EXISTS "auth_all_eventos_rep"     ON eventos_reproductivos;
DROP POLICY IF EXISTS "auth_all_beneficios"      ON beneficios;
DROP POLICY IF EXISTS "auth_all_cortes"          ON cortes;
DROP POLICY IF EXISTS "auth_all_empaques"        ON empaques;
DROP POLICY IF EXISTS "auth_all_presupuesto"     ON presupuesto;
DROP POLICY IF EXISTS "auth_all_aparceria"       ON aparceria;
DROP POLICY IF EXISTS "auth_all_pagos_aparceria" ON pagos_aparceria;
DROP POLICY IF EXISTS "auth_all_empleados"       ON empleados;
DROP POLICY IF EXISTS "auth_all_asistencia"      ON asistencia;
DROP POLICY IF EXISTS "auth_all_liquidaciones"   ON liquidaciones;
DROP POLICY IF EXISTS "auth_all_siigo_config"    ON siigo_config;
DROP POLICY IF EXISTS "auth_all_siigo_mapeo"     ON siigo_mapeo;
DROP POLICY IF EXISTS "auth_all_movilizaciones"  ON movilizaciones;
DROP POLICY IF EXISTS "auth_all_b2b"             ON clientes_b2b;
DROP POLICY IF EXISTS "auth_all_pedidos"         ON pedidos_b2b;
DROP POLICY IF EXISTS "auth_all_items"           ON items_pedido;
DROP POLICY IF EXISTS "auth_all_cadena_frio"     ON cadena_frio;

-- NOTA: se CONSERVAN a propósito (lectura pública del micrositio QR):
--   · anon_read_empaques    ON empaques
--   · anon_read_cadena_frio ON cadena_frio

-- Drops de las políticas nuevas (re-ejecutable sin error)
DROP POLICY IF EXISTS "rol_read_animales"             ON animales;
DROP POLICY IF EXISTS "rol_write_animales"            ON animales;
DROP POLICY IF EXISTS "rol_read_lotes"                ON lotes;
DROP POLICY IF EXISTS "rol_write_lotes"               ON lotes;
DROP POLICY IF EXISTS "rol_read_pesajes"              ON pesajes;
DROP POLICY IF EXISTS "rol_write_pesajes"             ON pesajes;
DROP POLICY IF EXISTS "rol_read_medicamentos"         ON medicamentos;
DROP POLICY IF EXISTS "rol_write_medicamentos"        ON medicamentos;
DROP POLICY IF EXISTS "rol_read_tratamientos"         ON tratamientos;
DROP POLICY IF EXISTS "rol_write_tratamientos"        ON tratamientos;
DROP POLICY IF EXISTS "rol_read_eventos"              ON eventos;
DROP POLICY IF EXISTS "rol_write_eventos"             ON eventos;
DROP POLICY IF EXISTS "rol_read_eventos_rep"          ON eventos_reproductivos;
DROP POLICY IF EXISTS "rol_write_eventos_rep"         ON eventos_reproductivos;
DROP POLICY IF EXISTS "rol_read_bajas"                ON bajas;
DROP POLICY IF EXISTS "rol_write_bajas"               ON bajas;
DROP POLICY IF EXISTS "rol_read_movilizaciones"       ON movilizaciones;
DROP POLICY IF EXISTS "rol_write_movilizaciones"      ON movilizaciones;
DROP POLICY IF EXISTS "rol_read_beneficios"           ON beneficios;
DROP POLICY IF EXISTS "rol_write_beneficios"          ON beneficios;
DROP POLICY IF EXISTS "rol_read_cortes"               ON cortes;
DROP POLICY IF EXISTS "rol_write_cortes"              ON cortes;
DROP POLICY IF EXISTS "rol_read_empaques"             ON empaques;
DROP POLICY IF EXISTS "rol_write_empaques"            ON empaques;
DROP POLICY IF EXISTS "rol_read_cadena_frio"          ON cadena_frio;
DROP POLICY IF EXISTS "rol_write_cadena_frio"         ON cadena_frio;
DROP POLICY IF EXISTS "rol_read_costos"               ON costos;
DROP POLICY IF EXISTS "rol_write_costos"              ON costos;
DROP POLICY IF EXISTS "rol_read_ingresos"             ON ingresos;
DROP POLICY IF EXISTS "rol_write_ingresos"            ON ingresos;
DROP POLICY IF EXISTS "rol_read_presupuesto"          ON presupuesto;
DROP POLICY IF EXISTS "rol_write_presupuesto"         ON presupuesto;
DROP POLICY IF EXISTS "rol_read_aparceria"            ON aparceria;
DROP POLICY IF EXISTS "rol_write_aparceria"           ON aparceria;
DROP POLICY IF EXISTS "rol_read_pagos_aparceria"      ON pagos_aparceria;
DROP POLICY IF EXISTS "rol_write_pagos_aparceria"     ON pagos_aparceria;
DROP POLICY IF EXISTS "rol_read_empleados"            ON empleados;
DROP POLICY IF EXISTS "rol_write_empleados"           ON empleados;
DROP POLICY IF EXISTS "rol_read_asistencia"           ON asistencia;
DROP POLICY IF EXISTS "rol_write_asistencia"          ON asistencia;
DROP POLICY IF EXISTS "rol_read_liquidaciones"        ON liquidaciones;
DROP POLICY IF EXISTS "rol_write_liquidaciones"       ON liquidaciones;
DROP POLICY IF EXISTS "rol_read_siigo_config"         ON siigo_config;
DROP POLICY IF EXISTS "rol_write_siigo_config"        ON siigo_config;
DROP POLICY IF EXISTS "rol_read_siigo_mapeo"          ON siigo_mapeo;
DROP POLICY IF EXISTS "rol_write_siigo_mapeo"         ON siigo_mapeo;
DROP POLICY IF EXISTS "rol_read_clientes_b2b"         ON clientes_b2b;
DROP POLICY IF EXISTS "rol_write_clientes_b2b"        ON clientes_b2b;
DROP POLICY IF EXISTS "rol_read_pedidos_b2b"          ON pedidos_b2b;
DROP POLICY IF EXISTS "rol_write_pedidos_b2b"         ON pedidos_b2b;
DROP POLICY IF EXISTS "rol_read_items_pedido"         ON items_pedido;
DROP POLICY IF EXISTS "rol_write_items_pedido"        ON items_pedido;
DROP POLICY IF EXISTS "rol_read_fincas"               ON fincas;
DROP POLICY IF EXISTS "rol_write_fincas"              ON fincas;
DROP POLICY IF EXISTS "rol_read_perfiles"             ON perfiles;
DROP POLICY IF EXISTS "rol_write_perfiles"            ON perfiles;

-- ── 3. POLÍTICAS POR ROL ─────────────────────────────────────
-- Grupos de roles:
--   GESTIÓN   = gerente, administrador
--   LECTURA   = gerente, administrador, socio  (+ operativos donde aplique)
--   OPERATIVO = veterinario, auxiliar

-- ··· 3a. TABLAS OPERATIVAS ···································
-- Lectura: gestión + socio + operativos. Escritura: gestión + operativos.
-- animales
CREATE POLICY "rol_read_animales" ON animales FOR SELECT TO authenticated
  USING (auth_rol() IN ('gerente','administrador','socio','veterinario','auxiliar'));
CREATE POLICY "rol_write_animales" ON animales FOR ALL TO authenticated
  USING (auth_rol() IN ('gerente','administrador','veterinario','auxiliar'))
  WITH CHECK (auth_rol() IN ('gerente','administrador','veterinario','auxiliar'));
-- lotes
CREATE POLICY "rol_read_lotes" ON lotes FOR SELECT TO authenticated
  USING (auth_rol() IN ('gerente','administrador','socio','veterinario','auxiliar'));
CREATE POLICY "rol_write_lotes" ON lotes FOR ALL TO authenticated
  USING (auth_rol() IN ('gerente','administrador','veterinario','auxiliar'))
  WITH CHECK (auth_rol() IN ('gerente','administrador','veterinario','auxiliar'));
-- pesajes
CREATE POLICY "rol_read_pesajes" ON pesajes FOR SELECT TO authenticated
  USING (auth_rol() IN ('gerente','administrador','socio','veterinario','auxiliar'));
CREATE POLICY "rol_write_pesajes" ON pesajes FOR ALL TO authenticated
  USING (auth_rol() IN ('gerente','administrador','veterinario','auxiliar'))
  WITH CHECK (auth_rol() IN ('gerente','administrador','veterinario','auxiliar'));
-- medicamentos
CREATE POLICY "rol_read_medicamentos" ON medicamentos FOR SELECT TO authenticated
  USING (auth_rol() IN ('gerente','administrador','socio','veterinario','auxiliar'));
CREATE POLICY "rol_write_medicamentos" ON medicamentos FOR ALL TO authenticated
  USING (auth_rol() IN ('gerente','administrador','veterinario','auxiliar'))
  WITH CHECK (auth_rol() IN ('gerente','administrador','veterinario','auxiliar'));
-- tratamientos
CREATE POLICY "rol_read_tratamientos" ON tratamientos FOR SELECT TO authenticated
  USING (auth_rol() IN ('gerente','administrador','socio','veterinario','auxiliar'));
CREATE POLICY "rol_write_tratamientos" ON tratamientos FOR ALL TO authenticated
  USING (auth_rol() IN ('gerente','administrador','veterinario','auxiliar'))
  WITH CHECK (auth_rol() IN ('gerente','administrador','veterinario','auxiliar'));
-- eventos
CREATE POLICY "rol_read_eventos" ON eventos FOR SELECT TO authenticated
  USING (auth_rol() IN ('gerente','administrador','socio','veterinario','auxiliar'));
CREATE POLICY "rol_write_eventos" ON eventos FOR ALL TO authenticated
  USING (auth_rol() IN ('gerente','administrador','veterinario','auxiliar'))
  WITH CHECK (auth_rol() IN ('gerente','administrador','veterinario','auxiliar'));
-- eventos_reproductivos
CREATE POLICY "rol_read_eventos_rep" ON eventos_reproductivos FOR SELECT TO authenticated
  USING (auth_rol() IN ('gerente','administrador','socio','veterinario','auxiliar'));
CREATE POLICY "rol_write_eventos_rep" ON eventos_reproductivos FOR ALL TO authenticated
  USING (auth_rol() IN ('gerente','administrador','veterinario','auxiliar'))
  WITH CHECK (auth_rol() IN ('gerente','administrador','veterinario','auxiliar'));
-- bajas
CREATE POLICY "rol_read_bajas" ON bajas FOR SELECT TO authenticated
  USING (auth_rol() IN ('gerente','administrador','socio','veterinario','auxiliar'));
CREATE POLICY "rol_write_bajas" ON bajas FOR ALL TO authenticated
  USING (auth_rol() IN ('gerente','administrador','veterinario','auxiliar'))
  WITH CHECK (auth_rol() IN ('gerente','administrador','veterinario','auxiliar'));
-- movilizaciones
CREATE POLICY "rol_read_movilizaciones" ON movilizaciones FOR SELECT TO authenticated
  USING (auth_rol() IN ('gerente','administrador','socio','veterinario','auxiliar'));
CREATE POLICY "rol_write_movilizaciones" ON movilizaciones FOR ALL TO authenticated
  USING (auth_rol() IN ('gerente','administrador','veterinario','auxiliar'))
  WITH CHECK (auth_rol() IN ('gerente','administrador','veterinario','auxiliar'));
-- beneficios
CREATE POLICY "rol_read_beneficios" ON beneficios FOR SELECT TO authenticated
  USING (auth_rol() IN ('gerente','administrador','socio','veterinario','auxiliar'));
CREATE POLICY "rol_write_beneficios" ON beneficios FOR ALL TO authenticated
  USING (auth_rol() IN ('gerente','administrador','veterinario','auxiliar'))
  WITH CHECK (auth_rol() IN ('gerente','administrador','veterinario','auxiliar'));
-- cortes
CREATE POLICY "rol_read_cortes" ON cortes FOR SELECT TO authenticated
  USING (auth_rol() IN ('gerente','administrador','socio','veterinario','auxiliar'));
CREATE POLICY "rol_write_cortes" ON cortes FOR ALL TO authenticated
  USING (auth_rol() IN ('gerente','administrador','veterinario','auxiliar'))
  WITH CHECK (auth_rol() IN ('gerente','administrador','veterinario','auxiliar'));
-- empaques (mantiene anon_read_empaques aparte)
CREATE POLICY "rol_read_empaques" ON empaques FOR SELECT TO authenticated
  USING (auth_rol() IN ('gerente','administrador','socio','veterinario','auxiliar'));
CREATE POLICY "rol_write_empaques" ON empaques FOR ALL TO authenticated
  USING (auth_rol() IN ('gerente','administrador','veterinario','auxiliar'))
  WITH CHECK (auth_rol() IN ('gerente','administrador','veterinario','auxiliar'));
-- cadena_frio (mantiene anon_read_cadena_frio aparte)
CREATE POLICY "rol_read_cadena_frio" ON cadena_frio FOR SELECT TO authenticated
  USING (auth_rol() IN ('gerente','administrador','socio','veterinario','auxiliar'));
CREATE POLICY "rol_write_cadena_frio" ON cadena_frio FOR ALL TO authenticated
  USING (auth_rol() IN ('gerente','administrador','veterinario','auxiliar'))
  WITH CHECK (auth_rol() IN ('gerente','administrador','veterinario','auxiliar'));

-- ··· 3b. TABLAS FINANCIERAS / COMERCIALES ····················
-- Lectura: gestión + socio. Escritura: gestión. Operativos: SIN acceso.
-- costos
CREATE POLICY "rol_read_costos" ON costos FOR SELECT TO authenticated
  USING (auth_rol() IN ('gerente','administrador','socio'));
CREATE POLICY "rol_write_costos" ON costos FOR ALL TO authenticated
  USING (auth_rol() IN ('gerente','administrador'))
  WITH CHECK (auth_rol() IN ('gerente','administrador'));
-- ingresos
CREATE POLICY "rol_read_ingresos" ON ingresos FOR SELECT TO authenticated
  USING (auth_rol() IN ('gerente','administrador','socio'));
CREATE POLICY "rol_write_ingresos" ON ingresos FOR ALL TO authenticated
  USING (auth_rol() IN ('gerente','administrador'))
  WITH CHECK (auth_rol() IN ('gerente','administrador'));
-- presupuesto
CREATE POLICY "rol_read_presupuesto" ON presupuesto FOR SELECT TO authenticated
  USING (auth_rol() IN ('gerente','administrador','socio'));
CREATE POLICY "rol_write_presupuesto" ON presupuesto FOR ALL TO authenticated
  USING (auth_rol() IN ('gerente','administrador'))
  WITH CHECK (auth_rol() IN ('gerente','administrador'));
-- aparceria
CREATE POLICY "rol_read_aparceria" ON aparceria FOR SELECT TO authenticated
  USING (auth_rol() IN ('gerente','administrador','socio'));
CREATE POLICY "rol_write_aparceria" ON aparceria FOR ALL TO authenticated
  USING (auth_rol() IN ('gerente','administrador'))
  WITH CHECK (auth_rol() IN ('gerente','administrador'));
-- pagos_aparceria
CREATE POLICY "rol_read_pagos_aparceria" ON pagos_aparceria FOR SELECT TO authenticated
  USING (auth_rol() IN ('gerente','administrador','socio'));
CREATE POLICY "rol_write_pagos_aparceria" ON pagos_aparceria FOR ALL TO authenticated
  USING (auth_rol() IN ('gerente','administrador'))
  WITH CHECK (auth_rol() IN ('gerente','administrador'));
-- empleados
CREATE POLICY "rol_read_empleados" ON empleados FOR SELECT TO authenticated
  USING (auth_rol() IN ('gerente','administrador','socio'));
CREATE POLICY "rol_write_empleados" ON empleados FOR ALL TO authenticated
  USING (auth_rol() IN ('gerente','administrador'))
  WITH CHECK (auth_rol() IN ('gerente','administrador'));
-- asistencia
CREATE POLICY "rol_read_asistencia" ON asistencia FOR SELECT TO authenticated
  USING (auth_rol() IN ('gerente','administrador','socio'));
CREATE POLICY "rol_write_asistencia" ON asistencia FOR ALL TO authenticated
  USING (auth_rol() IN ('gerente','administrador'))
  WITH CHECK (auth_rol() IN ('gerente','administrador'));
-- liquidaciones
CREATE POLICY "rol_read_liquidaciones" ON liquidaciones FOR SELECT TO authenticated
  USING (auth_rol() IN ('gerente','administrador','socio'));
CREATE POLICY "rol_write_liquidaciones" ON liquidaciones FOR ALL TO authenticated
  USING (auth_rol() IN ('gerente','administrador'))
  WITH CHECK (auth_rol() IN ('gerente','administrador'));
-- siigo_config
CREATE POLICY "rol_read_siigo_config" ON siigo_config FOR SELECT TO authenticated
  USING (auth_rol() IN ('gerente','administrador','socio'));
CREATE POLICY "rol_write_siigo_config" ON siigo_config FOR ALL TO authenticated
  USING (auth_rol() IN ('gerente','administrador'))
  WITH CHECK (auth_rol() IN ('gerente','administrador'));
-- siigo_mapeo
CREATE POLICY "rol_read_siigo_mapeo" ON siigo_mapeo FOR SELECT TO authenticated
  USING (auth_rol() IN ('gerente','administrador','socio'));
CREATE POLICY "rol_write_siigo_mapeo" ON siigo_mapeo FOR ALL TO authenticated
  USING (auth_rol() IN ('gerente','administrador'))
  WITH CHECK (auth_rol() IN ('gerente','administrador'));
-- clientes_b2b
CREATE POLICY "rol_read_clientes_b2b" ON clientes_b2b FOR SELECT TO authenticated
  USING (auth_rol() IN ('gerente','administrador','socio'));
CREATE POLICY "rol_write_clientes_b2b" ON clientes_b2b FOR ALL TO authenticated
  USING (auth_rol() IN ('gerente','administrador'))
  WITH CHECK (auth_rol() IN ('gerente','administrador'));
-- pedidos_b2b
CREATE POLICY "rol_read_pedidos_b2b" ON pedidos_b2b FOR SELECT TO authenticated
  USING (auth_rol() IN ('gerente','administrador','socio'));
CREATE POLICY "rol_write_pedidos_b2b" ON pedidos_b2b FOR ALL TO authenticated
  USING (auth_rol() IN ('gerente','administrador'))
  WITH CHECK (auth_rol() IN ('gerente','administrador'));
-- items_pedido
CREATE POLICY "rol_read_items_pedido" ON items_pedido FOR SELECT TO authenticated
  USING (auth_rol() IN ('gerente','administrador','socio'));
CREATE POLICY "rol_write_items_pedido" ON items_pedido FOR ALL TO authenticated
  USING (auth_rol() IN ('gerente','administrador'))
  WITH CHECK (auth_rol() IN ('gerente','administrador'));

-- ··· 3c. FINCAS ·············································
-- Lectura: todos los autenticados. Escritura: gestión.
CREATE POLICY "rol_read_fincas" ON fincas FOR SELECT TO authenticated
  USING (auth_rol() IN ('gerente','administrador','socio','veterinario','auxiliar'));
CREATE POLICY "rol_write_fincas" ON fincas FOR ALL TO authenticated
  USING (auth_rol() IN ('gerente','administrador'))
  WITH CHECK (auth_rol() IN ('gerente','administrador'));

-- ··· 3d. PERFILES ···········································
-- Cada usuario lee su propio perfil; gestión lee/escribe todos.
ALTER TABLE perfiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rol_read_perfiles" ON perfiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR auth_rol() IN ('gerente','administrador'));
CREATE POLICY "rol_write_perfiles" ON perfiles FOR ALL TO authenticated
  USING (auth_rol() IN ('gerente','administrador'))
  WITH CHECK (auth_rol() IN ('gerente','administrador'));

-- ── FIN ──────────────────────────────────────────────────────
