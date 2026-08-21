-- Resync audit_log primary key sequence after historical upserts with explicit ids.
-- Prevents: duplicate key value violates unique constraint "audit_log_pkey"

do $$
declare
  seq text;
  max_id bigint;
begin
  seq := pg_get_serial_sequence('public.audit_log', 'id');
  if seq is null then
    raise notice 'audit_log id sequence not found — skipping setval';
    return;
  end if;

  select coalesce(max(id), 0) into max_id from public.audit_log;
  -- is_called = false → next nextval() returns max_id + 1
  perform setval(seq, max_id + 1, false);
  raise notice 'audit_log sequence % set to next id %', seq, max_id + 1;
end $$;
