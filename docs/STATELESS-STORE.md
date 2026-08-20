# Stateless store (Postgres-first)

## Why

Vercel serverless instances are ephemeral and concurrent. The old design loaded a **full in-memory snapshot** on cold start, mutated it, then **upserted the whole snapshot** back to Supabase. That caused:

- Stale reads across instances
- Deleted rows resurrected by upsert-only sync
- Lost updates under concurrent users

## Current model

| Mode | When | Behavior |
|------|------|----------|
| **DB (production)** | `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | Repositories query Supabase per request. No process-wide cache. |
| **Local** | `ALLOW_LOCAL_STORE=1` **and** no Supabase credentials | In-memory only (demo seed). |

### Layers

- `db/runtime/query.js` — thin Supabase helpers (`dbSelect`, `dbInsert`, `dbUpdate`, …)
- `db/runtime/pgPool.js` — `pg` pool + `withTransaction()` for multi-table ACID writes
- `db/repositories/*` — async CRUD; dual-path `isDbMode()` vs local memory
- `db/store.js` — facade only; `persistToSupabase()` is a **no-op** (kept for route compatibility)
- `lib/issueBacklogPromoteTx.js` — transactional helpdesk → backlog promote (`FOR UPDATE` + insert/update)

### Auth

Sessions remain Bearer tokens in `sessions_app`. `findSessionByTokenAny` / `findUserByIdAny` hit Postgres directly.

### Transactions

Set `SUPABASE_DB_URL` (or `DATABASE_URL`) on Vercel so promote/purge can use real SQL transactions. Without it, promote falls back to sequential Supabase calls (still DB-backed, not memory).

### What routes should do

```js
const issues = await store.listIssues();
await store.updateIssue(id, patch);
// persistToSupabase() optional / no-op
```

Do not rely on sync getters (`store.issues`) in production — they only reflect local memory.
