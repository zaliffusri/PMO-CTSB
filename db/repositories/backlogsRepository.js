import { normalizeBacklogStatus, normalizeBacklogType } from '../../lib/backlogConstants.js';
import { normalizeModuleCode } from '../../lib/epbtModules.js';
import { cleanExternalTicketRef } from '../../lib/issueBacklogLink.js';
import { nextId } from '../runtime/helpers.js';
import { isDbMode, dbSelect, dbInsert, dbUpdate, dbDelete, dbDeleteWhere, dbUpdateWhere } from '../runtime/query.js';

function isMissingColumnError(err) {
  const msg = String(err?.message || err || '');
  return /schema cache|PGRST204|does not exist|column/i.test(msg);
}

/** Best-effort DDL so backlog form columns exist on older production DBs. */
async function ensureBacklogFormColumns() {
  try {
    const { getPgPool } = await import('../runtime/pgPool.js');
    const pool = getPgPool();
    if (!pool) return false;
    await pool.query(`
      alter table public.backlogs_app
        add column if not exists menu text,
        add column if not exists submenu text,
        add column if not exists url text,
        add column if not exists notes text;
    `);
    try {
      await pool.query("NOTIFY pgrst, 'reload schema'");
    } catch {
      /* best-effort */
    }
    await new Promise((r) => setTimeout(r, 400));
    return true;
  } catch (e) {
    console.warn('ensureBacklogFormColumns failed:', e?.message || e);
    return false;
  }
}

function cleanOptionalText(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s || null;
}

export function createBacklogsRepository(ctx, getStore) {
  const { getData, save } = ctx;

  async function listBacklogs(filters = {}) {
    const projectId = filters.project_id != null && filters.project_id !== ''
      ? Number(filters.project_id)
      : null;
    const workPackageId = filters.work_package_id != null && filters.work_package_id !== ''
      ? Number(filters.work_package_id)
      : null;

    if (!isDbMode()) {
      let rows = [...(getData().backlogs || [])];
      if (Number.isFinite(projectId)) rows = rows.filter((b) => Number(b.project_id) === projectId);
      if (Number.isFinite(workPackageId)) {
        rows = rows.filter((b) => Number(b.work_package_id) === workPackageId);
      }
      return rows;
    }

    const dbFilters = {};
    if (Number.isFinite(projectId)) dbFilters.project_id = projectId;
    if (Number.isFinite(workPackageId)) dbFilters.work_package_id = workPackageId;
    return dbSelect('backlogs_app', {
      columns: filters.columns || '*',
      filters: dbFilters,
      order: 'id',
    });
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

    async nextBacklogRefNo(opts = {}) {
      const { nextBacklogRefNo: buildRef } = await import('../../lib/issueBacklogLink.js');
      let backlogs;
      if (!isDbMode()) {
        const data = getData();
        if (!data.backlogs) data.backlogs = [];
        backlogs = data.backlogs;
      } else {
        backlogs = await dbSelect('backlogs_app', { columns: 'ref_no' });
      }
      return buildRef({
        backlogs,
        menu: opts.menu,
        projectShortCode: opts.projectShortCode,
        moduleCode: opts.moduleCode || 'XXX',
      });
    },

    async findBacklogById(id) {
      const bid = Number(id);
      if (!Number.isFinite(bid)) return null;
      if (!isDbMode()) {
        return (getData().backlogs || []).find((b) => Number(b.id) === bid) || null;
      }
      return dbSelect('backlogs_app', { filters: { id: bid }, maybeSingle: true });
    },

    async addBacklog(row) {
      const store = getStore();
      const now = new Date().toISOString();
      const item = {
        ref_no: row.ref_no || await store.nextBacklogRefNo(),
        project_id: +row.project_id,
        title: String(row.title || '').trim(),
        description: row.description != null ? String(row.description) : null,
        item_type: normalizeBacklogType(row.item_type || 'inquiry'),
        source: row.source || 'manual',
        status: normalizeBacklogStatus(row.status || 'open'),
        priority: row.priority || 'medium',
        issue_id: row.issue_id != null && row.issue_id !== '' ? +row.issue_id : null,
        task_id: row.task_id != null && row.task_id !== '' ? +row.task_id : null,
        assignee_person_id: row.assignee_person_id != null && row.assignee_person_id !== '' ? +row.assignee_person_id : null,
        created_by_user_id: row.created_by_user_id != null && row.created_by_user_id !== '' ? +row.created_by_user_id : null,
        module_code: row.module_code != null
          ? normalizeModuleCode(row.module_code, (await getStore().getSettings().catch(() => null))?.epbt_modules)
          : null,
        client_id: row.client_id != null && row.client_id !== '' ? +row.client_id : null,
        external_ticket_ref: row.external_ticket_ref != null
          ? cleanExternalTicketRef(row.external_ticket_ref)
          : null,
        menu: cleanOptionalText(row.menu),
        submenu: cleanOptionalText(row.submenu),
        url: cleanOptionalText(row.url),
        notes: cleanOptionalText(row.notes),
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
        const payload = { id, ...item };
        data.backlogs.push(payload);
        save();
        return payload;
      }

      // Older production DBs may lag migrations — drop optional columns and retry.
      const optionalKeys = [
        'created_by_user_id',
        'module_code',
        'client_id',
        'external_ticket_ref',
        'menu',
        'submenu',
        'url',
        'notes',
        'estimated_hours',
        'actual_hours',
        'work_package_id',
        'phase_id',
        'effort_days',
        'assignee_person_id',
        'issue_id',
        'task_id',
      ];
      let pending = { ...item };
      let lastError;
      let ensured = false;
      for (let attempt = 0; attempt < 10; attempt += 1) {
        try {
          const saved = await dbInsert('backlogs_app', pending);
          return saved;
        } catch (e) {
          lastError = e;
          const msg = String(e?.message || e || '');
          if (!isMissingColumnError(e)) throw e;
          if (!ensured && /(menu|submenu|url|notes)/i.test(msg)) {
            ensured = true;
            const ok = await ensureBacklogFormColumns();
            if (ok) continue;
          }
          const dropKey = optionalKeys.find((key) => pending[key] !== undefined && msg.includes(key));
          if (dropKey) {
            delete pending[dropKey];
            continue;
          }
          let changed = false;
          for (const key of optionalKeys) {
            if (pending[key] !== undefined) {
              delete pending[key];
              changed = true;
            }
          }
          if (!changed) throw e;
        }
      }
      throw lastError;
    },

    async updateBacklog(id, patch) {
      const next = { ...patch };
      if (next.status != null) next.status = normalizeBacklogStatus(next.status);
      if (next.item_type != null) next.item_type = normalizeBacklogType(next.item_type);
      if (next.menu !== undefined) next.menu = cleanOptionalText(next.menu);
      if (next.submenu !== undefined) next.submenu = cleanOptionalText(next.submenu);
      if (next.url !== undefined) next.url = cleanOptionalText(next.url);
      if (next.notes !== undefined) next.notes = cleanOptionalText(next.notes);
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
      try {
        const saved = await dbUpdate('backlogs_app', +id, next);
        return Boolean(saved);
      } catch (e) {
        if (isMissingColumnError(e) && /(menu|submenu|url|notes)/i.test(String(e?.message || e || ''))) {
          const ok = await ensureBacklogFormColumns();
          if (ok) {
            const saved = await dbUpdate('backlogs_app', +id, next);
            return Boolean(saved);
          }
        }
        throw e;
      }
    },

    async deleteBacklog(id) {
      const bid = Number(id);
      if (!Number.isFinite(bid)) return false;
      const store = getStore();
      const existing = await store.findBacklogById(bid);
      if (!existing) return false;

      if (!isDbMode()) {
        const data = getData();
        if (!data.backlogs) return false;
        const i = data.backlogs.findIndex((b) => Number(b.id) === bid);
        if (i === -1) return false;
        const [removed] = data.backlogs.splice(i, 1);
        const ref = String(removed.ref_no || '').trim().toLowerCase();
        if (data.backlog_comments) {
          data.backlog_comments = data.backlog_comments.filter((c) => Number(c.backlog_id) !== bid);
        }
        if (data.attachments) {
          data.attachments = data.attachments.filter(
            (a) => !(String(a.entity_type) === 'backlog' && Number(a.entity_id) === bid),
          );
        }
        if (data.notifications) {
          data.notifications = data.notifications.filter(
            (n) => !(String(n.entity_type) === 'backlog' && Number(n.entity_id) === bid),
          );
        }
        if (data.project_tasks) {
          data.project_tasks = data.project_tasks.map((t) => (
            Number(t.backlog_id) === bid ? { ...t, backlog_id: null } : t
          ));
        }
        if (data.issues) {
          data.issues = data.issues.map((issue) => {
            const linkedById = Number(removed.issue_id) === Number(issue.id);
            const linkedByRef = ref
              && String(issue.backlog_ref || '').trim().toLowerCase() === ref;
            if (!linkedById && !linkedByRef) return issue;
            return { ...issue, backlog_ref: null };
          });
        }
        save();
        return true;
      }

      // Best-effort related cleanup before deleting the row.
      try {
        await dbDeleteWhere('attachments_app', { entity_type: 'backlog', entity_id: bid });
      } catch (e) {
        console.warn('deleteBacklog attachments cleanup:', e?.message || e);
      }
      try {
        await dbDeleteWhere('backlog_comments_app', { backlog_id: bid });
      } catch (e) {
        console.warn('deleteBacklog comments cleanup:', e?.message || e);
      }
      try {
        await dbDeleteWhere('notifications_app', { entity_type: 'backlog', entity_id: bid });
      } catch (e) {
        console.warn('deleteBacklog notifications cleanup:', e?.message || e);
      }
      try {
        await dbUpdateWhere('project_tasks', { backlog_id: bid }, { backlog_id: null });
      } catch {
        /* project_tasks.backlog_id may be absent on older DBs */
      }
      try {
        if (existing.issue_id != null) {
          await store.updateIssue(existing.issue_id, { backlog_ref: null });
        } else if (existing.ref_no) {
          const issues = await store.listIssues().catch(() => []);
          const ref = String(existing.ref_no).trim().toLowerCase();
          const linked = (issues || []).find(
            (i) => String(i.backlog_ref || '').trim().toLowerCase() === ref,
          );
          if (linked?.id != null) {
            await store.updateIssue(linked.id, { backlog_ref: null });
          }
        }
      } catch (e) {
        console.warn('deleteBacklog issue unlink:', e?.message || e);
      }

      await dbDelete('backlogs_app', bid);
      return true;
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
