import { nextId } from '../runtime/helpers.js';
import { isDbMode, dbSelect, dbInsert, dbUpdate, dbDelete } from '../runtime/query.js';

function coll(getData, key) {
  const data = getData();
  if (!data[key]) data[key] = [];
  return data[key];
}

export function createDeliveryExtrasRepository(ctx) {
  const { getData, save } = ctx;

  async function listLocal(key, filters = {}) {
    let rows = [...coll(getData, key)];
    if (filters.project_id != null) {
      rows = rows.filter((r) => Number(r.project_id) === Number(filters.project_id));
    }
    if (filters.task_id != null) {
      rows = rows.filter((r) => Number(r.task_id) === Number(filters.task_id));
    }
    return rows.sort((a, b) => Number(b.id) - Number(a.id));
  }

  async function addLocal(key, row) {
    const data = getData();
    const arr = coll(getData, key);
    const id = nextId(arr);
    const saved = { id, created_at: new Date().toISOString(), ...row };
    arr.push(saved);
    save();
    return saved;
  }

  return {
    async listRaid(filters = {}) {
      if (!isDbMode()) return listLocal('raid_items', filters);
      return dbSelect('raid_items', {
        filters: filters.project_id != null ? { project_id: Number(filters.project_id) } : {},
        order: 'id',
        ascending: false,
      });
    },
    async addRaid(row) {
      const payload = {
        project_id: Number(row.project_id),
        kind: row.kind || 'risk',
        title: String(row.title || '').trim(),
        description: row.description || null,
        status: row.status || 'open',
        impact: row.impact || 'medium',
        owner_person_id: row.owner_person_id != null && row.owner_person_id !== '' ? +row.owner_person_id : null,
        mitigation: row.mitigation || null,
        updated_at: new Date().toISOString(),
      };
      if (!payload.title) throw new Error('Title is required');
      if (!isDbMode()) return addLocal('raid_items', payload);
      return dbInsert('raid_items', payload);
    },
    async updateRaid(id, patch) {
      if (!isDbMode()) {
        const arr = coll(getData, 'raid_items');
        const i = arr.findIndex((r) => Number(r.id) === Number(id));
        if (i === -1) return false;
        arr[i] = { ...arr[i], ...patch, updated_at: new Date().toISOString() };
        save();
        return arr[i];
      }
      return dbUpdate('raid_items', Number(id), { ...patch, updated_at: new Date().toISOString() });
    },
    async deleteRaid(id) {
      if (!isDbMode()) {
        const arr = coll(getData, 'raid_items');
        const i = arr.findIndex((r) => Number(r.id) === Number(id));
        if (i === -1) return false;
        arr.splice(i, 1);
        save();
        return true;
      }
      await dbDelete('raid_items', Number(id));
      return true;
    },

    async listTaskComments(taskId) {
      if (!isDbMode()) return listLocal('task_comments', { task_id: taskId });
      return dbSelect('task_comments', { filters: { task_id: Number(taskId) }, order: 'id', ascending: true });
    },
    async addTaskComment(row) {
      const payload = {
        task_id: Number(row.task_id),
        author_user_id: row.author_user_id != null ? Number(row.author_user_id) : null,
        author_name: row.author_name || null,
        body: String(row.body || '').trim(),
        created_at: new Date().toISOString(),
      };
      if (!payload.body) throw new Error('Comment is required');
      if (!isDbMode()) return addLocal('task_comments', payload);
      return dbInsert('task_comments', payload);
    },

    async listProjectActivity(projectId) {
      if (!isDbMode()) return listLocal('project_activity', { project_id: projectId });
      return dbSelect('project_activity', {
        filters: { project_id: Number(projectId) },
        order: 'id',
        ascending: false,
        limit: 50,
      });
    },
    async addProjectActivity(row) {
      const payload = {
        project_id: Number(row.project_id),
        actor_name: row.actor_name || null,
        summary: String(row.summary || '').trim(),
        created_at: new Date().toISOString(),
      };
      if (!payload.summary) return null;
      if (!isDbMode()) return addLocal('project_activity', payload);
      return dbInsert('project_activity', payload);
    },
  };
}
