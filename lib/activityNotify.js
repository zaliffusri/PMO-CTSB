/**
 * Calendar activity assignment notifications (in-app bell + optional email/ICS).
 * Assignees are people.id; resolved to users_app.id via people.user_id.
 */
import { store } from '../db/store.js';
import {
  isMailerConfigured,
  sendActivityLoggedEmail,
  sendActivityUpdatedEmail,
  sendActivityCancelledEmail,
} from './mailer.js';
import { formatEmailScheduleWhen, extractEmailsFromText } from './scheduleEmailUtils.js';
import { notifyInApp, resolveAppUserId } from './notifyUser.js';
import { normalizeEmail } from './teamUserSync.js';

/** Map activities.person_id (people.id, or legacy users_app.id) → users_app.id */
export async function userIdFromActivityPersonId(storedPersonId, { people, users } = {}) {
  if (storedPersonId == null) return null;
  const n = Number(storedPersonId);
  if (!Number.isFinite(n)) return null;
  const peopleList = people || await store.listPeople();
  const usersList = users || await store.listUsers();
  const person = peopleList.find((p) => Number(p.id) === n);
  if (person?.user_id != null && Number.isFinite(Number(person.user_id))) {
    return Number(person.user_id);
  }
  if (person) {
    const email = normalizeEmail(person.email);
    if (email) {
      const byEmail = usersList.find((u) => normalizeEmail(u.email) === email && u.active !== false);
      if (byEmail) return Number(byEmail.id);
    }
  }
  if (usersList.some((u) => Number(u.id) === n)) return n;
  return resolveAppUserId(n);
}

async function resolveCalendarAttendees(assigneePersonIds, external_attendees) {
  const out = [];
  const seen = new Set();
  const [people, users] = await Promise.all([store.listPeople(), store.listUsers()]);
  for (const pid of [...new Set((assigneePersonIds || []).filter((x) => x != null))]) {
    const uid = await userIdFromActivityPersonId(pid, { people, users });
    const assignee = uid != null ? users.find((u) => Number(u.id) === Number(uid)) : null;
    const person = people.find((p) => Number(p.id) === Number(pid));
    const email = String(assignee?.email || person?.email || '').trim().toLowerCase();
    const name = assignee?.name || person?.name || null;
    if (!email || !email.includes('@') || seen.has(email)) continue;
    seen.add(email);
    out.push({ email, name: name || email.split('@')[0] });
  }
  for (const to of extractEmailsFromText(external_attendees)) {
    const email = String(to || '').trim().toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    out.push({ email, name: email.split('@')[0] });
  }
  return out;
}

async function resolveAssigneeEmail(storedPersonId) {
  const [people, users] = await Promise.all([store.listPeople(), store.listUsers()]);
  const uid = await userIdFromActivityPersonId(storedPersonId, { people, users });
  const assignee = uid != null ? users.find((u) => Number(u.id) === Number(uid)) : null;
  const person = people.find((p) => Number(p.id) === Number(storedPersonId));
  const recipientEmail = String(assignee?.email || person?.email || '').trim();
  return {
    assignee: assignee || (person ? { id: person.user_id, name: person.name, email: person.email } : null),
    email: recipientEmail || null,
    name: assignee?.name || person?.name || null,
  };
}

async function notifyActivityAssigneeEmail(personId, {
  title,
  typeKey,
  location,
  start_at,
  end_at,
  projectName,
  description,
  loggedBy,
  variant = 'scheduled',
  calendarUid = null,
  sequence = 0,
  attendees = [],
}) {
  const { assignee, email: recipientEmail } = await resolveAssigneeEmail(personId);
  if (!recipientEmail) {
    return { sent: false, reason: 'no_email', to: null, name: assignee?.name || null };
  }
  if (!(await isMailerConfigured())) {
    return { sent: false, reason: 'smtp_not_configured', to: recipientEmail, name: assignee?.name || null };
  }
  const whenLabel = formatEmailScheduleWhen(start_at, end_at);
  const sendFn =
    variant === 'cancelled'
      ? sendActivityCancelledEmail
      : variant === 'updated'
        ? sendActivityUpdatedEmail
        : sendActivityLoggedEmail;
  try {
    const result = await sendFn({
      to: recipientEmail,
      recipientName: assignee?.name,
      title,
      typeKey,
      location,
      startAt: whenLabel,
      endAt: '',
      whenLabel,
      startAtIso: start_at,
      endAtIso: end_at,
      projectName,
      description,
      loggedBy,
      cancelledBy: loggedBy,
      updatedBy: loggedBy,
      calendarUid,
      sequence,
      attendees,
    });
    return {
      sent: Boolean(result?.sent),
      reason: result?.reason || null,
      to: recipientEmail,
      name: assignee?.name || null,
    };
  } catch (e) {
    console.warn(`activityNotify: email failed (${e.message})`);
    return { sent: false, reason: e.message || 'send_failed', to: recipientEmail, name: assignee?.name || null };
  }
}

async function notifyActivityGuestsEmail(external_attendees, payload) {
  if (!external_attendees) return [];
  if (!(await isMailerConfigured())) {
    return extractEmailsFromText(external_attendees).map((to) => ({
      sent: false,
      reason: 'smtp_not_configured',
      to,
      name: to.split('@')[0],
    }));
  }
  const guestEmails = extractEmailsFromText(external_attendees);
  const whenLabel = formatEmailScheduleWhen(payload.start_at, payload.end_at);
  const variant = payload.variant || 'scheduled';
  const sendFn =
    variant === 'cancelled'
      ? sendActivityCancelledEmail
      : variant === 'updated'
        ? sendActivityUpdatedEmail
        : sendActivityLoggedEmail;
  const results = [];
  for (const to of guestEmails) {
    try {
      const result = await sendFn({
        to,
        recipientName: to.split('@')[0],
        title: payload.title,
        typeKey: payload.typeKey,
        location: payload.location,
        startAt: whenLabel,
        endAt: '',
        whenLabel,
        startAtIso: payload.start_at,
        endAtIso: payload.end_at,
        projectName: payload.projectName,
        description: payload.description,
        loggedBy: payload.loggedBy,
        cancelledBy: payload.loggedBy,
        updatedBy: payload.loggedBy,
        calendarUid: payload.calendarUid,
        sequence: payload.sequence || 0,
        attendees: payload.attendees || [],
      });
      results.push({
        sent: Boolean(result?.sent),
        reason: result?.reason || null,
        to,
        name: to.split('@')[0],
      });
    } catch (e) {
      console.warn(`activityNotify: guest email failed (${e.message})`);
      results.push({ sent: false, reason: e.message || 'send_failed', to, name: to.split('@')[0] });
    }
  }
  return results;
}

/**
 * In-app bell notifications for calendar assignees.
 * Always called on assign / update / cancel so the assignee sees it in the app.
 */
export async function notifyActivityAssigneesInApp({
  assigneePersonIds,
  title,
  location,
  start_at,
  end_at,
  projectName,
  loggedBy,
  variant = 'scheduled',
  activityId = null,
  excludeUserId = null,
}) {
  const uniqueIds = [...new Set((assigneePersonIds || []).filter((x) => x != null))];
  const whenLabel = formatEmailScheduleWhen(start_at, end_at);
  const link = activityId ? `/calendar?activity=${activityId}` : '/calendar';
  let inApp = 0;
  const notifiedUserIds = new Set();
  const errors = [];
  const exclude = excludeUserId != null ? Number(excludeUserId) : null;

  for (const personId of uniqueIds) {
    const userId = await userIdFromActivityPersonId(personId);
    if (!userId || notifiedUserIds.has(userId)) continue;
    if (exclude != null && userId === exclude) continue;
    notifiedUserIds.add(userId);

    const actor = String(loggedBy || '').trim();
    let notifTitle;
    let notifBody;
    if (variant === 'cancelled') {
      notifTitle = `Activity cancelled: ${title || 'Activity'}`;
      notifBody = [whenLabel, location, actor ? `By ${actor}` : null].filter(Boolean).join(' \u00B7 ');
    } else if (variant === 'updated') {
      notifTitle = `Activity updated: ${title || 'Activity'}`;
      notifBody = [whenLabel, location, projectName, actor ? `By ${actor}` : null].filter(Boolean).join(' \u00B7 ');
    } else {
      notifTitle = `Calendar assigned: ${title || 'Activity'}`;
      notifBody = [whenLabel, location, projectName, actor ? `By ${actor}` : null].filter(Boolean).join(' \u00B7 ');
    }

    try {
      const id = await notifyInApp({
        user_id: userId,
        type: variant === 'cancelled' ? 'activity_cancelled' : variant === 'updated' ? 'activity_updated' : 'activity_assigned',
        title: notifTitle,
        body: notifBody || null,
        link: variant === 'cancelled' ? '/calendar' : link,
        entity_type: 'activity',
        entity_id: activityId != null ? Number(activityId) : null,
      });
      if (id) inApp += 1;
      else errors.push(`user ${userId}: insert returned null`);
    } catch (e) {
      errors.push(`user ${userId}: ${e?.message || e}`);
    }
  }

  return { inApp, error: errors.length ? errors.join('; ') : null };
}

/**
 * Full calendar notification dispatch.
 * - In-app: on by default (assignment always notifies in the bell)
 * - Email/ICS: when sendEmail is true (notify checkbox)
 */
export async function dispatchActivityNotifications({
  assigneeUids,
  title,
  typeKey,
  location,
  start_at,
  end_at,
  projectName,
  description,
  loggedBy,
  external_attendees,
  variant = 'scheduled',
  calendarUid = null,
  sequence = 0,
  activityId = null,
  skipInApp = false,
  sendEmail = true,
  excludeUserId = null,
}) {
  const uniqueIds = [...new Set((assigneeUids || []).filter((x) => x != null))];

  let inApp = 0;
  let inAppError = null;
  if (!skipInApp) {
    const result = await notifyActivityAssigneesInApp({
      assigneePersonIds: uniqueIds,
      title,
      location,
      start_at,
      end_at,
      projectName,
      loggedBy,
      variant,
      activityId,
      excludeUserId,
    });
    inApp = result.inApp;
    inAppError = result.error;
  }

  // Cancel / quiet saves: in-app only — skip SMTP lookups and attendee email resolution.
  if (!sendEmail) {
    return {
      smtp_configured: null,
      variant,
      in_app: inApp,
      in_app_error: inAppError,
      attempted: 0,
      sent: 0,
      failed: 0,
      recipients: [],
    };
  }

  const attendees = await resolveCalendarAttendees(uniqueIds, external_attendees);
  const payload = {
    title,
    typeKey,
    location,
    start_at,
    end_at,
    projectName,
    description,
    loggedBy,
    variant,
    calendarUid,
    sequence,
    attendees,
  };
  const assigneeResults = [];
  for (const personId of uniqueIds) {
    assigneeResults.push(await notifyActivityAssigneeEmail(personId, payload));
  }
  const guestResults = await notifyActivityGuestsEmail(external_attendees, payload);
  const results = [...assigneeResults, ...guestResults];

  return {
    smtp_configured: await isMailerConfigured(),
    variant,
    in_app: inApp,
    in_app_error: inAppError,
    attempted: results.length,
    sent: results.filter((r) => r.sent).length,
    failed: results.filter((r) => !r.sent).length,
    recipients: results,
  };
}
