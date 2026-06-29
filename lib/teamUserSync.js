/** Keep `people` roster aligned with `users_app` login accounts. */

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function findPersonByEmail(people, email) {
  const key = normalizeEmail(email);
  if (!key) return null;
  return people.find((p) => normalizeEmail(p.email) === key) || null;
}

/** True when this roster row matches an active login user (by email, or unique name). */
export function isPersonLinkedToUser(person, users = []) {
  const activeUsers = (users || []).filter((u) => u.active !== false);
  const email = normalizeEmail(person?.email);
  if (email) {
    return activeUsers.some((u) => normalizeEmail(u.email) === email);
  }
  const name = String(person?.name || '').trim().toLowerCase();
  if (!name) return false;
  const nameMatches = activeUsers.filter(
    (u) => String(u.name || '').trim().toLowerCase() === name,
  );
  return nameMatches.length === 1;
}

export function syncUserToTeamPerson(store, { name, email, role, previousEmail }) {
  const people = store.people;
  const emailKey = normalizeEmail(email);
  const prevKey = normalizeEmail(previousEmail);
  let person = findPersonByEmail(people, emailKey);
  if (!person && prevKey && prevKey !== emailKey) {
    person = findPersonByEmail(people, prevKey);
  }
  if (person) {
    store.updatePerson(person.id, {
      name,
      email: emailKey || null,
      role,
    });
    return person.id;
  }
  return store.addPerson({
    name,
    email: emailKey || null,
    role,
  });
}

export function syncAllUsersToTeamPeople(store) {
  let synced = 0;
  for (const u of store.users || []) {
    if (u.active === false) continue;
    syncUserToTeamPerson(store, {
      name: u.name,
      email: u.email,
      role: u.role,
    });
    synced += 1;
  }
  return synced;
}

export function findOrphanPeople(store) {
  const users = store.users || [];
  return store.people.filter((p) => !isPersonLinkedToUser(p, users));
}

/** Remove roster rows with no login user. Skips rows still on project teams. */
export function pruneOrphanPeople(store, { requireNoAssignments = true } = {}) {
  const orphans = findOrphanPeople(store);
  const pruned = [];
  for (const p of orphans) {
    const assignCount = store.project_assignments.filter((a) => a.person_id === p.id).length;
    if (requireNoAssignments && assignCount > 0) continue;
    if (assignCount > 0) {
      store.project_assignments
        .filter((a) => a.person_id === p.id)
        .forEach((a) => store.deleteAssignment(a.id));
    }
    store.deletePerson(p.id);
    pruned.push({ id: p.id, name: p.name, email: p.email || null });
  }
  return pruned;
}
