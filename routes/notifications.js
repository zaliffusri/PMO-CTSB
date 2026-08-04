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
  list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return list.slice(0, limit);
}

async function loadRemoteList(uid, unreadOnly) {
  let lastErr = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await fetchNotificationsForUser(uid, { unreadOnly, limit: 50 });
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('Failed to load notifications');
}

async function loadRemoteCount(uid) {
  let lastErr = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await countUnreadNotificationsForUser(uid);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('Failed to count notifications');
}

notificationsRouter.get('/', async (req, res) => {
  const unreadOnly = req.query.unread === '1' || req.query.unread === 'true';
  const uid = Number(req.user.id);

  if (hasSupabaseClient()) {
    try {
      const remote = await loadRemoteList(uid, unreadOnly);
      store.mergeNotificationsFromRemote?.(remote);
      return res.json(remote);
    } catch (e) {
      console.warn('notifications list: supabase fetch failed', e?.message || e);
      // Do not fall back to empty warm-instance memory — that caused intermittent "no notifications".
      return res.status(503).json({ error: 'Could not load notifications' });
    }
  }

  res.json(memoryNotifications(uid, { unreadOnly }));
});

notificationsRouter.get('/count', async (req, res) => {
  const uid = Number(req.user.id);

  if (hasSupabaseClient()) {
    try {
      const remote = await loadRemoteCount(uid);
      return res.json({ unread: remote || 0 });
    } catch (e) {
      console.warn('notifications count: supabase fetch failed', e?.message || e);
      return res.status(503).json({ error: 'Could not load notification count' });
    }
  }

  const unread = memoryNotifications(uid, { unreadOnly: true, limit: 500 }).length;
  res.json({ unread });
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
