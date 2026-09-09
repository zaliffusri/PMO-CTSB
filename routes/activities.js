import { Router } from 'express';
import crypto from 'crypto';
import { store } from '../db/store.js';
import { idsInSameLogicalGroup } from '../lib/activityLogicalGroup.js';
import { isMailerConfigured, sendTeamScheduleEmail } from '../lib/mailer.js';
import { publicSmtpStatus } from '../lib/smtpConfig.js';
import { buildTeamScheduleEmail } from '../lib/emailTemplates.js';
import {
  groupActivitiesForScheduleEmail,
  resolveScheduleRecipients,
} from '../lib/scheduleEmailUtils.js';
import { canEditCalendarUser } from '../lib/permissions.js';
import { normalizeEmail } from '../lib/teamUserSync.js';
import {
  applyActorsToActivityRow,
  resolveActivityActors,
  stripActorEmbedFromDescription,
} from '../lib/activityActorEmbed.js';
import { nextCalendarSequence } from '../lib/calendarInvite.js';
import { dispatchActivityNotifications } from '../lib/activityNotify.js';
import { validateBody } from '../middleware/validate.js';
import { createActivitySchema } from '../lib/validationSchemas.js';

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

/**
 * Resolve form/API ids to people.id (roster). Never store users_app.id on activities.
 * Accepts people.id or legacy users_app.id (mapped via people.user_id).
 */
async function resolveActivityPersonId(raw) {
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  const [people, users] = await Promise.all([store.listPeople(), store.listUsers()]);
  const activeUsers = (users || []).filter((u) => u.active !== false);
  const activeUserIds = new Set(activeUsers.map((u) => Number(u.id)));

  const byPeopleId = people.find((p) => Number(p.id) === n);
  if (byPeopleId) {
    const uid = Number(byPeopleId.user_id);
    if (Number.isFinite(uid) && activeUserIds.has(uid)) return byPeopleId.id;
    // Stale schema cache may omit user_id; allow roster id when email matches an active login.
    if (!Object.prototype.hasOwnProperty.call(byPeopleId, 'user_id')) {
      const email = normalizeEmail(byPeopleId.email);
      if (email && activeUsers.some((u) => normalizeEmail(u.email) === email)) {
        return byPeopleId.id;
      }
    }
    return null;
  }

  const byUserLink = people.find((p) => Number(p.user_id) === n);
  if (byUserLink && activeUserIds.has(n)) return byUserLink.id;

  // Legacy: client sent users_app.id; map via email when user_id column omitted from selects.
  const legacyUser = activeUsers.find((u) => Number(u.id) === n);
  if (legacyUser) {
    const email = normalizeEmail(legacyUser.email);
    if (email) {
      const byEmail = people.find((p) => normalizeEmail(p.email) === email);
      if (byEmail) return byEmail.id;
    }
  }

  return null;
}

async function activityPersonName(storedId, nameCache = null) {
  if (storedId == null) return null;
  const key = Number(storedId);
  if (nameCache && nameCache.has(key)) return nameCache.get(key);
  const people = await store.listPeople();
  const person = people.find((p) => Number(p.id) === key);
  if (person?.name) {
    if (nameCache) nameCache.set(key, person.name);
    return person.name;
  }
  const u = await store.findUserById(storedId);
  const name = u?.name ?? null;
  if (nameCache) nameCache.set(key, name);
  return name;
}

function actorSnapshot(user) {
  const id = user?.id != null && Number.isFinite(Number(user.id)) ? Number(user.id) : null;
  const name = String(user?.name || user?.email || '').trim() || null;
  return { id, name };
}

async function buildPersonNameCache() {
  const cache = new Map();
  const [users, people] = await Promise.all([store.listUsers(), store.listPeople()]);
  for (const p of people || []) {
    if (p?.id != null) cache.set(Number(p.id), p.name || null);
  }
  for (const u of users || []) {
    // Legacy activities may still store users_app.id in person_id
    if (u?.id != null && !cache.has(Number(u.id))) cache.set(Number(u.id), u.name || null);
  }
  return cache;
}

async function enrichActivityForClient(a, projects = null, nameCache = null) {
  const projectList = projects || await store.listProjects();
  const project = projectList.find((p) => p.id === a.project_id);
  const actors = resolveActivityActors(a);
  const createdByName =
    actors.created_by_name
    || await activityPersonName(actors.created_by_user_id, nameCache)
    || null;
  const updatedByName =
    actors.updated_by_name
    || await activityPersonName(actors.updated_by_user_id, nameCache)
    || null;

  return {
    ...a,
    type: normalizeActivityType(a.type),
    person_name: await activityPersonName(a.person_id, nameCache),
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
async function inheritAuditFromGroup(groupRows, existing) {
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
    created_by_name: best.created_by_name || await activityPersonName(best.created_by_user_id) || null,
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

activitiesRouter.get('/', async (req, res) => {
  // DB-first range query — do not refresh the full activities snapshot into memory.
  const personId = req.query.person_id ? +req.query.person_id : null;
  const projectId = req.query.project_id ? +req.query.project_id : null;
  const from = req.query.from;
  const to = req.query.to;
  const range = parseActivityRangeFilter(from, to);

  const [activities, projects, nameCache] = await Promise.all([
    store.listActivitiesOverlapping({
      fromMs: range?.fromMs ?? null,
      toExclusive: range?.toExclusive ?? null,
      personId: Number.isFinite(personId) ? personId : null,
      projectId: Number.isFinite(projectId) ? projectId : null,
    }),
    store.listProjects(),
    buildPersonNameCache(),
  ]);

  const rows = await Promise.all(
    activities.map((a) => enrichActivityForClient(a, projects, nameCache)),
  );
  res.json(rows);
});

async function listActivitiesInRange(from, to) {
  const range = parseActivityRangeFilter(from, to);
  const [activities, projects, nameCache] = await Promise.all([
    store.listActivitiesOverlapping({
      fromMs: range?.fromMs ?? null,
      toExclusive: range?.toExclusive ?? null,
    }),
    store.listProjects(),
    buildPersonNameCache(),
  ]);
  return Promise.all(activities.map((a) => enrichActivityForClient(a, projects, nameCache)));
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

activitiesRouter.get('/mail-status', async (req, res) => {
  res.json({ smtp_configured: await isMailerConfigured(), ...(await publicSmtpStatus()) });
});

activitiesRouter.get('/schedule-email/preview', requireCalendarEditor, async (req, res) => {
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

  const rawRows = await listActivitiesInRange(from, to);
  const scheduleRows = groupActivitiesForScheduleEmail(rawRows);
  const periodLabel = periodLabelFromRange(from, to);
  const settings = await store.getSettings();
  const orgName = settings?.org_display_name || 'PMO CTSB';
  const sentBy = req.user?.name || req.user?.email || '';

  const { html, text, subject } = buildTeamScheduleEmail({
    recipientName: 'Team',
    periodLabel,
    activities: scheduleRows,
    customMessage: message || undefined,
    sentBy,
    orgName,
  });

  const recipients = await resolveScheduleRecipients(store, {
    mode,
    customEmails,
    activityRows: scheduleRows,
  });

  res.json({
    smtp_configured: await isMailerConfigured(),
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
  if (!(await isMailerConfigured())) {
    return res.status(503).json({ error: 'SMTP is not configured on the server. Ask an admin to set SMTP_* in .env.' });
  }

  const { from, to, mode = 'team', emails = [], message } = req.body || {};
  if (!from || !to) {
    return res.status(400).json({ error: 'from and to are required' });
  }

  const rawRows = await listActivitiesInRange(from, to);
  const scheduleRows = groupActivitiesForScheduleEmail(rawRows);
  const periodLabel = periodLabelFromRange(from, to);
  const sentBy = req.user?.name || req.user?.email || '';
  const customEmails = Array.isArray(emails) ? emails : String(emails || '').split(/[,;]/).map((x) => x.trim()).filter(Boolean);

  const recipients = await resolveScheduleRecipients(store, {
    mode: String(mode),
    customEmails,
    activityRows: scheduleRows,
  });

  if (!recipients.length) {
    return res.status(400).json({
      error: 'No recipient emails found. Add emails on Team, or choose custom recipients.',
    });
  }

  const [people, users] = await Promise.all([store.listPeople(), store.listUsers()]);
  const results = { sent: 0, failed: 0, recipients: [] };
  for (const toEmail of recipients) {
    const person =
      people.find((p) => String(p.email || '').trim().toLowerCase() === toEmail) ||
      users.find((u) => String(u.email || '').trim().toLowerCase() === toEmail);
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

  await store.appendAuditLog(req.user, {
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
  if (!(await isMailerConfigured())) {
    return res.status(503).json({ error: 'SMTP is not configured on the server.' });
  }
  try {
    await store.refreshActivitiesFromSupabase();
  } catch (e) {
    console.warn('activities notify: could not refresh from Supabase', e?.message || e);
  }
  const id = +req.params.id;
  const [activities, projects] = await Promise.all([
    store.listActivities(),
    store.listProjects(),
  ]);
  const existing = activities.find((a) => a.id === id);
  if (!existing) return res.status(404).json({ error: 'Activity not found' });

  const groupIds = idsInSameLogicalGroup(activities, id);
  const groupRows = groupIds
    .map((gid) => activities.find((a) => a.id === gid))
    .filter(Boolean);
  const project = projects.find((p) => p.id === existing.project_id);
  const loggedBy = req.user?.name || req.user?.email || '';
  const typeKey = normalizeActivityType(existing.type);
  const ext = String(existing.external_attendees || '').trim();
  // Manual resend is email-only (assignees already got in-app on create/update).
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
    calendarUid: existing.activity_group_id || `activity-${existing.id}`,
    sequence: nextCalendarSequence('update'),
    activityId: existing.id,
    skipInApp: true,
    sendEmail: true,
  });

  res.json({
    ok: true,
    notified: emailNotify.sent,
    attempted: emailNotify.attempted,
    smtp_configured: emailNotify.smtp_configured,
    email_notify: emailNotify,
  });
});

activitiesRouter.post('/', requireCalendarEditor, validateBody(createActivitySchema), async (req, res) => {
  try {
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

  const resolvedPeopleIds = [];
  for (const pid of uniquePersonIds) {
    const personId = await resolveActivityPersonId(pid);
    if (!personId) {
      return res.status(400).json({
        error:
          'Invalid person: select a team roster member linked to an active login (Team → Sync from users).',
      });
    }
    resolvedPeopleIds.push(personId);
  }
  const uniqueResolved = [...new Set(resolvedPeopleIds)];

  const normalizedType = normalizeActivityType(type);
  const activityGroupId = crypto.randomUUID();
  const createdIds = [];
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
    const id = await store.addActivity(row);
    createdIds.push(id);
  } else {
    for (const personId of uniqueResolved) {
      const row = applyActorsToActivityRow({
        activity_group_id: activityGroupId,
        person_id: personId,
        external_attendees: extForRow,
        project_id: project_id || null,
        type: normalizedType,
        title,
        description: description || null,
        location: loc,
        start_at,
        end_at,
      }, actors);
      const id = await store.addActivity(row);
      createdIds.push(id);
    }
  }

  const [createdRows, projects] = await Promise.all([
    store.listActivitiesByIds(createdIds),
    store.listProjects(),
  ]);
  const byId = new Map(createdRows.map((a) => [Number(a.id), a]));
  const created = createdIds.map((id) => byId.get(Number(id))).filter(Boolean);
  if (!created.length) {
    return res.status(500).json({
      error: 'Activity was created but could not be reloaded. Refresh the calendar and check the new entry.',
    });
  }
  const project = projects.find((p) => p.id === (project_id || null));
  const personNames = [];
  for (const a of created) {
    const name = await activityPersonName(a.person_id);
    if (name) personNames.push(name);
  }
  await store.appendAuditLog(req.user, {
    action: 'create',
    target_type: 'activity',
    target_id: created[0]?.id ?? null,
    summary: `Logged activity "${title}"`,
    detail: {
      person_count: created.length,
      person_names: personNames,
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
  // In-app only on save — calendar invite emails are sent via detail "Resend invite", not the log form.
  let emailNotify = {
    smtp_configured: await isMailerConfigured(),
    variant: 'scheduled',
    in_app: 0,
    attempted: 0,
    sent: 0,
    failed: 0,
    recipients: [],
  };
  try {
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
      calendarUid: activityGroupId,
      sequence: nextCalendarSequence('create'),
      activityId: created[0]?.id ?? null,
      sendEmail: false,
    });
  } catch (notifyErr) {
    console.error('activities POST notify failed', notifyErr);
    emailNotify = {
      ...emailNotify,
      in_app_error: notifyErr?.message || String(notifyErr),
    };
  }

  const responseRows = await Promise.all(created.map((a) => enrichActivityForClient(a, projects)));
  const meta = {
    email_notify: emailNotify,
    notify_email_requested: false,
  };
  if (responseRows.length === 1) return res.status(201).json({ ...responseRows[0], ...meta });
  return res.status(201).json({ activities: responseRows, ...meta });
  } catch (e) {
    console.error('activities POST failed', e);
    return res.status(500).json({
      error: e?.message || 'Failed to save activity',
    });
  }
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
  } = req.body;
  const id = +req.params.id;
  let activities = await store.listActivities();
  const existing = activities.find((a) => a.id === id);
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

  const resolvedPeopleIds = [];
  if (Array.isArray(person_ids)) {
    for (const pid of person_ids) {
      const personId = await resolveActivityPersonId(pid);
      if (personId) resolvedPeopleIds.push(personId);
    }
  } else if (person_id !== undefined) {
    const resolved = await resolveActivityPersonId(person_id);
    if (!resolved) {
      return res.status(400).json({
        error:
          'Invalid person: select a team roster member linked to an active login (Team → Sync from users).',
      });
    }
    resolvedPeopleIds.push(resolved);
  } else {
    const peerRows = idsInSameLogicalGroup(activities, id)
      .map((pid) => activities.find((a) => a.id === pid))
      .filter(Boolean);
    for (const row of peerRows) {
      if (row.person_id == null) continue;
      const personId = await resolveActivityPersonId(row.person_id);
      if (personId) resolvedPeopleIds.push(personId);
    }
  }

  const uniquePeopleIds = [...new Set(resolvedPeopleIds)];
  if (uniquePeopleIds.length === 0 && !nextExternal) {
    return res.status(400).json({ error: 'Select at least one valid assignee or enter guest names.' });
  }

  const loggedBy = req.user?.name || req.user?.email || '';
  const activityGroupId = existing.activity_group_id || crypto.randomUUID();
  const previousGroupIds = idsInSameLogicalGroup(activities, id);
  const previousRows = previousGroupIds
    .map((aid) => activities.find((a) => a.id === aid))
    .filter(Boolean);
  const inherited = await inheritAuditFromGroup(previousRows, existing);
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
  const createdIds = [];
  const projects = await store.listProjects();
  const project = projects.find((p) => p.id === (nextProjectId || null));
  const extForRow = nextExternal || null;
  // Client notes never include the embed marker (stripped on GET); rebuild embed on save.
  const cleanDescription = stripActorEmbedFromDescription(nextDescription) || null;

  for (const personId of uniquePeopleIds) {
    const prepared = applyActorsToActivityRow({
      activity_group_id: activityGroupId,
      person_id: personId,
      external_attendees: extForRow,
      project_id: nextProjectId || null,
      type: nextType,
      title: nextTitle,
      description: cleanDescription,
      location: nextLocation,
      start_at: nextStart,
      end_at: nextEnd,
    }, actors);
    const newId = await store.addActivity(prepared);
    createdIds.push(newId);
  }

  if (uniquePeopleIds.length === 0) {
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
    const newId = await store.addActivity(prepared);
    createdIds.push(newId);
  }

  activities = await store.listActivities();
  const createdRows = createdIds.map((newId) => activities.find((x) => x.id === newId)).filter(Boolean);

  // In-app only on save — calendar invite emails are sent via detail "Resend invite", not the log form.
  let emailNotify = {
    smtp_configured: await isMailerConfigured(),
    variant: 'updated',
    in_app: 0,
    attempted: 0,
    sent: 0,
    failed: 0,
    recipients: [],
  };
  try {
    emailNotify = await dispatchActivityNotifications({
      assigneeUids: uniquePeopleIds,
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
      calendarUid: activityGroupId,
      sequence: nextCalendarSequence('update'),
      activityId: createdRows[0]?.id ?? id,
      sendEmail: false,
    });
  } catch (notifyErr) {
    console.error('activities PUT notify failed', notifyErr);
    emailNotify = {
      ...emailNotify,
      in_app_error: notifyErr?.message || String(notifyErr),
    };
  }

  const firstNewId = createdRows[0]?.id ?? id;
  const assigneeNames = [];
  for (const r of createdRows) {
    const name = await activityPersonName(r.person_id);
    if (name) assigneeNames.push(name);
  }
  await store.appendAuditLog(req.user, {
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
  const splitInto = createdRows.length > 1
    ? await Promise.all(createdRows.map(async (r) => ({
      id: r.id,
      person_id: r.person_id,
      person_name: await activityPersonName(r.person_id),
    })))
    : null;
  return res.json({
    ...await enrichActivityForClient(first, projects),
    split_into: splitInto,
    replaced_id: id,
    email_notify: emailNotify,
    notify_email_requested: false,
  });
});

activitiesRouter.delete('/:id', requireCalendarEditor, async (req, res) => {
  try {
    await store.refreshActivitiesFromSupabase();
  } catch (e) {
    console.warn('activities DELETE: could not refresh from Supabase', e?.message || e);
  }
  const id = +req.params.id;
  const [activities, projects] = await Promise.all([
    store.listActivities(),
    store.listProjects(),
  ]);
  const existing = activities.find((a) => a.id === id);
  if (!existing) return res.status(404).json({ error: 'Activity not found' });

  const notifyRaw = req.query.notify_email ?? req.body?.notify_email;
  const shouldNotify = notifyRaw === undefined || notifyRaw === null || notifyRaw === ''
    ? true
    : !(notifyRaw === false || notifyRaw === 'false' || notifyRaw === 0 || notifyRaw === '0');

  const deletedIds = idsInSameLogicalGroup(activities, id);
  const groupRows = deletedIds
    .map((aid) => activities.find((a) => a.id === aid))
    .filter(Boolean);
  const assigneeUids = [...new Set(groupRows.map((r) => r.person_id).filter((x) => x != null))];
  const external_attendees = groupRows.map((r) => r.external_attendees).find((x) => x != null && String(x).trim())
    || existing.external_attendees
    || null;
  const project = projects.find((p) => p.id === existing.project_id);
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

  // Durable cancel: purge DB + memory first (skip sync queue), notify, audit.
  // Do NOT full-persist afterward — a stale upsert snapshot can resurrect rows.
  const { deleted, deleted_ids: removedIds } = await store.deleteActivityLogicalGroupByAnyMemberId(id, {
    skipSave: true,
  });
  if (deleted === 0) return res.status(404).json({ error: 'Activity not found' });

  const idsToPurge = [...new Set([...(removedIds || []), ...deletedIds].map(Number).filter(Number.isFinite))];
  try {
    await store.purgeActivityIdsFromSupabase(idsToPurge);
  } catch (e) {
    console.warn('activities DELETE early purge:', e?.message || e);
  }

  const calendarUid = existing.activity_group_id || `activity-${id}`;

  let emailNotify = {
    smtp_configured: await isMailerConfigured(),
    variant: 'cancelled',
    in_app: 0,
    attempted: 0,
    sent: 0,
    failed: 0,
    recipients: [],
  };
  try {
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
      calendarUid,
      sequence: nextCalendarSequence('cancel'),
      activityId: id,
      sendEmail: shouldNotify,
    });
  } catch (notifyErr) {
    console.error('activities DELETE notify failed', notifyErr);
    emailNotify = {
      ...emailNotify,
      in_app_error: notifyErr?.message || String(notifyErr),
    };
  }

  const suffix = deleted > 1 ? ` (${deleted} assignee rows)` : '';
  await store.appendAuditLog(req.user, {
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
  // Final hard-delete in case a concurrent upsert raced during notify/audit.
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
