import { store } from '../db/store.js';
import { getTokenFromHeader } from './authUtils.js';

export { requireAdmin } from './requireRole.js';

export function requireAuth(req, res, next) {
  (async () => {
    store.clearExpiredSessions();
    const token = getTokenFromHeader(req);
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    const session = await store.findSessionByTokenAny(token);
    if (!session || (session.expires_at && session.expires_at <= new Date().toISOString())) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const user = await store.findUserByIdAny(session.user_id);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    if (user.active === false) {
      store.deleteSessionByToken(token);
      return res.status(401).json({ error: 'Unauthorized' });
    }
    req.user = { id: user.id, email: user.email, role: user.role, name: user.name };
    next();
  })().catch(() => res.status(401).json({ error: 'Unauthorized' }));
}
