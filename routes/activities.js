import { Router } from 'express';
import { store } from '../db/store.js';
import { isMailerConfigured, sendActivityLoggedEmail } from '../lib/mailer.js';

export const activitiesRouter = Router();

const ALLOWED_TYPES = new Set(['meeting', 'outstation', 'other', 'uat', 'urs', 'fat', 'demo', 'training', 'go-live', 'tender']);

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
  const u = store.findUserById(storedId);
  if (u?.name) return u.name;
  const person = store.people.find((p) => Number(p.id) === Number(storedId));
  return person?.name ?? null;
}

activitiesRouter.get('/', (req, res) => {
  const personId = req.query.person_id ? +req.query.person_id : null;
  const projectId = req.query.project_id ? +req.query.project_id : null;
  const from = req.query.from;
  const to = req.query.to;
  let rows = store.activities.map(a => {
    const project = store.projects.find(p => p.id === a.project_id);
    return {
      ...a,
      type: normalizeActivityType(a.type),
      person_name: activityPersonName(a.person_id),
      project_name: project?.name,
    };
  });
  if (personId) rows = rows.filter(r => r.person_id === personId);
  if (projectId) rows = rows.filter(r => r.project_id === projectId);
  if (from) rows = rows.filter(r => r.end_at >= from);
  if (to) rows = rows.filter(r => r.start_at <= to);
  rows.sort((a, b) => new Date(a.start_at) - new Date(b.start_at));
  res.json(rows);
});

activitiesRouter.post('/', async (req, res) => {
  const { person_id, person_ids, project_id, type, title, description, location, start_at, end_at } = req.body;
  const rawPersonIds = Array.isArray(person_ids) && person_ids.length > 0 ? person_ids : [person_id];
  if (!type || !title || !start_at || !end_at) {
    return res.status(400).json({ error: 'type, title, start_at, end_at are required' });
  }
  if (!rawPersonIds.length) return res.status(400).json({ error: 'Select at least one person' });
  const loc = location != null ? String(location).trim() : '';
  if (!loc) {
    return res.status(400).json({ error: 'location is required' });
  }
  const uniquePersonIds = [...new Set(rawPersonIds.map((x) => Number(x)).filter(Number.isFinite))];
  if (!uniquePersonIds.length) {
    return res.status(400).json({ error: 'Invalid person list' });
  }
  const resolvedUsers = uniquePersonIds.map((pid) => resolveActivityUserId(pid));
  if (resolvedUsers.some((uid) => !uid)) {
    return res.status(400).json({
      error:
        'Invalid person: use a system user id, or a team member id whose email matches a user account.',
    });
  }
  const normalizedType = normalizeActivityType(type);
  const created = [];
  for (const uid of resolvedUsers) {
    const id = store.addActivity({
      person_id: uid,
      project_id: project_id || null,
      type: normalizedType,
      title,
      description: description || null,
      location: loc,
      start_at,
      end_at,
    });
    const a = store.activities.find((x) => x.id === id);
    if (a) created.push(a);
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
      project_name: project?.name,
    },
  });
  try {
    await store.persistToSupabase();
  } catch (e) {
    console.error('activities POST persistToSupabase failed', e);
    return res.status(500).json({ error: e.message || 'Failed to save activity to database' });
  }

  if (isMailerConfigured()) {
    created.forEach((a) => {
      const assignee = store.findUserById(a.person_id);
      let recipientEmail = String(assignee?.email || '').trim();
      if (!recipientEmail && assignee?.name) {
        const pe = store.people.find(
          (p) => String(p.name || '').trim().toLowerCase() === String(assignee.name || '').trim().toLowerCase(),
        );
        recipientEmail = String(pe?.email || '').trim();
      }
      if (!recipientEmail) return;
      sendActivityLoggedEmail({
        to: recipientEmail,
        recipientName: assignee?.name,
        title,
        typeKey: normalizedType,
        location: loc,
        startAt: start_at,
        endAt: end_at,
        projectName: project?.name || null,
        loggedBy: req.user?.name || req.user?.email || '',
      }).catch((e) => {
        console.warn(`activities: failed to send notification email (${e.message})`);
      });
    });
  }

  const responseRows = created.map((a) => ({
    ...a,
    type: normalizeActivityType(a.type),
    person_name: activityPersonName(a.person_id),
    project_name: project?.name,
  }));
  if (responseRows.length === 1) return res.status(201).json(responseRows[0]);
  return res.status(201).json(responseRows);
});

activitiesRouter.put('/:id', async (req, res) => {
  const { person_id, project_id, type, title, description, location, start_at, end_at } = req.body;
  const id = +req.params.id;
  const existing = store.activities.find(a => a.id === id);
  if (!existing) return res.status(404).json({ error: 'Activity not found' });
  let nextPersonId = existing.person_id;
  if (person_id !== undefined) {
    const resolved = resolveActivityUserId(person_id);
    if (!resolved) {
      return res.status(400).json({
        error:
          'Invalid person: use a system user id, or a team member id whose email matches a user account.',
      });
    }
    nextPersonId = resolved;
  }
  const nextLocation = location !== undefined ? String(location || '').trim() : (existing.location != null ? String(existing.location).trim() : '');
  if (!nextLocation) {
    return res.status(400).json({ error: 'location is required' });
  }
  store.updateActivity(id, {
    person_id: nextPersonId,
    project_id: project_id !== undefined ? project_id : existing.project_id,
    type: type !== undefined ? normalizeActivityType(type) : normalizeActivityType(existing.type),
    title: title ?? existing.title,
    description: description ?? existing.description,
    location: nextLocation,
    start_at: start_at ?? existing.start_at,
    end_at: end_at ?? existing.end_at,
  });
  const a = store.activities.find(x => x.id === id);
  const project = store.projects.find(p => p.id === a.project_id);
  try {
    await store.persistToSupabase();
  } catch (e) {
    console.error('activities PUT persistToSupabase failed', e);
    return res.status(500).json({ error: e.message || 'Failed to save activity to database' });
  }
  res.json({
    ...a,
    type: normalizeActivityType(a.type),
    person_name: activityPersonName(a.person_id),
    project_name: project?.name,
  });
});

activitiesRouter.delete('/:id', async (req, res) => {
  const id = +req.params.id;
  const existing = store.activities.find(a => a.id === id);
  if (!existing) return res.status(404).json({ error: 'Activity not found' });
  await store.deleteActivity(id);
  store.appendAuditLog(req.user, {
    action: 'delete',
    target_type: 'activity',
    target_id: id,
    summary: `Deleted activity "${existing.title}"`,
  });
  try {
    await store.persistToSupabase();
  } catch (e) {
    console.error('activities DELETE persistToSupabase failed', e);
    return res.status(500).json({ error: e.message || 'Failed to save to database' });
  }
  res.status(204).send();
});
