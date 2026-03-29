import { Router } from 'express';
import { store } from '../db/store.js';

export const projectTasksRouter = Router();

projectTasksRouter.get('/', (req, res) => {
  const projectId = req.query.project_id ? +req.query.project_id : null;
  let tasks = store.project_tasks.map(t => {
    const project = store.projects.find(p => p.id === t.project_id);
    return { ...t, project_name: project?.name };
  });
  if (projectId) tasks = tasks.filter(t => t.project_id === projectId);
  tasks.sort((a, b) => a.project_id - b.project_id || (a.sort_order ?? 0) - (b.sort_order ?? 0));
  res.json(tasks);
});

projectTasksRouter.get('/gantt', (req, res) => {
  const from = req.query.from;
  const to = req.query.to;
  let tasks = store.project_tasks.map(t => {
    const project = store.projects.find(p => p.id === t.project_id);
    return { ...t, project_name: project?.name };
  });
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
  const { project_id, name, planned_start_date, planned_end_date, actual_start_date, actual_end_date, progress_percent, sort_order } = req.body;
  if (!project_id || !name) return res.status(400).json({ error: 'project_id and name are required' });
  const id = store.addProjectTask({
    project_id: +project_id,
    name,
    planned_start_date: planned_start_date || null,
    planned_end_date: planned_end_date || null,
    actual_start_date: actual_start_date || null,
    actual_end_date: actual_end_date || null,
    progress_percent: progress_percent ?? 0,
    sort_order: sort_order != null ? sort_order : undefined,
  });
  const task = store.project_tasks.find(t => t.id === id);
  const project = store.projects.find(p => p.id === task.project_id);
  res.status(201).json({ ...task, project_name: project?.name });
});

projectTasksRouter.put('/:id', (req, res) => {
  const id = +req.params.id;
  const existing = store.project_tasks.find(t => t.id === id);
  if (!existing) return res.status(404).json({ error: 'Task not found' });
  const { name, planned_start_date, planned_end_date, actual_start_date, actual_end_date, progress_percent, sort_order } = req.body;
  store.updateProjectTask(id, {
    name: name ?? existing.name,
    planned_start_date: planned_start_date !== undefined ? planned_start_date : existing.planned_start_date,
    planned_end_date: planned_end_date !== undefined ? planned_end_date : existing.planned_end_date,
    actual_start_date: actual_start_date !== undefined ? actual_start_date : existing.actual_start_date,
    actual_end_date: actual_end_date !== undefined ? actual_end_date : existing.actual_end_date,
    progress_percent: progress_percent !== undefined ? progress_percent : existing.progress_percent,
    sort_order: sort_order !== undefined ? sort_order : existing.sort_order,
  });
  const task = store.project_tasks.find(t => t.id === id);
  const project = store.projects.find(p => p.id === task.project_id);
  res.json({ ...task, project_name: project?.name });
});

projectTasksRouter.delete('/:id', (req, res) => {
  const id = +req.params.id;
  const existing = store.project_tasks.find(t => t.id === id);
  if (!existing) return res.status(404).json({ error: 'Task not found' });
  store.deleteProjectTask(id);
  res.status(204).send();
});
