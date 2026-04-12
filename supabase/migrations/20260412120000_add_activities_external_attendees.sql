-- Guest / external names on activities (no system account). person_id may be null when only guests.
-- After running: Supabase Dashboard → Project Settings → API → "Reload schema" (or wait ~1 min).
alter table public.activities add column if not exists external_attendees text;

alter table public.activities alter column person_id drop not null;

alter table public.activities drop constraint if exists activities_person_or_external_chk;

alter table public.activities add constraint activities_person_or_external_chk check (
  person_id is not null
  or (
    external_attendees is not null
    and length(btrim(external_attendees)) > 0
  )
);
