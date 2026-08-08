-- 0066_seed_lluvia_historico_jun_jul.sql
-- Historial de lluvia La Marinilla (Juan, 2026):
--   · 24 jun: llovió bueno, duro y largo (fuerte)
--   · 25 jun – 11 jul: seco
--   · 12 jul: lluvia suave (leve)
--
-- Ejecutar en Supabase SQL Editor (bypasea RLS).
-- Idempotente: actualiza si el día ya existe (lote_id null).

begin;

-- Helper: upsert un día a nivel finca (sin lote)
create or replace function _tmp_upsert_lluvia(
  p_fecha date,
  p_llovio boolean,
  p_intensidad text,
  p_duracion text,
  p_notas text
) returns void language plpgsql as $$
declare
  v_finca uuid := 'a1b2c3d4-0000-0000-0000-000000000001';
  v_id uuid;
begin
  select id into v_id
  from public.registros_lluvia
  where finca_id = v_finca and fecha = p_fecha and lote_id is null
  limit 1;

  if v_id is not null then
    update public.registros_lluvia set
      llovio = p_llovio,
      intensidad = p_intensidad,
      duracion_texto = p_duracion,
      notas = p_notas,
      registrado_por = coalesce(registrado_por, 'historico/juan')
    where id = v_id;
  else
    insert into public.registros_lluvia (
      finca_id, fecha, llovio, intensidad, duracion_texto, notas, registrado_por
    ) values (
      v_finca, p_fecha, p_llovio, p_intensidad, p_duracion, p_notas, 'historico/juan'
    );
  end if;
end;
$$;

-- 24 junio 2026: lluvia fuerte, dura y larga
select _tmp_upsert_lluvia(
  '2026-06-24'::date,
  true,
  'fuerte',
  'duro y largo · casi todo el día',
  'Histórico Juan: llovió bueno, duro y largo'
);

-- 25 jun → 11 jul 2026: secos
do $$
declare
  d date := '2026-06-25'::date;
begin
  while d <= '2026-07-11'::date loop
    perform _tmp_upsert_lluvia(
      d,
      false,
      null,
      null,
      'Histórico Juan: seco (entre 24-jun fuerte y 12-jul suave)'
    );
    d := d + 1;
  end loop;
end $$;

-- 12 julio 2026: lluvia suave
select _tmp_upsert_lluvia(
  '2026-07-12'::date,
  true,
  'leve',
  'suave',
  'Histórico Juan: llovía suave'
);

drop function _tmp_upsert_lluvia(date, boolean, text, text, text);

-- Verificación
select fecha, llovio, intensidad, duracion_texto
from public.registros_lluvia
where finca_id = 'a1b2c3d4-0000-0000-0000-000000000001'
  and fecha between '2026-06-24' and '2026-07-12'
  and lote_id is null
order by fecha;

commit;
