-- Optional company branding column used by Clients page logo upload.
alter table public.clients
  add column if not exists logo_url text;
