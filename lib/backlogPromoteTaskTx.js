/**
 * Atomic backlog → project_task promotion via Postgres transaction.
 */
import { withTransaction, hasPgPool } from '../db/runtime/pgPool.js';
import { isDbMode } from '../db/runtime/query.js';

export async function promoteBacklogToTaskTx(backlogId, {
  assigneeId = null,
  estimatedHours = null,
  actualHours = null,
} = {}) {
  if (!isDbMode() || !hasPgPool()) return null;

  return withTransaction(async (client) => {
    const { rows: backlogRows } = await client.query(
      'SELECT * FROM public.backlogs_app WHERE id = $1 FOR UPDATE',
      [+backlogId],
    );
    const item = backlogRows[0];
    if (!item) throw new Error('Backlog item not found');
    if (item.task_id) throw new Error('Backlog item already linked to a task');
    if (String(item.status || '').toLowerCase() === 'closed') {
      throw new Error('Closed backlog items cannot be promoted to a task');
    }

    const est = estimatedHours ?? (item.estimated_hours != null
      ? Number(item.estimated_hours)
      : (item.effort_days != null ? Number(item.effort_days) * 8 : null));
    const act = actualHours ?? (item.actual_hours != null ? Number(item.actual_hours) : null);

    const { rows: taskRows } = await client.query(
      `INSERT INTO public.project_tasks (
         project_id, name, task_kind, status, progress_percent,
         assignee_id, backlog_id, work_package_id,
         estimated_hours, actual_hours, sort_order, created_at
       ) VALUES (
         $1, $2, 'task', 'new', 0,
         $3, $4, $5,
         $6, $7, 0, now()
       ) RETURNING *`,
      [
        item.project_id,
        item.title,
        assigneeId,
        item.id,
        item.work_package_id,
        est,
        act,
      ],
    );
    const task = taskRows[0];

    await client.query(
      `UPDATE public.backlogs_app
       SET status = 'in_progress', task_id = $2, updated_at = now()
       WHERE id = $1`,
      [item.id, task.id],
    );

    return { task, backlogId: item.id, ref_no: item.ref_no };
  });
}
