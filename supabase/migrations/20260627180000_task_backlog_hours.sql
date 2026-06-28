-- Estimated and actual hours for tasks and backlog time tracking
alter table public.project_tasks
  add column if not exists estimated_hours numeric,
  add column if not exists actual_hours numeric;

alter table public.backlogs_app
  add column if not exists estimated_hours numeric,
  add column if not exists actual_hours numeric;

-- Backfill backlog estimates from legacy effort_days (8h per day)
update public.backlogs_app
set estimated_hours = round(effort_days * 8, 2)
where estimated_hours is null
  and effort_days is not null
  and effort_days > 0;
