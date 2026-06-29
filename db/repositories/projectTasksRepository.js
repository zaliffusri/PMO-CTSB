import { nextId } from '../runtime/helpers.js';

export function createProjectTasksRepository(ctx, getStore) {
  const { getData, save } = ctx;

  return {
    get project_tasks() {
      return [...getData().project_tasks];
    },

    addProjectTask(row) {
      const data = getData();
      const id = nextId(data.project_tasks);
      const created_at = new Date().toISOString();
      const project_id = +row.project_id;
      const parent_id = row.parent_id != null && row.parent_id !== '' ? +row.parent_id : null;
      const task_kind = row.task_kind === 'group' ? 'group' : 'task';
      let assignee_id = row.assignee_id != null && row.assignee_id !== '' ? +row.assignee_id : null;
      if (task_kind === 'group') assignee_id = null;
      let prog = task_kind === 'group' ? 0 : (row.progress_percent ?? 0);
      let st = row.status && ['new', 'ongoing', 'done'].includes(row.status) ? row.status : 'new';
      if (task_kind === 'group') st = 'new';
      else if (prog >= 100) st = 'done';
      const siblings = data.project_tasks.filter((t) =>
        t.project_id === project_id &&
        (parent_id == null ? t.parent_id == null : t.parent_id === parent_id),
      );
      const sort_order = row.sort_order != null ? row.sort_order : siblings.reduce((m, t) => Math.max(m, t.sort_order ?? 0), -1) + 1;
      data.project_tasks.push({
        id,
        project_id,
        name: row.name,
        planned_start_date: row.planned_start_date || null,
        planned_end_date: row.planned_end_date || null,
        actual_start_date: row.actual_start_date || null,
        actual_end_date: row.actual_end_date || null,
        progress_percent: prog,
        sort_order,
        parent_id,
        task_kind,
        assignee_id,
        status: st,
        backlog_id: row.backlog_id != null && row.backlog_id !== '' ? +row.backlog_id : null,
        work_package_id: row.work_package_id != null && row.work_package_id !== '' ? +row.work_package_id : null,
        estimated_hours: row.estimated_hours != null && row.estimated_hours !== '' ? +row.estimated_hours : null,
        actual_hours: row.actual_hours != null && row.actual_hours !== '' ? +row.actual_hours : null,
        created_at,
      });
      save();
      return id;
    },

    updateProjectTask(id, row) {
      const data = getData();
      const i = data.project_tasks.findIndex((t) => t.id === id);
      if (i === -1) return false;
      data.project_tasks[i] = { ...data.project_tasks[i], ...row };
      save();
      return true;
    },

    deleteProjectTask(id) {
      const data = getData();
      const childIds = data.project_tasks.filter((t) => t.parent_id === id).map((t) => t.id);
      for (const cid of childIds) {
        getStore().deleteProjectTask(cid);
      }
      const i = data.project_tasks.findIndex((t) => t.id === id);
      if (i === -1) return false;
      data.project_tasks.splice(i, 1);
      save();
      return true;
    },
  };
}
