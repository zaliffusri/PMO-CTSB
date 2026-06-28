import nodemailer from 'nodemailer';
import { buildActivityNotificationEmail, buildTeamScheduleEmail } from './emailTemplates.js';
import { store } from '../db/store.js';
import { typeLabel as activityTypeLabel } from './scheduleEmailUtils.js';

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

function orgDisplayName() {
  try {
    return store.getSettings()?.org_display_name || 'PMO CTSB';
  } catch {
    return 'PMO CTSB';
  }
}

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
  description,
  loggedBy,
}) {
  if (!configured || !transporter || !to) {
    if (!configured && !warnedMissingConfig) {
      warnedMissingConfig = true;
      console.warn('mailer: SMTP not configured, emails are disabled');
    }
    return { sent: false, reason: 'not_configured_or_missing_recipient' };
  }

  const { html, text, subject } = buildActivityNotificationEmail({
    recipientName,
    title,
    typeKey,
    typeLabel: activityTypeLabel(typeKey),
    location,
    startAt,
    endAt,
    projectName,
    description,
    loggedBy,
    orgName: orgDisplayName(),
  });

  await transporter.sendMail({
    from: smtpFrom,
    to,
    subject,
    text,
    html,
  });

  return { sent: true };
}

/** Send a period schedule digest to one recipient. */
export async function sendTeamScheduleEmail({
  to,
  recipientName,
  periodLabel,
  activities,
  customMessage,
  sentBy,
}) {
  if (!configured || !transporter || !to) {
    if (!configured && !warnedMissingConfig) {
      warnedMissingConfig = true;
      console.warn('mailer: SMTP not configured, emails are disabled');
    }
    return { sent: false, reason: 'not_configured_or_missing_recipient' };
  }

  const { html, text, subject } = buildTeamScheduleEmail({
    recipientName,
    periodLabel,
    activities,
    customMessage,
    sentBy,
    orgName: orgDisplayName(),
  });

  await transporter.sendMail({
    from: smtpFrom,
    to,
    subject,
    text,
    html,
  });

  return { sent: true };
}

export async function sendIssueAssignedEmail({
  to,
  personName,
  ticketNo,
  title,
  projectName,
  assignedBy,
}) {
  if (!configured || !transporter || !to) {
    if (!configured && !warnedMissingConfig) {
      warnedMissingConfig = true;
      console.warn('mailer: SMTP not configured, issue emails are disabled');
    }
    return { sent: false, reason: 'not_configured_or_missing_recipient' };
  }

  const subject = `PMO CTSB Helpdesk: ${ticketNo} — ${title}`;
  const text = [
    `Hi ${personName || 'team member'},`,
    '',
    'You have been assigned the following helpdesk issue:',
    '',
    `Ticket: ${ticketNo}`,
    `Title: ${title}`,
    projectName ? `Project: ${projectName}` : null,
    assignedBy ? `Assigned by: ${assignedBy}` : null,
    '',
    'Sign in to PMO CTSB → Helpdesk for details.',
  ].filter(Boolean).join('\n');

  await transporter.sendMail({ from: smtpFrom, to, subject, text });
  return { sent: true };
}

export async function sendTaskAssignedEmail({
  to,
  personName,
  taskName,
  projectName,
  assignedBy,
}) {
  if (!configured || !transporter || !to) {
    return { sent: false, reason: 'not_configured_or_missing_recipient' };
  }

  const subject = `PMO CTSB: Task assigned — ${taskName}`;
  const text = [
    `Hi ${personName || 'team member'},`,
    '',
    'You have been assigned the following task:',
    '',
    `Task: ${taskName}`,
    `Project: ${projectName || '—'}`,
    assignedBy ? `Updated by: ${assignedBy}` : null,
    '',
    'Review your project workspace in PMO CTSB.',
  ].filter(Boolean).join('\n');

  await transporter.sendMail({ from: smtpFrom, to, subject, text });
  return { sent: true };
}
