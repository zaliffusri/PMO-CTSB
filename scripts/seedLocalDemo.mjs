import 'dotenv/config';
import { store, resetLocalDemoData } from '../db/store.js';
import { DEMO_SEED_VERSION, runRichDemoSeed } from '../db/demoSeed.js';

if (process.env.ALLOW_LOCAL_STORE !== '1') {
  console.error('Set ALLOW_LOCAL_STORE=1 for local demo seed.');
  process.exit(1);
}

resetLocalDemoData();
const summary = await runRichDemoSeed(store);
await store.updateSettings({ demo_seed_version: DEMO_SEED_VERSION });

console.log(`Demo data loaded (v${DEMO_SEED_VERSION}). Restart the dev server if it is already running.`);
console.log('');
console.log('Portfolio volume (approx):');
console.log(`  Projects: ${store.projects.length}`);
console.log(`  Clients:  ${store.clients.length}`);
console.log(`  Team:     ${store.people.length} people, ${store.project_assignments.length} assignments`);
console.log(`  Helpdesk: ${store.issues.length} tickets`);
console.log(`  Backlog:  ${store.backlogs.length} items`);
console.log(`  Tasks:    ${store.project_tasks.length}`);
console.log(`  Calendar: ${store.activities.length} activities`);
console.log(`  Finance:  ${store.project_phases.length} delivery phases`);
console.log('');
if (summary.bulk) {
  console.log('Bulk seed stats:', summary.bulk);
}
console.log('');
console.log('Full-cycle tour (suggested order):');
console.log('  1. Dashboard — portfolio KPIs');
console.log('  2. Helpdesk — L1/L2 tickets (eT-CK-0001 login incident, eT-PN-0002 CR)');
console.log('  3. Projects → PBT Portal → Backlog tab (bug linked to helpdesk)');
console.log('  4. Projects → Tasks tab (hotfix from backlog)');
console.log('  5. Finance — ready to bill / invoiced milestones');
console.log('  6. My work — login as ahmadrizal@company.com / user123');
console.log('  7. Calendar, Team, Reports, Gantt');
console.log('');
console.log('Accounts:');
console.log('  admin@pmo.local / admin123 (Administrator)');
console.log('  pmo@pmo.local / pmo123 (PMO)');
console.log('  finance@pmo.local / finance123 (Finance)');
console.log('  ahmadrizal@company.com / user123 (Team member — My work)');
