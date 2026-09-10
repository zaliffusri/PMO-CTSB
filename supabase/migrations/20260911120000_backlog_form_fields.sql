-- Backlog form fields: menu / submenu / url / notes
alter table public.backlogs_app
  add column if not exists menu text,
  add column if not exists submenu text,
  add column if not exists url text,
  add column if not exists notes text;

-- Normalize legacy item_type values to the current catalog (best-effort).
update public.backlogs_app set item_type = 'bug_defect' where item_type in ('bug', 'defect', 'bug/defect');
update public.backlogs_app set item_type = 'inquiry' where item_type in ('support');
update public.backlogs_app set item_type = 'changes' where item_type in ('enhancement');
update public.backlogs_app set item_type = 'issue' where item_type in ('scope', 'data', 'recurring');
update public.backlogs_app set item_type = 'cr' where item_type in ('change_request');
update public.backlogs_app set item_type = 'golive' where item_type in ('go-live', 'go_live', 'GoLive');

notify pgrst, 'reload schema';
