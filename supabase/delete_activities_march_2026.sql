-- Activities that overlap March 2026 (any touch of the month).
--
-- Below: calendar March in UTC.
-- For Malaysia (UTC+8) local March instead, use:
--   start_at < '2026-03-31T16:00:00+00'::timestamptz
--   and end_at > '2026-02-28T16:00:00+00'::timestamptz
--
-- Preview (uncomment and run first):
-- select id, title, start_at, end_at from activities
-- where start_at < '2026-04-01T00:00:00+00'::timestamptz
--   and end_at > '2026-03-01T00:00:00+00'::timestamptz;

delete from activities
where start_at < '2026-04-01T00:00:00+00'::timestamptz
  and end_at > '2026-03-01T00:00:00+00'::timestamptz;
