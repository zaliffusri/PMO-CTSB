-- Row Level Security policies (defense in depth).
--
-- IMPORTANT: The Express API uses the Supabase *service_role* key, which
-- BYPASSES RLS by design. These policies protect direct PostgREST / anon /
-- authenticated client access. Application authorization (requireAuth +
-- requireRole + lib/permissions.js) remains mandatory for the API.

-- Helper: current JWT role claim (when using Supabase Auth). For service_role
-- requests this never applies.

alter table public.people enable row level security;
alter table public.users_app enable row level security;
alter table public.sessions_app enable row level security;
alter table public.projects enable row level security;
alter table public.project_assignments enable row level security;
alter table public.activities enable row level security;
alter table public.project_tasks enable row level security;
alter table public.issues_app enable row level security;
alter table public.backlogs_app enable row level security;
alter table public.notifications_app enable row level security;
alter table public.attachments_app enable row level security;
alter table public.clients enable row level security;
alter table public.client_contacts enable row level security;
alter table public.project_clients enable row level security;
alter table public.project_phases_app enable row level security;
alter table public.project_work_packages_app enable row level security;
alter table public.settings_app enable row level security;
alter table public.audit_log enable row level security;
alter table public.backlog_comments_app enable row level security;
alter table public.activities_deleted enable row level security;

-- Deny-by-default for anon: no policies granting anon access.
-- Authenticated: read-mostly where appropriate; writes go through the API.

do $$
begin
  -- people: authenticated users can read roster; writes via service role / API only
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'people' and policyname = 'people_authenticated_select') then
    create policy people_authenticated_select on public.people
      for select to authenticated
      using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'projects' and policyname = 'projects_authenticated_select') then
    create policy projects_authenticated_select on public.projects
      for select to authenticated
      using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'notifications_app' and policyname = 'notifications_own_select') then
    create policy notifications_own_select on public.notifications_app
      for select to authenticated
      using (
        user_id::text = coalesce(auth.jwt() ->> 'app_user_id', auth.jwt() ->> 'sub', '')
      );
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'notifications_app' and policyname = 'notifications_own_update') then
    create policy notifications_own_update on public.notifications_app
      for update to authenticated
      using (
        user_id::text = coalesce(auth.jwt() ->> 'app_user_id', auth.jwt() ->> 'sub', '')
      );
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'sessions_app' and policyname = 'sessions_deny_authenticated') then
    -- Sessions must never be readable via PostgREST authenticated role
    create policy sessions_deny_authenticated on public.sessions_app
      for all to authenticated
      using (false)
      with check (false);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'users_app' and policyname = 'users_authenticated_select_limited') then
    create policy users_authenticated_select_limited on public.users_app
      for select to authenticated
      using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'settings_app' and policyname = 'settings_authenticated_select') then
    create policy settings_authenticated_select on public.settings_app
      for select to authenticated
      using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'activities' and policyname = 'activities_authenticated_select') then
    create policy activities_authenticated_select on public.activities
      for select to authenticated
      using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'issues_app' and policyname = 'issues_authenticated_select') then
    create policy issues_authenticated_select on public.issues_app
      for select to authenticated
      using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'backlogs_app' and policyname = 'backlogs_authenticated_select') then
    create policy backlogs_authenticated_select on public.backlogs_app
      for select to authenticated
      using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'project_tasks' and policyname = 'tasks_authenticated_select') then
    create policy tasks_authenticated_select on public.project_tasks
      for select to authenticated
      using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'clients' and policyname = 'clients_authenticated_select') then
    create policy clients_authenticated_select on public.clients
      for select to authenticated
      using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'audit_log' and policyname = 'audit_deny_authenticated') then
    create policy audit_deny_authenticated on public.audit_log
      for all to authenticated
      using (false)
      with check (false);
  end if;
end $$;

-- Revoke broad grants from anon where possible (idempotent best-effort)
revoke all on table public.sessions_app from anon;
revoke all on table public.audit_log from anon;
revoke all on table public.settings_app from anon;
revoke insert, update, delete on table public.users_app from anon;
revoke insert, update, delete on table public.people from anon;
