import { Router } from 'express';
import { store } from '../db/store.js';
import { generateToken, hashPassword, verifyPassword } from '../lib/auth.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { getTokenFromHeader } from '../middleware/authUtils.js';
import { mintSupabaseRealtimeJwt } from '../lib/realtimeJwt.js';

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
    avatar_url: user.avatar_url || null,
  };
}

/** Short-lived JWT for browser → Supabase Realtime (RLS). Not a session bearer. */
function realtimeAuthFields(userId) {
  const minted = mintSupabaseRealtimeJwt({ userId, ttlSeconds: 3600 });
  if (!minted) return {};
  return {
    supabase_realtime_token: minted.token,
    supabase_realtime_expires_at: minted.expiresAt,
    supabase_realtime_expires_in: minted.expiresIn,
  };
}

const MAX_AVATAR_BYTES = 1_500_000;
const AVATAR_DATA_URL_RE = /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/;

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
    if (await store.findUserByEmail(email)) {
      return res.status(409).json({ error: 'Email is already registered' });
    }

    const id = await store.addUser({
      name: String(name).trim(),
      email: String(email).trim().toLowerCase(),
      role: 'admin',
      password_hash: hashPassword(String(password)),
    });
    const created = await store.findUserById(id);
    await store.appendAuditLog(
      { id: created.id, email: created.email, name: created.name },
      {
        action: 'create',
        target_type: 'user',
        target_id: id,
        summary: `Registered initial admin "${created.name}" (${created.email})`,
      },
    );
    const session = await createUserSession(created);
    return res.status(201).json({
      user: sanitizeUser(created),
      ...session,
      ...realtimeAuthFields(created.id),
    });
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
    const user = await store.findUserByEmail(String(email).trim().toLowerCase());
    if (!user || !verifyPassword(String(password), user.password_hash)) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    if (!isUserActive(user)) {
      return res.status(403).json({ error: 'Account is inactive. Contact an administrator.' });
    }
    const session = await createUserSession(user);
    return res.json({
      user: sanitizeUser(user),
      ...session,
      ...realtimeAuthFields(user.id),
    });
  } catch {
    return res.status(500).json({ error: 'Failed to login' });
  }
});

authRouter.get('/me', async (req, res) => {
  await store.clearExpiredSessions();
  const token = getTokenFromHeader(req);
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  const session = await store.findSessionByTokenAny(token);
  if (!session || (session.expires_at && session.expires_at <= new Date().toISOString())) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const user = await store.findUserByIdAny(session.user_id);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  if (!isUserActive(user)) {
    await store.deleteSessionByToken(token);
    return res.status(401).json({ error: 'Unauthorized' });
  }
  return res.json({
    user: sanitizeUser(user),
    ...realtimeAuthFields(user.id),
  });
});

authRouter.post('/logout', async (req, res) => {
  const token = getTokenFromHeader(req);
  if (token) await store.deleteSessionByToken(token);
  res.status(204).send();
});

authRouter.post('/avatar', requireAuth, async (req, res) => {
  try {
    const { avatar_url } = req.body || {};
    if (typeof avatar_url !== 'string' || !AVATAR_DATA_URL_RE.test(avatar_url)) {
      return res.status(400).json({ error: 'avatar_url must be a base64 image data URL' });
    }
    if (avatar_url.length > MAX_AVATAR_BYTES) {
      return res.status(413).json({ error: 'Avatar is too large. Please choose a smaller image.' });
    }
    const user = await store.findUserById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    await store.updateUser(user.id, { avatar_url });
    await store.appendAuditLog(req.user, {
      action: 'update',
      target_type: 'user',
      target_id: user.id,
      summary: 'Updated profile picture',
    });
    try {
      await store.persistToSupabase();
    } catch (e) {
      console.error('auth /avatar POST persistToSupabase failed', e);
      return res.status(500).json({ error: e.message || 'Failed to save avatar' });
    }
    const updated = await store.findUserById(user.id);
    return res.json({ user: sanitizeUser(updated) });
  } catch (e) {
    console.error('auth /avatar POST failed', e);
    return res.status(500).json({ error: 'Failed to update avatar' });
  }
});

authRouter.delete('/avatar', requireAuth, async (req, res) => {
  try {
    const user = await store.findUserById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.avatar_url) {
      return res.json({ user: sanitizeUser(user) });
    }
    await store.updateUser(user.id, { avatar_url: null });
    await store.appendAuditLog(req.user, {
      action: 'update',
      target_type: 'user',
      target_id: user.id,
      summary: 'Removed profile picture',
    });
    try {
      await store.persistToSupabase();
    } catch (e) {
      console.error('auth /avatar DELETE persistToSupabase failed', e);
      return res.status(500).json({ error: e.message || 'Failed to remove avatar' });
    }
    const updated = await store.findUserById(user.id);
    return res.json({ user: sanitizeUser(updated) });
  } catch (e) {
    console.error('auth /avatar DELETE failed', e);
    return res.status(500).json({ error: 'Failed to remove avatar' });
  }
});

authRouter.post('/change-password', requireAuth, async (req, res) => {
  const { current_password, new_password } = req.body || {};
  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'current_password and new_password are required' });
  }
  if (String(new_password).length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  }
  const user = await store.findUserById(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (!verifyPassword(String(current_password), user.password_hash)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }
  await store.updateUser(user.id, { password_hash: hashPassword(String(new_password)) });
  await store.appendAuditLog(req.user, {
    action: 'update',
    target_type: 'user',
    target_id: user.id,
    summary: 'Changed own password',
  });
  res.status(204).send();
});
