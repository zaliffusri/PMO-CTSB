-- Re-assert Realtime publication for notifications_app (idempotent).
-- Dashboard: Database → Publications → supabase_realtime → enable notifications_app
-- if events still do not arrive after this migration.

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'notifications_app'
    ) then
      execute 'alter publication supabase_realtime add table public.notifications_app';
    end if;
  end if;
end $$;
