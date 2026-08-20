/**
 * Stateless assignments repository — Supabase when configured, in-memory when ALLOW_LOCAL_STORE only.
 * Table: project_assignments
 */
import { nextId } from '../runtime/helpers.js';
import { isDbMode, dbSelect, dbInsert, dbUpdate, dbDelete } from '../runtime/query.js';

export function createAssignmentsRepository(ctx, getStore) {
  const { getData, save } = ctx;

  async function listAssignments() {
    if (!isDbMode()) return [...getData().project_assignments];
    return dbSelect('project_assignments', { order: 'id' });
  }

  return {
    /** @deprecated Prefer listAssignments() — sync getter is local-only. */
    get project_assignments() {
      return [...getData().project_assignments];
    },

    listAssignments,

    async addAssignment(row) {
      const created_at = new Date().toISOString();
      const payload = { allocation_percent: 100, ...row, created_at };

      if (!isDbMode()) {
        const data = getData();
        if (
          data.project_assignments.some(
            (a) => a.project_id === row.project_id && a.person_id === row.person_id,
          )
        ) {
          const err = new Error('Person is already assigned to this project');
          err.code = 'DUPLICATE';
          throw err;
        }
        const id = nextId(data.project_assignments);
        data.project_assignments.push({ id, ...payload });
        save();
        return id;
      }

      const existing = await dbSelect('project_assignments', {
        filters: { project_id: row.project_id, person_id: row.person_id },
        maybeSingle: true,
      });
      if (existing) {
        const err = new Error('Person is already assigned to this project');
        err.code = 'DUPLICATE';
        throw err;
      }
      const saved = await dbInsert('project_assignments', payload);
      return saved.id;
    },

    async updateAssignment(id, row) {
      if (!isDbMode()) {
        const data = getData();
        const i = data.project_assignments.findIndex((a) => a.id === id);
        if (i === -1) return false;
        data.project_assignments[i] = { ...data.project_assignments[i], ...row };
        save();
        return true;
      }
      const saved = await dbUpdate('project_assignments', id, row);
      return Boolean(saved);
    },

    async deleteAssignment(id) {
      if (!isDbMode()) {
        const data = getData();
        const i = data.project_assignments.findIndex((a) => a.id === id);
        if (i === -1) return false;
        data.project_assignments.splice(i, 1);
        save();
        return true;
      }
      await dbDelete('project_assignments', id);
      return true;
    },
  };
}
