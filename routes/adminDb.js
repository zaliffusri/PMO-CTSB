import { Router } from 'express';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { requireAdmin } from '../middleware/requireAuth.js';
import { getSupabaseDbUrl } from '../lib/dbConnection.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const adminDbRouter = Router();
adminDbRouter.use(requireAdmin);

async function verifySchema(client) {
  const tables = await client.query(`
    select table_name from information_schema.tables
    where table_schema = 'public' and table_name in ('client_contacts', 'project_clients')
  `);
  const legacy = await client.query(`
    select table_name, column_name from information_schema.columns
    where table_schema = 'public'
      and (
        (table_name = 'clients' and column_name in ('contact_name', 'email', 'phone'))
        or (table_name = 'projects' and column_name = 'client_id')
      )
  `);
  const activityAudit = await client.query(`
    select column_name from information_schema.columns
    where table_schema = 'public'
      and table_name = 'activities'
      and column_name in (
        'created_by_user_id', 'created_by_name',
        'updated_by_user_id', 'updated_by_name', 'updated_at'
      )
    order by column_name
  `);
  const names = tables.rows.map((r) => r.table_name);
  const activityAuditCols = activityAudit.rows.map((r) => r.column_name);
  return {
    ok: names.includes('client_contacts') && names.includes('project_clients') && legacy.rows.length === 0,
    tables: names,
    legacy_columns: legacy.rows,
    activities_audit_columns: activityAuditCols,
    activities_audit_ok: activityAuditCols.length >= 5,
  };
}

function dbClient(dbUrl) {
  return new pg.Client({
    connectionString: dbUrl,
    ssl: dbUrl.includes('localhost') ? false : { rejectUnauthorized: false },
  });
}

/** GET — schema status (admin only) */
adminDbRouter.get('/schema-status', async (req, res) => {
  const dbUrl = getSupabaseDbUrl();
  if (!dbUrl) {
    return res.status(503).json({
      error: 'Set SUPABASE_DB_URL or SUPABASE_URL + SUPABASE_DB_PASSWORD in server environment',
    });
  }
  const client = dbClient(dbUrl);
  try {
    await client.connect();
    const status = await verifySchema(client);
    res.json(status);
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    await client.end().catch(() => {});
  }
});

/** POST — apply push_schema_updates.sql (admin only, once) */
adminDbRouter.post('/apply-schema', async (req, res) => {
  const dbUrl = getSupabaseDbUrl();
  if (!dbUrl) {
    return res.status(503).json({
      error: 'Set SUPABASE_DB_URL or SUPABASE_URL + SUPABASE_DB_PASSWORD in server environment',
    });
  }
  const sqlPath = path.join(__dirname, '../supabase/push_schema_updates.sql');
  const sql = readFileSync(sqlPath, 'utf8');
  const client = dbClient(dbUrl);
  try {
    await client.connect();
    await client.query(sql);
    const status = await verifySchema(client);
    res.json({ applied: true, ...status });
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    await client.end().catch(() => {});
  }
});

/** POST — add calendar activity creator/editor columns (idempotent). */
adminDbRouter.post('/apply-activities-audit', async (req, res) => {
  const dbUrl = getSupabaseDbUrl();
  if (!dbUrl) {
    return res.status(503).json({
      error: 'Set SUPABASE_DB_URL or SUPABASE_URL + SUPABASE_DB_PASSWORD in server environment',
    });
  }
  const sqlPath = path.join(__dirname, '../supabase/migrations/20260803120000_activities_audit_actors.sql');
  const sql = readFileSync(sqlPath, 'utf8');
  const client = dbClient(dbUrl);
  try {
    await client.connect();
    await client.query(sql);
    const status = await verifySchema(client);
    res.json({ applied: true, migration: '20260803120000_activities_audit_actors', ...status });
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    await client.end().catch(() => {});
  }
});
