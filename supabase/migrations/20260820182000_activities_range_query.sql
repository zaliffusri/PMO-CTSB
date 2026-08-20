-- Fast calendar range reads: indexes + RPC that excludes cancel tombstones in SQL.
-- Overlap semantics match the API: activity [start_at, end_at) vs query [p_from, p_to).

create index if not exists idx_activities_end_at
  on public.activities (end_at);

-- Reinforce range scans (start_at index may already exist from earlier migration).
create index if not exists idx_activities_start_at
  on public.activities (start_at);

create index if not exists idx_activities_start_end
  on public.activities (start_at, end_at);

create or replace function public.list_activities_in_range(
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_person_id bigint default null,
  p_project_id bigint default null
)
returns setof public.activities
language sql
stable
security definer
set search_path = public
as $$
  select a.*
  from public.activities a
  where (p_from is null or a.end_at > p_from)
    and (p_to is null or a.start_at < p_to)
    and (p_person_id is null or a.person_id = p_person_id)
    and (p_project_id is null or a.project_id = p_project_id)
    and not exists (
      select 1
      from public.activities_deleted d
      where d.id = a.id
    )
  order by a.start_at asc, a.id asc;
$$;

comment on function public.list_activities_in_range is
  'Calendar GET: overlap filter + exclude activities_deleted tombstones at the DB layer.';

-- Service role (API) and authenticated may execute; anon cannot list activities via this RPC.
revoke all on function public.list_activities_in_range(timestamptz, timestamptz, bigint, bigint) from public;
revoke all on function public.list_activities_in_range(timestamptz, timestamptz, bigint, bigint) from anon;
grant execute on function public.list_activities_in_range(timestamptz, timestamptz, bigint, bigint) to service_role;
grant execute on function public.list_activities_in_range(timestamptz, timestamptz, bigint, bigint) to authenticated;
