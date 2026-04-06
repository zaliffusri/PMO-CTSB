/**
 * Quick SMTP check. Usage:
 *   node scripts/email-test.mjs
 * Requires `.env` with SMTP_* (see `.env.example`). Sends to SMTP_USER unless SMTP_TEST_TO is set.
 */
import 'dotenv/config';
import { isMailerConfigured, sendAssignmentEmail } from '../lib/mailer.js';

const to = process.env.SMTP_TEST_TO || process.env.SMTP_USER;
if (!to) {
  console.error('Set SMTP_USER in .env (or SMTP_TEST_TO for a different recipient).');
  process.exit(1);
}
if (!isMailerConfigured()) {
  console.error('Mailer not configured. Set SMTP_SERVICE=gmail, SMTP_USER, SMTP_PASS, SMTP_FROM in .env');
  process.exit(1);
}

const r = await sendAssignmentEmail({
  to,
  personName: 'Test',
  projectName: 'SMTP test',
  roleInProject: null,
  allocationPercent: 100,
  assignedBy: 'PMO CTSB email test',
  action: 'assigned',
});
console.log(r.sent ? `Sent test mail to ${to}` : `Not sent: ${r.reason}`);
