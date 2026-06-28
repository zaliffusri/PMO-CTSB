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

```bash
npm install
npm run seed:demo   # optional rich demo (v9+ — includes bulk volume data)
npm run dev
```

- Frontend: `http://localhost:5173`
- API: `http://localhost:3001`

Demo accounts (after `seed:demo`):

| Email | Password | Role |
|-------|----------|------|
| admin@pmo.local | admin123 | Admin |
| pmo@pmo.local | pmo123 | PMO |
| finance@pmo.local | finance123 | Finance |
| ahmadrizal@company.com | user123 | Team member |

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

`db:migrate` runs `push_schema_updates.sql` plus every file in `supabase/migrations/` in order, including:

- `issues_app`, `notifications_app`
- `backlogs_app`, `project_phases_app`
- `project_work_packages_app`, `engagement_type` on projects

Also set in production:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- Optional SMTP for email notifications (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`)

Test email: `npm run email:test`

## Deep links

- Project workspace tabs: `/projects/1?tab=tasks` (tasks, backlog, delivery, packages, …)
- Helpdesk issue detail: `/helpdesk?issue=3`
- Notifications link directly to these URLs

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Dev server + API with hot reload |
| `npm run build` | Production frontend build |
| `npm run test` | Unit tests (Vitest) |
| `npm run seed:demo` | Load demo portfolio |
| `npm run db:migrate` | Apply all SQL migrations |
| `npm run db:verify` | Verify schema |

## Deploy to Vercel

1. Import repo in Vercel (`vercel.json` configures API + static).
2. Set env vars (Supabase + optional SMTP).
3. Run `npm run db:migrate` against production DB **before** first use.
4. Deploy.

## Architecture

- **Frontend:** React + Vite (`src/`)
- **API:** Express (`server.js`, `routes/`)
- **Store:** Local JSON (`db/data.json`) when `ALLOW_LOCAL_STORE=1`, else Supabase via `db/store.js`

## CI

GitHub Actions runs `npm test` and `npm run build` on push/PR (`.github/workflows/ci.yml`).
