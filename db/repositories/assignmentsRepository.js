import { nextId } from '../runtime/helpers.js';

export function createAssignmentsRepository(ctx, getStore) {
  const { getData, save } = ctx;

  return {
    get project_assignments() {
      return [...getData().project_assignments];
    },

    addAssignment(row) {
      const data = getData();
      if (data.project_assignments.some((a) => a.project_id === row.project_id && a.person_id === row.person_id)) {
        const err = new Error('Person is already assigned to this project');
        err.code = 'DUPLICATE';
        throw err;
      }
      const id = nextId(data.project_assignments);
      const created_at = new Date().toISOString();
      data.project_assignments.push({ id, allocation_percent: 100, ...row, created_at });
      save();
      return id;
    },

    updateAssignment(id, row) {
      const data = getData();
      const i = data.project_assignments.findIndex((a) => a.id === id);
      if (i === -1) return false;
      data.project_assignments[i] = { ...data.project_assignments[i], ...row };
      save();
      return true;
    },

    deleteAssignment(id) {
      const data = getData();
      const i = data.project_assignments.findIndex((a) => a.id === id);
      if (i === -1) return false;
      data.project_assignments.splice(i, 1);
      save();
      return true;
    },
  };
}
