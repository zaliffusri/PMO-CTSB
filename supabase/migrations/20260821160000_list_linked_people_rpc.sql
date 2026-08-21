-- Linked roster list for Calendar/Team — returns jsonb so PostgREST does not depend on
-- people.user_id being present in the table schema cache (avoids empty linked_only lists).

create or replace function public.list_linked_people()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'name', p.name,
        'email', p.email,
        'role', p.role,
        'user_id', p.user_id,
        'created_at', p.created_at,
        'linked_to_user', true,
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
  from public.people p
  inner join public.users_app u
    on u.id = p.user_id
   and coalesce(u.active, true) = true;
$$;

comment on function public.list_linked_people is
  'GET /api/people?linked_only=1: people linked to active users_app via people.user_id.';

revoke all on function public.list_linked_people() from public;
revoke all on function public.list_linked_people() from anon;
grant execute on function public.list_linked_people() to service_role;
grant execute on function public.list_linked_people() to authenticated;

-- Best-effort: refresh PostgREST so people.user_id is visible on table selects too.
notify pgrst, 'reload schema';
