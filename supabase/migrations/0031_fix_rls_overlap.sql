-- ─────────────────────────────────────────────────────────────
-- 0031_fix_rls_overlap.sql
-- Resuelve el SOLAPAMIENTO de políticas RLS entre migraciones.
-- En Postgres, varias políticas PERMISIVAS sobre la misma tabla y el
-- mismo comando se combinan con OR → gana la MÁS permisiva. Por eso,
-- donde 0021/0028 dejaron una política más permisiva que la de 0029,
-- la restricción por rol de 0029 quedaba ANULADA. Aquí eliminamos las
-- permisivas redundantes para que la restricción surta efecto.
--
-- Decisión de negocio confirmada: FINANZAS (costos, ingresos,
-- liquidaciones) → SOLO gerente/administrador. El socio PIERDE la
-- lectura financiera (recordar ocultarle la pestaña Finanzas en el
-- frontend para no mostrarle pantallas vacías).
--
-- Ejecutar en Supabase (SQL Editor) DESPUÉS de 0021, 0028 y 0029.
-- ─────────────────────────────────────────────────────────────

begin;

-- ── COSTOS ──────────────────────────────────────────────────
-- 0021 'costos_sel' daba lectura a gerente/administrador/SOCIO.
-- 0029 'rls_costos_rol' (FOR ALL) restringe a gerente/administrador.
-- Al combinarse con OR, socio seguía leyendo → eliminamos las de 0021.
drop policy if exists "costos_sel" on public.costos;
drop policy if exists "costos_wr"  on public.costos;
-- Queda únicamente: rls_costos_rol (FOR ALL, gerente/administrador).

-- ── INGRESOS ────────────────────────────────────────────────
drop policy if exists "ingresos_sel" on public.ingresos;
drop policy if exists "ingresos_wr"  on public.ingresos;
-- Queda únicamente: rls_ingresos_rol.

-- ── LIQUIDACIONES (nómina) ──────────────────────────────────
drop policy if exists "liquidaciones_sel" on public.liquidaciones;
drop policy if exists "liquidaciones_wr"  on public.liquidaciones;
-- Queda únicamente: rls_nomina_rol.

-- ── AUDIT_LOG ───────────────────────────────────────────────
-- El solapamiento real NO viene de 0021 sino de 0028:
--   0028 'auth_read_audit' = SELECT TO authenticated USING (true)
--        → CUALQUIER autenticado leía el log y anulaba a 0029.
--   0029 'rls_audit_read'  = SELECT, gerente/administrador.
-- Eliminamos la permisiva; conservamos la de inserción (necesaria para
-- registrar auditoría) y la restrictiva de lectura.
drop policy if exists "auth_read_audit" on public.audit_log;
-- Quedan: auth_insert_audit (INSERT) + rls_audit_read (SELECT gerente/admin).

commit;

-- ─────────────────────────────────────────────────────────────
-- RESIDUALES detectados (NO aplicados aquí — requieren su propia
-- decisión de negocio; documentados para no aplicarlos a ciegas):
--
-- · bajas:
--   0021 'bajas_sel' (los 5 roles leen TODAS las bajas) y 'bajas_wr'
--   (FOR ALL ⇒ también concede SELECT) ANULAN la política fina de 0029
--   'rls_bajas_rol' (auxiliar/veterinario solo ven aprobadas o propias).
--   Para que 0029 surta efecto, en una migración aparte:
--     drop policy if exists "bajas_sel" on public.bajas;
--     drop policy if exists "bajas_wr"  on public.bajas;
--     create policy "bajas_ins" on public.bajas for insert to authenticated
--       with check (public.auth_rol() in ('gerente','administrador','veterinario','auxiliar'));
--     create policy "bajas_upd" on public.bajas for update to authenticated
--       using (public.auth_rol() in ('gerente','administrador','veterinario','auxiliar'))
--       with check (public.auth_rol() in ('gerente','administrador','veterinario','auxiliar'));
--     create policy "bajas_del" on public.bajas for delete to authenticated
--       using (public.auth_rol() in ('gerente','administrador'));
--   ⚠️ Esto también QUITA al socio la lectura de bajas (rls_bajas_rol no
--      lo incluye). Decidir antes de aplicar.
--
-- · perfiles:
--   0029 'rls_perfiles_rol' (cada uno ve el suyo + gerente/admin ven
--   todos) AMPLÍA respecto a 0021 'perfiles_mgmt_sel' (solo g/a). El OR
--   da self OR g/a, que es justo lo deseado → NO hay conflicto de
--   seguridad: se dejan ambas.
--
-- · animales:
--   0029 'rls_animales_socio' (FOR ALL USING(true) WITH CHECK rol<>'socio')
--   abre SELECT a todos (socio solo-lectura, intencional) y bloquea
--   INSERT/UPDATE del socio. PERO al ser FOR ALL con USING(true) y sin
--   filtro propio de DELETE, el socio PODRÍA BORRAR filas. Si se quiere
--   socio estrictamente solo-lectura, separar en políticas de lectura
--   (USING true) y de escritura con DELETE restringido. Revisar aparte.
-- ─────────────────────────────────────────────────────────────
