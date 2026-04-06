-- Run once in Supabase SQL editor if `users_app` has no `active` column yet.
alter table users_app add column if not exists active boolean not null default true;
