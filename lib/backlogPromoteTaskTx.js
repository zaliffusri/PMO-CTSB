/**
 * Atomic backlog → project_task promotion via Postgres transaction.
 */
import { withTransaction, hasPgPool } from '../db/runtime/pgPool.js';
import { isDbMode } from '../db/runtime/query.js';
import { buildPromotedTaskFields } from './backlogPromoteFields.js';

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

    const fields = buildPromotedTaskFields(item, {
      assigneeId,
      estimatedHours,
      actualHours,
    });

    const { rows: taskRows } = await client.query(
      `INSERT INTO public.project_tasks (
         project_id, name, task_kind, status, progress_percent,
         assignee_id, backlog_id, work_package_id,
         estimated_hours, actual_hours,
         planned_start_date, planned_end_date, actual_start_date,
         sort_order, created_at
       ) VALUES (
         $1, $2, 'task', $3, $4,
         $5, $6, $7,
         $8, $9,
         $10, $11, $12,
         0, now()
       ) RETURNING *`,
      [
        fields.project_id,
        fields.name,
        fields.status,
        fields.progress_percent,
        fields.assignee_id,
        fields.backlog_id,
        fields.work_package_id,
        fields.estimated_hours,
        fields.actual_hours,
        fields.planned_start_date,
        fields.planned_end_date,
        fields.actual_start_date,
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
