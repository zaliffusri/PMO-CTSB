import { Router } from 'express';
import { store } from '../db/store.js';
import { generateToken, hashPassword, verifyPassword } from '../lib/auth.js';
import { requireAuth } from '../middleware/requireAuth.js';

export const authRouter = Router();

function isUserActive(user) {
  return user && user.active !== false;
}

function sanitizeUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    active: user.active !== false,
    created_at: user.created_at,
  };
}

function getTokenFromHeader(req) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return null;
  return auth.slice('Bearer '.length).trim();
}

async function createUserSession(user) {
  const token = generateToken();
  const expires = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString();
  await store.createSession(user.id, token, expires);
  return { token, expires_at: expires };
}

authRouter.post('/register-admin', async (req, res) => {
  try {
    const { name, email, password } = req.body || {};
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'name, email, and password are required' });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    if (store.findUserByEmail(email)) {
      return res.status(409).json({ error: 'Email is already registered' });
    }

    const id = store.addUser({
      name: String(name).trim(),
      email: String(email).trim().toLowerCase(),
      role: 'admin',
      password_hash: hashPassword(String(password)),
    });
    const created = store.findUserById(id);
    store.appendAuditLog(
      { id: created.id, email: created.email, name: created.name },
      {
        action: 'create',
        target_type: 'user',
        target_id: id,
        summary: `Registered initial admin "${created.name}" (${created.email})`,
      },
    );
    const session = await createUserSession(created);
    return res.status(201).json({ user: sanitizeUser(created), ...session });
  } catch {
    return res.status(500).json({ error: 'Failed to register admin' });
  }
});

authRouter.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }
    const user = store.findUserByEmail(String(email).trim().toLowerCase());
    if (!user || !verifyPassword(String(password), user.password_hash)) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    if (!isUserActive(user)) {
      return res.status(403).json({ error: 'Account is inactive. Contact an administrator.' });
    }
    const session = await createUserSession(user);
    return res.json({ user: sanitizeUser(user), ...session });
  } catch {
    return res.status(500).json({ error: 'Failed to login' });
  }
});

authRouter.get('/me', async (req, res) => {
  store.clearExpiredSessions();
  const token = getTokenFromHeader(req);
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  const session = await store.findSessionByTokenAny(token);
  if (!session || (session.expires_at && session.expires_at <= new Date().toISOString())) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const user = await store.findUserByIdAny(session.user_id);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  if (!isUserActive(user)) {
    store.deleteSessionByToken(token);
    return res.status(401).json({ error: 'Unauthorized' });
  }
  return res.json({ user: sanitizeUser(user) });
});

authRouter.post('/logout', (req, res) => {
  const token = getTokenFromHeader(req);
  if (token) store.deleteSessionByToken(token);
  res.status(204).send();
});

authRouter.post('/change-password', requireAuth, (req, res) => {
  const { current_password, new_password } = req.body || {};
  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'current_password and new_password are required' });
  }
  if (String(new_password).length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  }
  const user = store.findUserById(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (!verifyPassword(String(current_password), user.password_hash)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }
  store.updateUser(user.id, { password_hash: hashPassword(String(new_password)) });
  store.appendAuditLog(req.user, {
    action: 'update',
    target_type: 'user',
    target_id: user.id,
    summary: 'Changed own password',
  });
  res.status(204).send();
});
