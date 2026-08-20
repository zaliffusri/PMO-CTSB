import { describe, it, expect, beforeEach } from 'vitest';
import {
  isPersonLinkedToUser,
  syncUserToTeamPerson,
  syncAllUsersToTeamPeople,
  findOrphanPeople,
  pruneOrphanPeople,
} from '../lib/teamUserSync.js';
import { personIdForUser } from '../lib/permissions.js';

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
    async listPeople() { return data.people; },
    async listUsers() { return data.users; },
    async listAssignments() { return data.project_assignments; },
    async addPerson(row) {
      const id = nextPersonId++;
      data.people.push({ id, ...row, created_at: new Date().toISOString() });
      return id;
    },
    async updatePerson(id, patch) {
      const i = data.people.findIndex((p) => p.id === id);
      if (i >= 0) data.people[i] = { ...data.people[i], ...patch };
    },
    async deletePerson(id) {
      const i = data.people.findIndex((p) => p.id === id);
      if (i >= 0) data.people.splice(i, 1);
    },
    async deleteAssignment(id) {
      const i = data.project_assignments.findIndex((a) => a.id === id);
      if (i >= 0) data.project_assignments.splice(i, 1);
    },
    setUsers(users) { data.users = users; },
    async addOrphan(name) { return this.addPerson({ name, email: null, role: null, user_id: null }); },
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

  it('links people by user_id hard FK only (not email/name)', () => {
    expect(isPersonLinkedToUser(
      { id: 9, name: 'ramlee', email: 'ramlee@ctsb.com', user_id: 1 },
      store.users,
    )).toBe(true);
    expect(isPersonLinkedToUser(
      { id: 10, name: 'ramlee', email: 'ramlee@ctsb.com', user_id: null },
      store.users,
    )).toBe(false);
    expect(personIdForUser({ id: 1 }, [
      { id: 9, user_id: 1 },
      { id: 10, email: 'ramlee@ctsb.com' },
    ])).toBe(9);
  });

  it('syncs users into people with user_id and updates names', async () => {
    await store.addPerson({ name: 'ramlee', email: 'ramlee@ctsb.com', role: null, user_id: null });
    await syncAllUsersToTeamPeople(store);
    expect(store.people).toHaveLength(2);
    const ramlee = store.people.find((p) => p.email === 'ramlee@ctsb.com');
    expect(ramlee?.name).toBe('Ramlee Bin Jaafar');
    expect(ramlee?.user_id).toBe(1);
  });

  it('prunes orphan roster rows without project assignments', async () => {
    await store.addOrphan('ramlee');
    await store.addPerson({ name: 'Ramlee Bin Jaafar', email: 'ramlee@ctsb.com', role: 'user', user_id: 1 });
    const pruned = await pruneOrphanPeople(store);
    expect(pruned).toHaveLength(1);
    expect(pruned[0].name).toBe('ramlee');
    expect(await findOrphanPeople(store)).toHaveLength(0);
  });

  it('syncUserToTeamPerson creates missing roster row with user_id', async () => {
    const id = await syncUserToTeamPerson(store, {
      userId: 2,
      name: 'Abu Dzar bin Adam',
      email: 'abudzar@ctsb.com',
      role: 'user',
    });
    expect(id).toBeTruthy();
    const row = store.people.find((p) => p.email === 'abudzar@ctsb.com');
    expect(row?.user_id).toBe(2);
  });

  it('personIdForUser ignores email soft-match', () => {
    const people = [{ id: 5, email: 'ramlee@ctsb.com', name: 'Ramlee Bin Jaafar', user_id: null }];
    expect(personIdForUser({ id: 1, email: 'ramlee@ctsb.com', name: 'Ramlee Bin Jaafar' }, people)).toBeNull();
  });
});
