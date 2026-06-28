import { Router } from 'express';
import { store } from '../db/store.js';

export const notificationsRouter = Router();

notificationsRouter.get('/', (req, res) => {
  const unreadOnly = req.query.unread === '1' || req.query.unread === 'true';
  let list = (store.notifications || []).filter((n) => n.user_id === req.user.id);
  if (unreadOnly) list = list.filter((n) => !n.read_at);
  list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  res.json(list.slice(0, 50));
});

notificationsRouter.get('/count', (req, res) => {
  const unread = (store.notifications || []).filter(
    (n) => n.user_id === req.user.id && !n.read_at,
  ).length;
  res.json({ unread });
});

notificationsRouter.post('/read-all', async (req, res) => {
  const count = store.markAllNotificationsRead(req.user.id);
  try { await store.persistToSupabase(); } catch (e) { console.warn('persist:', e.message); }
  res.json({ marked: count });
});

notificationsRouter.post('/:id/read', async (req, res) => {
  const ok = store.markNotificationRead(+req.params.id, req.user.id);
  if (!ok) return res.status(404).json({ error: 'Notification not found' });
  try { await store.persistToSupabase(); } catch (e) { console.warn('persist:', e.message); }
  res.json({ ok: true });
});
