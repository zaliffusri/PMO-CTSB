import { Router } from 'express';
import crypto from 'crypto';
import { store } from '../db/store.js';
import { idsInSameLogicalGroup } from '../lib/activityLogicalGroup.js';
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

function notifyActivityAssignee(uid, { title, typeKey, location, start_at, end_at, projectName, loggedBy }) {
  const assignee = store.findUserById(uid);
  let recipientEmail = String(assignee?.email || '').trim();
  if (!recipientEmail && assignee?.name) {
    const pe = store.people.find(
      (p) => String(p.name || '').trim().toLowerCase() === String(assignee.name || '').trim().toLowerCase(),
    );
    recipientEmail = String(pe?.email || '').trim();
  }
  if (recipientEmail && isMailerConfigured()) {
    sendActivityLoggedEmail({
      to: recipientEmail,
      recipientName: assignee?.name,
      title,
      typeKey,
      location,
      startAt: start_at,
      endAt: end_at,
      projectName,
      loggedBy,
    }).catch((e) => {
      console.warn(`activities: failed to send notification email (${e.message})`);
    });
  }
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
  const activityGroupId = crypto.randomUUID();
  const created = [];
  for (const uid of resolvedUsers) {
    const id = store.addActivity({
      activity_group_id: activityGroupId,
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

  const loggedBy = req.user?.name || req.user?.email || '';
  created.forEach((a) => {
    notifyActivityAssignee(a.person_id, {
      title,
      typeKey: normalizedType,
      location: loc,
      start_at,
      end_at,
      projectName: project?.name || null,
      loggedBy,
    });
  });

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
  try {
    await store.refreshActivitiesFromSupabase();
  } catch (e) {
    console.warn('activities PUT: could not refresh from Supabase', e?.message || e);
  }
  const { person_id, person_ids, project_id, type, title, description, location, start_at, end_at } = req.body;
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

  const resolvedUids = [];
  if (Array.isArray(person_ids) && person_ids.length > 0) {
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
    resolvedUids.push(existing.person_id);
  }

  const uniqueUids = [...new Set(resolvedUids)];
  if (uniqueUids.length === 0) {
    return res.status(400).json({ error: 'Select at least one valid assignee.' });
  }

  const loggedBy = req.user?.name || req.user?.email || '';
  const activityGroupId = existing.activity_group_id || crypto.randomUUID();
  const previousGroupIds = idsInSameLogicalGroup(store.activities, id);
  await store.deleteActivityLogicalGroupByAnyMemberId(id);
  const createdRows = [];
  const project = store.projects.find(p => p.id === (nextProjectId || null));
  for (const uid of uniqueUids) {
    const newId = store.addActivity({
      activity_group_id: activityGroupId,
      person_id: uid,
      project_id: nextProjectId || null,
      type: nextType,
      title: nextTitle,
      description: nextDescription || null,
      location: nextLocation,
      start_at: nextStart,
      end_at: nextEnd,
    });
    const row = store.activities.find(x => x.id === newId);
    createdRows.push(row);
    notifyActivityAssignee(uid, {
      title: nextTitle,
      typeKey: nextType,
      location: nextLocation,
      start_at: nextStart,
      end_at: nextEnd,
      projectName: project?.name || null,
      loggedBy,
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
    ...first,
    type: normalizeActivityType(first.type),
    person_name: activityPersonName(first.person_id),
    project_name: project?.name,
    split_into: createdRows.length > 1 ? createdRows.map((r) => ({
      id: r.id,
      person_id: r.person_id,
      person_name: activityPersonName(r.person_id),
    })) : null,
    replaced_id: id,
  });
});

activitiesRouter.delete('/:id', async (req, res) => {
  try {
    await store.refreshActivitiesFromSupabase();
  } catch (e) {
    console.warn('activities DELETE: could not refresh from Supabase', e?.message || e);
  }
  const id = +req.params.id;
  const existing = store.activities.find((a) => a.id === id);
  if (!existing) return res.status(404).json({ error: 'Activity not found' });
  const deletedIds = idsInSameLogicalGroup(store.activities, id);
  const { deleted } = await store.deleteActivityLogicalGroupByAnyMemberId(id);
  if (deleted === 0) return res.status(404).json({ error: 'Activity not found' });
  const suffix = deleted > 1 ? ` (${deleted} assignee rows)` : '';
  store.appendAuditLog(req.user, {
    action: 'delete',
    target_type: 'activity',
    target_id: id,
    summary: `Deleted activity "${existing.title}"${suffix}`,
    detail: { deleted_activity_ids: deletedIds },
  });
  try {
    await store.persistToSupabase();
  } catch (e) {
    console.error('activities DELETE persistToSupabase failed', e);
    return res.status(500).json({ error: e.message || 'Failed to save to database' });
  }
  res.status(204).send();
});
