/**
 * Stateless projects repository — Supabase when configured, in-memory when ALLOW_LOCAL_STORE only.
 * Table: projects (+ project_clients on delete / client link)
 */
import { nextId, projectRowForDb } from '../runtime/helpers.js';
import { isDbMode, dbSelect, dbInsert, dbUpdate, dbDelete, dbDeleteWhere } from '../runtime/query.js';

export function createProjectsRepository(ctx, getStore) {
  const { getData, save } = ctx;

  async function listProjects() {
    if (!isDbMode()) return [...getData().projects];
    return dbSelect('projects', { order: 'id' });
  }

  return {
    /** @deprecated Prefer listProjects() — sync getter is local-only. */
    get projects() {
      return [...getData().projects];
    },

    listProjects,

    async addProject(row) {
      const created_at = new Date().toISOString();
      const { client_id, client_ids, tags: _tags, classification, engagement_type, ...rest } = row;
      const normalizedClassification =
        classification != null && String(classification).trim()
          ? String(classification).trim()
          : null;
      const normalizedEngagementType =
        engagement_type != null && String(engagement_type).trim()
          ? String(engagement_type).trim()
          : null;
      const projectFields = {
        status: 'active',
        classification: normalizedClassification,
        engagement_type: normalizedEngagementType,
        ...rest,
        created_at,
      };
      const ids = Array.isArray(client_ids)
        ? client_ids
        : client_id != null && client_id !== ''
          ? [client_id]
          : [];

      if (!isDbMode()) {
        const data = getData();
        const id = nextId(data.projects);
        data.projects.push({ id, ...projectFields });
        if (ids.length) await getStore().setProjectClients(id, ids);
        else save();
        return id;
      }

      const payload = projectRowForDb(projectFields);
      delete payload.id;
      const saved = await dbInsert('projects', payload);
      if (ids.length) await getStore().setProjectClients(saved.id, ids);
      return saved.id;
    },

    async updateProject(id, row) {
      const { client_id, client_ids, ...patch } = row;
      if (patch.classification !== undefined) {
        patch.classification =
          patch.classification != null && String(patch.classification).trim()
            ? String(patch.classification).trim()
            : null;
      }
      if (patch.engagement_type !== undefined) {
        patch.engagement_type =
          patch.engagement_type != null && String(patch.engagement_type).trim()
            ? String(patch.engagement_type).trim()
            : null;
      }
      delete patch.tags;
      delete patch.client_id;
      delete patch.client_ids;

      if (!isDbMode()) {
        const data = getData();
        const i = data.projects.findIndex((p) => p.id === id);
        if (i === -1) return false;
        data.projects[i] = { ...data.projects[i], ...patch };
        if (client_ids !== undefined) {
          await getStore().setProjectClients(id, client_ids);
        } else if (client_id !== undefined) {
          await getStore().setProjectClients(
            id,
            client_id != null && client_id !== '' ? [client_id] : [],
          );
        } else {
          save();
        }
        return true;
      }

      const existing = await dbSelect('projects', { filters: { id }, maybeSingle: true });
      if (!existing) return false;
      const forDb = projectRowForDb({ ...existing, ...patch, id });
      delete forDb.id;
      const saved = await dbUpdate('projects', id, forDb);
      if (!saved) return false;
      if (client_ids !== undefined) {
        await getStore().setProjectClients(id, client_ids);
      } else if (client_id !== undefined) {
        await getStore().setProjectClients(
          id,
          client_id != null && client_id !== '' ? [client_id] : [],
        );
      }
      return true;
    },

    async deleteProject(id, { skipSave = false } = {}) {
      const pid = +id;

      if (!isDbMode()) {
        const data = getData();
        const i = data.projects.findIndex((p) => Number(p.id) === pid);
        if (i === -1) return false;

        const removedTaskIds = new Set(
          (data.project_tasks || [])
            .filter((t) => Number(t.project_id) === pid)
            .map((t) => Number(t.id)),
        );
        const removedBacklogIds = new Set();
        if (data.backlogs) {
          for (const b of data.backlogs) {
            if (Number(b.project_id) === pid) removedBacklogIds.add(Number(b.id));
          }
        }
        const removedPhaseIds = new Set(
          (data.project_phases || [])
            .filter((p) => Number(p.project_id) === pid)
            .map((p) => Number(p.id)),
        );
        const removedWpIds = new Set(
          (data.work_packages || [])
            .filter((w) => Number(w.project_id) === pid)
            .map((w) => Number(w.id)),
        );

        data.projects.splice(i, 1);
        if (data.project_clients) {
          data.project_clients = data.project_clients.filter((pc) => Number(pc.project_id) !== pid);
        }
        data.project_assignments = data.project_assignments.filter(
          (a) => Number(a.project_id) !== pid,
        );
        data.project_tasks = data.project_tasks.filter((t) => Number(t.project_id) !== pid);
        if (data.backlogs) {
          data.backlogs = data.backlogs.filter((b) => Number(b.project_id) !== pid);
        }
        if (data.backlog_comments && removedBacklogIds.size) {
          data.backlog_comments = data.backlog_comments.filter(
            (c) => !removedBacklogIds.has(Number(c.backlog_id)),
          );
        }
        if (data.project_phases) {
          data.project_phases = data.project_phases.filter((p) => Number(p.project_id) !== pid);
        }
        if (data.work_packages) {
          data.work_packages = data.work_packages.filter((w) => Number(w.project_id) !== pid);
        }
        if (data.attachments) {
          data.attachments = data.attachments.filter((a) => {
            const type = String(a.entity_type || '');
            const eid = Number(a.entity_id);
            if (type === 'project' && eid === pid) return false;
            if ((type === 'task' || type === 'project_task') && removedTaskIds.has(eid)) return false;
            if (type === 'backlog' && removedBacklogIds.has(eid)) return false;
            if ((type === 'phase' || type === 'project_phase') && removedPhaseIds.has(eid)) {
              return false;
            }
            if (type === 'work_package' && removedWpIds.has(eid)) return false;
            return true;
          });
        }
        if (data.notifications) {
          data.notifications = data.notifications.filter((n) => {
            const type = String(n.entity_type || '');
            const eid = Number(n.entity_id);
            const link = String(n.link || '');
            if (type === 'project' && eid === pid) return false;
            if ((type === 'project_task' || type === 'task') && removedTaskIds.has(eid)) return false;
            if (type === 'backlog' && removedBacklogIds.has(eid)) return false;
            if (link.startsWith(`/projects/${pid}`)) return false;
            return true;
          });
        }
        if (data.issues) {
          data.issues = data.issues.map((issue) =>
            Number(issue.project_id) === pid ? { ...issue, project_id: null } : issue,
          );
        }
        data.activities.forEach((a) => {
          if (Number(a.project_id) === pid) a.project_id = null;
        });
        if (!skipSave) save();
        return true;
      }

      // DB path: delete project + project_clients; FKs may cascade for the rest. skipSave is a no-op.
      void skipSave;
      await dbDeleteWhere('project_clients', { project_id: pid });
      await dbDelete('projects', pid);
      return true;
    },
  };
}
