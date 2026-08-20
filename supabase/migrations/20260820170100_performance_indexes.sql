-- Performance indexes for frequent filters / joins

-- Activities
create index if not exists idx_activities_project_id
  on public.activities (project_id);

create index if not exists idx_activities_person_id
  on public.activities (person_id);

create index if not exists idx_activities_activity_group_id
  on public.activities (activity_group_id);

create index if not exists idx_activities_start_at
  on public.activities (start_at);

-- Project assignments
create index if not exists idx_project_assignments_project_id
  on public.project_assignments (project_id);

create index if not exists idx_project_assignments_person_id
  on public.project_assignments (person_id);

-- Project tasks
create index if not exists idx_project_tasks_project_id
  on public.project_tasks (project_id);

create index if not exists idx_project_tasks_assignee_id
  on public.project_tasks (assignee_id);

create index if not exists idx_project_tasks_backlog_id
  on public.project_tasks (backlog_id);

-- Issues
create index if not exists idx_issues_app_assignee_person_id
  on public.issues_app (assignee_person_id);

create index if not exists idx_issues_app_reporter_user_id
  on public.issues_app (reporter_user_id);

-- Backlogs
create index if not exists idx_backlogs_app_assignee_person_id
  on public.backlogs_app (assignee_person_id);

create index if not exists idx_backlogs_app_project_id
  on public.backlogs_app (project_id);

-- Notifications (user_id already indexed in earlier migration; reinforce composite)
create index if not exists idx_notifications_app_user_created
  on public.notifications_app (user_id, created_at desc);
