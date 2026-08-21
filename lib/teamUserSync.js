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
  peopleCache = null,
}) {
  const uid = Number(userId);
  if (!Number.isFinite(uid)) {
    throw new Error('userId is required to sync team person');
  }
  const people = peopleCache || await store.listPeople();
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
    if (peopleCache) {
      const i = peopleCache.findIndex((p) => Number(p.id) === Number(person.id));
      if (i >= 0) {
        peopleCache[i] = {
          ...peopleCache[i],
          name,
          email: emailKey || null,
          role,
          user_id: uid,
        };
      }
    }
    return person.id;
  }

  const id = await store.addPerson({
    name,
    email: emailKey || null,
    role,
    user_id: uid,
  });
  if (peopleCache) {
    peopleCache.push({
      id,
      name,
      email: emailKey || null,
      role,
      user_id: uid,
    });
  }
  return id;
}

/** In-memory / local-store path: one people list, then per-user upsert. */
export async function syncAllUsersToTeamPeopleLocal(store) {
  let synced = 0;
  const [users, people] = await Promise.all([store.listUsers(), store.listPeople()]);
  const peopleCache = [...(people || [])];
  for (const u of users || []) {
    if (u.active === false) continue;
    await syncUserToTeamPerson(store, {
      userId: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      peopleCache,
    });
    synced += 1;
  }
  return synced;
}

/**
 * Preferred path when Supabase is configured: single Postgres RPC.
 * Falls back to local loop if RPC is missing (migration not applied yet).
 */
export async function syncPeopleFromUsersViaRpc() {
  const { requireSupabase } = await import('../db/runtime/query.js');
  const sb = requireSupabase();
  const { data, error } = await sb.rpc('sync_people_from_users');
  if (error) throw error;
  const payload = data && typeof data === 'object' ? data : {};
  return {
    synced: Number(payload.synced) || 0,
    pruned: Array.isArray(payload.pruned) ? payload.pruned : [],
    orphanRemaining: Array.isArray(payload.orphanRemaining) ? payload.orphanRemaining : [],
  };
}

export async function syncAllUsersToTeamPeople(store) {
  return syncAllUsersToTeamPeopleLocal(store);
}

/**
 * Full sync+prune used by POST /people/sync-from-users.
 * DB mode → one RPC; otherwise existing store helpers.
 */
export async function syncPeopleRosterFromUsers(store) {
  const { isDbMode } = await import('../db/runtime/query.js');
  if (isDbMode()) {
    try {
      return await syncPeopleFromUsersViaRpc();
    } catch (e) {
      console.warn(
        'sync_people_from_users RPC unavailable, using Node fallback:',
        e?.message || e,
      );
    }
  }

  const synced = await syncAllUsersToTeamPeopleLocal(store);
  const pruned = await pruneOrphanPeople(store, { requireNoAssignments: true });
  const orphans = await findOrphanPeople(store);
  const assignments = await store.listAssignments();
  const orphanRemaining = orphans.map((p) => ({
    id: p.id,
    name: p.name,
    email: p.email || null,
    project_count: assignments.filter((a) => a.person_id === p.id).length,
  }));
  return { synced, pruned, orphanRemaining };
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
