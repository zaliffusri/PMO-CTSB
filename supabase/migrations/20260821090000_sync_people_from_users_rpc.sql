-- Bulk roster sync entirely in Postgres (avoids Node N+1 list/update loops on Vercel).
-- Mirrors lib/teamUserSync.js: link/update by people.user_id, reclaim by email, prune unlinked orphans.

create or replace function public.sync_people_from_users()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_synced int := 0;
  v_pruned jsonb := '[]'::jsonb;
  v_orphan_remaining jsonb := '[]'::jsonb;
  r record;
  v_person_id bigint;
  v_email_key text;
begin
  for r in
    select u.id, u.name, u.email, u.role
    from public.users_app u
    where coalesce(u.active, true) = true
    order by u.id
  loop
    v_email_key := nullif(lower(btrim(coalesce(r.email, ''))), '');
    v_person_id := null;

    select p.id
      into v_person_id
    from public.people p
    where p.user_id = r.id
    order by p.id
    limit 1;

    if v_person_id is null and v_email_key is not null then
      select p.id
        into v_person_id
      from public.people p
      where p.user_id is null
        and lower(btrim(coalesce(p.email, ''))) = v_email_key
      order by p.id
      limit 1;
    end if;

    if v_person_id is not null then
      update public.people
      set
        name = r.name,
        email = v_email_key,
        role = nullif(btrim(coalesce(r.role, '')), ''),
        user_id = r.id
      where id = v_person_id;
    else
      insert into public.people (name, email, role, user_id, created_at)
      values (
        r.name,
        v_email_key,
        nullif(btrim(coalesce(r.role, '')), ''),
        r.id,
        now()
      );
    end if;

    v_synced := v_synced + 1;
  end loop;

  with orphans as (
    select p.id, p.name, p.email, p.user_id
    from public.people p
    where p.user_id is null
       or not exists (
         select 1
         from public.users_app u
         where u.id = p.user_id
           and coalesce(u.active, true) = true
       )
  ),
  deletable as (
    select o.id, o.name, o.email, o.user_id
    from orphans o
    where not exists (
      select 1
      from public.project_assignments pa
      where pa.person_id = o.id
    )
  ),
  deleted as (
    delete from public.people p
    using deletable d
    where p.id = d.id
    returning d.id, d.name, d.email, d.user_id
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', d.id,
        'name', d.name,
        'email', d.email,
        'user_id', d.user_id
      )
      order by d.id
    ),
    '[]'::jsonb
  )
  into v_pruned
  from deleted d;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'name', p.name,
        'email', p.email,
        'project_count', (
          select count(*)::int
          from public.project_assignments pa
          where pa.person_id = p.id
        )
      )
      order by p.name
    ),
    '[]'::jsonb
  )
  into v_orphan_remaining
  from public.people p
  where p.user_id is null
     or not exists (
       select 1
       from public.users_app u
       where u.id = p.user_id
         and coalesce(u.active, true) = true
     );

  return jsonb_build_object(
    'synced', v_synced,
    'pruned', v_pruned,
    'orphanRemaining', v_orphan_remaining
  );
end;
$$;

comment on function public.sync_people_from_users is
  'Team roster sync: upsert people from active users_app, prune unassigned orphans. Used by POST /api/people/sync-from-users.';

revoke all on function public.sync_people_from_users() from public;
revoke all on function public.sync_people_from_users() from anon;
revoke all on function public.sync_people_from_users() from authenticated;
grant execute on function public.sync_people_from_users() to service_role;
