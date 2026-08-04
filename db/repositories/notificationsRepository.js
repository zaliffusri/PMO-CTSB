import { nextId } from '../runtime/helpers.js';

export function createNotificationsRepository(ctx, getStore) {
  const { getData, save } = ctx;
  let idFloor = 0;

  return {
    get notifications() {
      return [...(getData().notifications || [])];
    },

    addNotification(row) {
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

    markNotificationRead(id, userId) {
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

    markAllNotificationsRead(userId) {
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

    /** Merge rows fetched from Supabase into memory (by id). */
    mergeNotificationsFromRemote(rows) {
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

    /** Raise next id floor so new local ids do not collide with remote rows. */
    ensureNotificationIdFloor(minId) {
      const n = Number(minId);
      if (!Number.isFinite(n) || n < 0) return;
      idFloor = Math.max(idFloor, n);
    },
  };
}
