import nodemailer from 'nodemailer';

/** Set to `gmail` to use Nodemailer’s built-in Gmail transport (no SMTP_HOST/PORT needed). */
const smtpService = String(process.env.SMTP_SERVICE || '').trim().toLowerCase();
const smtpHost = process.env.SMTP_HOST || '';
const smtpPort = Number(process.env.SMTP_PORT || 587);
const smtpUser = process.env.SMTP_USER || '';
/** Gmail app passwords are often pasted with spaces; auth expects 16 chars without spaces. */
const smtpPass = String(process.env.SMTP_PASS || '').replace(/\s/g, '');
const smtpFrom = process.env.SMTP_FROM || '';
const smtpSecure = String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true';

let warnedMissingConfig = false;

const useGmailPreset = smtpService === 'gmail';
const configured = useGmailPreset
  ? Boolean(smtpUser && smtpPass && smtpFrom)
  : Boolean(smtpHost && smtpPort && smtpFrom);

const transporter = configured
  ? nodemailer.createTransport(
      useGmailPreset
        ? {
            service: 'gmail',
            auth: { user: smtpUser, pass: smtpPass },
          }
        : {
            host: smtpHost,
            port: smtpPort,
            secure: smtpSecure,
            auth: smtpUser && smtpPass ? { user: smtpUser, pass: smtpPass } : undefined,
          },
    )
  : null;

export function isMailerConfigured() {
  return configured;
}

export async function sendAssignmentEmail({
  to,
  personName,
  projectName,
  roleInProject,
  allocationPercent,
  assignedBy,
  action = 'assigned',
}) {
  if (!configured || !transporter || !to) {
    if (!configured && !warnedMissingConfig) {
      warnedMissingConfig = true;
      console.warn('mailer: SMTP not configured, assignment emails are disabled');
    }
    return { sent: false, reason: 'not_configured_or_missing_recipient' };
  }

  const roleText = roleInProject ? `Role: ${roleInProject}` : 'Role: -';
  const allocationText = `Allocation: ${allocationPercent ?? 100}%`;
  const actorText = assignedBy ? `Assigned by: ${assignedBy}` : '';
  const actionTitle = action === 'updated' ? 'assignment updated' : 'new assignment';
  const subject = `PMO CTSB: ${actionTitle} for ${projectName}`;
  const text = [
    `Hi ${personName || 'team member'},`,
    '',
    `You have a ${actionTitle}.`,
    `Project: ${projectName}`,
    roleText,
    allocationText,
    actorText,
    '',
    'Please check PMO CTSB for details.',
  ]
    .filter(Boolean)
    .join('\n');

  await transporter.sendMail({
    from: smtpFrom,
    to,
    subject,
    text,
  });

  return { sent: true };
}

const ACTIVITY_TYPE_LABELS = {
  meeting: 'Meeting',
  outstation: 'Outstation',
  other: 'Other',
  uat: 'UAT',
  urs: 'URS',
  fat: 'FAT',
  demo: 'DEMO',
  training: 'TRAINING',
  'go-live': 'GO-LIVE',
  tender: 'TENDER',
  task: 'Outstation',
};

/**
 * Notify the person an activity was logged for them (Calendar / API).
 * Fire-and-forget from routes; failures are logged only.
 */
export async function sendActivityLoggedEmail({
  to,
  recipientName,
  title,
  typeKey,
  location,
  startAt,
  endAt,
  projectName,
  loggedBy,
}) {
  if (!configured || !transporter || !to) {
    if (!configured && !warnedMissingConfig) {
      warnedMissingConfig = true;
      console.warn('mailer: SMTP not configured, emails are disabled');
    }
    return { sent: false, reason: 'not_configured_or_missing_recipient' };
  }

  const typeLabel = ACTIVITY_TYPE_LABELS[typeKey] || String(typeKey || 'Activity');
  const projectLine = projectName ? `Project: ${projectName}` : 'Project: (none)';
  const actorText = loggedBy ? `Logged by: ${loggedBy}` : '';
  const subject = `PMO CTSB: Activity logged for you — ${title}`;
  const text = [
    `Hi ${recipientName || 'team member'},`,
    '',
    'An activity has been logged for you in PMO CTSB.',
    '',
    `Type: ${typeLabel}`,
    `Title: ${title}`,
    `Location: ${location}`,
    projectLine,
    `Start: ${startAt}`,
    `End: ${endAt}`,
    actorText,
    '',
    'Open PMO CTSB → Calendar & Activities to review.',
  ]
    .filter(Boolean)
    .join('\n');

  await transporter.sendMail({
    from: smtpFrom,
    to,
    subject,
    text,
  });

  return { sent: true };
}
