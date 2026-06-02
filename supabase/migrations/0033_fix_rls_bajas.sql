-- ─────────────────────────────────────────────────────────────
-- 0033_fix_rls_bajas.sql
-- Resuelve el residual de RLS sobre 'bajas' documentado en 0031.
--
-- Problema: 0021 dejó 'bajas_sel' (los 5 roles leen TODAS las bajas) y
-- 'bajas_wr' (FOR ALL ⇒ también concede SELECT). Al combinarse con OR,
-- ANULAN la política fina de 0029 'rls_bajas_rol' (veterinario/auxiliar
-- solo ven aprobadas o las propuestas por ellos, nunca las pendientes de
-- otros). Aquí eliminamos las permisivas de 0021 y convertimos la de
-- escritura en políticas SOLO de escritura (INSERT/UPDATE/DELETE) para que
-- la ÚNICA política de SELECT sea 'rls_bajas_rol'.
--
-- ⚠️ Efecto: el socio deja de leer 'bajas' (rls_bajas_rol no lo incluye),
-- consistente con la decisión "finanzas/datos sensibles restringidos".
--
-- Requiere que 0029 (rls_bajas_rol) y el helper public.auth_rol() (0021)
-- ya existan. Ejecutar en Supabase (SQL Editor) DESPUÉS de 0021/0029/0031.
-- ─────────────────────────────────────────────────────────────

begin;

-- 1) Eliminar las políticas permisivas de 0021 sobre bajas.
drop policy if exists "bajas_sel" on public.bajas;
drop policy if exists "bajas_wr"  on public.bajas;

-- 2) Recrear SOLO escritura (no conceden SELECT), por comando.
--    Lectura queda gobernada únicamente por 0029 'rls_bajas_rol'.
create policy "bajas_ins" on public.bajas
  for insert to authenticated
  with check (public.auth_rol() in ('gerente','administrador','veterinario','auxiliar'));

create policy "bajas_upd" on public.bajas
  for update to authenticated
  using (public.auth_rol() in ('gerente','administrador','veterinario','auxiliar'))
  with check (public.auth_rol() in ('gerente','administrador','veterinario','auxiliar'));

create policy "bajas_del" on public.bajas
  for delete to authenticated
  using (public.auth_rol() in ('gerente','administrador'));

commit;

-- Estado final de 'bajas':
--   · SELECT → rls_bajas_rol (0029): gerente/admin ven todo; veterinario/
--     auxiliar ven aprobadas o las propuestas por ellos; socio: ninguna.
--   · INSERT/UPDATE → gerente/admin/veterinario/auxiliar.
--   · DELETE → solo gerente/admin.
