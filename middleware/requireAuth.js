import { store } from '../db/store.js';

function getTokenFromHeader(req) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return null;
  return auth.slice('Bearer '.length).trim();
}

export function requireAuth(req, res, next) {
  store.clearExpiredSessions();
  const token = getTokenFromHeader(req);
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  const session = store.findSessionByToken(token);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });
  const user = store.findUserById(session.user_id);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  req.user = { id: user.id, email: user.email, role: user.role, name: user.name };
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}
