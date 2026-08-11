-- Durable cancel tombstones so serverless instances cannot resurrect deleted activities.
create table if not exists public.activities_deleted (
  id bigint primary key,
  deleted_at timestamptz not null default now()
);

create index if not exists activities_deleted_deleted_at_idx
  on public.activities_deleted (deleted_at);
