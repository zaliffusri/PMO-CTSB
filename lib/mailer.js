import nodemailer from 'nodemailer';

const smtpHost = process.env.SMTP_HOST || '';
const smtpPort = Number(process.env.SMTP_PORT || 587);
const smtpUser = process.env.SMTP_USER || '';
const smtpPass = process.env.SMTP_PASS || '';
const smtpFrom = process.env.SMTP_FROM || '';
const smtpSecure = String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true';

let warnedMissingConfig = false;

const configured = Boolean(smtpHost && smtpPort && smtpFrom);
const transporter = configured
  ? nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: smtpUser && smtpPass ? { user: smtpUser, pass: smtpPass } : undefined,
    })
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
