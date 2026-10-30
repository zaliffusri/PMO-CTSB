-- Extension of Time (EOT) tracking on projects
alter table public.projects add column if not exists baseline_end_date date;
alter table public.projects add column if not exists eot_log jsonb not null default '[]'::jsonb;

comment on column public.projects.baseline_end_date is 'Original contract / planned end date before EOT extensions';
comment on column public.projects.eot_log is 'JSON array of EOT records: previous/new dates, days, reason, approver';

-- Backfill baseline from current end_date when never extended
update public.projects
set baseline_end_date = end_date
where baseline_end_date is null
  and end_date is not null;
