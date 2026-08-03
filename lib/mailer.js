import nodemailer from 'nodemailer';
import {
  buildActivityNotificationEmail,
  buildActivityUpdatedEmail,
  buildActivityCancelledEmail,
  buildTeamScheduleEmail,
} from './emailTemplates.js';
import { store } from '../db/store.js';
import { typeLabel as activityTypeLabel } from './scheduleEmailUtils.js';
import { resolveSmtpConfig } from './smtpConfig.js';
import {
  buildActivityIcs,
  buildGoogleCalendarUrl,
  buildOutlookCalendarUrl,
} from './calendarInvite.js';

let warnedMissingConfig = false;
let cachedKey = '';
let cachedTransporter = null;
let cachedFrom = '';

function getTransport() {
  const cfg = resolveSmtpConfig();
  if (!cfg.configured) {
    cachedKey = '';
    cachedTransporter = null;
    cachedFrom = '';
    return { configured: false, transporter: null, from: '' };
  }

  const key = [
    cfg.source,
    cfg.service,
    cfg.host,
    cfg.port,
    cfg.user,
    cfg.pass,
    cfg.from,
    cfg.secure ? '1' : '0',
  ].join('|');

  if (cachedTransporter && cachedKey === key) {
    return { configured: true, transporter: cachedTransporter, from: cachedFrom };
  }

  const useGmailPreset = cfg.service === 'gmail';
  cachedTransporter = nodemailer.createTransport(
    useGmailPreset
      ? {
          service: 'gmail',
          auth: { user: cfg.user, pass: cfg.pass },
        }
      : {
          host: cfg.host,
          port: cfg.port || 587,
          secure: cfg.secure,
          auth: cfg.user && cfg.pass ? { user: cfg.user, pass: cfg.pass } : undefined,
        },
  );
  cachedKey = key;
  cachedFrom = cfg.from;
  return { configured: true, transporter: cachedTransporter, from: cachedFrom };
}

export function isMailerConfigured() {
  return resolveSmtpConfig().configured;
}

export function invalidateMailerCache() {
  cachedKey = '';
  cachedTransporter = null;
  cachedFrom = '';
}

function orgDisplayName() {
  try {
    return store.getSettings()?.org_display_name || 'PMO CTSB';
  } catch {
    return 'PMO CTSB';
  }
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
  const { configured, transporter, from } = getTransport();
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
    from,
    to,
    subject,
    text,
  });

  return { sent: true };
}

/**
 * Notify the person an activity was logged for them (Calendar / API).
 */
export async function sendActivityLoggedEmail(opts) {
  return sendActivityCalendarEmail({ ...opts, variant: 'scheduled' });
}

/**
 * Notify recipients that a calendar activity was updated (e.g. new end date / more days).
 */
export async function sendActivityUpdatedEmail(opts) {
  return sendActivityCalendarEmail({ ...opts, variant: 'updated' });
}

/**
 * Notify recipients that a calendar activity was cancelled.
 */
export async function sendActivityCancelledEmail(opts) {
  return sendActivityCalendarEmail({ ...opts, variant: 'cancelled' });
}

async function sendActivityCalendarEmail({
  to,
  recipientName,
  title,
  typeKey,
  location,
  startAt,
  endAt,
  startAtIso,
  endAtIso,
  projectName,
  description,
  loggedBy,
  updatedBy,
  cancelledBy,
  calendarUid,
  sequence = 0,
  variant = 'scheduled',
}) {
  const { configured, transporter, from } = getTransport();
  if (!configured || !transporter || !to) {
    if (!configured && !warnedMissingConfig) {
      warnedMissingConfig = true;
      console.warn('mailer: SMTP not configured, emails are disabled');
    }
    return { sent: false, reason: 'not_configured_or_missing_recipient' };
  }

  const whenStart = startAtIso || startAt;
  const whenEnd = endAtIso || endAt;
  const googleCalendarUrl =
    variant === 'cancelled'
      ? null
      : buildGoogleCalendarUrl({
          title,
          description,
          location,
          startAt: whenStart,
          endAt: whenEnd,
        });
  const outlookCalendarUrl =
    variant === 'cancelled'
      ? null
      : buildOutlookCalendarUrl({
          title,
          description,
          location,
          startAt: whenStart,
          endAt: whenEnd,
        });

  const common = {
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
    updatedBy,
    cancelledBy,
    orgName: orgDisplayName(),
    googleCalendarUrl,
    outlookCalendarUrl,
  };

  const built =
    variant === 'cancelled'
      ? buildActivityCancelledEmail(common)
      : variant === 'updated'
        ? buildActivityUpdatedEmail(common)
        : buildActivityNotificationEmail(common);

  const ics = buildActivityIcs({
    title,
    description,
    location,
    startAt: whenStart,
    endAt: whenEnd,
    calendarUid: calendarUid || `activity-${Date.now()}`,
    sequence,
    method: variant === 'cancelled' ? 'cancel' : 'request',
    organizerEmail: from,
    organizerName: orgDisplayName(),
    attendeeEmail: to,
    attendeeName: recipientName,
  });

  const mail = {
    from,
    to,
    subject: built.subject,
    text: built.text,
    html: built.html,
  };

  if (ics) {
    mail.icalEvent = {
      filename: variant === 'cancelled' ? 'cancel.ics' : 'invite.ics',
      method: variant === 'cancelled' ? 'CANCEL' : 'REQUEST',
      content: ics,
    };
    mail.attachments = [
      {
        filename: variant === 'cancelled' ? 'PMO-CTSB-cancel.ics' : 'PMO-CTSB-invite.ics',
        content: ics,
        contentType: 'text/calendar; charset=UTF-8',
      },
    ];
  }

  await transporter.sendMail(mail);
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
  const { configured, transporter, from } = getTransport();
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
    from,
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
  const { configured, transporter, from } = getTransport();
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
    'A helpdesk ticket was assigned to you.',
    `Ticket: ${ticketNo}`,
    `Title: ${title}`,
    projectName ? `Project: ${projectName}` : null,
    assignedBy ? `Assigned by: ${assignedBy}` : null,
    '',
    'Please check PMO CTSB Helpdesk.',
  ]
    .filter(Boolean)
    .join('\n');

  await transporter.sendMail({ from, to, subject, text });
  return { sent: true };
}

export async function sendTaskAssignedEmail({
  to,
  personName,
  taskName,
  projectName,
  assignedBy,
}) {
  const { configured, transporter, from } = getTransport();
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

  await transporter.sendMail({ from, to, subject, text });
  return { sent: true };
}

export async function sendGenericNotificationEmail({ to, subject, text }) {
  const { configured, transporter, from } = getTransport();
  if (!configured || !transporter || !to) {
    return { sent: false, reason: 'not_configured_or_missing_recipient' };
  }
  await transporter.sendMail({ from, to, subject, text });
  return { sent: true };
}
