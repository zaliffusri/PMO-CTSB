-- Activity audit trail for calendar (creator + last editor).
alter table public.activities
  add column if not exists created_by_user_id bigint references public.users_app(id) on delete set null;

alter table public.activities
  add column if not exists created_by_name text;

alter table public.activities
  add column if not exists updated_by_user_id bigint references public.users_app(id) on delete set null;

alter table public.activities
  add column if not exists updated_by_name text;

alter table public.activities
  add column if not exists updated_at timestamptz;
