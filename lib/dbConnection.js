/** Build Postgres connection string for schema migrations. */
export function getSupabaseDbUrl() {
  if (process.env.SUPABASE_DB_URL) return process.env.SUPABASE_DB_URL;
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const base = process.env.SUPABASE_URL || '';
  const password = process.env.SUPABASE_DB_PASSWORD;
  const match = base.match(/https:\/\/([^.]+)\.supabase\.co/i);
  if (password && match) {
    const ref = match[1];
    const host = process.env.SUPABASE_DB_HOST || 'aws-0-ap-southeast-1.pooler.supabase.com';
    return `postgresql://postgres.${ref}:${encodeURIComponent(password)}@${host}:6543/postgres`;
  }
  return null;
}
