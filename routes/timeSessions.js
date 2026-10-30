import { Router } from 'express';
import { store } from '../db/store.js';
import { canCreateProject, personIdForUser } from '../lib/permissions.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

export const timeSessionsRouter = Router();

async function resolveActorPersonId(user) {
  const people = await store.listPeople();
  return personIdForUser(user, people);
}

async function enrichSession(session) {
  if (!session) return null;
  const [tasks, projects, people] = await Promise.all([
    store.listProjectTasks(),
    store.listProjects(),
    store.listPeople(),
  ]);
  const task = tasks.find((t) => Number(t.id) === Number(session.task_id));
  const project = projects.find((p) => Number(p.id) === Number(session.project_id));
  const person = people.find((p) => Number(p.id) === Number(session.person_id));
  const elapsed_minutes = session.ended_at
    ? (session.minutes ?? 0)
    : store.elapsedMinutesFromStart(session.started_at);
  return {
    ...session,
    elapsed_minutes,
    elapsed_hours: store.hoursFromMinutes(elapsed_minutes),
    task_name: task?.name || null,
    task_status: task?.status || null,
    assignee_id: task?.assignee_id ?? null,
    project_name: project?.name || null,
    person_name: person?.name || null,
    is_open: session.ended_at == null,
  };
}

function canControlTimer(user, task, actorPersonId) {
  if (!user || !task) return false;
  if (canCreateProject(user)) return true;
  if (actorPersonId == null) return false;
  return Number(task.assignee_id) === Number(actorPersonId);
}

/** GET /api/time-sessions/active — current user's open timer (if any). */
timeSessionsRouter.get('/active', asyncHandler(async (req, res) => {
  const personId = await resolveActorPersonId(req.user);
  if (personId == null) return res.json(null);
  const open = await store.findOpenTimeSessionForPerson(personId);
  if (!open) return res.json(null);
  res.json(await enrichSession(open));
}));

/** GET /api/time-sessions/task/:taskId — session history for a task. */
timeSessionsRouter.get('/task/:taskId', asyncHandler(async (req, res) => {
  const taskId = +req.params.taskId;
  if (!Number.isFinite(taskId)) return res.status(400).json({ error: 'Invalid task id' });
  const rows = await store.listTimeSessions({ task_id: taskId });
  const enriched = await Promise.all(rows.map((r) => enrichSession(r)));
  res.json(enriched);
}));

/**
 * POST /api/time-sessions/start
 * body: { task_id, switch?: boolean }
 */
timeSessionsRouter.post('/start', asyncHandler(async (req, res) => {
  const taskId = +req.body?.task_id;
  if (!Number.isFinite(taskId)) return res.status(400).json({ error: 'task_id is required' });

  const tasks = await store.listProjectTasks();
  const task = tasks.find((t) => Number(t.id) === taskId);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  if (task.task_kind === 'group') {
    return res.status(400).json({ error: 'Cannot time a task group — start a leaf task' });
  }

  const actorPersonId = await resolveActorPersonId(req.user);
  if (actorPersonId == null) {
    return res.status(403).json({ error: 'Your account is not linked to a team member. Ask an admin to link people.user_id.' });
  }
  if (!canControlTimer(req.user, task, actorPersonId)) {
    return res.status(403).json({ error: 'Only the task assignee (or PMO/admin) can start this timer' });
  }

  const open = await store.findOpenTimeSessionForPerson(actorPersonId);
  if (open) {
    if (Number(open.task_id) === taskId) {
      return res.json({
        session: await enrichSession(open),
        switched_from: null,
        already_running: true,
      });
    }
    if (!req.body?.switch) {
      const conflict = await enrichSession(open);
      return res.status(409).json({
        error: 'You already have a timer running on another task',
        code: 'TIMER_CONFLICT',
        active: conflict,
      });
    }
    const stopped = await store.stopTimeSession(open.id);
    const session = await store.createTimeSession({
      task_id: taskId,
      person_id: actorPersonId,
      project_id: task.project_id,
    });
    return res.status(201).json({
      session: await enrichSession(session),
      switched_from: await enrichSession(stopped.session),
      hours_added_to_previous: stopped.hoursAdded,
      previous_task: stopped.task
        ? { id: stopped.task.id, actual_hours: stopped.task.actual_hours }
        : null,
    });
  }

  const session = await store.createTimeSession({
    task_id: taskId,
    person_id: actorPersonId,
    project_id: task.project_id,
  });
  res.status(201).json({
    session: await enrichSession(session),
    switched_from: null,
  });
}));

/**
 * POST /api/time-sessions/stop
 * body: { task_id? } — stop active session (optionally must match task_id)
 */
timeSessionsRouter.post('/stop', asyncHandler(async (req, res) => {
  const actorPersonId = await resolveActorPersonId(req.user);
  if (actorPersonId == null) {
    return res.status(403).json({ error: 'Your account is not linked to a team member' });
  }

  const open = await store.findOpenTimeSessionForPerson(actorPersonId);
  if (!open) return res.status(404).json({ error: 'No active timer' });

  const taskIdFilter = req.body?.task_id != null && req.body.task_id !== ''
    ? +req.body.task_id
    : null;
  if (taskIdFilter != null && Number(open.task_id) !== taskIdFilter) {
    return res.status(400).json({ error: 'Active timer is on a different task' });
  }

  // Owner of the open session can always stop; PMO/admin can stop any.
  if (Number(open.person_id) !== Number(actorPersonId) && !canCreateProject(req.user)) {
    return res.status(403).json({ error: 'Not allowed to stop this timer' });
  }

  const result = await store.stopTimeSession(open.id);
  res.json({
    session: await enrichSession(result.session),
    minutes: result.minutes,
    hours_added: result.hoursAdded,
    task: result.task
      ? { id: result.task.id, actual_hours: result.task.actual_hours, name: result.task.name }
      : null,
  });
}));
