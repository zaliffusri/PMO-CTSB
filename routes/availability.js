import { Router } from 'express';
import { store } from '../db/store.js';
import { normalizeTaskStatus } from '../lib/taskStatus.js';

export const availabilityRouter = Router();

async function taskSummaryForPerson(personId, { assignments, projects, tasks } = {}) {
  if (personId == null) {
    return { new: 0, ongoing: 0, done: 0, notDone: 0 };
  }
  const projectAssignments = assignments || await store.listAssignments();
  const projectList = projects || await store.listProjects();
  const projectTasks = tasks || await store.listProjectTasks();
  const projectIds = new Set(
    projectAssignments
      .filter((a) => a.person_id === personId)
      .map((a) => a.project_id)
      .filter((pid) => {
        const pr = projectList.find((p) => p.id === pid);
        return pr?.status === 'active';
      }),
  );
  const counts = { new: 0, ongoing: 0, done: 0 };
  projectTasks.forEach((t) => {
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

/** Map team person id → users_app.id (prefer hard FK people.user_id). */
function userIdByPersonId(users, people) {
  const map = new Map();
  const userIds = new Set((users || []).map((u) => Number(u.id)));
  (people || []).forEach((pe) => {
    const uid = Number(pe.user_id);
    if (Number.isFinite(uid) && userIds.has(uid)) {
      map.set(pe.id, uid);
      return;
    }
    const byEmail = users.find(
      (u) => String(u.email || '').toLowerCase() === String(pe.email || '').toLowerCase(),
    );
    const byName = users.find(
      (u) => String(u.name || '').trim().toLowerCase() === String(pe.name || '').trim().toLowerCase(),
    );
    const matched = byEmail || byName;
    if (matched) map.set(pe.id, matched.id);
  });
  return map;
}

/** Match activities.person_id as people.id or legacy users_app.id. */
function activityMatchesPerson(activityPersonId, personId, userId) {
  const stored = Number(activityPersonId);
  if (!Number.isFinite(stored)) return false;
  if (Number(personId) === stored) return true;
  if (userId != null && Number(userId) === stored) return true;
  return false;
}

availabilityRouter.get('/workload', async (req, res) => {
  const from = req.query.from || new Date().toISOString().slice(0, 10);
  const to = req.query.to || from;
  const [people, usersRaw, projectAssignments, projects, activitiesAll, projectTasks] = await Promise.all([
    store.listPeople(),
    store.listUsers(),
    store.listAssignments(),
    store.listProjects(),
    store.listActivities(),
    store.listProjectTasks(),
  ]);
  const users = [...usersRaw].sort((a, b) => a.name.localeCompare(b.name));
  const personToUser = userIdByPersonId(users, people);
  const assignments = projectAssignments.filter((pa) => {
    const p = projects.find((pr) => pr.id === pa.project_id);
    return p?.status === 'active';
  });
  const activities = activitiesAll
    .filter((a) => a.end_at >= from && a.start_at <= to)
    .sort((a, b) => new Date(a.start_at) - new Date(b.start_at));

  const byUser = {};
  users.forEach((u) => {
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
  assignments.forEach((a) => {
    const uid = personToUser.get(a.person_id);
    if (uid == null || !byUser[uid]) return;
    const project = projects.find((p) => p.id === a.project_id);
    byUser[uid].projects.push({ name: project?.name, allocation: a.allocation_percent });
    byUser[uid].totalAllocation += a.allocation_percent;
  });
  const userIdToPersonId = new Map();
  personToUser.forEach((uid, pid) => {
    if (!userIdToPersonId.has(uid)) userIdToPersonId.set(uid, pid);
  });

  activities.forEach((a) => {
    let uid = null;
    if (byUser[a.person_id]) {
      uid = a.person_id; // legacy: activities.person_id stored users_app.id
    } else {
      const linkedUid = personToUser.get(a.person_id);
      if (linkedUid != null && byUser[linkedUid]) uid = linkedUid;
    }
    if (uid == null) return;
    const start = new Date(a.start_at).getTime();
    const end = new Date(a.end_at).getTime();
    const hours = (end - start) / (1000 * 60 * 60);
    byUser[uid].activities.push({
      type: a.type,
      title: a.title,
      location: a.location ?? null,
      start_at: a.start_at,
      end_at: a.end_at,
      hours,
    });
    byUser[uid].activityHours += hours;
  });

  const workload = await Promise.all(Object.values(byUser).map(async (p) => ({
    ...p,
    person_id: userIdToPersonId.get(p.id) ?? null,
    projectCount: p.projects.length,
    taskSummary: await taskSummaryForPerson(userIdToPersonId.get(p.id) ?? null, {
      assignments: projectAssignments,
      projects,
      tasks: projectTasks,
    }),
    availability: Math.max(0, 100 - p.totalAllocation),
    isOverloaded: p.totalAllocation > 100,
  })));

  res.json({ from, to, workload });
});

availabilityRouter.get('/check', async (req, res) => {
  const personId = +req.query.person_id;
  const from = req.query.from;
  const to = req.query.to;
  if (!personId) return res.status(400).json({ error: 'person_id is required' });

  const [people, users, projectAssignments, projects, activitiesAll, projectTasks] = await Promise.all([
    store.listPeople(),
    store.listUsers(),
    store.listAssignments(),
    store.listProjects(),
    store.listActivities(),
    store.listProjectTasks(),
  ]);

  const person = people.find((p) => p.id === personId);
  if (!person) return res.status(404).json({ error: 'Person not found' });

  const personToUser = userIdByPersonId(users, people);
  const userId = personToUser.get(personId) ?? null;
  const user = userId != null ? await store.findUserById(userId) : null;

  const personProjects = projectAssignments
    .filter((pa) => pa.person_id === personId)
    .map((pa) => {
      const proj = projects.find((p) => p.id === pa.project_id);
      return proj?.status === 'active' ? { ...pa, project_name: proj?.name } : null;
    })
    .filter(Boolean);
  const totalAllocation = personProjects.reduce((s, p) => s + (p.allocation_percent || 0), 0);

  let activities = [];
  if (from && to) {
    activities = activitiesAll
      .filter((a) => activityMatchesPerson(a.person_id, personId, userId) && a.end_at >= from && a.start_at <= to)
      .sort((a, b) => new Date(a.start_at) - new Date(b.start_at))
      .map((a) => {
        const proj = projects.find((p) => p.id === a.project_id);
        return { ...a, project_name: proj?.name };
      });
  }

  res.json({
    person: {
      id: person.id,
      name: person.name,
      email: person.email,
      role: person.role,
      user_id: userId,
    },
    user: user ? { id: user.id, name: user.name, email: user.email, role: user.role } : null,
    currentProjects: personProjects,
    totalAllocation,
    availabilityPercent: Math.max(0, 100 - totalAllocation),
    isOverloaded: totalAllocation > 100,
    activitiesInRange: activities,
    taskSummary: await taskSummaryForPerson(personId, {
      assignments: projectAssignments,
      projects,
      tasks: projectTasks,
    }),
  });
});
