import { Router } from 'express';
import { store } from '../db/store.js';
import {
  fetchNotificationsForUser,
  countUnreadNotificationsForUser,
  markNotificationReadRemote,
  markAllNotificationsReadRemote,
  hasSupabaseClient,
} from '../db/runtime/supabaseSync.js';

export const notificationsRouter = Router();

function sameUserId(a, b) {
  return Number(a) === Number(b) && Number.isFinite(Number(a));
}

function memoryNotifications(uid, { unreadOnly = false, limit = 50 } = {}) {
  let list = (store.notifications || []).filter((n) => sameUserId(n.user_id, uid));
  if (unreadOnly) list = list.filter((n) => !n.read_at);
  list.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  return list.slice(0, limit);
}

async function loadList(uid, unreadOnly) {
  if (hasSupabaseClient()) {
    try {
      const remote = await fetchNotificationsForUser(uid, { unreadOnly, limit: 50 });
      if (Array.isArray(remote)) {
        store.mergeNotificationsFromRemote?.(remote);
        return remote;
      }
    } catch (e) {
      console.warn('notifications list: supabase fetch failed', e?.message || e);
      try {
        await store.reloadFromSupabase();
      } catch (e2) {
        console.warn('notifications list: reload fallback failed', e2?.message || e2);
      }
    }
  }
  return memoryNotifications(uid, { unreadOnly });
}

async function loadCount(uid) {
  if (hasSupabaseClient()) {
    try {
      const remote = await countUnreadNotificationsForUser(uid);
      if (remote != null) return remote;
    } catch (e) {
      console.warn('notifications count: supabase fetch failed', e?.message || e);
      try {
        await store.reloadFromSupabase();
      } catch (e2) {
        console.warn('notifications count: reload fallback failed', e2?.message || e2);
      }
    }
  }
  return memoryNotifications(uid, { unreadOnly: true, limit: 500 }).length;
}

notificationsRouter.get('/', async (req, res) => {
  const unreadOnly = req.query.unread === '1' || req.query.unread === 'true';
  const uid = Number(req.user.id);
  // Always 200 — never 503. Missing table / transient errors return [].
  const list = await loadList(uid, unreadOnly);
  res.json(Array.isArray(list) ? list : []);
});

notificationsRouter.get('/count', async (req, res) => {
  const uid = Number(req.user.id);
  const unread = await loadCount(uid);
  res.json({ unread: Number(unread) || 0 });
});

notificationsRouter.post('/read-all', async (req, res) => {
  const uid = req.user.id;
  const local = store.markAllNotificationsRead(uid);
  let remote = 0;
  try {
    remote = await markAllNotificationsReadRemote(uid);
  } catch (e) {
    console.warn('notifications read-all remote:', e?.message || e);
  }
  res.json({ marked: Math.max(local, remote) });
});

notificationsRouter.post('/:id/read', async (req, res) => {
  const id = +req.params.id;
  const uid = req.user.id;
  const localOk = store.markNotificationRead(id, uid);
  let remoteOk = false;
  try {
    remoteOk = await markNotificationReadRemote(id, uid);
  } catch (e) {
    console.warn('notifications read remote:', e?.message || e);
  }
  if (!localOk && !remoteOk) return res.status(404).json({ error: 'Notification not found' });
  res.json({ ok: true });
});
