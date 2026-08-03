import { Router } from 'express';
import crypto from 'crypto';
import { store } from '../db/store.js';
import { idsInSameLogicalGroup } from '../lib/activityLogicalGroup.js';
import { isMailerConfigured, sendActivityLoggedEmail, sendActivityUpdatedEmail, sendActivityCancelledEmail, sendTeamScheduleEmail } from '../lib/mailer.js';
import { publicSmtpStatus } from '../lib/smtpConfig.js';
import { buildTeamScheduleEmail } from '../lib/emailTemplates.js';
import {
  groupActivitiesForScheduleEmail,
  resolveScheduleRecipients,
  formatEmailDateTime,
  extractEmailsFromText,
} from '../lib/scheduleEmailUtils.js';
import { canEditCalendarUser } from '../lib/permissions.js';
import {
  applyActorsToActivityRow,
  resolveActivityActors,
  stripActorEmbedFromDescription,
} from '../lib/activityActorEmbed.js';

export const activitiesRouter = Router();

const ALLOWED_TYPES = new Set(['meeting', 'outstation', 'other', 'uat', 'urs', 'fat', 'demo', 'training', 'go-live', 'tender']);

function requireCalendarEditor(req, res, next) {
  if (!canEditCalendarUser(req.user)) {
    return res.status(403).json({ error: 'Calendar edit access requires PMO or admin role' });
  }
  next();
}

function normalizeActivityType(type) {
  if (type === 'task') return 'outstation';
  if (ALLOWED_TYPES.has(String(type))) return String(type);
  return 'other';
}

/** Activities store `person_id` as app user id (for workload). Accept user id or team `people` id and normalize. */
function resolveActivityUserId(raw) {
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  if (store.findUserById(n)) return n;
  const person = store.people.find((p) => Number(p.id) === n);
  if (!person) return null;
  const em = String(person.email || '').trim().toLowerCase();
  if (em) {
    const u = store.findUserByEmail(em);
    if (u) return u.id;
  }
  const nm = String(person.name || '').trim().toLowerCase();
  if (nm) {
    const u = store.users.find((x) => String(x.name || '').trim().toLowerCase() === nm);
    if (u) return u.id;
  }
  return null;
}

function activityPersonName(storedId) {
  if (storedId == null) return null;
  const u = store.findUserById(storedId);
  if (u?.name) return u.name;
  const person = store.people.find((p) => Number(p.id) === Number(storedId));
  return person?.name ?? null;
}

function actorSnapshot(user) {
  const id = user?.id != null && Number.isFinite(Number(user.id)) ? Number(user.id) : null;
  const name = String(user?.name || user?.email || '').trim() || null;
  return { id, name };
}

function enrichActivityForClient(a) {
  const project = store.projects.find((p) => p.id === a.project_id);
  const actors = resolveActivityActors(a);
  const createdByName =
    actors.created_by_name
    || activityPersonName(actors.created_by_user_id)
    || null;
  const updatedByName =
    actors.updated_by_name
    || activityPersonName(actors.updated_by_user_id)
    || null;

  return {
    ...a,
    type: normalizeActivityType(a.type),
    person_name: activityPersonName(a.person_id),
    external_attendees: a.external_attendees != null ? String(a.external_attendees) : null,
    project_name: project?.name,
    // Never expose embed marker to clients as "notes".
    description: stripActorEmbedFromDescription(a.description) || null,
    created_by_name: createdByName,
    updated_by_name: updatedByName,
    created_by_user_id: actors.created_by_user_id,
    updated_by_user_id: actors.updated_by_user_id,
    created_at: actors.created_at || a.created_at || null,
    updated_at: actors.updated_at,
  };
}

/** Prefer earliest creator across a multi-assignee group before recreate. */
function inheritAuditFromGroup(groupRows, existing) {
  const rows = (groupRows || []).filter(Boolean);
  const seed = existing || rows[0] || {};
  let best = resolveActivityActors(seed);
  let created_at = best.created_at || seed.created_at || null;

  for (const r of rows) {
    const actors = resolveActivityActors(r);
    if (r.created_at && (!created_at || new Date(r.created_at) < new Date(created_at))) {
      created_at = r.created_at;
      best = {
        ...best,
        created_at,
        created_by_user_id: actors.created_by_user_id ?? best.created_by_user_id,
        created_by_name: actors.created_by_name || best.created_by_name,
      };
    }
    if (!best.created_by_name && actors.created_by_name) {
      best.created_by_name = actors.created_by_name;
      best.created_by_user_id = actors.created_by_user_id ?? best.created_by_user_id;
    }
  }

  return {
    created_at: created_at || new Date().toISOString(),
    created_by_user_id: best.created_by_user_id,
    created_by_name: best.created_by_name || activityPersonName(best.created_by_user_id) || null,
  };
}

function normalizeExternalAttendees(raw) {
  if (raw == null) return '';
  const s = String(raw).trim();
  if (!s) return '';
  return s.length > 2000 ? s.slice(0, 2000) : s;
}

/** Overlap: activity [start,end) vs [from, toExclusive). Supports legacy YYYY-MM-DD (inclusive `to`). */
function parseActivityRangeFilter(fromRaw, toRaw) {
  if (fromRaw == null || toRaw == null || fromRaw === '' || toRaw === '') return null;
  const fromStr = String(fromRaw).trim();
  const toStr = String(toRaw).trim();
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/;
  if (dateOnly.test(fromStr) && dateOnly.test(toStr)) {
    const [fy, fm, fd] = fromStr.split('-').map(Number);
    const [ty, tm, td] = toStr.split('-').map(Number);
    const fromMs = Date.UTC(fy, fm - 1, fd, 0, 0, 0, 0);
    const end = new Date(Date.UTC(ty, tm - 1, td));
    end.setUTCDate(end.getUTCDate() + 1);
    const toExclusive = end.getTime();
    if (toExclusive <= fromMs) return null;
    return { fromMs, toExclusive };
  }
  const fromMs = Date.parse(fromStr);
  const toExclusive = Date.parse(toStr);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toExclusive)) return null;
  if (toExclusive <= fromMs) return null;
  return { fromMs, toExclusive };
}

async function notifyActivityAssignee(uid, { title, typeKey, location, start_at, end_at, projectName, description, loggedBy, variant = 'scheduled' }) {
  const assignee = store.findUserById(uid);
  let recipientEmail = String(assignee?.email || '').trim();
  if (!recipientEmail && assignee?.name) {
    const pe = store.people.find(
      (p) => String(p.name || '').trim().toLowerCase() === String(assignee.name || '').trim().toLowerCase(),
    );
    recipientEmail = String(pe?.email || '').trim();
  }
  if (!recipientEmail) {
    return { sent: false, reason: 'no_email', to: null, name: assignee?.name || null };
  }
  if (!isMailerConfigured()) {
    return { sent: false, reason: 'smtp_not_configured', to: recipientEmail, name: assignee?.name || null };
  }
  const startLabel = formatEmailDateTime(start_at);
  const endLabel = formatEmailDateTime(end_at);
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
      startAt: startLabel,
      endAt: endLabel,
      projectName,
      description,
      loggedBy,
      cancelledBy: loggedBy,
      updatedBy: loggedBy,
    });
    return {
      sent: Boolean(result?.sent),
      reason: result?.reason || null,
      to: recipientEmail,
      name: assignee?.name || null,
    };
  } catch (e) {
    console.warn(`activities: failed to send notification email (${e.message})`);
    return { sent: false, reason: e.message || 'send_failed', to: recipientEmail, name: assignee?.name || null };
  }
}

async function notifyActivityGuests(external_attendees, payload) {
  if (!external_attendees) return [];
  if (!isMailerConfigured()) {
    return extractEmailsFromText(external_attendees).map((to) => ({
      sent: false,
      reason: 'smtp_not_configured',
      to,
      name: to.split('@')[0],
    }));
  }
  const guestEmails = extractEmailsFromText(external_attendees);
  const startLabel = formatEmailDateTime(payload.start_at);
  const endLabel = formatEmailDateTime(payload.end_at);
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
        startAt: startLabel,
        endAt: endLabel,
        projectName: payload.projectName,
        description: payload.description,
        loggedBy: payload.loggedBy,
        cancelledBy: payload.loggedBy,
        updatedBy: payload.loggedBy,
      });
      results.push({
        sent: Boolean(result?.sent),
        reason: result?.reason || null,
        to,
        name: to.split('@')[0],
      });
    } catch (e) {
      console.warn(`activities: failed to send guest email (${e.message})`);
      results.push({ sent: false, reason: e.message || 'send_failed', to, name: to.split('@')[0] });
    }
  }
  return results;
}

/** Await emails before responding — required on Vercel serverless or sends get killed. */
async function dispatchActivityNotifications({
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
}) {
  const uniqueUids = [...new Set((assigneeUids || []).filter((x) => x != null))];
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
  };
  const assigneeResults = [];
  for (const uid of uniqueUids) {
    assigneeResults.push(await notifyActivityAssignee(uid, payload));
  }
  const guestResults = await notifyActivityGuests(external_attendees, payload);
  const results = [...assigneeResults, ...guestResults];
  return {
    smtp_configured: isMailerConfigured(),
    variant,
    attempted: results.length,
    sent: results.filter((r) => r.sent).length,
    failed: results.filter((r) => !r.sent).length,
    recipients: results,
  };
}

activitiesRouter.get('/', async (req, res) => {
  try {
    await store.refreshActivitiesFromSupabase();
  } catch (e) {
    console.warn('activities GET: could not refresh from Supabase', e?.message || e);
  }
  const personId = req.query.person_id ? +req.query.person_id : null;
  const projectId = req.query.project_id ? +req.query.project_id : null;
  const from = req.query.from;
  const to = req.query.to;
  let rows = store.activities.map((a) => enrichActivityForClient(a));
  if (personId) rows = rows.filter(r => r.person_id === personId);
  if (projectId) rows = rows.filter(r => r.project_id === projectId);
  const range = parseActivityRangeFilter(from, to);
  if (range) {
    const { fromMs, toExclusive } = range;
    rows = rows.filter((r) => {
      const s = new Date(r.start_at).getTime();
      const e = new Date(r.end_at).getTime();
      return s < toExclusive && e > fromMs;
    });
  }
  rows.sort((a, b) => new Date(a.start_at) - new Date(b.start_at));
  res.json(rows);
});

function listActivitiesInRange(from, to) {
  const range = parseActivityRangeFilter(from, to);
  let rows = store.activities.map((a) => enrichActivityForClient(a));
  if (range) {
    const { fromMs, toExclusive } = range;
    rows = rows.filter((r) => {
      const s = new Date(r.start_at).getTime();
      const e = new Date(r.end_at).getTime();
      return s < toExclusive && e > fromMs;
    });
  }
  rows.sort((a, b) => new Date(a.start_at) - new Date(b.start_at));
  return rows;
}

function periodLabelFromRange(fromRaw, toRaw) {
  const fromStr = String(fromRaw || '').trim();
  const toStr = String(toRaw || '').trim();
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/;
  if (dateOnly.test(fromStr) && dateOnly.test(toStr)) {
    const [fy, fm, fd] = fromStr.split('-').map(Number);
    const [ty, tm, td] = toStr.split('-').map(Number);
    const fromD = new Date(fy, fm - 1, fd);
    const toD = new Date(ty, tm - 1, td);
    const sameMonth = fy === ty && fm === tm;
    if (sameMonth && fd === 1 && td === new Date(ty, tm, 0).getDate()) {
      return fromD.toLocaleDateString('en-MY', { month: 'long', year: 'numeric' });
    }
    return `${fromD.toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })} – ${toD.toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  }
  return `${fromStr} – ${toStr}`;
}

activitiesRouter.get('/mail-status', (req, res) => {
  res.json({ smtp_configured: isMailerConfigured(), ...publicSmtpStatus() });
});

activitiesRouter.get('/schedule-email/preview', requireCalendarEditor, (req, res) => {
  const from = req.query.from;
  const to = req.query.to;
  const mode = String(req.query.mode || 'team');
  const customEmails = String(req.query.emails || '')
    .split(/[,;]/)
    .map((x) => x.trim())
    .filter(Boolean);
  const message = String(req.query.message || '').trim();

  if (!from || !to) {
    return res.status(400).json({ error: 'from and to query parameters are required' });
  }

  const rawRows = listActivitiesInRange(from, to);
  const scheduleRows = groupActivitiesForScheduleEmail(rawRows);
  const periodLabel = periodLabelFromRange(from, to);
  const orgName = store.getSettings()?.org_display_name || 'PMO CTSB';
  const sentBy = req.user?.name || req.user?.email || '';

  const { html, text, subject } = buildTeamScheduleEmail({
    recipientName: 'Team',
    periodLabel,
    activities: scheduleRows,
    customMessage: message || undefined,
    sentBy,
    orgName,
  });

  const recipients = resolveScheduleRecipients(store, {
    mode,
    customEmails,
    activityRows: scheduleRows,
  });

  res.json({
    smtp_configured: isMailerConfigured(),
    subject,
    html,
    text,
    period_label: periodLabel,
    activity_count: scheduleRows.length,
    recipient_count: recipients.length,
    recipients,
  });
});

activitiesRouter.post('/schedule-email/send', requireCalendarEditor, async (req, res) => {
  if (!isMailerConfigured()) {
    return res.status(503).json({ error: 'SMTP is not configured on the server. Ask an admin to set SMTP_* in .env.' });
  }

  const { from, to, mode = 'team', emails = [], message } = req.body || {};
  if (!from || !to) {
    return res.status(400).json({ error: 'from and to are required' });
  }

  const rawRows = listActivitiesInRange(from, to);
  const scheduleRows = groupActivitiesForScheduleEmail(rawRows);
  const periodLabel = periodLabelFromRange(from, to);
  const sentBy = req.user?.name || req.user?.email || '';
  const customEmails = Array.isArray(emails) ? emails : String(emails || '').split(/[,;]/).map((x) => x.trim()).filter(Boolean);

  const recipients = resolveScheduleRecipients(store, {
    mode: String(mode),
    customEmails,
    activityRows: scheduleRows,
  });

  if (!recipients.length) {
    return res.status(400).json({
      error: 'No recipient emails found. Add emails on Team, or choose custom recipients.',
    });
  }

  const results = { sent: 0, failed: 0, recipients: [] };
  for (const toEmail of recipients) {
    const person =
      store.people.find((p) => String(p.email || '').trim().toLowerCase() === toEmail) ||
      store.users.find((u) => String(u.email || '').trim().toLowerCase() === toEmail);
    try {
      // eslint-disable-next-line no-await-in-loop
      const r = await sendTeamScheduleEmail({
        to: toEmail,
        recipientName: person?.name || toEmail.split('@')[0],
        periodLabel,
        activities: scheduleRows,
        customMessage: message || undefined,
        sentBy,
      });
      if (r.sent) {
        results.sent += 1;
        results.recipients.push({ email: toEmail, status: 'sent' });
      } else {
        results.failed += 1;
        results.recipients.push({ email: toEmail, status: 'skipped', reason: r.reason });
      }
    } catch (e) {
      results.failed += 1;
      results.recipients.push({ email: toEmail, status: 'failed', reason: e.message });
    }
  }

  store.appendAuditLog(req.user, {
    action: 'email',
    target_type: 'activity_schedule',
    target_id: null,
    summary: `Emailed team schedule (${periodLabel}) to ${results.sent} recipient(s)`,
    detail: {
      period_label: periodLabel,
      activity_count: scheduleRows.length,
      mode,
      sent: results.sent,
      failed: results.failed,
    },
  });

  res.json({
    ok: true,
    period_label: periodLabel,
    activity_count: scheduleRows.length,
    ...results,
  });
});

activitiesRouter.post('/:id/notify', requireCalendarEditor, async (req, res) => {
  if (!isMailerConfigured()) {
    return res.status(503).json({ error: 'SMTP is not configured on the server.' });
  }
  try {
    await store.refreshActivitiesFromSupabase();
  } catch (e) {
    console.warn('activities notify: could not refresh from Supabase', e?.message || e);
  }
  const id = +req.params.id;
  const existing = store.activities.find((a) => a.id === id);
  if (!existing) return res.status(404).json({ error: 'Activity not found' });

  const groupIds = idsInSameLogicalGroup(store.activities, id);
  const groupRows = groupIds
    .map((gid) => store.activities.find((a) => a.id === gid))
    .filter(Boolean);
  const project = store.projects.find((p) => p.id === existing.project_id);
  const loggedBy = req.user?.name || req.user?.email || '';
  const typeKey = normalizeActivityType(existing.type);
  const ext = String(existing.external_attendees || '').trim();
  const emailNotify = await dispatchActivityNotifications({
    assigneeUids: groupRows.map((row) => row.person_id),
    title: existing.title,
    typeKey,
    location: existing.location,
    start_at: existing.start_at,
    end_at: existing.end_at,
    projectName: project?.name || null,
    description: existing.description,
    loggedBy,
    external_attendees: ext,
  });

  res.json({
    ok: true,
    notified: emailNotify.sent,
    attempted: emailNotify.attempted,
    smtp_configured: emailNotify.smtp_configured,
    email_notify: emailNotify,
  });
});

activitiesRouter.post('/', requireCalendarEditor, async (req, res) => {
  const {
    person_id,
    person_ids,
    project_id,
    type,
    title,
    description,
    location,
    start_at,
    end_at,
    external_attendees: externalRaw,
    notify_email: notifyEmailRaw,
  } = req.body;
  const external_attendees = normalizeExternalAttendees(externalRaw);

  const rawPersonIds = Array.isArray(person_ids) && person_ids.length > 0
    ? person_ids
    : person_id !== undefined && person_id !== null && person_id !== ''
      ? [person_id]
      : [];

  if (!type || !title || !start_at || !end_at) {
    return res.status(400).json({ error: 'type, title, start_at, end_at are required' });
  }
  const loc = location != null ? String(location).trim() : '';
  if (!loc) {
    return res.status(400).json({ error: 'location is required' });
  }

  const uniquePersonIds = [...new Set(rawPersonIds.map((x) => Number(x)).filter(Number.isFinite))];
  if (!uniquePersonIds.length && !external_attendees) {
    return res.status(400).json({
      error: 'Select at least one person with an account, or enter guest names (no login required).',
    });
  }

  const resolvedUsers = [];
  for (const pid of uniquePersonIds) {
    const uid = resolveActivityUserId(pid);
    if (!uid) {
      return res.status(400).json({
        error:
          'Invalid person: use a system user id, or a team member id whose email matches a user account.',
      });
    }
    resolvedUsers.push(uid);
  }
  const uniqueResolved = [...new Set(resolvedUsers)];

  const normalizedType = normalizeActivityType(type);
  const activityGroupId = crypto.randomUUID();
  const created = [];
  const extForRow = external_attendees || null;
  const actor = actorSnapshot(req.user);
  const nowIso = new Date().toISOString();
  const actors = {
    created_at: nowIso,
    created_by_user_id: actor.id,
    created_by_name: actor.name,
    updated_by_user_id: actor.id,
    updated_by_name: actor.name,
    updated_at: nowIso,
  };

  if (uniqueResolved.length === 0) {
    const row = applyActorsToActivityRow({
      activity_group_id: activityGroupId,
      person_id: null,
      external_attendees,
      project_id: project_id || null,
      type: normalizedType,
      title,
      description: description || null,
      location: loc,
      start_at,
      end_at,
    }, actors);
    const id = store.addActivity(row);
    const a = store.activities.find((x) => x.id === id);
    if (a) created.push(a);
  } else {
    for (const uid of uniqueResolved) {
      const row = applyActorsToActivityRow({
        activity_group_id: activityGroupId,
        person_id: uid,
        external_attendees: extForRow,
        project_id: project_id || null,
        type: normalizedType,
        title,
        description: description || null,
        location: loc,
        start_at,
        end_at,
      }, actors);
      const id = store.addActivity(row);
      const a = store.activities.find((x) => x.id === id);
      if (a) created.push(a);
    }
  }

  const project = store.projects.find((p) => p.id === (project_id || null));
  store.appendAuditLog(req.user, {
    action: 'create',
    target_type: 'activity',
    target_id: created[0]?.id ?? null,
    summary: `Logged activity "${title}"`,
    detail: {
      person_count: created.length,
      person_names: created.map((a) => activityPersonName(a.person_id)).filter(Boolean),
      external_attendees: external_attendees || null,
      project_name: project?.name,
      activity_group_id: activityGroupId,
      created_by_name: actor.name,
      created_by_user_id: actor.id,
    },
  });
  try {
    await store.persistToSupabase();
  } catch (e) {
    console.error('activities POST persistToSupabase failed', e);
    return res.status(500).json({ error: e.message || 'Failed to save activity to database' });
  }

  const loggedBy = req.user?.name || req.user?.email || '';
  const shouldNotify = notifyEmailRaw !== false;
  let emailNotify = null;
  if (shouldNotify) {
    emailNotify = await dispatchActivityNotifications({
      assigneeUids: created.map((a) => a.person_id),
      title,
      typeKey: normalizedType,
      location: loc,
      start_at,
      end_at,
      projectName: project?.name || null,
      description: description || null,
      loggedBy,
      external_attendees,
    });
  }

  const responseRows = created.map((a) => enrichActivityForClient(a));
  const meta = {
    email_notify: emailNotify,
    notify_email_requested: shouldNotify,
  };
  if (responseRows.length === 1) return res.status(201).json({ ...responseRows[0], ...meta });
  return res.status(201).json({ activities: responseRows, ...meta });
});

activitiesRouter.put('/:id', requireCalendarEditor, async (req, res) => {
  try {
    await store.refreshActivitiesFromSupabase();
  } catch (e) {
    console.warn('activities PUT: could not refresh from Supabase', e?.message || e);
  }
  const {
    person_id,
    person_ids,
    project_id,
    type,
    title,
    description,
    location,
    start_at,
    end_at,
    external_attendees: externalRaw,
    notify_email: notifyEmailRaw,
  } = req.body;
  const id = +req.params.id;
  const existing = store.activities.find(a => a.id === id);
  if (!existing) return res.status(404).json({ error: 'Activity not found' });

  const nextLocation = location !== undefined ? String(location || '').trim() : (existing.location != null ? String(existing.location).trim() : '');
  if (!nextLocation) {
    return res.status(400).json({ error: 'location is required' });
  }

  const nextProjectId = project_id !== undefined ? project_id : existing.project_id;
  const nextType = type !== undefined ? normalizeActivityType(type) : normalizeActivityType(existing.type);
  const nextTitle = title ?? existing.title;
  const nextDescription = description ?? existing.description;
  const nextStart = start_at ?? existing.start_at;
  const nextEnd = end_at ?? existing.end_at;

  const nextExternal =
    externalRaw !== undefined
      ? normalizeExternalAttendees(externalRaw)
      : normalizeExternalAttendees(existing.external_attendees);

  const resolvedUids = [];
  if (Array.isArray(person_ids)) {
    for (const pid of person_ids) {
      const uid = resolveActivityUserId(pid);
      if (uid) resolvedUids.push(uid);
    }
  } else if (person_id !== undefined) {
    const resolved = resolveActivityUserId(person_id);
    if (!resolved) {
      return res.status(400).json({
        error:
          'Invalid person: use a system user id, or a team member id whose email matches a user account.',
      });
    }
    resolvedUids.push(resolved);
  } else {
    const peerRows = idsInSameLogicalGroup(store.activities, id)
      .map((pid) => store.activities.find((a) => a.id === pid))
      .filter(Boolean);
    peerRows.forEach((row) => {
      if (row.person_id != null) resolvedUids.push(row.person_id);
    });
  }

  const uniqueUids = [...new Set(resolvedUids)];
  if (uniqueUids.length === 0 && !nextExternal) {
    return res.status(400).json({ error: 'Select at least one valid assignee or enter guest names.' });
  }

  const loggedBy = req.user?.name || req.user?.email || '';
  const shouldNotify = notifyEmailRaw !== false;
  const activityGroupId = existing.activity_group_id || crypto.randomUUID();
  const previousGroupIds = idsInSameLogicalGroup(store.activities, id);
  const previousRows = previousGroupIds
    .map((aid) => store.activities.find((a) => a.id === aid))
    .filter(Boolean);
  const inherited = inheritAuditFromGroup(previousRows, existing);
  const actor = actorSnapshot(req.user);
  const nowIso = new Date().toISOString();
  const actors = {
    created_at: inherited.created_at,
    created_by_user_id: inherited.created_by_user_id ?? actor.id,
    created_by_name: inherited.created_by_name || actor.name,
    updated_by_user_id: actor.id,
    updated_by_name: actor.name,
    updated_at: nowIso,
  };
  await store.deleteActivityLogicalGroupByAnyMemberId(id);
  const createdRows = [];
  const project = store.projects.find(p => p.id === (nextProjectId || null));
  const extForRow = nextExternal || null;
  // Client notes never include the embed marker (stripped on GET); rebuild embed on save.
  const cleanDescription = stripActorEmbedFromDescription(nextDescription) || null;

  for (const uid of uniqueUids) {
    const prepared = applyActorsToActivityRow({
      activity_group_id: activityGroupId,
      person_id: uid,
      external_attendees: extForRow,
      project_id: nextProjectId || null,
      type: nextType,
      title: nextTitle,
      description: cleanDescription,
      location: nextLocation,
      start_at: nextStart,
      end_at: nextEnd,
    }, actors);
    const newId = store.addActivity(prepared);
    const row = store.activities.find(x => x.id === newId);
    createdRows.push(row);
  }

  if (uniqueUids.length === 0) {
    const prepared = applyActorsToActivityRow({
      activity_group_id: activityGroupId,
      person_id: null,
      external_attendees: nextExternal,
      project_id: nextProjectId || null,
      type: nextType,
      title: nextTitle,
      description: cleanDescription,
      location: nextLocation,
      start_at: nextStart,
      end_at: nextEnd,
    }, actors);
    const newId = store.addActivity(prepared);
    const row = store.activities.find((x) => x.id === newId);
    if (row) createdRows.push(row);
  }

  let emailNotify = null;
  if (shouldNotify) {
    emailNotify = await dispatchActivityNotifications({
      assigneeUids: uniqueUids,
      title: nextTitle,
      typeKey: nextType,
      location: nextLocation,
      start_at: nextStart,
      end_at: nextEnd,
      projectName: project?.name || null,
      description: nextDescription || null,
      loggedBy,
      external_attendees: extForRow,
      variant: 'updated',
    });
  }

  const firstNewId = createdRows[0]?.id ?? id;
  const assigneeNames = createdRows.map((r) => activityPersonName(r.person_id)).filter(Boolean);
  store.appendAuditLog(req.user, {
    action: 'update',
    target_type: 'activity',
    target_id: firstNewId,
    summary: `Updated activity "${nextTitle}"`,
    detail: {
      previous_activity_ids: previousGroupIds,
      new_activity_ids: createdRows.map((r) => r.id),
      person_names: assigneeNames,
      external_attendees: nextExternal || null,
      project_name: project?.name,
    },
  });

  try {
    await store.persistToSupabase();
  } catch (e) {
    console.error('activities PUT persistToSupabase failed', e);
    return res.status(500).json({ error: e.message || 'Failed to save activity to database' });
  }

  const first = createdRows[0];
  return res.json({
    ...enrichActivityForClient(first),
    split_into: createdRows.length > 1 ? createdRows.map((r) => ({
      id: r.id,
      person_id: r.person_id,
      person_name: activityPersonName(r.person_id),
    })) : null,
    replaced_id: id,
    email_notify: emailNotify,
    notify_email_requested: shouldNotify,
  });
});

activitiesRouter.delete('/:id', requireCalendarEditor, async (req, res) => {
  try {
    await store.refreshActivitiesFromSupabase();
  } catch (e) {
    console.warn('activities DELETE: could not refresh from Supabase', e?.message || e);
  }
  const id = +req.params.id;
  const existing = store.activities.find((a) => a.id === id);
  if (!existing) return res.status(404).json({ error: 'Activity not found' });

  const notifyRaw = req.query.notify_email ?? req.body?.notify_email;
  const shouldNotify = notifyRaw === undefined || notifyRaw === null || notifyRaw === ''
    ? true
    : !(notifyRaw === false || notifyRaw === 'false' || notifyRaw === 0 || notifyRaw === '0');

  const deletedIds = idsInSameLogicalGroup(store.activities, id);
  const groupRows = deletedIds
    .map((aid) => store.activities.find((a) => a.id === aid))
    .filter(Boolean);
  const assigneeUids = [...new Set(groupRows.map((r) => r.person_id).filter((x) => x != null))];
  const external_attendees = groupRows.map((r) => r.external_attendees).find((x) => x != null && String(x).trim())
    || existing.external_attendees
    || null;
  const project = store.projects.find((p) => p.id === existing.project_id);
  const cancelledBy = req.user?.name || req.user?.email || '';
  const cancelPayload = {
    title: existing.title,
    typeKey: normalizeActivityType(existing.type),
    location: existing.location,
    start_at: existing.start_at,
    end_at: existing.end_at,
    projectName: project?.name || null,
    description: existing.description || null,
  };

  // Delete from DB/memory first so the calendar clears even if email is slow/fails.
  const { deleted, deleted_ids: removedIds } = await store.deleteActivityLogicalGroupByAnyMemberId(id);
  if (deleted === 0) return res.status(404).json({ error: 'Activity not found' });

  let emailNotify = null;
  if (shouldNotify) {
    emailNotify = await dispatchActivityNotifications({
      assigneeUids,
      title: cancelPayload.title,
      typeKey: cancelPayload.typeKey,
      location: cancelPayload.location,
      start_at: cancelPayload.start_at,
      end_at: cancelPayload.end_at,
      projectName: cancelPayload.projectName,
      description: cancelPayload.description,
      loggedBy: cancelledBy,
      external_attendees,
      variant: 'cancelled',
    });
  }

  const suffix = deleted > 1 ? ` (${deleted} assignee rows)` : '';
  store.appendAuditLog(req.user, {
    action: 'cancel',
    target_type: 'activity',
    target_id: id,
    summary: `Cancelled activity "${existing.title}"${suffix}`,
    detail: {
      cancelled_activity_ids: deletedIds,
      notify_email: shouldNotify,
      email_notify: emailNotify
        ? { attempted: emailNotify.attempted, sent: emailNotify.sent, failed: emailNotify.failed }
        : null,
    },
  });
  try {
    await store.persistToSupabase();
  } catch (e) {
    console.error('activities DELETE persistToSupabase failed', e);
    return res.status(500).json({ error: e.message || 'Failed to save to database' });
  }
  // Final hard-delete so a concurrent upsert cannot leave the event on the calendar.
  const idsToPurge = [...new Set([...(removedIds || []), ...deletedIds].map(Number).filter(Number.isFinite))];
  try {
    await store.purgeActivityIdsFromSupabase(idsToPurge);
  } catch (e) {
    console.warn('activities DELETE final purge:', e?.message || e);
  }
  res.json({
    cancelled: true,
    id,
    title: existing.title,
    removed: deleted,
    notify_email_requested: shouldNotify,
    email_notify: emailNotify,
  });
});
