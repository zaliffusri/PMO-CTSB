-- Fast projects list: clients + member_count in one SQL call (no per-project N+1).
-- Response shape matches GET /api/projects enrichment (tags omitted).

create or replace function public.list_projects_enriched(
  p_limit int default 500,
  p_offset int default 0
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with bounded as (
    select
      greatest(1, least(coalesce(p_limit, 500), 2000)) as lim,
      greatest(0, coalesce(p_offset, 0)) as off
  ),
  page as (
    select p.*
    from public.projects p
    order by p.created_at desc nulls last, p.id desc
    limit (select lim from bounded)
    offset (select off from bounded)
  ),
  client_rows as (
    select
      pc.project_id,
      c.id,
      c.name,
      c.short_code,
      c.created_at
    from public.project_clients pc
    join public.clients c on c.id = pc.client_id
    join page p on p.id = pc.project_id
  ),
  clients_agg as (
    select
      cr.project_id,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', cr.id,
            'name', cr.name,
            'short_code', cr.short_code,
            'created_at', cr.created_at
          )
          order by cr.name
        ),
        '[]'::jsonb
      ) as clients,
      coalesce(
        jsonb_agg(cr.id order by cr.name),
        '[]'::jsonb
      ) as client_ids,
      nullif(
        string_agg(cr.name, ', ' order by cr.name) filter (where cr.name is not null and btrim(cr.name) <> ''),
        ''
      ) as client_name,
      (array_agg(cr.id order by cr.name))[1] as client_id
    from client_rows cr
    group by cr.project_id
  ),
  member_counts as (
    select pa.project_id, count(*)::int as member_count
    from public.project_assignments pa
    join page p on p.id = pa.project_id
    group by pa.project_id
  )
  select coalesce(
    jsonb_agg(
      (to_jsonb(p) - 'tags')
      || jsonb_build_object(
        'clients', coalesce(ca.clients, '[]'::jsonb),
        'client_ids', coalesce(ca.client_ids, '[]'::jsonb),
        'client_name', ca.client_name,
        'client_id', ca.client_id,
        'member_count', coalesce(mc.member_count, 0)
      )
      order by p.created_at desc nulls last, p.id desc
    ),
    '[]'::jsonb
  )
  from page p
  left join clients_agg ca on ca.project_id = p.id
  left join member_counts mc on mc.project_id = p.id;
$$;

comment on function public.list_projects_enriched is
  'GET /api/projects: paginated projects with clients + member_count; tags stripped.';

revoke all on function public.list_projects_enriched(int, int) from public;
revoke all on function public.list_projects_enriched(int, int) from anon;
grant execute on function public.list_projects_enriched(int, int) to service_role;
grant execute on function public.list_projects_enriched(int, int) to authenticated;
