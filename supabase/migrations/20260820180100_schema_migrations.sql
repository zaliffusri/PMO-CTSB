-- Track applied SQL migrations for strict CI/CD pipelines.
-- Applied by scripts/applyDbMigrations.mjs (also creates this table if missing).

create table if not exists public.schema_migrations (
  id text primary key,
  applied_at timestamptz not null default now(),
  checksum text
);

comment on table public.schema_migrations is
  'Filenames of supabase/migrations/*.sql (and push_schema_updates.sql) already applied.';
