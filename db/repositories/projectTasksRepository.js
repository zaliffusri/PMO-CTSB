import { nextId } from '../runtime/helpers.js';
import { isDbMode, dbSelect, dbInsert, dbUpdate, dbDelete } from '../runtime/query.js';

export function createProjectTasksRepository(ctx, getStore) {
  const { getData, save } = ctx;

  async function listProjectTasks() {
    if (!isDbMode()) return [...getData().project_tasks];
    return dbSelect('project_tasks', { order: 'id' });
  }

  return {
    /** @deprecated Prefer listProjectTasks() — sync getter is local-only. */
    get project_tasks() {
      return [...getData().project_tasks];
    },

    listProjectTasks,

    async addProjectTask(row) {
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

      let sort_order = row.sort_order;
      if (sort_order == null) {
        let siblings;
        if (!isDbMode()) {
          siblings = getData().project_tasks.filter((t) =>
            t.project_id === project_id &&
            (parent_id == null ? t.parent_id == null : t.parent_id === parent_id),
          );
        } else {
          siblings = await dbSelect('project_tasks', {
            filters: { project_id, parent_id },
          });
        }
        sort_order = siblings.reduce((m, t) => Math.max(m, t.sort_order ?? 0), -1) + 1;
      }

      const task = {
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
      };

      if (!isDbMode()) {
        const data = getData();
        const id = nextId(data.project_tasks);
        data.project_tasks.push({ id, ...task });
        save();
        return id;
      }
      const saved = await dbInsert('project_tasks', task);
      return saved.id;
    },

    async updateProjectTask(id, row) {
      if (!isDbMode()) {
        const data = getData();
        const i = data.project_tasks.findIndex((t) => t.id === id);
        if (i === -1) return false;
        data.project_tasks[i] = { ...data.project_tasks[i], ...row };
        save();
        return true;
      }
      const saved = await dbUpdate('project_tasks', id, row);
      return Boolean(saved);
    },

    async deleteProjectTask(id) {
      const tid = +id;
      if (!isDbMode()) {
        const data = getData();
        const childIds = data.project_tasks.filter((t) => t.parent_id === tid).map((t) => t.id);
        for (const cid of childIds) {
          await getStore().deleteProjectTask(cid);
        }
        const i = data.project_tasks.findIndex((t) => t.id === tid);
        if (i === -1) return false;
        data.project_tasks.splice(i, 1);
        save();
        return true;
      }

      const children = await dbSelect('project_tasks', { filters: { parent_id: tid } });
      for (const child of children) {
        await getStore().deleteProjectTask(child.id);
      }
      await dbDelete('project_tasks', tid);
      return true;
    },
  };
}
