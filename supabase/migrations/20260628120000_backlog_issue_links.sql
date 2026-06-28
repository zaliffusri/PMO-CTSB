-- Link product backlog rows to helpdesk / legacy refs (PBLID, No Tiket)
alter table public.backlogs_app
  add column if not exists external_ticket_ref text,
  add column if not exists module_code text,
  add column if not exists client_id bigint references public.clients(id) on delete set null;

create index if not exists idx_backlogs_app_ref_no on public.backlogs_app(ref_no);
create index if not exists idx_backlogs_app_external_ticket_ref on public.backlogs_app(external_ticket_ref);
