-- Enable Supabase Realtime for in-app notifications (postgres_changes).
-- Table shape of notifications_app is unchanged.
-- RLS (notifications_own_select / notifications_own_update) remains the authorization gate:
-- browser clients must present a JWT with claim app_user_id matching notifications_app.user_id.

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

-- Ensure UPDATE payloads include enough columns for filtered Realtime clients.
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'notifications_app'
  ) then
    execute 'alter table public.notifications_app replica identity full';
  end if;
end $$;

-- Harden / re-assert own-row policies (idempotent).
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'notifications_app'
      and policyname = 'notifications_own_select'
  ) then
    create policy notifications_own_select on public.notifications_app
      for select to authenticated
      using (
        user_id::text = coalesce(auth.jwt() ->> 'app_user_id', auth.jwt() ->> 'sub', '')
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'notifications_app'
      and policyname = 'notifications_own_update'
  ) then
    create policy notifications_own_update on public.notifications_app
      for update to authenticated
      using (
        user_id::text = coalesce(auth.jwt() ->> 'app_user_id', auth.jwt() ->> 'sub', '')
      )
      with check (
        user_id::text = coalesce(auth.jwt() ->> 'app_user_id', auth.jwt() ->> 'sub', '')
      );
  end if;
end $$;
