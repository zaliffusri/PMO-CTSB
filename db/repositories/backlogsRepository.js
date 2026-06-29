import { normalizeBacklogStatus } from '../../lib/backlogConstants.js';
import { normalizeModuleCode } from '../../lib/epbtModules.js';
import { cleanExternalTicketRef } from '../../lib/issueBacklogLink.js';
import { nextId } from '../runtime/helpers.js';

export function createBacklogsRepository(ctx, getStore) {
  const { getData, save } = ctx;

  return {
    get backlogs() {
      return [...(getData().backlogs || [])];
    },
    get backlog_comments() {
      return [...(getData().backlog_comments || [])];
    },

    nextBacklogRefNo() {
      const data = getData();
      if (!data.backlogs) data.backlogs = [];
      const year = new Date().getFullYear();
      const prefix = `BLG-${year}-`;
      const nums = data.backlogs
        .filter((b) => b.ref_no && String(b.ref_no).startsWith(prefix))
        .map((b) => parseInt(String(b.ref_no).slice(prefix.length), 10))
        .filter((n) => Number.isFinite(n));
      const next = nums.length ? Math.max(...nums) + 1 : 1;
      return `${prefix}${String(next).padStart(4, '0')}`;
    },

    addBacklog(row) {
      const data = getData();
      const store = getStore();
      if (!data.backlogs) data.backlogs = [];
      const id = nextId(data.backlogs);
      const now = new Date().toISOString();
      const item = {
        id,
        ref_no: row.ref_no || store.nextBacklogRefNo(),
        project_id: +row.project_id,
        title: String(row.title || '').trim(),
        description: row.description != null ? String(row.description) : null,
        item_type: row.item_type || 'scope',
        source: row.source || 'manual',
        status: normalizeBacklogStatus(row.status || 'open'),
        priority: row.priority || 'medium',
        issue_id: row.issue_id != null && row.issue_id !== '' ? +row.issue_id : null,
        task_id: row.task_id != null && row.task_id !== '' ? +row.task_id : null,
        assignee_person_id: row.assignee_person_id != null && row.assignee_person_id !== '' ? +row.assignee_person_id : null,
        created_by_user_id: row.created_by_user_id != null && row.created_by_user_id !== '' ? +row.created_by_user_id : null,
        module_code: row.module_code != null ? normalizeModuleCode(row.module_code) : null,
        client_id: row.client_id != null && row.client_id !== '' ? +row.client_id : null,
        external_ticket_ref: row.external_ticket_ref != null
          ? cleanExternalTicketRef(row.external_ticket_ref)
          : null,
        effort_days: row.effort_days != null && row.effort_days !== '' ? +row.effort_days : null,
        estimated_hours: row.estimated_hours != null && row.estimated_hours !== ''
          ? +row.estimated_hours
          : (row.effort_days != null && row.effort_days !== '' ? +row.effort_days * 8 : null),
        actual_hours: row.actual_hours != null && row.actual_hours !== '' ? +row.actual_hours : null,
        phase_id: row.phase_id != null && row.phase_id !== '' ? +row.phase_id : null,
        work_package_id: row.work_package_id != null && row.work_package_id !== '' ? +row.work_package_id : null,
        created_at: now,
        updated_at: now,
      };
      data.backlogs.push(item);
      save();
      return id;
    },

    updateBacklog(id, patch) {
      const data = getData();
      if (!data.backlogs) data.backlogs = [];
      const i = data.backlogs.findIndex((b) => b.id === +id);
      if (i === -1) return false;
      const next = { ...patch };
      if (next.status != null) next.status = normalizeBacklogStatus(next.status);
      data.backlogs[i] = { ...data.backlogs[i], ...next, updated_at: new Date().toISOString() };
      save();
      return true;
    },

    listBacklogComments(backlogId) {
      const data = getData();
      return (data.backlog_comments || [])
        .filter((c) => c.backlog_id === +backlogId)
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    },

    addBacklogComment(row) {
      const data = getData();
      if (!data.backlog_comments) data.backlog_comments = [];
      const id = nextId(data.backlog_comments);
      const comment = {
        id,
        backlog_id: +row.backlog_id,
        author_user_id: +row.author_user_id,
        body: String(row.body || '').trim(),
        mentioned_person_ids: Array.isArray(row.mentioned_person_ids)
          ? row.mentioned_person_ids.map((x) => +x).filter(Number.isFinite)
          : [],
        created_at: new Date().toISOString(),
      };
      data.backlog_comments.push(comment);
      save();
      return id;
    },

    findBacklogByIssueId(issueId) {
      const data = getData();
      return (data.backlogs || []).find((b) => b.issue_id === +issueId) || null;
    },
  };
}
