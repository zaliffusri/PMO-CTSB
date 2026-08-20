/**
 * Stateless people repository — Supabase when configured, in-memory when ALLOW_LOCAL_STORE only.
 * Table: people
 */
import { nextId } from '../runtime/helpers.js';
import {
  isDbMode,
  dbSelect,
  dbInsert,
  dbUpdate,
  dbDelete,
  dbDeleteWhere,
  dbUpdateWhere,
} from '../runtime/query.js';

export function createPeopleRepository(ctx, getStore) {
  const { getData, save } = ctx;

  async function listPeople() {
    if (!isDbMode()) return [...getData().people];
    return dbSelect('people', { order: 'id' });
  }

  async function findPersonByUserId(userId) {
    const uid = Number(userId);
    if (!Number.isFinite(uid)) return null;
    if (!isDbMode()) {
      return getData().people.find((p) => Number(p.user_id) === uid) || null;
    }
    return dbSelect('people', { filters: { user_id: uid }, maybeSingle: true });
  }

  function personPayload(row, { forUpdate = false } = {}) {
    const payload = {};
    if (!forUpdate || row.name !== undefined) {
      payload.name = row.name != null ? String(row.name).trim() : row.name;
    }
    if (!forUpdate || row.email !== undefined) {
      payload.email = row.email != null ? String(row.email).trim().toLowerCase() || null : null;
    }
    if (!forUpdate || row.role !== undefined) {
      payload.role = row.role != null ? String(row.role).trim() || null : null;
    }
    if (row.user_id !== undefined) {
      payload.user_id = row.user_id == null || row.user_id === '' ? null : Number(row.user_id);
      if (payload.user_id != null && !Number.isFinite(payload.user_id)) {
        throw new Error('Invalid user_id');
      }
    }
    return payload;
  }

  return {
    /** @deprecated Prefer listPeople() — sync getter is local-only. */
    get people() {
      return [...getData().people];
    },

    listPeople,
    findPersonByUserId,

    async addPerson(row) {
      const created_at = new Date().toISOString();
      const payload = { ...personPayload(row), created_at };
      if (!isDbMode()) {
        const data = getData();
        const id = nextId(data.people);
        data.people.push({ id, ...payload });
        save();
        return id;
      }
      const saved = await dbInsert('people', payload);
      return saved.id;
    },

    async updatePerson(id, row) {
      const patch = personPayload(row, { forUpdate: true });
      if (!Object.keys(patch).length) return true;
      if (!isDbMode()) {
        const data = getData();
        const i = data.people.findIndex((p) => p.id === id);
        if (i === -1) return false;
        data.people[i] = { ...data.people[i], ...patch };
        save();
        return true;
      }
      const saved = await dbUpdate('people', id, patch);
      return Boolean(saved);
    },

    async deletePerson(id) {
      if (!isDbMode()) {
        const data = getData();
        const i = data.people.findIndex((p) => p.id === id);
        if (i === -1) return false;
        data.people.splice(i, 1);
        data.project_assignments = data.project_assignments.filter((a) => a.person_id !== id);
        data.activities = data.activities.filter((a) => a.person_id !== id);
        data.project_tasks.forEach((t) => {
          if (t.assignee_id === id) t.assignee_id = null;
        });
        save();
        return true;
      }
      await dbDeleteWhere('project_assignments', { person_id: id });
      await dbUpdateWhere('project_tasks', { assignee_id: id }, { assignee_id: null });
      await dbDeleteWhere('activities', { person_id: id });
      await dbDelete('people', id);
      return true;
    },
  };
}
