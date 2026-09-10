-- Ensure Clients page fields exist (may already be present from earlier migrations).
alter table public.clients
  add column if not exists short_code text;

alter table public.clients
  add column if not exists logo_url text;

create index if not exists clients_short_code_idx on public.clients (short_code);
