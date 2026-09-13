-- Unique project short code (e.g. PKPJ) for create form + backlog refs.
alter table public.projects
  add column if not exists short_code text;

create unique index if not exists projects_short_code_unique_idx
  on public.projects (upper(btrim(short_code)))
  where short_code is not null and btrim(short_code) <> '';

notify pgrst, 'reload schema';
