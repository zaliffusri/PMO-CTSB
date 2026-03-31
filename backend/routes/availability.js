import { Router } from 'express';
import { store } from '../db/store.js';
import { normalizeTaskStatus } from '../lib/taskStatus.js';

export const availabilityRouter = Router();

function taskSummaryForPerson(personId) {
  if (personId == null) {
    return { new: 0, ongoing: 0, done: 0, notDone: 0 };
  }
  const projectIds = new Set(
    store.project_assignments
      .filter((a) => a.person_id === personId)
      .map((a) => a.project_id)
      .filter((pid) => {
        const pr = store.projects.find((p) => p.id === pid);
        return pr?.status === 'active';
      }),
  );
  const counts = { new: 0, ongoing: 0, done: 0 };
  store.project_tasks.forEach((t) => {
    if (t.task_kind === 'group') return;
    if (!projectIds.has(t.project_id)) return;
    if (t.assignee_id != null && t.assignee_id !== personId) return;
    const s = normalizeTaskStatus(t);
    counts[s]++;
  });
  return {
    ...counts,
    notDone: counts.new + counts.ongoing,
  };
}

/** Map team person id → user id (email match, then name match). */
function userIdByPersonId(users, people) {
  const map = new Map();
  users.forEach((u) => {
    const pe =
      people.find((p) => String(p.email || '').toLowerCase() === String(u.email || '').toLowerCase()) ||
      people.find((p) => String(p.name || '').trim().toLowerCase() === String(u.name || '').trim().toLowerCase());
    if (pe) map.set(pe.id, u.id);
  });
  return map;
}

availabilityRouter.get('/workload', (req, res) => {
  const from = req.query.from || new Date().toISOString().slice(0, 10);
  const to = req.query.to || from;
  const people = store.people;
  const users = [...store.users].sort((a, b) => a.name.localeCompare(b.name));
  const personToUser = userIdByPersonId(users, people);
  const assignments = store.project_assignments.filter(pa => {
    const p = store.projects.find(pr => pr.id === pa.project_id);
    return p?.status === 'active';
  });
  const activities = store.activities.filter(a => a.end_at >= from && a.start_at <= to).sort((a, b) => new Date(a.start_at) - new Date(b.start_at));

  const byUser = {};
  users.forEach(u => {
    byUser[u.id] = {
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      totalAllocation: 0,
      projects: [],
      activities: [],
      activityHours: 0,
    };
  });
  assignments.forEach(a => {
    const uid = personToUser.get(a.person_id);
    if (uid == null || !byUser[uid]) return;
    const project = store.projects.find(p => p.id === a.project_id);
    byUser[uid].projects.push({ name: project?.name, allocation: a.allocation_percent });
    byUser[uid].totalAllocation += a.allocation_percent;
  });
  activities.forEach(a => {
    if (!byUser[a.person_id]) return;
    const start = new Date(a.start_at).getTime();
    const end = new Date(a.end_at).getTime();
    const hours = (end - start) / (1000 * 60 * 60);
    byUser[a.person_id].activities.push({
      type: a.type,
      title: a.title,
      location: a.location ?? null,
      start_at: a.start_at,
      end_at: a.end_at,
      hours,
    });
    byUser[a.person_id].activityHours += hours;
  });

  const userIdToPersonId = new Map();
  personToUser.forEach((uid, pid) => {
    if (!userIdToPersonId.has(uid)) userIdToPersonId.set(uid, pid);
  });

  const workload = Object.values(byUser).map((p) => ({
    ...p,
    projectCount: p.projects.length,
    taskSummary: taskSummaryForPerson(userIdToPersonId.get(p.id) ?? null),
    availability: Math.max(0, 100 - p.totalAllocation),
    isOverloaded: p.totalAllocation > 100,
  }));

  res.json({ from, to, workload });
});

availabilityRouter.get('/check', (req, res) => {
  const personId = +req.query.person_id;
  const from = req.query.from;
  const to = req.query.to;
  if (!personId) return res.status(400).json({ error: 'person_id is required' });

  const person = store.people.find(p => p.id === personId);
  if (!person) return res.status(404).json({ error: 'Person not found' });

  const projects = store.project_assignments
    .filter(pa => pa.person_id === personId)
    .map(pa => {
      const proj = store.projects.find(p => p.id === pa.project_id);
      return proj?.status === 'active' ? { ...pa, project_name: proj?.name } : null;
    })
    .filter(Boolean);
  const totalAllocation = projects.reduce((s, p) => s + p.allocation_percent, 0);

  let activities = [];
  if (from && to) {
    activities = store.activities
      .filter(a => a.person_id === userId && a.end_at >= from && a.start_at <= to)
      .sort((a, b) => new Date(a.start_at) - new Date(b.start_at))
      .map(a => {
        const proj = store.projects.find(p => p.id === a.project_id);
        return { ...a, project_name: proj?.name };
      });
  }

  res.json({
    person: { id: user.id, name: user.name, email: user.email, role: user.role },
    currentProjects: projects,
    totalAllocation,
    availabilityPercent: Math.max(0, 100 - totalAllocation),
    isOverloaded: totalAllocation > 100,
    activitiesInRange: activities,
  });
});
