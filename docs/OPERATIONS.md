# Operations: Realtime notifications, migrations, observability

## Notifications (Supabase Realtime)

The notification bell no longer polls `/api/notifications` on an interval.

1. Initial load still uses the authenticated REST API (`GET /api/notifications`).
2. The API mints a **short-lived** Supabase JWT (`GET /api/notifications/realtime`) with claims:
   - `role: authenticated`
   - `app_user_id` / `sub` = current `users_app.id`
3. The browser opens a Realtime `postgres_changes` channel on `notifications_app` filtered by `user_id=eq.<id>`.
4. Row Level Security (`notifications_own_select` / `notifications_own_update`) ensures users only receive their own rows.
5. Mark-read still goes through the Express API (service role); Realtime UPDATE events refresh the badge.

### Required server env

| Variable | Purpose |
|----------|---------|
| `SUPABASE_URL` | Project URL |
| `SUPABASE_ANON_KEY` | Public anon key (safe for browser; returned by `/realtime`) |
| `SUPABASE_JWT_SECRET` | JWT secret from Supabase → Settings → API (server-only) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server writes (unchanged; **never** sent to the browser) |

Apply migration `20260820180000_notifications_realtime.sql` so `notifications_app` is in the `supabase_realtime` publication.

If Realtime env is missing, the UI falls back to refresh-on-focus / visibility / `pmo:notifications-changed` (still **no** 15s polling).

## Database migrations (strict)

All schema changes must land as numbered files:

```text
supabase/migrations/YYYYMMDDHHMMSS_description.sql
```

Do **not** apply ad-hoc DDL in the SQL editor for durable schema (except emergency hotfix, which must be back-ported as a migration).

```bash
npm run db:check-migrations   # filename / uniqueness gate (also runs in CI)
npm run db:migrate:dry-run    # list pending
npm run db:migrate            # apply pending; records in public.schema_migrations
npm run db:verify             # table presence checks
```

Flags:

- `--baseline` / `DB_MIGRATE_BASELINE=1` — mark current files applied without executing (first CI connect to an already-migrated DB)
- `--force` — re-run selected files
- `--skip-push` — skip legacy `push_schema_updates.sql`

CI (`.github/workflows/ci.yml`) on push to `main`/`master`: dry-run → migrate → verify when `SUPABASE_DB_URL` secret is set.

## Observability

- Structured JSON logs via `lib/logger.js` (redacts `authorization`, `password`, `token`, bearer values).
- Optional Sentry via `SENTRY_DSN` (`lib/sentry.js`); `beforeSend` scrubs headers/body. Never logs `sessions_app` tokens or env dumps.

| Variable | Purpose |
|----------|---------|
| `SENTRY_DSN` | Enable error tracking |
| `SENTRY_ENVIRONMENT` | Override environment label |
| `SENTRY_TRACES_SAMPLE_RATE` | Default `0.05` |
| `LOG_LEVEL=debug` | Extra debug lines |
