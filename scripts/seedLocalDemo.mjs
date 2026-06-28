import 'dotenv/config';
import { store, resetLocalDemoData } from '../db/store.js';
import { DEMO_SEED_VERSION, runRichDemoSeed } from '../db/demoSeed.js';

if (process.env.ALLOW_LOCAL_STORE !== '1') {
  console.error('Set ALLOW_LOCAL_STORE=1 for local demo seed.');
  process.exit(1);
}

resetLocalDemoData();
const summary = runRichDemoSeed(store);
store.updateSettings({ demo_seed_version: DEMO_SEED_VERSION });

console.log(`Demo data loaded (v${DEMO_SEED_VERSION}). Restart the dev server if it is already running.`);
if (summary.bulk) {
  console.log('Bulk volume:', summary.bulk);
  console.log(`  ~${summary.bulk.issuesAdded + 5} helpdesk tickets, ~${summary.bulk.backlogsAdded + 6} backlog items, ~${summary.bulk.tasksAdded + 7} tasks, ~${summary.bulk.activitiesAdded + 35} calendar events`);
}
console.log('Accounts:');
console.log('  admin@pmo.local / admin123 (Administrator)');
console.log('  pmo@pmo.local / pmo123 (PMO)');
console.log('  finance@pmo.local / finance123 (Finance)');
console.log('  ahmadrizal@company.com / user123 (Team member — My work)');
