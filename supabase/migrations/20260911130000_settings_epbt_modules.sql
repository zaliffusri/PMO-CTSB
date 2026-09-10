-- Editable ePBT module catalog in system settings (mirrors activity_locations pattern).
alter table public.settings_app
  add column if not exists epbt_modules jsonb not null default '[]'::jsonb;

notify pgrst, 'reload schema';
