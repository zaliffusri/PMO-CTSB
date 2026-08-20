import { normalizeBacklogStatus } from '../../lib/backlogConstants.js';
import { normalizeModuleCode } from '../../lib/epbtModules.js';
import { cleanExternalTicketRef } from '../../lib/issueBacklogLink.js';
import { nextId } from '../runtime/helpers.js';
import { isDbMode, dbSelect, dbInsert, dbUpdate } from '../runtime/query.js';

export function createBacklogsRepository(ctx, getStore) {
  const { getData, save } = ctx;

  async function listBacklogs() {
    if (!isDbMode()) return [...(getData().backlogs || [])];
    return dbSelect('backlogs_app', { order: 'id' });
  }

  return {
    /** @deprecated Prefer listBacklogs() — sync getter is local-only. */
    get backlogs() {
      return [...(getData().backlogs || [])];
    },
    /** @deprecated Prefer listBacklogComments(backlogId) — sync getter is local-only. */
    get backlog_comments() {
      return [...(getData().backlog_comments || [])];
    },

    listBacklogs,

    async nextBacklogRefNo() {
      const year = new Date().getFullYear();
      const prefix = `BLG-${year}-`;
      let backlogs;
      if (!isDbMode()) {
        const data = getData();
        if (!data.backlogs) data.backlogs = [];
        backlogs = data.backlogs;
      } else {
        backlogs = await dbSelect('backlogs_app', { columns: 'ref_no' });
      }
      const nums = backlogs
        .filter((b) => b.ref_no && String(b.ref_no).startsWith(prefix))
        .map((b) => parseInt(String(b.ref_no).slice(prefix.length), 10))
        .filter((n) => Number.isFinite(n));
      const next = nums.length ? Math.max(...nums) + 1 : 1;
      return `${prefix}${String(next).padStart(4, '0')}`;
    },

    async addBacklog(row) {
      const store = getStore();
      const now = new Date().toISOString();
      const item = {
        ref_no: row.ref_no || await store.nextBacklogRefNo(),
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

      if (!isDbMode()) {
        const data = getData();
        if (!data.backlogs) data.backlogs = [];
        const id = nextId(data.backlogs);
        data.backlogs.push({ id, ...item });
        save();
        return id;
      }
      const saved = await dbInsert('backlogs_app', item);
      return saved.id;
    },

    async updateBacklog(id, patch) {
      const next = { ...patch };
      if (next.status != null) next.status = normalizeBacklogStatus(next.status);
      next.updated_at = new Date().toISOString();

      if (!isDbMode()) {
        const data = getData();
        if (!data.backlogs) data.backlogs = [];
        const i = data.backlogs.findIndex((b) => b.id === +id);
        if (i === -1) return false;
        data.backlogs[i] = { ...data.backlogs[i], ...next };
        save();
        return true;
      }
      const saved = await dbUpdate('backlogs_app', +id, next);
      return Boolean(saved);
    },

    async listBacklogComments(backlogId) {
      if (!isDbMode()) {
        const data = getData();
        return (data.backlog_comments || [])
          .filter((c) => c.backlog_id === +backlogId)
          .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      }
      const rows = await dbSelect('backlog_comments_app', {
        filters: { backlog_id: +backlogId },
        order: 'created_at',
      });
      return rows.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    },

    async addBacklogComment(row) {
      const comment = {
        backlog_id: +row.backlog_id,
        author_user_id: +row.author_user_id,
        body: String(row.body || '').trim(),
        mentioned_person_ids: Array.isArray(row.mentioned_person_ids)
          ? row.mentioned_person_ids.map((x) => +x).filter(Number.isFinite)
          : [],
        created_at: new Date().toISOString(),
      };

      if (!isDbMode()) {
        const data = getData();
        if (!data.backlog_comments) data.backlog_comments = [];
        const id = nextId(data.backlog_comments);
        data.backlog_comments.push({ id, ...comment });
        save();
        return id;
      }
      const saved = await dbInsert('backlog_comments_app', comment);
      return saved.id;
    },

    async findBacklogByIssueId(issueId) {
      if (!isDbMode()) {
        const data = getData();
        return (data.backlogs || []).find((b) => b.issue_id === +issueId) || null;
      }
      return dbSelect('backlogs_app', { filters: { issue_id: +issueId }, maybeSingle: true });
    },
  };
}
