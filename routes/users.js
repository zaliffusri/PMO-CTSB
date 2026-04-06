import { Router } from 'express';
import { store } from '../db/store.js';
import { hashPassword } from '../lib/auth.js';
import { requireAdmin } from '../middleware/requireAuth.js';

export const usersRouter = Router();

function safeUser(u) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    active: u.active !== false,
    created_at: u.created_at,
  };
}

function findPersonByEmail(email) {
  const key = String(email || '').trim().toLowerCase();
  if (!key) return null;
  return store.people.find((p) => String(p.email || '').trim().toLowerCase() === key) || null;
}

function syncUserToTeamPerson({ name, email, role, previousEmail }) {
  const emailKey = String(email || '').trim().toLowerCase();
  const prevKey = String(previousEmail || '').trim().toLowerCase();
  let person = findPersonByEmail(emailKey);
  if (!person && prevKey && prevKey !== emailKey) {
    person = findPersonByEmail(prevKey);
  }
  if (person) {
    store.updatePerson(person.id, {
      name,
      email: emailKey || null,
      role,
    });
    return person.id;
  }
  return store.addPerson({
    name,
    email: emailKey || null,
    role,
  });
}

usersRouter.get('/', (req, res) => {
  const rows = store.users
    .map(safeUser)
    .sort((a, b) => a.name.localeCompare(b.name));
  res.json(rows);
});

usersRouter.post('/', requireAdmin, async (req, res) => {
  const { name, email, password, role } = req.body || {};
  if (!name || !email) {
    return res.status(400).json({ error: 'name and email are required' });
  }
  const finalPassword = password ? String(password) : 'P@ssw0rd';
  if (finalPassword.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  if (store.findUserByEmail(email)) {
    return res.status(409).json({ error: 'Email is already registered' });
  }
  const allowedRoles = new Set(['admin', 'pmo', 'finance', 'hr', 'user']);
  const nextRole = allowedRoles.has(String(role)) ? String(role) : 'user';
  const id = store.addUser({
    name: String(name).trim(),
    email: String(email).trim().toLowerCase(),
    role: nextRole,
    password_hash: hashPassword(finalPassword),
  });
  const created = store.findUserById(id);
  syncUserToTeamPerson({
    name: created.name,
    email: created.email,
    role: created.role,
  });
  store.appendAuditLog(req.user, {
    action: 'create',
    target_type: 'user',
    target_id: id,
    summary: `Created user "${created.name}" (${created.email}) as ${created.role}`,
  });
  try {
    await store.persistToSupabase();
  } catch (e) {
    console.error('users POST persistToSupabase failed', e);
    return res.status(500).json({ error: e.message || 'Failed to save to database' });
  }
  res.status(201).json(safeUser(created));
});

const ALLOWED_ROLES = new Set(['admin', 'pmo', 'finance', 'hr', 'user']);

/** Admins that can still sign in (used for last-admin protection). */
function countActiveAdmins() {
  return store.users.filter((u) => u.role === 'admin' && u.active !== false).length;
}

usersRouter.put('/:id', requireAdmin, async (req, res) => {
  const id = +req.params.id;
  const existing = store.findUserById(id);
  if (!existing) return res.status(404).json({ error: 'User not found' });

  const { name, email, role, password, active } = req.body || {};
  if (name === undefined && email === undefined && role === undefined && password === undefined && active === undefined) {
    return res.status(400).json({ error: 'Nothing to update' });
  }

  const nextName = name !== undefined ? String(name).trim() : existing.name;
  if (!nextName) return res.status(400).json({ error: 'Name cannot be empty' });

  const nextEmailRaw = email !== undefined ? String(email).trim().toLowerCase() : existing.email;
  if (!nextEmailRaw) return res.status(400).json({ error: 'Email cannot be empty' });

  const other = store.findUserByEmail(nextEmailRaw);
  if (other && other.id !== id) {
    return res.status(409).json({ error: 'Email is already registered' });
  }

  let nextRole = role !== undefined ? String(role) : existing.role;
  if (!ALLOWED_ROLES.has(nextRole)) nextRole = existing.role;

  if (existing.role === 'admin' && nextRole !== 'admin' && countAdmins() <= 1) {
    return res.status(400).json({ error: 'Cannot remove the last admin role' });
  }

  let nextActive = existing.active !== false;
  if (active !== undefined) {
    nextActive = Boolean(active);
  }
  if (existing.role === 'admin' && nextActive === false && countActiveAdmins() <= 1) {
    return res.status(400).json({ error: 'Cannot deactivate the last active admin account' });
  }

  const patch = { name: nextName, email: nextEmailRaw, role: nextRole, active: nextActive };
  if (password !== undefined && password !== null && String(password).trim() !== '') {
    if (String(password).length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    patch.password_hash = hashPassword(String(password));
  }

  const wasActive = existing.active !== false;
  store.updateUser(id, patch);
  const updated = store.findUserById(id);
  if (wasActive && updated.active === false) {
    try {
      await store.deleteSessionsForUser(id);
    } catch (e) {
      console.error('users PUT: deleteSessionsForUser failed', e);
      return res.status(500).json({ error: e.message || 'Failed to revoke sessions' });
    }
  }
  syncUserToTeamPerson({
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
  store.appendAuditLog(req.user, {
    action: 'update',
    target_type: 'user',
    target_id: id,
    summary: `Updated user "${updated.name}" (${updated.email})`,
    detail: { fields: changed },
  });
  try {
    await store.persistToSupabase();
  } catch (e) {
    console.error('users PUT persistToSupabase failed', e);
    return res.status(500).json({ error: e.message || 'Failed to save to database' });
  }
  res.json(safeUser(updated));
});
