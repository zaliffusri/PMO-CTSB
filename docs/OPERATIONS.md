# Operations: Realtime notifications, migrations, observability

## Notifications (direct Supabase Realtime)

The notification bell does **not** poll `/api/notifications` on an interval, and does **not** open WebSockets through Vercel.

1. Initial load uses the authenticated REST API (`GET /api/notifications`).
2. The browser creates a Supabase JS client with **public** Vite env:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY` (never the service role key)
3. It subscribes to `postgres_changes` on `notifications_app` with `user_id=eq.<current user>`.
4. INSERT/UPDATE payloads update React state in place (no full refetch).
5. Channels are removed on unmount (`removeChannel`).

### RLS (own rows only)

Custom app sessions are not Supabase Auth. For RLS to allow Realtime events, `/api/auth/login` and `/api/auth/me` may include a short-lived `supabase_realtime_token` minted with server-only `SUPABASE_JWT_SECRET` (claims: `role=authenticated`, `app_user_id`). The browser calls `realtime.setAuth(token)` then connects **directly to Supabase**. That token is not the `sessions_app` bearer.

| Variable | Where | Purpose |
|----------|--------|---------|
| `VITE_SUPABASE_URL` | Vite / Vercel (build) | Project URL for browser client |
| `VITE_SUPABASE_ANON_KEY` | Vite / Vercel (build) | Public anon key |
| `SUPABASE_JWT_SECRET` | API only | Mint Realtime JWTs on auth responses |
| `SUPABASE_SERVICE_ROLE_KEY` | API only | Server writes — **never** in Vite |

Apply `20260820180000_notifications_realtime.sql` (and enable Realtime for `notifications_app` in the Supabase Dashboard → Database → Publications if needed).

If Vite env is missing, the UI falls back to focus / `pmo:notifications-changed` refresh (still **no** interval polling).

## Database migrations (strict)

All schema changes must land as numbered files under `supabase/migrations/`. See `npm run db:migrate` / CI migrate job.

## Observability

Structured logs (`lib/logger.js`) + optional Sentry (`SENTRY_DSN`). Secrets and bearer tokens are redacted.
