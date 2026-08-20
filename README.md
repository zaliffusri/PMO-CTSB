# PMO CTSB – Project & Resource Management

Government and PBT-style **project portfolio management**: delivery workspaces, work packages, backlog, helpdesk, finance by phase, team workload, and personal **My work** queues.

## Documentation

| Document | Description |
|----------|-------------|
| **[System Workflow Guide](docs/PMO-CTSB-System-Workflow.md)** | Full end-to-end flow: Helpdesk → Backlog → Tasks, roles, notifications, linking |
| **[System Workflow (PDF)](docs/PMO-CTSB-System-Workflow.pdf)** | Same guide as printable PDF — run `npm run docs:workflow-pdf` to regenerate |
| [Team Presentation (PDF)](docs/PMO-CTSB-Team-Presentation.pdf) | Slide deck for stakeholders |
| [Screenshot Tour (PDF)](docs/PMO-CTSB-Screenshot-Tour.pdf) | UI walkthrough with screenshots |

## Features

| Module | Capability |
|--------|------------|
| **Projects** | Engagement types (Contract, LO, PO…), health KPIs, grid/list portfolio |
| **Work packages** | Multiple delivery scopes per project (dev, API, migration…) |
| **Backlog** | Scope items, promote from helpdesk, link to tasks |
| **Helpdesk** | Issues, assignees, in-app + email notifications, promote to backlog |
| **Delivery** | Phase templates (URS, UAT, maintenance…), payment milestones |
| **Finance** | Ready to bill, invoiced, paid & claimed, maintenance renewal follow-up |
| **My work** | Personal tasks, backlog, helpdesk, today's schedule |
| **Team & calendar** | People, assignments, activities, availability |
| **Reports** | Portfolio health, exports |

## Quick start (local)

### Windows (recommended)

Double-click **`run-local.cmd`** in the project folder, or run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/run-local.ps1
```

This finds Node.js (system install or `.tools/node`), installs dependencies if needed, and starts dev servers.

### All platforms

```bash
npm install
npm run dev
```

Optional richer demo reset:

```bash
npm run seed:demo
```

- Frontend: `http://localhost:5173`
- API: `http://localhost:3001`

Demo accounts (auto-loaded on first `npm run dev` with local store):

| Email | Password | Role |
|-------|----------|------|
| admin@pmo.local | admin123 | Admin |
| pmo@pmo.local | pmo123 | PMO |
| finance@pmo.local | finance123 | Finance |
| ahmadrizal@company.com | user123 | Team member |

**Troubleshooting**

| Problem | Fix |
|---------|-----|
| `npm` not recognized | Install [Node.js LTS](https://nodejs.org) or use `run-local.cmd` |
| Port 3001 / 5173 in use | Stop the other terminal (`Ctrl+C`) or close the old dev window |
| Blank page / build error | Run `npm run build` to see compile errors; pull latest `main` |

Single-process local run:

```bash
npm start
```

Uses `ALLOW_LOCAL_STORE=1` for JSON file store without Supabase.

## Database (Supabase production)

The app needs **all** migrations applied. From the repo root:

```bash
# .env: SUPABASE_DB_URL=postgresql://postgres.[ref]:[PASSWORD]@...pooler.supabase.com:6543/postgres
npm run db:migrate
npm run db:verify
```

`db:migrate` applies pending files from `supabase/migrations/` (plus optional `push_schema_updates.sql`), records them in `public.schema_migrations`, and skips already-applied scripts. See [docs/OPERATIONS.md](docs/OPERATIONS.md).

Includes:

- `issues_app`, `notifications_app` (+ Realtime publication)
- `backlogs_app`, `project_phases_app`
- `project_work_packages_app`, `engagement_type` on projects
- `people.user_id` hard link to `users_app`, performance indexes, RLS policies

Link existing roster rows (safe email backfill):

```bash
npm run db:link-people -- --dry-run
npm run db:link-people
```

See [docs/SECURITY-IDENTITY.md](docs/SECURITY-IDENTITY.md).

Also set in production:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_JWT_SECRET` (optional Realtime RLS tokens on `/api/auth/me`)
- `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` (browser Realtime; never service role)
- `SUPABASE_DB_URL` (Postgres URI — required for multi-table **transactions** such as promote ticket → backlog)
- Optional `SENTRY_DSN` for API error tracking
- Optional SMTP for email notifications (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`)

Backend data access is **stateless** (per-request Supabase/Postgres queries). See [docs/STATELESS-STORE.md](docs/STATELESS-STORE.md).

Test email: `npm run email:test`

## Deep links

- Project workspace tabs: `/projects/1?tab=tasks` (tasks, backlog, delivery, packages, …)
- Helpdesk issue detail: `/helpdesk?issue=3`
- Notifications link directly to these URLs

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Dev server + API with hot reload |
| `scripts/run-local.ps1` / `run-local.cmd` | Windows helper (finds Node, runs `npm run dev`) |
| `npm run build` | Production frontend build |
| `npm run test` | Unit tests (Vitest) |
| `npm run seed:demo` | Load demo portfolio |
| `npm run db:migrate` | Apply pending SQL migrations (tracked) |
| `npm run db:migrate:dry-run` | List pending migrations |
| `npm run db:check-migrations` | Validate migration filenames |
| `npm run db:verify` | Verify schema |

## Deploy to Vercel

1. Import repo in Vercel (`vercel.json` configures API + static).
2. Set env vars (Supabase + optional SMTP / Sentry). For Realtime badges: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and server `SUPABASE_JWT_SECRET`.
3. Run `npm run db:migrate` against production DB **before** first use (or rely on CI migrate job with `SUPABASE_DB_URL` secret).
4. Deploy.

## Architecture

- **Frontend:** React + Vite (`src/`)
- **API:** Express (`server.js`, `routes/`)
- **Store:** Local JSON (`db/data.json`) when `ALLOW_LOCAL_STORE=1`, else Supabase via `db/store.js`

## CI

GitHub Actions (`.github/workflows/ci.yml`):

- PR / push: `db:check-migrations`, `npm test`, `npm run build`
- Push to `main`/`master`: apply pending migrations when `SUPABASE_DB_URL` secret is set

Ops details: [docs/OPERATIONS.md](docs/OPERATIONS.md).
