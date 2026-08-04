import { nextId } from '../runtime/helpers.js';

export function createProjectsRepository(ctx, getStore) {
  const { getData, save } = ctx;

  return {
    get projects() {
      return [...getData().projects];
    },

    addProject(row) {
      const data = getData();
      const id = nextId(data.projects);
      const created_at = new Date().toISOString();
      const { client_id, client_ids, tags: _tags, classification, engagement_type, ...rest } = row;
      const normalizedClassification = classification != null && String(classification).trim()
        ? String(classification).trim()
        : null;
      const normalizedEngagementType = engagement_type != null && String(engagement_type).trim()
        ? String(engagement_type).trim()
        : null;
      data.projects.push({
        id,
        status: 'active',
        classification: normalizedClassification,
        engagement_type: normalizedEngagementType,
        ...rest,
        created_at,
      });
      const ids = Array.isArray(client_ids)
        ? client_ids
        : client_id != null && client_id !== ''
          ? [client_id]
          : [];
      if (ids.length) getStore().setProjectClients(id, ids);
      else save();
      return id;
    },

    updateProject(id, row) {
      const data = getData();
      const i = data.projects.findIndex((p) => p.id === id);
      if (i === -1) return false;
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
      data.projects[i] = { ...data.projects[i], ...patch };
      if (client_ids !== undefined) {
        getStore().setProjectClients(id, client_ids);
      } else if (client_id !== undefined) {
        getStore().setProjectClients(id, client_id != null && client_id !== '' ? [client_id] : []);
      } else {
        save();
      }
      return true;
    },

    deleteProject(id) {
      const data = getData();
      const pid = +id;
      const i = data.projects.findIndex((p) => Number(p.id) === pid);
      if (i === -1) return false;
      data.projects.splice(i, 1);
      if (data.project_clients) {
        data.project_clients = data.project_clients.filter((pc) => Number(pc.project_id) !== pid);
      }
      data.project_assignments = data.project_assignments.filter((a) => Number(a.project_id) !== pid);
      data.project_tasks = data.project_tasks.filter((t) => Number(t.project_id) !== pid);

      const removedBacklogIds = new Set();
      if (data.backlogs) {
        for (const b of data.backlogs) {
          if (Number(b.project_id) === pid) removedBacklogIds.add(Number(b.id));
        }
        data.backlogs = data.backlogs.filter((b) => Number(b.project_id) !== pid);
      }
      if (data.backlog_comments && removedBacklogIds.size) {
        data.backlog_comments = data.backlog_comments.filter(
          (c) => !removedBacklogIds.has(Number(c.backlog_id)),
        );
      }
      if (data.attachments && removedBacklogIds.size) {
        data.attachments = data.attachments.filter((a) => {
          if (String(a.entity_type || '') !== 'backlog') return true;
          return !removedBacklogIds.has(Number(a.entity_id));
        });
      }
      if (data.project_phases) {
        data.project_phases = data.project_phases.filter((p) => Number(p.project_id) !== pid);
      }
      if (data.work_packages) {
        data.work_packages = data.work_packages.filter((w) => Number(w.project_id) !== pid);
      }
      if (data.issues) {
        data.issues = data.issues.map((issue) => (
          Number(issue.project_id) === pid ? { ...issue, project_id: null } : issue
        ));
      }
      data.activities.forEach((a) => {
        if (Number(a.project_id) === pid) a.project_id = null;
      });
      save();
      return true;
    },
  };
}
