import { nextId } from '../runtime/helpers.js';
import { isDbMode } from '../runtime/query.js';
import {
  insertNotificationRemote,
  fetchNotificationsForUser,
  markNotificationReadRemote,
  markAllNotificationsReadRemote,
} from '../runtime/supabaseSync.js';

export function createNotificationsRepository(ctx, getStore) {
  const { getData, save } = ctx;
  let idFloor = 0;

  return {
    /** @deprecated Prefer listNotificationsForUser() — sync getter is local-only. */
    get notifications() {
      return [...(getData().notifications || [])];
    },

    async listNotificationsForUser(userId, opts = {}) {
      if (isDbMode()) {
        const remote = await fetchNotificationsForUser(userId, opts);
        return Array.isArray(remote) ? remote : [];
      }
      const uid = +userId;
      const { unreadOnly = false, limit = 50 } = opts;
      let list = (getData().notifications || []).filter((n) => Number(n.user_id) === uid);
      if (unreadOnly) list = list.filter((n) => !n.read_at);
      list.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
      return list.slice(0, limit);
    },

    async addNotification(row) {
      if (isDbMode()) {
        const inserted = await insertNotificationRemote(row);
        return inserted?.id != null ? Number(inserted.id) : null;
      }
      const data = getData();
      if (!data.notifications) data.notifications = [];
      const id = Math.max(nextId(data.notifications), idFloor + 1);
      idFloor = Math.max(idFloor, id);
      const notification = {
        id,
        user_id: +row.user_id,
        type: row.type || 'info',
        title: String(row.title || ''),
        body: row.body != null ? String(row.body) : null,
        link: row.link || null,
        entity_type: row.entity_type || null,
        entity_id: row.entity_id ?? null,
        read_at: null,
        created_at: new Date().toISOString(),
      };
      data.notifications.push(notification);
      // Do not queue full Supabase sync here — durable notifies insert remotely.
      // Queuing a full snapshot caused intermittent id collisions on Vercel.
      return id;
    },

    async markNotificationRead(id, userId) {
      if (isDbMode()) {
        return markNotificationReadRemote(id, userId);
      }
      const data = getData();
      if (!data.notifications) return false;
      const i = data.notifications.findIndex((n) => n.id === +id && n.user_id === +userId);
      if (i === -1) return false;
      if (!data.notifications[i].read_at) {
        data.notifications[i].read_at = new Date().toISOString();
        save();
      }
      return true;
    },

    async markAllNotificationsRead(userId) {
      if (isDbMode()) {
        return markAllNotificationsReadRemote(userId);
      }
      const data = getData();
      if (!data.notifications) return 0;
      const now = new Date().toISOString();
      let count = 0;
      data.notifications.forEach((n) => {
        if (n.user_id === +userId && !n.read_at) {
          n.read_at = now;
          count += 1;
        }
      });
      if (count) save();
      return count;
    },

    /** Merge rows fetched from Supabase into memory (by id). No-op in DB mode. */
    mergeNotificationsFromRemote(rows) {
      if (isDbMode()) return;
      if (!Array.isArray(rows) || !rows.length) return;
      const data = getData();
      if (!data.notifications) data.notifications = [];
      const byId = new Map(data.notifications.map((n) => [Number(n.id), n]));
      for (const row of rows) {
        const id = Number(row.id);
        if (!Number.isFinite(id)) continue;
        idFloor = Math.max(idFloor, id);
        const normalized = {
          id,
          user_id: Number(row.user_id),
          type: row.type || 'info',
          title: String(row.title || ''),
          body: row.body != null ? String(row.body) : null,
          link: row.link || null,
          entity_type: row.entity_type || null,
          entity_id: row.entity_id ?? null,
          read_at: row.read_at || null,
          created_at: row.created_at || new Date().toISOString(),
        };
        if (byId.has(id)) {
          Object.assign(byId.get(id), normalized);
        } else {
          data.notifications.push(normalized);
          byId.set(id, normalized);
        }
      }
    },

    /** Raise next id floor so new local ids do not collide with remote rows. No-op in DB mode. */
    ensureNotificationIdFloor(minId) {
      if (isDbMode()) return;
      const n = Number(minId);
      if (!Number.isFinite(n) || n < 0) return;
      idFloor = Math.max(idFloor, n);
    },
  };
}
