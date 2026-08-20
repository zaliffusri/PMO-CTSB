/** Keep `people` roster aligned with `users_app` via hard FK people.user_id. */

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function findPersonByUserId(people, userId) {
  const uid = Number(userId);
  if (!Number.isFinite(uid)) return null;
  return (people || []).find((p) => Number(p.user_id) === uid) || null;
}

/** @deprecated Prefer findPersonByUserId — email lookup only for one-time reclaim during sync. */
export function findPersonByEmail(people, email) {
  const key = normalizeEmail(email);
  if (!key) return null;
  return people.find((p) => normalizeEmail(p.email) === key) || null;
}

/** True when this roster row has a hard link to an active login user. */
export function isPersonLinkedToUser(person, users = []) {
  const uid = Number(person?.user_id);
  if (!Number.isFinite(uid)) return false;
  const activeUsers = (users || []).filter((u) => u.active !== false);
  return activeUsers.some((u) => Number(u.id) === uid);
}

/**
 * Upsert roster row for a login user, always setting people.user_id.
 * Email is used only to reclaim an unlinked person row once (migration safety).
 */
export async function syncUserToTeamPerson(store, {
  userId,
  name,
  email,
  role,
  previousEmail,
}) {
  const uid = Number(userId);
  if (!Number.isFinite(uid)) {
    throw new Error('userId is required to sync team person');
  }
  const people = await store.listPeople();
  const emailKey = normalizeEmail(email);
  const prevKey = normalizeEmail(previousEmail);

  let person = findPersonByUserId(people, uid);
  if (!person && emailKey) {
    const byEmail = findPersonByEmail(people, emailKey);
    // Reclaim only if unlinked or already linked to this user
    if (byEmail && (byEmail.user_id == null || Number(byEmail.user_id) === uid)) {
      person = byEmail;
    }
  }
  if (!person && prevKey && prevKey !== emailKey) {
    const byPrev = findPersonByEmail(people, prevKey);
    if (byPrev && (byPrev.user_id == null || Number(byPrev.user_id) === uid)) {
      person = byPrev;
    }
  }

  if (person) {
    await store.updatePerson(person.id, {
      name,
      email: emailKey || null,
      role,
      user_id: uid,
    });
    return person.id;
  }

  return await store.addPerson({
    name,
    email: emailKey || null,
    role,
    user_id: uid,
  });
}

export async function syncAllUsersToTeamPeople(store) {
  let synced = 0;
  const users = await store.listUsers();
  for (const u of users || []) {
    if (u.active === false) continue;
    await syncUserToTeamPerson(store, {
      userId: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
    });
    synced += 1;
  }
  return synced;
}

export async function findOrphanPeople(store) {
  const users = await store.listUsers();
  const people = await store.listPeople();
  return people.filter((p) => !isPersonLinkedToUser(p, users));
}

/** Remove roster rows with no login user. Skips rows still on project teams. */
export async function pruneOrphanPeople(store, { requireNoAssignments = true } = {}) {
  const orphans = await findOrphanPeople(store);
  const assignments = await store.listAssignments();
  const pruned = [];
  for (const p of orphans) {
    const personAssignments = assignments.filter((a) => a.person_id === p.id);
    const assignCount = personAssignments.length;
    if (requireNoAssignments && assignCount > 0) continue;
    if (assignCount > 0) {
      for (const a of personAssignments) {
        await store.deleteAssignment(a.id);
      }
    }
    await store.deletePerson(p.id);
    pruned.push({ id: p.id, name: p.name, email: p.email || null, user_id: p.user_id ?? null });
  }
  return pruned;
}
