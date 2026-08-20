import { store } from '../db/store.js';
import { insertNotificationRemote, hasSupabaseClient } from '../db/runtime/supabaseSync.js';

/** Resolve app user id from team person (email match). */
export async function userIdForPerson(person) {
  if (!person) return null;
  const email = String(person.email || '').trim().toLowerCase();
  if (email) {
    const u = await store.findUserByEmail(email);
    if (u) return Number(u.id);
  }
  const name = String(person.name || '').trim().toLowerCase();
  if (!name) return null;
  const users = await store.listUsers();
  const u = users.find(
    (x) => String(x.name || '').trim().toLowerCase() === name && x.active !== false,
  );
  return u?.id != null ? Number(u.id) : null;
}

export async function userIdForPersonId(personId) {
  if (personId == null) return null;
  const people = await store.listPeople();
  const person = people.find((p) => Number(p.id) === Number(personId));
  return await userIdForPerson(person);
}

export async function emailForPerson(person) {
  if (!person) return null;
  if (person.email) return String(person.email).trim();
  const uid = await userIdForPerson(person);
  if (!uid) return null;
  const u = await store.findUserById(uid);
  return u?.email || null;
}

/**
 * Resolve a calendar assignee id (user id or people id) to an app user id.
 */
export async function resolveAppUserId(rawId) {
  if (rawId == null || rawId === '') return null;
  const n = Number(rawId);
  if (!Number.isFinite(n)) return null;
  if (await store.findUserById(n)) return n;
  return await userIdForPersonId(n);
}

/**
 * Durable in-app notification: insert into Supabase with DB-generated id.
 * Falls back to memory-only when Supabase is unavailable.
 * @returns {Promise<number|null>} notification id
 */
export async function notifyInApp(payload) {
  const userId = Number(payload?.user_id);
  if (!Number.isFinite(userId) || userId <= 0) return null;

  const row = {
    user_id: userId,
    type: payload.type || 'info',
    title: payload.title,
    body: payload.body || null,
    link: payload.link || null,
    entity_type: payload.entity_type || null,
    entity_id: payload.entity_id ?? null,
  };

  if (hasSupabaseClient()) {
    let lastErr = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const inserted = await insertNotificationRemote(row);
        if (inserted?.id != null) {
          store.mergeNotificationsFromRemote?.([inserted]);
          return Number(inserted.id);
        }
      } catch (e) {
        lastErr = e;
        if (attempt === 0) continue;
      }
    }
    console.warn('notifyInApp: remote insert failed', lastErr?.message || lastErr);
    return null;
  }

  return await store.addNotification(row);
}

export async function notifyPersonInApp(personId, payload) {
  const userId = await resolveAppUserId(personId);
  if (!userId) return null;
  return notifyInApp({ ...payload, user_id: userId });
}
