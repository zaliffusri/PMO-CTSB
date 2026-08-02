-- Optional dedicated SMTP column (embed in mileage_from_office_km still works without this).
alter table settings_app
  add column if not exists smtp_config jsonb not null default '{}'::jsonb;
