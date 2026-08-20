-- Hard-link people (delivery roster) to users_app (login accounts).
-- 1) Add nullable user_id
-- 2) Backfill by normalized email (safe, one match per user)
-- 3) Unique + FK constraints

alter table public.people
  add column if not exists user_id bigint;

comment on column public.people.user_id is
  'Hard link to users_app.id. Prefer this over matching email/name. Nullable for roster-only people.';

-- Backfill: exact email match (case-insensitive), only when not already linked
-- and only when the email maps to exactly one active-or-any user and one person.
with user_emails as (
  select
    u.id as user_id,
    lower(btrim(u.email)) as email_key
  from public.users_app u
  where u.email is not null
    and btrim(u.email) <> ''
),
person_emails as (
  select
    p.id as person_id,
    lower(btrim(p.email)) as email_key
  from public.people p
  where p.user_id is null
    and p.email is not null
    and btrim(p.email) <> ''
),
unique_user_emails as (
  select email_key
  from user_emails
  group by email_key
  having count(*) = 1
),
unique_person_emails as (
  select email_key
  from person_emails
  group by email_key
  having count(*) = 1
),
matches as (
  select pe.person_id, ue.user_id
  from person_emails pe
  join unique_person_emails upe on upe.email_key = pe.email_key
  join unique_user_emails uue on uue.email_key = pe.email_key
  join user_emails ue on ue.email_key = pe.email_key
)
update public.people p
set user_id = m.user_id
from matches m
where p.id = m.person_id
  and p.user_id is null;

-- Ensure no duplicate user_id before unique index (keep lowest person id)
with dups as (
  select user_id, min(id) as keep_id
  from public.people
  where user_id is not null
  group by user_id
  having count(*) > 1
)
update public.people p
set user_id = null
from dups d
where p.user_id = d.user_id
  and p.id <> d.keep_id;

create unique index if not exists people_user_id_uidx
  on public.people (user_id)
  where user_id is not null;

create index if not exists people_user_id_idx
  on public.people (user_id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'people_user_id_fkey'
  ) then
    alter table public.people
      add constraint people_user_id_fkey
      foreign key (user_id) references public.users_app(id)
      on delete set null;
  end if;
end $$;
