-- Some environments have users_app.status NOT NULL without an app-side default; inserts then fail.
alter table public.users_app add column if not exists status text;

update public.users_app set status = 'active' where status is null or btrim(status) = '';

alter table public.users_app alter column status set default 'active';

do $$
begin
  if not exists (select 1 from public.users_app where status is null) then
    alter table public.users_app alter column status set not null;
  end if;
end $$;
