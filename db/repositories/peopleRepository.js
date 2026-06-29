import { nextId } from '../runtime/helpers.js';

export function createPeopleRepository(ctx, getStore) {
  const { getData, save } = ctx;

  return {
    get people() {
      return [...getData().people];
    },

    addPerson(row) {
      const data = getData();
      const id = nextId(data.people);
      const created_at = new Date().toISOString();
      data.people.push({ id, ...row, created_at });
      save();
      return id;
    },

    updatePerson(id, row) {
      const data = getData();
      const i = data.people.findIndex((p) => p.id === id);
      if (i === -1) return false;
      data.people[i] = { ...data.people[i], ...row };
      save();
      return true;
    },

    deletePerson(id) {
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
    },
  };
}
