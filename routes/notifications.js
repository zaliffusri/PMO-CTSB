import { Router } from 'express';
import { store } from '../db/store.js';
import {
  fetchNotificationsForUser,
  countUnreadNotificationsForUser,
  markNotificationReadRemote,
  markAllNotificationsReadRemote,
  hasSupabaseClient,
} from '../db/runtime/supabaseSync.js';
import { logger } from '../lib/logger.js';

export const notificationsRouter = Router();

async function memoryNotifications(uid, { unreadOnly = false, limit = 50 } = {}) {
  return await store.listNotificationsForUser(uid, { unreadOnly, limit });
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
      logger.warn('notifications list: supabase fetch failed', { err: e?.message || e });
      try {
        await store.reloadFromSupabase();
      } catch (e2) {
        logger.warn('notifications list: reload fallback failed', { err: e2?.message || e2 });
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
      logger.warn('notifications count: supabase fetch failed', { err: e?.message || e });
      try {
        await store.reloadFromSupabase();
      } catch (e2) {
        logger.warn('notifications count: reload fallback failed', { err: e2?.message || e2 });
      }
    }
  }
  const list = await memoryNotifications(uid, { unreadOnly: true, limit: 500 });
  return list.length;
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
  const local = await store.markAllNotificationsRead(uid);
  let remote = 0;
  try {
    remote = await markAllNotificationsReadRemote(uid);
  } catch (e) {
    logger.warn('notifications read-all remote', { err: e?.message || e });
  }
  res.json({ marked: Math.max(local, remote) });
});

notificationsRouter.post('/:id/read', async (req, res) => {
  const id = +req.params.id;
  const uid = req.user.id;
  const localOk = await store.markNotificationRead(id, uid);
  let remoteOk = false;
  try {
    remoteOk = await markNotificationReadRemote(id, uid);
  } catch (e) {
    logger.warn('notifications read remote', { err: e?.message || e });
  }
  if (!localOk && !remoteOk) return res.status(404).json({ error: 'Notification not found' });
  res.json({ ok: true });
});
