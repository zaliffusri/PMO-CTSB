-- eTicket-compatible helpdesk fields
alter table public.issues_app
  add column if not exists incident_type text,
  add column if not exists module_code text,
  add column if not exists epbt_module text,
  add column if not exists intake_channel text,
  add column if not exists client_pic text,
  add column if not exists action_taken text,
  add column if not exists l1_assignee_label text,
  add column if not exists l2_assignee_label text,
  add column if not exists backlog_ref text,
  add column if not exists issue_attachment_ref text,
  add column if not exists resolution_attachment_ref text;

alter table public.clients
  add column if not exists short_code text;

create index if not exists issues_app_module_code_idx on public.issues_app (module_code);
create index if not exists issues_app_incident_type_idx on public.issues_app (incident_type);
create index if not exists clients_short_code_idx on public.clients (short_code);
