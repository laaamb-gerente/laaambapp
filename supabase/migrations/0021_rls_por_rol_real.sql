-- supabase/migrations/0021_rls_por_rol_real.sql
-- ─────────────────────────────────────────────────────────────
-- RLS REAL por rol (Sprint 0 — Acción 1). YA EJECUTADA EN PRODUCCIÓN
-- directamente en el SQL Editor de Supabase; este archivo documenta el
-- estado real del esquema en el repo.
--
-- SUPERA a 0020_rls_por_rol.sql: la 0020 dejó vivas políticas previas y
-- no cuajó la matriz por rol. Esta es la versión que quedó aplicada.
-- Helper auth_rol() con search_path vacío + grant solo a authenticated;
-- elimina las auth_all_* / anon_read_perfil y crea la matriz definitiva:
--   · OPERATIVAS  → lectura 5 roles, escritura gerente/admin/vet/auxiliar
--   · FINANCIERAS → lectura gerente/admin/socio, escritura gerente/admin
--   · fincas      → lectura todos, escritura gerente/admin
--   · perfiles    → gestión solo gerente/admin
-- ─────────────────────────────────────────────────────────────

begin;
-- ── 1. Helper de rol ─────────────────────────────────────────
create or replace function public.auth_rol()
returns text
language sql
security definer
stable
set search_path = ''
as $$
  select rol from public.perfiles where id = auth.uid()
$$;
revoke all on function public.auth_rol() from public, anon;
grant execute on function public.auth_rol() to authenticated;
-- ── 2. Eliminar políticas viejas ─────────────────────────────
do $$
declare r record;
begin
  for r in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
      and (policyname like 'auth_all_%' or policyname = 'anon_read_perfil')
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;
-- ── 3. Tablas OPERATIVAS ──────────────────────────────────────
create policy animales_sel on public.animales for select to authenticated
  using (public.auth_rol() in ('gerente','administrador','socio','veterinario','auxiliar'));
create policy animales_wr on public.animales for all to authenticated
  using (public.auth_rol() in ('gerente','administrador','veterinario','auxiliar'))
  with check (public.auth_rol() in ('gerente','administrador','veterinario','auxiliar'));
create policy lotes_sel on public.lotes for select to authenticated
  using (public.auth_rol() in ('gerente','administrador','socio','veterinario','auxiliar'));
create policy lotes_wr on public.lotes for all to authenticated
  using (public.auth_rol() in ('gerente','administrador','veterinario','auxiliar'))
  with check (public.auth_rol() in ('gerente','administrador','veterinario','auxiliar'));
create policy pesajes_sel on public.pesajes for select to authenticated
  using (public.auth_rol() in ('gerente','administrador','socio','veterinario','auxiliar'));
create policy pesajes_wr on public.pesajes for all to authenticated
  using (public.auth_rol() in ('gerente','administrador','veterinario','auxiliar'))
  with check (public.auth_rol() in ('gerente','administrador','veterinario','auxiliar'));
create policy medicamentos_sel on public.medicamentos for select to authenticated
  using (public.auth_rol() in ('gerente','administrador','socio','veterinario','auxiliar'));
create policy medicamentos_wr on public.medicamentos for all to authenticated
  using (public.auth_rol() in ('gerente','administrador','veterinario','auxiliar'))
  with check (public.auth_rol() in ('gerente','administrador','veterinario','auxiliar'));
create policy tratamientos_sel on public.tratamientos for select to authenticated
  using (public.auth_rol() in ('gerente','administrador','socio','veterinario','auxiliar'));
create policy tratamientos_wr on public.tratamientos for all to authenticated
  using (public.auth_rol() in ('gerente','administrador','veterinario','auxiliar'))
  with check (public.auth_rol() in ('gerente','administrador','veterinario','auxiliar'));
create policy eventos_sel on public.eventos for select to authenticated
  using (public.auth_rol() in ('gerente','administrador','socio','veterinario','auxiliar'));
create policy eventos_wr on public.eventos for all to authenticated
  using (public.auth_rol() in ('gerente','administrador','veterinario','auxiliar'))
  with check (public.auth_rol() in ('gerente','administrador','veterinario','auxiliar'));
create policy eventos_rep_sel on public.eventos_reproductivos for select to authenticated
  using (public.auth_rol() in ('gerente','administrador','socio','veterinario','auxiliar'));
create policy eventos_rep_wr on public.eventos_reproductivos for all to authenticated
  using (public.auth_rol() in ('gerente','administrador','veterinario','auxiliar'))
  with check (public.auth_rol() in ('gerente','administrador','veterinario','auxiliar'));
create policy bajas_sel on public.bajas for select to authenticated
  using (public.auth_rol() in ('gerente','administrador','socio','veterinario','auxiliar'));
create policy bajas_wr on public.bajas for all to authenticated
  using (public.auth_rol() in ('gerente','administrador','veterinario','auxiliar'))
  with check (public.auth_rol() in ('gerente','administrador','veterinario','auxiliar'));
create policy movilizaciones_sel on public.movilizaciones for select to authenticated
  using (public.auth_rol() in ('gerente','administrador','socio','veterinario','auxiliar'));
create policy movilizaciones_wr on public.movilizaciones for all to authenticated
  using (public.auth_rol() in ('gerente','administrador','veterinario','auxiliar'))
  with check (public.auth_rol() in ('gerente','administrador','veterinario','auxiliar'));
create policy beneficios_sel on public.beneficios for select to authenticated
  using (public.auth_rol() in ('gerente','administrador','socio','veterinario','auxiliar'));
create policy beneficios_wr on public.beneficios for all to authenticated
  using (public.auth_rol() in ('gerente','administrador','veterinario','auxiliar'))
  with check (public.auth_rol() in ('gerente','administrador','veterinario','auxiliar'));
create policy cortes_wr on public.cortes for all to authenticated
  using (public.auth_rol() in ('gerente','administrador','veterinario','auxiliar'))
  with check (public.auth_rol() in ('gerente','administrador','veterinario','auxiliar'));
create policy cortes_sel on public.cortes for select to authenticated
  using (public.auth_rol() in ('gerente','administrador','socio','veterinario','auxiliar'));
create policy empaques_wr on public.empaques for all to authenticated
  using (public.auth_rol() in ('gerente','administrador','veterinario','auxiliar'))
  with check (public.auth_rol() in ('gerente','administrador','veterinario','auxiliar'));
create policy empaques_sel on public.empaques for select to authenticated
  using (public.auth_rol() in ('gerente','administrador','socio','veterinario','auxiliar'));
create policy cadena_frio_wr on public.cadena_frio for all to authenticated
  using (public.auth_rol() in ('gerente','administrador','veterinario','auxiliar'))
  with check (public.auth_rol() in ('gerente','administrador','veterinario','auxiliar'));
create policy cadena_frio_sel on public.cadena_frio for select to authenticated
  using (public.auth_rol() in ('gerente','administrador','socio','veterinario','auxiliar'));
-- ── 4. Tablas FINANCIERAS / COMERCIALES ───────────────────────
create policy costos_sel on public.costos for select to authenticated
  using (public.auth_rol() in ('gerente','administrador','socio'));
create policy costos_wr on public.costos for all to authenticated
  using (public.auth_rol() in ('gerente','administrador'))
  with check (public.auth_rol() in ('gerente','administrador'));
create policy ingresos_sel on public.ingresos for select to authenticated
  using (public.auth_rol() in ('gerente','administrador','socio'));
create policy ingresos_wr on public.ingresos for all to authenticated
  using (public.auth_rol() in ('gerente','administrador'))
  with check (public.auth_rol() in ('gerente','administrador'));
create policy presupuesto_sel on public.presupuesto for select to authenticated
  using (public.auth_rol() in ('gerente','administrador','socio'));
create policy presupuesto_wr on public.presupuesto for all to authenticated
  using (public.auth_rol() in ('gerente','administrador'))
  with check (public.auth_rol() in ('gerente','administrador'));
create policy aparceria_sel on public.aparceria for select to authenticated
  using (public.auth_rol() in ('gerente','administrador','socio'));
create policy aparceria_wr on public.aparceria for all to authenticated
  using (public.auth_rol() in ('gerente','administrador'))
  with check (public.auth_rol() in ('gerente','administrador'));
create policy pagos_aparceria_sel on public.pagos_aparceria for select to authenticated
  using (public.auth_rol() in ('gerente','administrador','socio'));
create policy pagos_aparceria_wr on public.pagos_aparceria for all to authenticated
  using (public.auth_rol() in ('gerente','administrador'))
  with check (public.auth_rol() in ('gerente','administrador'));
create policy empleados_sel on public.empleados for select to authenticated
  using (public.auth_rol() in ('gerente','administrador','socio'));
create policy empleados_wr on public.empleados for all to authenticated
  using (public.auth_rol() in ('gerente','administrador'))
  with check (public.auth_rol() in ('gerente','administrador'));
create policy asistencia_sel on public.asistencia for select to authenticated
  using (public.auth_rol() in ('gerente','administrador','socio'));
create policy asistencia_wr on public.asistencia for all to authenticated
  using (public.auth_rol() in ('gerente','administrador'))
  with check (public.auth_rol() in ('gerente','administrador'));
create policy liquidaciones_sel on public.liquidaciones for select to authenticated
  using (public.auth_rol() in ('gerente','administrador','socio'));
create policy liquidaciones_wr on public.liquidaciones for all to authenticated
  using (public.auth_rol() in ('gerente','administrador'))
  with check (public.auth_rol() in ('gerente','administrador'));
create policy siigo_config_sel on public.siigo_config for select to authenticated
  using (public.auth_rol() in ('gerente','administrador','socio'));
create policy siigo_config_wr on public.siigo_config for all to authenticated
  using (public.auth_rol() in ('gerente','administrador'))
  with check (public.auth_rol() in ('gerente','administrador'));
create policy siigo_mapeo_sel on public.siigo_mapeo for select to authenticated
  using (public.auth_rol() in ('gerente','administrador','socio'));
create policy siigo_mapeo_wr on public.siigo_mapeo for all to authenticated
  using (public.auth_rol() in ('gerente','administrador'))
  with check (public.auth_rol() in ('gerente','administrador'));
create policy clientes_b2b_sel on public.clientes_b2b for select to authenticated
  using (public.auth_rol() in ('gerente','administrador','socio'));
create policy clientes_b2b_wr on public.clientes_b2b for all to authenticated
  using (public.auth_rol() in ('gerente','administrador'))
  with check (public.auth_rol() in ('gerente','administrador'));
create policy pedidos_b2b_sel on public.pedidos_b2b for select to authenticated
  using (public.auth_rol() in ('gerente','administrador','socio'));
create policy pedidos_b2b_wr on public.pedidos_b2b for all to authenticated
  using (public.auth_rol() in ('gerente','administrador'))
  with check (public.auth_rol() in ('gerente','administrador'));
create policy items_pedido_sel on public.items_pedido for select to authenticated
  using (public.auth_rol() in ('gerente','administrador','socio'));
create policy items_pedido_wr on public.items_pedido for all to authenticated
  using (public.auth_rol() in ('gerente','administrador'))
  with check (public.auth_rol() in ('gerente','administrador'));
-- ── 5. fincas ─────────────────────────────────────────────────
create policy fincas_sel on public.fincas for select to authenticated
  using (true);
create policy fincas_wr on public.fincas for all to authenticated
  using (public.auth_rol() in ('gerente','administrador'))
  with check (public.auth_rol() in ('gerente','administrador'));
-- ── 6. perfiles ───────────────────────────────────────────────
create policy perfiles_mgmt_sel on public.perfiles for select to authenticated
  using (public.auth_rol() in ('gerente','administrador'));
create policy perfiles_mgmt_wr on public.perfiles for all to authenticated
  using (public.auth_rol() in ('gerente','administrador'))
  with check (public.auth_rol() in ('gerente','administrador'));
commit;
