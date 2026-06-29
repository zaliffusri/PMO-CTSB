import { nextId } from '../runtime/helpers.js';

export function createNotificationsRepository(ctx, getStore) {
  const { getData, save } = ctx;

  return {
    get notifications() {
      return [...(getData().notifications || [])];
    },

    addNotification(row) {
      const data = getData();
      if (!data.notifications) data.notifications = [];
      const id = nextId(data.notifications);
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
      save();
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
  };
}
