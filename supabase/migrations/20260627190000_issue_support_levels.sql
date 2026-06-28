-- Helpdesk L1 / L2 / L3 escalation workflow
alter table public.issues_app
  add column if not exists external_ticket_ref text,
  add column if not exists support_level text not null default 'L1',
  add column if not exists resolution_method text,
  add column if not exists resolution_notes text;

create index if not exists issues_app_support_level_idx on public.issues_app (support_level);
