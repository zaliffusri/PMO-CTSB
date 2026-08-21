/**
 * Stateless projects repository — Supabase when configured, in-memory when ALLOW_LOCAL_STORE only.
 * Table: projects (+ project_clients on delete / client link)
 */
import { nextId, projectRowForDb } from '../runtime/helpers.js';
import { formatClientNames } from '../../lib/projectClients.js';
import {
  isDbMode,
  dbSelect,
  dbInsert,
  dbUpdate,
  dbDelete,
  dbDeleteWhere,
  requireSupabase,
} from '../runtime/query.js';

const DEFAULT_PROJECTS_LIMIT = 500;
const MAX_PROJECTS_LIMIT = 2000;

function stripProjectTags(project) {
  if (!project || typeof project !== 'object') return project;
  const { tags: _tags, ...rest } = project;
  return rest;
}

/**
 * Enrich projects with clients + member_count using a few batched queries (no per-project N+1).
 * DB mode only.
 */
async function enrichProjectsBatched(projects) {
  const list = Array.isArray(projects) ? projects : [];
  if (!list.length) return [];

  const projectIds = list.map((p) => Number(p.id)).filter((id) => Number.isFinite(id));
  const links = projectIds.length
    ? await dbSelect('project_clients', { inFilters: { project_id: projectIds } })
    : [];
  const clientIds = [...new Set(links.map((l) => Number(l.client_id)).filter(Number.isFinite))];
  const clients = clientIds.length
    ? await dbSelect('clients', { inFilters: { id: clientIds } })
    : [];
  const assignmentRows = projectIds.length
    ? await dbSelect('project_assignments', {
      columns: 'id,project_id',
      inFilters: { project_id: projectIds },
    })
    : [];

  const clientById = new Map((clients || []).map((c) => [Number(c.id), c]));
  const clientsByProject = new Map();
  for (const link of links || []) {
    const pid = Number(link.project_id);
    const client = clientById.get(Number(link.client_id));
    if (!client) continue;
    if (!clientsByProject.has(pid)) clientsByProject.set(pid, []);
    clientsByProject.get(pid).push(client);
  }
  for (const [, arr] of clientsByProject) {
    arr.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  }

  const memberCountByProject = new Map();
  for (const a of assignmentRows || []) {
    const pid = Number(a.project_id);
    memberCountByProject.set(pid, (memberCountByProject.get(pid) || 0) + 1);
  }

  return list.map((p) => {
    const pid = Number(p.id);
    const projectClients = clientsByProject.get(pid) || [];
    const client_ids = projectClients.map((c) => c.id);
    return {
      ...stripProjectTags(p),
      clients: projectClients,
      client_ids,
      client_name: formatClientNames(projectClients),
      client_id: client_ids[0] ?? null,
      member_count: memberCountByProject.get(pid) || 0,
    };
  });
}

export function createProjectsRepository(ctx, getStore) {
  const { getData, save } = ctx;

  async function listProjects() {
    if (!isDbMode()) return [...getData().projects];
    return dbSelect('projects', { order: 'id' });
  }

  /**
   * Fast list for GET /api/projects — RPC when available, else batched selects.
   * @param {{ limit?: number, offset?: number }} opts
   */
  async function listProjectsEnriched({ limit = DEFAULT_PROJECTS_LIMIT, offset = 0 } = {}) {
    const lim = Math.max(1, Math.min(Number(limit) || DEFAULT_PROJECTS_LIMIT, MAX_PROJECTS_LIMIT));
    const off = Math.max(0, Number(offset) || 0);

    if (!isDbMode()) {
      const projects = [...getData().projects]
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(off, off + lim);
      const links = (getData().project_clients || []).filter((pc) =>
        projects.some((p) => Number(p.id) === Number(pc.project_id)),
      );
      const clients = getData().clients || [];
      const clientById = new Map(clients.map((c) => [Number(c.id), c]));
      const clientsByProject = new Map();
      for (const link of links) {
        const pid = Number(link.project_id);
        const client = clientById.get(Number(link.client_id));
        if (!client) continue;
        if (!clientsByProject.has(pid)) clientsByProject.set(pid, []);
        clientsByProject.get(pid).push(client);
      }
      for (const [, arr] of clientsByProject) {
        arr.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
      }
      const assignments = getData().project_assignments || [];
      const memberCountByProject = new Map();
      for (const a of assignments) {
        const pid = Number(a.project_id);
        memberCountByProject.set(pid, (memberCountByProject.get(pid) || 0) + 1);
      }
      return projects.map((p) => {
        const pid = Number(p.id);
        const projectClients = clientsByProject.get(pid) || [];
        const client_ids = projectClients.map((c) => c.id);
        return {
          ...stripProjectTags(p),
          clients: projectClients,
          client_ids,
          client_name: formatClientNames(projectClients),
          client_id: client_ids[0] ?? null,
          member_count: memberCountByProject.get(pid) || 0,
        };
      });
    }

    try {
      const sb = requireSupabase();
      const { data, error } = await sb.rpc('list_projects_enriched', {
        p_limit: lim,
        p_offset: off,
      });
      if (error) throw error;
      if (Array.isArray(data)) return data.map(stripProjectTags);
      return [];
    } catch (e) {
      console.warn(
        'list_projects_enriched RPC unavailable, using batched select:',
        e?.message || e,
      );
      const sb = requireSupabase();
      const { data: projects, error } = await sb
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(off, off + lim - 1);
      if (error) throw error;
      return enrichProjectsBatched(projects || []);
    }
  }

  return {
    /** @deprecated Prefer listProjects() — sync getter is local-only. */
    get projects() {
      return [...getData().projects];
    },

    listProjects,
    listProjectsEnriched,

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
