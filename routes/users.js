import { Router } from 'express';
import { store } from '../db/store.js';
import { hashPassword } from '../lib/auth.js';
import { requireAdmin } from '../middleware/requireAuth.js';
import { validateBody } from '../middleware/validate.js';
import { createUserSchema, updateUserSchema } from '../lib/validationSchemas.js';
import { syncUserToTeamPerson } from '../lib/teamUserSync.js';
import { APP_ROLES } from '../lib/permissions.js';

export const usersRouter = Router();

function safeUser(u) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    active: u.active !== false,
    created_at: u.created_at,
    avatar_url: u.avatar_url || null,
  };
}

usersRouter.get('/', async (req, res) => {
  const users = await store.listUsers();
  const rows = users
    .map(safeUser)
    .sort((a, b) => a.name.localeCompare(b.name));
  res.json(rows);
});

usersRouter.post('/', requireAdmin, validateBody(createUserSchema), async (req, res) => {
  const { name, email, password, role } = req.body;
  const finalPassword = password ? String(password) : 'P@ssw0rd';
  if (await store.findUserByEmail(email)) {
    return res.status(409).json({ error: 'Email is already registered' });
  }
  const nextRole = APP_ROLES.has(String(role)) ? String(role) : 'user';
  const id = await store.addUser({
    name,
    email,
    role: nextRole,
    password_hash: hashPassword(finalPassword),
  });
  const created = await store.findUserById(id);
  await syncUserToTeamPerson(store, {
    userId: id,
    name: created.name,
    email: created.email,
    role: created.role,
  });
  await store.appendAuditLog(req.user, {
    action: 'create',
    target_type: 'user',
    target_id: id,
    summary: `Created user "${created.name}" (${created.email}) as ${created.role}`,
  });
  try {
    await store.persistUsersToSupabase();
  } catch (e) {
    console.error('users POST persistUsersToSupabase failed', e);
    return res.status(500).json({ error: e.message || 'Failed to save to database' });
  }
  res.status(201).json(safeUser(created));
});

const ALLOWED_ROLES = APP_ROLES;

async function countActiveAdmins() {
  const users = await store.listUsers();
  return users.filter((u) => u.role === 'admin' && u.active !== false).length;
}

usersRouter.put('/:id', requireAdmin, validateBody(updateUserSchema), async (req, res) => {
  const id = +req.params.id;
  const existing = await store.findUserById(id);
  if (!existing) return res.status(404).json({ error: 'User not found' });

  const { name, email, role, password, active } = req.body;

  const nextName = name !== undefined ? name : existing.name;
  const nextEmailRaw = email !== undefined ? email : existing.email;

  const other = await store.findUserByEmail(nextEmailRaw);
  if (other && other.id !== id) {
    return res.status(409).json({ error: 'Email is already registered' });
  }

  let nextRole = role !== undefined ? String(role) : existing.role;
  if (!ALLOWED_ROLES.has(nextRole)) nextRole = existing.role;

  if (existing.role === 'admin' && nextRole !== 'admin' && (await countActiveAdmins()) <= 1) {
    return res.status(400).json({ error: 'Cannot remove the last active admin role' });
  }

  let nextActive = existing.active !== false;
  if (active !== undefined) {
    nextActive = Boolean(active);
  }
  if (existing.role === 'admin' && nextActive === false && (await countActiveAdmins()) <= 1) {
    return res.status(400).json({ error: 'Cannot deactivate the last active admin account' });
  }

  const patch = { name: nextName, email: nextEmailRaw, role: nextRole, active: nextActive };
  if (password !== undefined && password !== null && String(password).trim() !== '') {
    patch.password_hash = hashPassword(String(password));
  }

  const wasActive = existing.active !== false;
  await store.updateUser(id, patch);
  const updated = await store.findUserById(id);
  if (wasActive && updated.active === false) {
    try {
      await store.deleteSessionsForUser(id);
    } catch (e) {
      console.error('users PUT: deleteSessionsForUser failed', e);
      return res.status(500).json({ error: e.message || 'Failed to revoke sessions' });
    }
  }
  await syncUserToTeamPerson(store, {
    userId: id,
    name: updated.name,
    email: updated.email,
    role: updated.role,
    previousEmail: existing.email,
  });
  const changed = [];
  if (name !== undefined) changed.push('name');
  if (email !== undefined) changed.push('email');
  if (role !== undefined) changed.push('role');
  if (active !== undefined) changed.push('active');
  if (password !== undefined && password !== null && String(password).trim() !== '') changed.push('password');
  await store.appendAuditLog(req.user, {
    action: 'update',
    target_type: 'user',
    target_id: id,
    summary: `Updated user "${updated.name}" (${updated.email})`,
    detail: { fields: changed },
  });
  try {
    await store.persistUsersToSupabase();
  } catch (e) {
    console.error('users PUT persistUsersToSupabase failed', e);
    return res.status(500).json({ error: e.message || 'Failed to save to database' });
  }
  res.json(safeUser(updated));
});
