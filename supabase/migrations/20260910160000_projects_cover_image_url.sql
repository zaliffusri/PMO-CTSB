-- Project workspace cover / banner image (data URL or URL text).
alter table public.projects
  add column if not exists cover_image_url text;
