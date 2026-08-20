# Identity hard-link, RLS, and service-role boundaries

## Problem (fixed)

Login accounts (`users_app`) were soft-matched to the delivery roster (`people`) by **email or name**. Renaming or changing email broke My Work, notifications, and assignment checks.

The API uses the Supabase **service_role** key, which **bypasses RLS**. That is normal for a trusted server, but means authorization must be enforced in Express — RLS alone is not enough.

## Identity model (now)

```
users_app.id  ←── people.user_id  (FK, unique when not null, ON DELETE SET NULL)
```

- `lib/permissions.js` → `personIdForUser(user, people)` uses **`people.user_id` only** (no email/name fallback).
- `lib/teamUserSync.js` always writes `user_id` when syncing users → people.
- `requireAuth` attaches `req.user.person_id` from the hard link when present.

### Migrate existing data

```bash
npm run db:migrate          # includes 20260820170000_people_user_id_link.sql
# or re-run backfill only:
npm run db:link-people
npm run db:link-people -- --dry-run
```

Then sync from the UI (**Team → Sync from users**) or `POST /api/people/sync-from-users` so any remaining users get roster rows with `user_id`.

## Service role audit

| Boundary | Enforcement |
|----------|-------------|
| Unauthenticated API | Blocked except `/api/auth`, `/api/health`, `/api/settings/public` |
| Role gates | `middleware/requireRole.js` + `lib/permissions.js` |
| Payload shape | Zod via `middleware/validate.js` on key write routes (users, issues, activities, projects, promote) |
| Direct PostgREST / anon | RLS enabled + deny policies on `sessions_app`, `audit_log`; select policies for `authenticated` |
| Secrets | `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_JWT_SECRET` stay **server-only**; browser uses `VITE_SUPABASE_ANON_KEY` only |

**RLS does not constrain the Express service role.** Treat RLS as defense-in-depth for accidental client exposure; keep strengthening route-level checks.

### Realtime notifications

Browser connects **directly** to Supabase Realtime (not via Vercel). Public anon key is in Vite env. A short-lived JWT with `app_user_id` may be attached to `/api/auth/me` (and login) so RLS `notifications_own_*` policies allow only the caller's rows. Session tokens from `sessions_app` are never used as Realtime JWTs. See [OPERATIONS.md](OPERATIONS.md).

## Indexes added

See `supabase/migrations/20260820170100_performance_indexes.sql` — `project_id`, `assignee_person_id` / `assignee_id`, `activity_group_id`, and related hot paths.
