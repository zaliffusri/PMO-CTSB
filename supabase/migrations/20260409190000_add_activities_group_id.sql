alter table public.activities
add column if not exists activity_group_id text;

create index if not exists idx_activities_group_id on public.activities(activity_group_id);
