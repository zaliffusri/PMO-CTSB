-- Adds an optional profile picture column to users_app.
-- Stores the avatar as a base64 data URL (image/jpeg). The frontend
-- resizes uploads to 256x256 to keep payloads small (~30-80KB).
alter table public.users_app
  add column if not exists avatar_url text;
