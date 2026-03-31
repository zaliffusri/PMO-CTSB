# Supabase Hosting Guide (No Render)

This project is now prepared with Supabase database schema and migration scripts.

## What is ready

- `supabase/schema.sql` -> creates all app tables.
- `backend/scripts/migrateToSupabase.mjs` -> migrates data from `backend/db/data.json`.
- `backend/.env.example` -> env template for migration script.

## 1) Create Supabase project

1. Open Supabase dashboard.
2. Create a new free project.
3. From Project Settings -> API, copy:
   - `Project URL`
   - `service_role` key

## 2) Create DB schema

1. Open SQL Editor in Supabase.
2. Paste content from `supabase/schema.sql`.
3. Run query.

## 3) Migrate your current data

From `backend` directory:

1. Create `.env` file (or set env vars in terminal):
   - `SUPABASE_URL=...`
   - `SUPABASE_SERVICE_ROLE_KEY=...`
2. Run:

```bash
npm run migrate:supabase
```

## 4) Host frontend (free)

Use Netlify to host frontend.

Set Netlify env var:

- `VITE_API_BASE` = your backend API URL ending with `/api`

## Important note

Supabase provides database and serverless functions.  
Your current backend is still an Express API (Node). If you want to remove Node hosting completely, the next step is to rewrite API routes into Supabase Edge Functions.

If you want, this can be done in a follow-up phase (route-by-route).
