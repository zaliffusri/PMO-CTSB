/**
 * Import legacy eTicket CSV into local PMO-CTSB store.
 *
 * Usage:
 *   npm run import:eticket -- "C:\path\to\eTicket.csv"
 *   ALLOW_LOCAL_STORE=1 node scripts/importETicketCsv.mjs path/to/eTicket.csv
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { store } from '../db/store.js';
import { parseCsv, mapEticketRowToIssue } from '../lib/eticketImport.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

if (process.env.ALLOW_LOCAL_STORE !== '1') {
  console.error('Set ALLOW_LOCAL_STORE=1 for local eTicket import.');
  process.exit(1);
}

const defaultPath = path.join(
  process.env.USERPROFILE || process.env.HOME || '',
  'Downloads',
  'eTicket.csv',
);
const csvPath = process.argv[2] ? path.resolve(process.argv[2]) : defaultPath;

if (!fs.existsSync(csvPath)) {
  console.error(`CSV not found: ${csvPath}`);
  console.error('Pass a file path: npm run import:eticket -- "C:\\path\\to\\eTicket.csv"');
  process.exit(1);
}

const admin = store.users?.find((u) => u.role === 'admin') || store.users?.[0];
const reporterUserId = admin?.id ?? null;

const csvText = fs.readFileSync(csvPath, 'utf8');
const rows = parseCsv(csvText);
let imported = 0;
let skipped = 0;
const errors = [];

for (const row of rows) {
  try {
    const ticketNo = String(row.TicketID || '').trim();
    if (!ticketNo) {
      skipped += 1;
      continue;
    }
    if (store.findIssueByTicketNo(ticketNo)) {
      skipped += 1;
      continue;
    }
    const clientCode = row.Client ? String(row.Client).trim() : null;
    const clientId = clientCode ? store.findOrCreateClient(clientCode, clientCode) : null;
    const payload = mapEticketRowToIssue(row, { clientId, reporterUserId });
    store.addIssue(payload);
    imported += 1;
  } catch (e) {
    errors.push({ ticket: row.TicketID, error: e.message });
  }
}

try {
  await store.persistToSupabase();
} catch (e) {
  console.warn('Supabase persist skipped or failed:', e.message);
}

console.log(`eTicket import from: ${csvPath}`);
console.log(`  Imported: ${imported}`);
console.log(`  Skipped:  ${skipped}`);
if (errors.length) {
  console.log(`  Errors:   ${errors.length}`);
  errors.slice(0, 10).forEach((err) => {
    console.log(`    - ${err.ticket}: ${err.error}`);
  });
}
