/**
 * Fail CI if migration filenames are not strictly ordered / uniquely prefixed.
 * Enforces: supabase/migrations/YYYYMMDDHHMMSS_description.sql
 */
import { readdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(__dirname, '..', 'supabase', 'migrations');

const PATTERN = /^(\d{14})_[a-z0-9][a-z0-9_-]*\.sql$/i;

const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
const prefixes = new Set();
const errors = [];

for (const file of files) {
  const m = file.match(PATTERN);
  if (!m) {
    errors.push(`Invalid migration name (want YYYYMMDDHHMMSS_slug.sql): ${file}`);
    continue;
  }
  if (prefixes.has(m[1])) {
    errors.push(`Duplicate migration timestamp prefix: ${m[1]} (${file})`);
  }
  prefixes.add(m[1]);
}

if (!files.length) {
  errors.push('No migration files found under supabase/migrations/');
}

if (errors.length) {
  console.error('Migration check failed:');
  errors.forEach((e) => console.error(`  - ${e}`));
  process.exit(1);
}

console.log(`OK: ${files.length} migration file(s) with unique timestamps.`);
