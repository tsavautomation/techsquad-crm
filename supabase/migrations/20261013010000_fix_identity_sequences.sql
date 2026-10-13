-- New records failed with "duplicate key value violates unique constraint payouts_pkey" (Fred 2026-10-13):
-- rows imported with their WebAuthor ids left the identity counters behind. Move every record table's
-- counter past its highest id. Safe to run again at any time (it never moves a counter backwards).
do $$
declare
  r record;
  seq text;
  top bigint;
begin
  for r in select table_name from app.record_types loop
    seq := pg_get_serial_sequence('public.' || quote_ident(r.table_name), 'id');
    if seq is null then continue; end if;
    execute format('select coalesce(max(id), 0) from public.%I', r.table_name) into top;
    if top > 0 then
      perform setval(seq, greatest(top, (select last_value from pg_sequences where schemaname || '.' || sequencename = replace(seq, '"', '')) ), true);
    end if;
  end loop;
end $$;
