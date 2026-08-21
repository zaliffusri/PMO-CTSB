-- Resync activities primary key sequence after historical upserts/imports with explicit ids.
-- Prevents: duplicate key value violates unique constraint "activities_pkey"
-- Does not drop or alter activities_pkey; does not delete rows.

do $$
declare
  seq text;
  max_id bigint;
begin
  seq := pg_get_serial_sequence('public.activities', 'id');
  if seq is null then
    raise notice 'activities id sequence not found — skipping setval';
    return;
  end if;

  select coalesce(max(id), 0) into max_id from public.activities;
  -- is_called = false → next nextval() returns max_id + 1
  perform setval(seq, max_id + 1, false);
  raise notice 'activities sequence % set to next id %', seq, max_id + 1;
end $$;
