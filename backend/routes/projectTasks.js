import { Router } from 'express';
import { store } from '../db/store.js';
import { normalizeTaskStatus } from '../lib/taskStatus.js';

export const projectTasksRouter = Router();

function withTaskMeta(t) {
  const project = store.projects.find(p => p.id === t.project_id);
  return { ...t, status: normalizeTaskStatus(t), project_name: project?.name };
}

projectTasksRouter.get('/', (req, res) => {
  const projectId = req.query.project_id ? +req.query.project_id : null;
  let tasks = store.project_tasks.map(t => withTaskMeta(t));
  if (projectId) tasks = tasks.filter(t => t.project_id === projectId);
  tasks.sort((a, b) => a.project_id - b.project_id || (a.sort_order ?? 0) - (b.sort_order ?? 0));
  res.json(tasks);
});

projectTasksRouter.get('/gantt', (req, res) => {
  const from = req.query.from;
  const to = req.query.to;
  let tasks = store.project_tasks.map(t => withTaskMeta(t));
  if (from && to) {
    tasks = tasks.filter(t => {
      const taskStart = t.planned_start_date || t.actual_start_date;
      const taskEnd = t.planned_end_date || t.actual_end_date;
      if (!taskStart && !taskEnd) return true;
      const start = taskStart || taskEnd;
      const end = taskEnd || taskStart;
      return end >= from && start <= to;
    });
  }
  tasks.sort((a, b) => a.project_id - b.project_id || (a.sort_order ?? 0) - (b.sort_order ?? 0));
  res.json(tasks);
});

projectTasksRouter.post('/', (req, res) => {
  const { project_id, name, planned_start_date, planned_end_date, actual_start_date, actual_end_date, progress_percent, sort_order, status } = req.body;
  if (!project_id || !name) return res.status(400).json({ error: 'project_id and name are required' });
  const prog = progress_percent ?? 0;
  let st = status && ['new', 'ongoing', 'done'].includes(status) ? status : 'new';
  if (prog >= 100) st = 'done';
  const id = store.addProjectTask({
    project_id: +project_id,
    name,
    planned_start_date: planned_start_date || null,
    planned_end_date: planned_end_date || null,
    actual_start_date: actual_start_date || null,
    actual_end_date: actual_end_date || null,
    progress_percent: prog,
    sort_order: sort_order != null ? sort_order : undefined,
    status: st,
  });
  const task = store.project_tasks.find(t => t.id === id);
  res.status(201).json(withTaskMeta(task));
});

projectTasksRouter.put('/:id', (req, res) => {
  const id = +req.params.id;
  const existing = store.project_tasks.find(t => t.id === id);
  if (!existing) return res.status(404).json({ error: 'Task not found' });
  const { name, planned_start_date, planned_end_date, actual_start_date, actual_end_date, progress_percent, sort_order, status } = req.body;
  const baseStatus = normalizeTaskStatus(existing);
  let nextProgress = progress_percent !== undefined ? progress_percent : existing.progress_percent;
  let nextStatus = status !== undefined && ['new', 'ongoing', 'done'].includes(status) ? status : baseStatus;
  if (nextProgress >= 100) nextStatus = 'done';
  if (nextStatus === 'done' && nextProgress < 100) nextProgress = 100;
  store.updateProjectTask(id, {
    name: name ?? existing.name,
    planned_start_date: planned_start_date !== undefined ? planned_start_date : existing.planned_start_date,
    planned_end_date: planned_end_date !== undefined ? planned_end_date : existing.planned_end_date,
    actual_start_date: actual_start_date !== undefined ? actual_start_date : existing.actual_start_date,
    actual_end_date: actual_end_date !== undefined ? actual_end_date : existing.actual_end_date,
    progress_percent: nextProgress,
    sort_order: sort_order !== undefined ? sort_order : existing.sort_order,
    status: nextStatus,
  });
  const task = store.project_tasks.find(t => t.id === id);
  res.json(withTaskMeta(task));
});

projectTasksRouter.delete('/:id', (req, res) => {
  const id = +req.params.id;
  const existing = store.project_tasks.find(t => t.id === id);
  if (!existing) return res.status(404).json({ error: 'Task not found' });
  store.deleteProjectTask(id);
  res.status(204).send();
});
