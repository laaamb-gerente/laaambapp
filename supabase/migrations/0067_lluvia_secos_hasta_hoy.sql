-- 0067_lluvia_secos_hasta_hoy.sql
-- Marca SECO todos los días desde el día siguiente a la última lluvia
-- registrada (llovio=true) hasta HOY (inclusive).
-- La Marinilla · Juan: no ha llovido desde la última lluvia.
--
-- Ejecutar en Supabase SQL Editor. Idempotente (upsert por finca+fecha sin lote).

begin;

do $$
declare
  v_finca uuid := 'a1b2c3d4-0000-0000-0000-000000000001';
  v_ultima date;
  v_d date;
  v_hoy date := CURRENT_DATE;
  v_id uuid;
  v_n int := 0;
begin
  -- Última fecha con lluvia real
  select max(fecha) into v_ultima
  from public.registros_lluvia
  where finca_id = v_finca
    and llovio = true
    and lote_id is null;

  if v_ultima is null then
    raise notice 'No hay ninguna lluvia registrada; no se insertan secos.';
    return;
  end if;

  v_d := v_ultima + 1;
  if v_d > v_hoy then
    raise notice 'La última lluvia es hoy o futura (%); nada que secar.', v_ultima;
    return;
  end if;

  while v_d <= v_hoy loop
    select id into v_id
    from public.registros_lluvia
    where finca_id = v_finca and fecha = v_d and lote_id is null
    limit 1;

    if v_id is not null then
      update public.registros_lluvia set
        llovio = false,
        intensidad = null,
        duracion_texto = null,
        notas = coalesce(nullif(trim(notas), ''), 'Histórico: seco hasta hoy (sin lluvia desde '||v_ultima||')'),
        registrado_por = coalesce(registrado_por, 'historico/seco')
      where id = v_id
        -- no pisar un día que ya esté marcado como lluvia
        and (llovio is distinct from true);
    else
      insert into public.registros_lluvia (
        finca_id, fecha, llovio, intensidad, duracion_texto, notas, registrado_por
      ) values (
        v_finca, v_d, false, null, null,
        'Histórico: seco hasta hoy (sin lluvia desde '||v_ultima||')',
        'historico/seco'
      );
    end if;

    v_n := v_n + 1;
    v_d := v_d + 1;
  end loop;

  raise notice 'Secos aplicados: % día(s) desde % hasta % (última lluvia %)',
    v_n, (v_ultima + 1), v_hoy, v_ultima;
end $$;

-- Verificación rápida
select fecha, llovio, intensidad, left(coalesce(notas,''), 60) as notas
from public.registros_lluvia
where finca_id = 'a1b2c3d4-0000-0000-0000-000000000001'
  and lote_id is null
  and fecha >= (
    select coalesce(max(fecha), '2026-01-01'::date)
    from public.registros_lluvia
    where finca_id = 'a1b2c3d4-0000-0000-0000-000000000001' and llovio = true and lote_id is null
  )
order by fecha;

commit;
