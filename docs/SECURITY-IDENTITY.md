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
| Secrets | `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_JWT_SECRET` stay **server-only**; anon key may be returned by `/api/notifications/realtime` for Realtime only |

**RLS does not constrain the Express service role.** Treat RLS as defense-in-depth for accidental client exposure; keep strengthening route-level checks.

### Realtime notifications

Browser clients subscribe with a short-lived JWT (`app_user_id` claim) minted by the API. RLS `notifications_own_select` / `notifications_own_update` limits `postgres_changes` to the caller's rows. Session bearer tokens from `sessions_app` are never placed in Realtime JWTs or logs. See [OPERATIONS.md](OPERATIONS.md).

## Indexes added

See `supabase/migrations/20260820170100_performance_indexes.sql` — `project_id`, `assignee_person_id` / `assignee_id`, `activity_group_id`, and related hot paths.
