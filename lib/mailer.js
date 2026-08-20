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
  parseEmailAddress,
} from './calendarInvite.js';

let warnedMissingConfig = false;
let cachedKey = '';
let cachedTransporter = null;
let cachedFrom = '';

async function getTransport() {
  const cfg = await resolveSmtpConfig();
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
  const transportOpts = useGmailPreset
    ? {
        service: 'gmail',
        auth: { user: cfg.user, pass: cfg.pass },
      }
    : {
        host: cfg.host || 'smtp.office365.com',
        port: cfg.port || 587,
        secure: Boolean(cfg.secure),
        requireTLS: cfg.requireTLS !== false && !(cfg.secure),
        auth: cfg.user && cfg.pass ? { user: cfg.user, pass: cfg.pass } : undefined,
        tls: { ciphers: 'TLSv1.2', minVersion: 'TLSv1.2' },
      };

  cachedTransporter = nodemailer.createTransport(transportOpts);
  cachedKey = key;
  cachedFrom = cfg.from;
  return { configured: true, transporter: cachedTransporter, from: cachedFrom };
}

export async function isMailerConfigured() {
  return (await resolveSmtpConfig()).configured;
}

export function invalidateMailerCache() {
  cachedKey = '';
  cachedTransporter = null;
  cachedFrom = '';
}

async function orgDisplayName() {
  try {
    const s = await store.getSettings();
    return s?.org_display_name || 'PMO CTSB';
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
  const { configured, transporter, from } = await getTransport();
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
  whenLabel,
  startAtIso,
  endAtIso,
  projectName,
  description,
  loggedBy,
  updatedBy,
  cancelledBy,
  calendarUid,
  sequence = 0,
  attendees = [],
  skipIcs = false,
  variant = 'scheduled',
}) {
  const { configured, transporter, from } = await getTransport();
  if (!configured || !transporter || !to) {
    if (!configured && !warnedMissingConfig) {
      warnedMissingConfig = true;
      console.warn('mailer: SMTP not configured, emails are disabled');
    }
    return { sent: false, reason: 'not_configured_or_missing_recipient' };
  }

  const whenStart = startAtIso || startAt;
  const whenEnd = endAtIso || endAt;
  const isCancel = variant === 'cancelled';
  const googleCalendarUrl = isCancel
    ? null
    : buildGoogleCalendarUrl({
        title,
        description,
        location,
        startAt: whenStart,
        endAt: whenEnd,
      });
  const outlookCalendarUrl = isCancel
    ? null
    : buildOutlookCalendarUrl({
        title,
        description,
        location,
        startAt: whenStart,
        endAt: whenEnd,
      });

  const orgName = await orgDisplayName();
  const common = {
    recipientName,
    title,
    typeKey,
    typeLabel: activityTypeLabel(typeKey),
    location,
    startAt,
    endAt,
    whenLabel,
    projectName,
    description,
    loggedBy,
    updatedBy,
    cancelledBy,
    orgName,
    googleCalendarUrl,
    outlookCalendarUrl,
  };

  const built =
    isCancel
      ? buildActivityCancelledEmail(common)
      : variant === 'updated'
        ? buildActivityUpdatedEmail(common)
        : buildActivityNotificationEmail(common);

  const organizerEmail = parseEmailAddress(from) || from;
  const uid = calendarUid || `activity-${Date.now()}`;
  const icsOpts = {
    title,
    description,
    location,
    startAt: whenStart,
    endAt: whenEnd,
    calendarUid: uid,
    sequence,
    organizerEmail,
    organizerName: orgName,
    attendeeEmail: to,
    attendeeName: recipientName,
    attendees,
  };

  // Cancel: send a REQUEST update that renames the meeting to "Canceled: …"
  // so Teams/Outlook show it as cancelled (Gmail SMTP often ignores METHOD:CANCEL).
  // Then send a METHOD:CANCEL follow-up to try removing it entirely.
  // When Microsoft Graph already synced this recipient, skip ICS to avoid duplicates.
  if (isCancel) {
    if (skipIcs) {
      await transporter.sendMail({
        from,
        to,
        subject: `Canceled: ${title || 'Activity'}`,
        text: built.text,
        html: built.html,
      });
      return { sent: true };
    }

    const updateIcs = buildActivityIcs({
      ...icsOpts,
      method: 'request',
      markAsCanceled: true,
      sequence: Math.max(1, Number(sequence) || 1),
    });
    const cancelIcs = buildActivityIcs({
      ...icsOpts,
      method: 'cancel',
      markAsCanceled: false,
      sequence: Math.max(2, (Number(sequence) || 1) + 1),
    });

    if (updateIcs) {
      await transporter.sendMail({
        from,
        to,
        subject: `Canceled: ${title || 'Activity'}`,
        text: built.text,
        html: built.html,
        headers: { 'Content-Class': 'urn:content-classes:calendarmessage' },
        icalEvent: {
          filename: 'invite.ics',
          method: 'REQUEST',
          content: Buffer.from(updateIcs, 'utf8'),
        },
      });
    }

    if (cancelIcs) {
      try {
        await transporter.sendMail({
          from,
          to,
          subject: `Canceled: ${title || 'Activity'}`,
          text: [
            `The activity "${title || 'Activity'}" was cancelled in PMO CTSB.`,
            'This message removes it from your Outlook / Teams calendar.',
          ].join('\n'),
          headers: { 'Content-Class': 'urn:content-classes:calendarmessage' },
          icalEvent: {
            filename: 'invite.ics',
            method: 'CANCEL',
            content: Buffer.from(cancelIcs, 'utf8'),
          },
        });
      } catch (e) {
        console.warn(`mailer: cancel MIME follow-up failed (${e.message})`);
      }
    }

    return { sent: true };
  }

  const ics = skipIcs
    ? null
    : buildActivityIcs({
        ...icsOpts,
        method: 'request',
      });

  const mail = {
    from,
    to,
    subject: built.subject,
    text: built.text,
    html: built.html,
    headers: {
      'Content-Class': 'urn:content-classes:calendarmessage',
    },
  };

  if (ics) {
    mail.icalEvent = {
      filename: 'invite.ics',
      method: 'REQUEST',
      content: Buffer.from(ics, 'utf8'),
    };
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
  const { configured, transporter, from } = await getTransport();
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
    orgName: await orgDisplayName(),
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
  const { configured, transporter, from } = await getTransport();
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
  const { configured, transporter, from } = await getTransport();
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
  const { configured, transporter, from } = await getTransport();
  if (!configured || !transporter || !to) {
    return { sent: false, reason: 'not_configured_or_missing_recipient' };
  }
  await transporter.sendMail({ from, to, subject, text });
  return { sent: true };
}
