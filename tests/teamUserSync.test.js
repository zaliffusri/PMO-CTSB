import { describe, it, expect, beforeEach } from 'vitest';
import {
  isPersonLinkedToUser,
  syncUserToTeamPerson,
  syncAllUsersToTeamPeople,
  findOrphanPeople,
  pruneOrphanPeople,
} from '../lib/teamUserSync.js';

function makeStore() {
  const data = {
    people: [],
    users: [],
    project_assignments: [],
  };
  let nextPersonId = 1;
  return {
    get people() { return data.people; },
    get users() { return data.users; },
    get project_assignments() { return data.project_assignments; },
    addPerson(row) {
      const id = nextPersonId++;
      data.people.push({ id, ...row, created_at: new Date().toISOString() });
      return id;
    },
    updatePerson(id, patch) {
      const i = data.people.findIndex((p) => p.id === id);
      if (i >= 0) data.people[i] = { ...data.people[i], ...patch };
    },
    deletePerson(id) {
      const i = data.people.findIndex((p) => p.id === id);
      if (i >= 0) data.people.splice(i, 1);
    },
    deleteAssignment(id) {
      const i = data.project_assignments.findIndex((a) => a.id === id);
      if (i >= 0) data.project_assignments.splice(i, 1);
    },
    setUsers(users) { data.users = users; },
    addOrphan(name) { return this.addPerson({ name, email: null, role: null }); },
  };
}

describe('teamUserSync', () => {
  let store;

  beforeEach(() => {
    store = makeStore();
    store.setUsers([
      { id: 1, name: 'Ramlee Bin Jaafar', email: 'ramlee@ctsb.com', role: 'user', active: true },
      { id: 2, name: 'Abu Dzar bin Adam', email: 'abudzar@ctsb.com', role: 'user', active: true },
    ]);
  });

  it('links people by email to active users', () => {
    const person = { id: 9, name: 'ramlee', email: 'ramlee@ctsb.com', role: null };
    expect(isPersonLinkedToUser(person, store.users)).toBe(true);
    expect(isPersonLinkedToUser({ id: 10, name: 'ramlee', email: null }, store.users)).toBe(false);
  });

  it('syncs users into people and updates names', () => {
    store.addPerson({ name: 'ramlee', email: 'ramlee@ctsb.com', role: null });
    syncAllUsersToTeamPeople(store);
    expect(store.people).toHaveLength(2);
    expect(store.people.find((p) => p.email === 'ramlee@ctsb.com')?.name).toBe('Ramlee Bin Jaafar');
  });

  it('prunes orphan roster rows without project assignments', () => {
    store.addOrphan('ramlee');
    store.addPerson({ name: 'Ramlee Bin Jaafar', email: 'ramlee@ctsb.com', role: 'user' });
    const pruned = pruneOrphanPeople(store);
    expect(pruned).toHaveLength(1);
    expect(pruned[0].name).toBe('ramlee');
    expect(findOrphanPeople(store)).toHaveLength(0);
  });

  it('syncUserToTeamPerson creates missing roster row', () => {
    const id = syncUserToTeamPerson(store, {
      name: 'Abu Dzar bin Adam',
      email: 'abudzar@ctsb.com',
      role: 'user',
    });
    expect(id).toBeTruthy();
    expect(store.people.some((p) => p.email === 'abudzar@ctsb.com')).toBe(true);
  });
});
