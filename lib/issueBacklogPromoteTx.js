/**
 * Atomic helpdesk → backlog promotion via Postgres transaction.
 * Requires SUPABASE_DB_URL. Falls back to sequential repo calls when pool unavailable.
 */
import { withTransaction, hasPgPool } from '../db/runtime/pgPool.js';
import { isDbMode } from '../db/runtime/query.js';
import {
  resolveBacklogRefForIssue,
  normalizeBacklogRef,
  cleanExternalTicketRef,
} from './issueBacklogLink.js';
import { issueCategoryToBacklogType } from './backlogConstants.js';
import { helpdeskStageForIssue } from './issueWorkflow.js';

function mapBacklogRow(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    ref_no: row.ref_no,
    project_id: row.project_id != null ? Number(row.project_id) : null,
    title: row.title,
    description: row.description,
    item_type: row.item_type,
    source: row.source,
    status: row.status,
    priority: row.priority,
    issue_id: row.issue_id != null ? Number(row.issue_id) : null,
    task_id: row.task_id != null ? Number(row.task_id) : null,
    assignee_person_id: row.assignee_person_id != null ? Number(row.assignee_person_id) : null,
    module_code: row.module_code,
    client_id: row.client_id != null ? Number(row.client_id) : null,
    external_ticket_ref: row.external_ticket_ref,
    created_by_user_id: row.created_by_user_id != null ? Number(row.created_by_user_id) : null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * @returns {Promise<{ backlog: object, created: boolean, linked: boolean } | null>}
 *   null when transaction path unavailable (caller should use store promote).
 */
export async function promoteIssueToBacklogTx(issueId, projectId, {
  createdByUserId = null,
  assigneePersonId = null,
} = {}) {
  if (!isDbMode() || !hasPgPool()) return null;

  const assigneeId = assigneePersonId != null && assigneePersonId !== '' ? +assigneePersonId : null;
  if (!assigneeId) throw new Error('assignee_person_id is required when promoting to backlog');

  return withTransaction(async (client) => {
    const { rows: issueRows } = await client.query(
      'SELECT * FROM public.issues_app WHERE id = $1 FOR UPDATE',
      [+issueId],
    );
    const issue = issueRows[0];
    if (!issue) throw new Error('Issue not found');

    const { rows: existingByIssue } = await client.query(
      'SELECT * FROM public.backlogs_app WHERE issue_id = $1 LIMIT 1 FOR UPDATE',
      [issue.id],
    );
    if (existingByIssue[0]) {
      await client.query(
        `UPDATE public.backlogs_app
         SET assignee_person_id = $2, updated_at = now()
         WHERE id = $1`,
        [existingByIssue[0].id, assigneeId],
      );
      await client.query(
        `UPDATE public.issues_app
         SET assignee_person_id = $2, updated_at = now()
         WHERE id = $1`,
        [issue.id, assigneeId],
      );
      const { rows } = await client.query('SELECT * FROM public.backlogs_app WHERE id = $1', [existingByIssue[0].id]);
      return { backlog: mapBacklogRow(rows[0]), created: false, linked: true };
    }

    // Try match by backlog_ref / external ticket
    let matched = null;
    const backlogRef = normalizeBacklogRef(issue.backlog_ref);
    if (backlogRef) {
      const { rows } = await client.query(
        `SELECT * FROM public.backlogs_app WHERE upper(btrim(ref_no)) = $1 LIMIT 1 FOR UPDATE`,
        [backlogRef],
      );
      matched = rows[0] || null;
    }
    const ext = cleanExternalTicketRef(issue.external_ticket_ref);
    if (!matched && ext) {
      const { rows } = await client.query(
        `SELECT * FROM public.backlogs_app
         WHERE external_ticket_ref IS NOT NULL
           AND upper(btrim(external_ticket_ref)) = $1
           AND (issue_id IS NULL OR issue_id = $2)
         LIMIT 1 FOR UPDATE`,
        [ext.toUpperCase(), issue.id],
      );
      matched = rows[0] || null;
    }

    const pid = projectId != null ? +projectId : (issue.project_id != null ? +issue.project_id : null);

    if (matched) {
      await client.query(
        `UPDATE public.backlogs_app SET
           issue_id = $2,
           assignee_person_id = $3,
           project_id = COALESCE($4, project_id),
           client_id = COALESCE(client_id, $5),
           module_code = COALESCE(module_code, $6),
           external_ticket_ref = COALESCE(external_ticket_ref, $7),
           updated_at = now()
         WHERE id = $1`,
        [
          matched.id,
          issue.id,
          assigneeId,
          pid,
          issue.client_id,
          issue.module_code,
          issue.external_ticket_ref,
        ],
      );
      await client.query(
        `UPDATE public.issues_app SET
           backlog_ref = $2,
           project_id = COALESCE($3, project_id),
           status = 'in_progress',
           assignee_person_id = $4,
           updated_at = now()
         WHERE id = $1`,
        [issue.id, matched.ref_no, pid, assigneeId],
      );
      const { rows } = await client.query('SELECT * FROM public.backlogs_app WHERE id = $1', [matched.id]);
      return { backlog: mapBacklogRow(rows[0]), created: false, linked: true };
    }

    // Create new backlog
    const { rows: allRefs } = await client.query('SELECT ref_no FROM public.backlogs_app');
    const refNo = resolveBacklogRefForIssue(issue, allRefs);
    const stage = helpdeskStageForIssue(issue);
    const stageLabel = stage.code === 'backlog' ? 'Backlog' : stage.label;
    const refLine = issue.external_ticket_ref ? `Client ref: ${issue.external_ticket_ref}\n` : '';
    const description = issue.description
      ? `${refLine}${issue.description}\n\n[From helpdesk ${issue.ticket_no} · ${stageLabel}]`
      : `${refLine}[From helpdesk ${issue.ticket_no} · ${stageLabel}]`;

    if (!pid) throw new Error('project_id is required when creating backlog from issue');

    const { rows: inserted } = await client.query(
      `INSERT INTO public.backlogs_app (
         ref_no, project_id, title, description, item_type, source, status, priority,
         issue_id, assignee_person_id, module_code, client_id, external_ticket_ref,
         created_by_user_id, created_at, updated_at
       ) VALUES (
         $1,$2,$3,$4,$5,'helpdesk','open',$6,
         $7,$8,$9,$10,$11,
         $12, now(), now()
       ) RETURNING *`,
      [
        refNo,
        pid,
        issue.title,
        description,
        issueCategoryToBacklogType(issue.category),
        issue.priority || 'medium',
        issue.id,
        assigneeId,
        issue.module_code || null,
        issue.client_id || null,
        issue.external_ticket_ref || null,
        createdByUserId != null ? +createdByUserId : null,
      ],
    );

    await client.query(
      `UPDATE public.issues_app SET
         backlog_ref = $2,
         project_id = $3,
         status = 'in_progress',
         assignee_person_id = $4,
         updated_at = now()
       WHERE id = $1`,
      [issue.id, refNo, pid, assigneeId],
    );

    return { backlog: mapBacklogRow(inserted[0]), created: true, linked: true };
  });
}

/** Prefer TX path; otherwise use async store promote. */
export async function promoteIssueToBacklogDurable(store, issueId, projectId, opts = {}) {
  const { promoteIssueToBacklog } = await import('./issueBacklogLink.js');
  try {
    const txResult = await promoteIssueToBacklogTx(issueId, projectId, opts);
    if (txResult) return txResult;
  } catch (e) {
    // If TX path fails due to missing pool, fall through; rethrow business errors.
    if (!/transactions require|pool unavailable|SUPABASE_DB_URL/i.test(String(e?.message || e))) {
      throw e;
    }
    console.warn('promoteIssueToBacklogTx unavailable, using store path:', e.message);
  }
  return promoteIssueToBacklog(store, issueId, projectId, opts);
}
