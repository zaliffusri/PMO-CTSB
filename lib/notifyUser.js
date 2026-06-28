import { store } from '../db/store.js';

/** Resolve app user id from team person (email match). */
export function userIdForPerson(person) {
  if (!person) return null;
  const email = String(person.email || '').trim().toLowerCase();
  if (email) {
    const u = store.findUserByEmail(email);
    if (u) return u.id;
  }
  const name = String(person.name || '').trim().toLowerCase();
  if (!name) return null;
  const u = store.users.find(
    (x) => String(x.name || '').trim().toLowerCase() === name && x.active !== false,
  );
  return u?.id ?? null;
}

export function userIdForPersonId(personId) {
  if (personId == null) return null;
  const person = store.people.find((p) => p.id === +personId);
  return userIdForPerson(person);
}

export function emailForPerson(person) {
  if (!person) return null;
  if (person.email) return String(person.email).trim();
  const uid = userIdForPerson(person);
  if (!uid) return null;
  const u = store.findUserById(uid);
  return u?.email || null;
}

/**
 * In-app notification for a user.
 * @param {{ user_id: number, type: string, title: string, body?: string, link?: string, entity_type?: string, entity_id?: number }} payload
 */
export function notifyInApp(payload) {
  if (!payload?.user_id) return null;
  return store.addNotification({
    user_id: +payload.user_id,
    type: payload.type || 'info',
    title: payload.title,
    body: payload.body || null,
    link: payload.link || null,
    entity_type: payload.entity_type || null,
    entity_id: payload.entity_id ?? null,
  });
}

export function notifyPersonInApp(personId, payload) {
  const userId = userIdForPersonId(personId);
  if (!userId) return null;
  return notifyInApp({ ...payload, user_id: userId });
}
