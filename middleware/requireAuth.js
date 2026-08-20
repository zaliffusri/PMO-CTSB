import { store } from '../db/store.js';
import { getTokenFromHeader } from './authUtils.js';

export { requireAdmin } from './requireRole.js';

export function requireAuth(req, res, next) {
  (async () => {
    try {
      await store.clearExpiredSessions();
    } catch (e) {
      console.warn('clearExpiredSessions:', e?.message || e);
    }
    const token = getTokenFromHeader(req);
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    const session = await store.findSessionByTokenAny(token);
    if (!session || (session.expires_at && session.expires_at <= new Date().toISOString())) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const user = await store.findUserByIdAny(session.user_id);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    if (user.active === false) {
      await store.deleteSessionByToken(token);
      return res.status(401).json({ error: 'Unauthorized' });
    }
    let personId = null;
    try {
      const person = await store.findPersonByUserId?.(user.id);
      personId = person?.id ?? null;
    } catch (e) {
      console.warn('requireAuth: findPersonByUserId', e?.message || e);
    }
    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      person_id: personId,
    };
    next();
  })().catch(() => res.status(401).json({ error: 'Unauthorized' }));
}
