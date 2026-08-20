/**
 * Stateless auth repository — Supabase when configured, in-memory when ALLOW_LOCAL_STORE only.
 * Tables: users_app, sessions_app
 */
import { nextId, normalizeUserRow } from '../runtime/helpers.js';
import {
  isDbMode,
  requireSupabase,
  dbSelect,
  dbInsert,
  dbUpdate,
  dbDeleteWhere,
  dbUpsert,
} from '../runtime/query.js';

export function createAuthRepository(ctx, getStore) {
  const { getData, save } = ctx;

  async function listUsers() {
    if (!isDbMode()) return getData().users.map(normalizeUserRow);
    const rows = await dbSelect('users_app', { order: 'id' });
    return rows.map(normalizeUserRow);
  }

  async function listSessions() {
    if (!isDbMode()) return [...getData().sessions];
    return dbSelect('sessions_app', { order: 'id' });
  }

  async function findUserById(id) {
    if (id == null || id === '') return null;
    const n = Number(id);
    if (Number.isNaN(n)) return null;
    if (!isDbMode()) {
      const user = getData().users.find((u) => Number(u.id) === n) || null;
      return user ? normalizeUserRow(user) : null;
    }
    const row = await dbSelect('users_app', { filters: { id: n }, maybeSingle: true });
    return row ? normalizeUserRow(row) : null;
  }

  async function findUserByEmail(email) {
    const q = String(email || '').toLowerCase();
    if (!q) return null;
    if (!isDbMode()) {
      const user = getData().users.find((u) => u.email.toLowerCase() === q) || null;
      return user ? normalizeUserRow(user) : null;
    }
    const row = await dbSelect('users_app', { filters: { email: q }, maybeSingle: true });
    // emails may be mixed case in DB — fallback scan if exact miss
    if (row) return normalizeUserRow(row);
    const { data, error } = await requireSupabase()
      .from('users_app')
      .select('*')
      .ilike('email', q)
      .maybeSingle();
    if (error) throw error;
    return data ? normalizeUserRow(data) : null;
  }

  async function findSessionByToken(token) {
    if (!token) return null;
    if (!isDbMode()) return getData().sessions.find((s) => s.token === token) || null;
    return dbSelect('sessions_app', { filters: { token }, maybeSingle: true });
  }

  return {
    /** @deprecated Prefer listUsers() — sync getter is local-only. */
    get users() {
      return getData().users.map(normalizeUserRow);
    },
    /** @deprecated Prefer listSessions() — sync getter is local-only. */
    get sessions() {
      return [...getData().sessions];
    },

    listUsers,
    listSessions,
    findUserById,
    findUserByEmail,
    findSessionByToken,

    async addUser(row) {
      const created_at = new Date().toISOString();
      if (!isDbMode()) {
        const data = getData();
        const id = nextId(data.users);
        const user = normalizeUserRow({ id, role: 'admin', active: true, ...row, created_at });
        data.users.push(user);
        save();
        return id;
      }
      const payload = normalizeUserRow({ role: 'admin', active: true, ...row, created_at });
      delete payload.id;
      const saved = await dbInsert('users_app', payload);
      return saved.id;
    },

    /** Query DB directly when configured — do not cache into memory. */
    async findUserByIdAny(id) {
      if (id == null || id === '') return null;
      const n = Number(id);
      if (Number.isNaN(n)) return null;
      if (!isDbMode()) return findUserById(id);
      const row = await dbSelect('users_app', { filters: { id: n }, maybeSingle: true });
      return row ? normalizeUserRow(row) : null;
    },

    async updateUser(id, row) {
      const n = Number(id);
      if (!isDbMode()) {
        const data = getData();
        const i = data.users.findIndex((u) => Number(u.id) === n);
        if (i === -1) return false;
        data.users[i] = normalizeUserRow({ ...data.users[i], ...row });
        save();
        return true;
      }
      const existing = await dbSelect('users_app', { filters: { id: n }, maybeSingle: true });
      if (!existing) return false;
      const patch = normalizeUserRow({ ...existing, ...row, id: n });
      delete patch.id;
      const saved = await dbUpdate('users_app', n, patch);
      return Boolean(saved);
    },

    async createSession(user_id, token, expires_at) {
      const created_at = new Date().toISOString();
      const row = { user_id, token, expires_at, created_at };
      if (!isDbMode()) {
        const data = getData();
        const id = nextId(data.sessions);
        data.sessions.push({ id, ...row });
        save();
        return data.sessions.find((s) => s.token === token) || { id, ...row };
      }
      // Upsert by token — never invent local surrogate ids for DB sessions.
      const saved = await dbUpsert('sessions_app', row, { onConflict: 'token' });
      return saved[0] || row;
    },

    /** Query DB directly when configured — do not cache into memory. */
    async findSessionByTokenAny(token) {
      if (!token) return null;
      if (!isDbMode()) return findSessionByToken(token);
      return dbSelect('sessions_app', { filters: { token }, maybeSingle: true });
    },

    async deleteSessionByToken(token) {
      if (!isDbMode()) {
        const data = getData();
        const i = data.sessions.findIndex((s) => s.token === token);
        if (i === -1) return false;
        data.sessions.splice(i, 1);
        save();
        return true;
      }
      await dbDeleteWhere('sessions_app', { token });
      return true;
    },

    /** Remove all sessions for a user (e.g. when account deactivated). */
    async deleteSessionsForUser(userId) {
      const n = Number(userId);
      if (Number.isNaN(n)) return;
      if (!isDbMode()) {
        const data = getData();
        const before = data.sessions.length;
        data.sessions = data.sessions.filter((s) => Number(s.user_id) !== n);
        if (data.sessions.length !== before) save();
        return;
      }
      await dbDeleteWhere('sessions_app', { user_id: n });
    },

    async clearExpiredSessions() {
      const now = new Date().toISOString();
      if (!isDbMode()) {
        const data = getData();
        const before = data.sessions.length;
        data.sessions = data.sessions.filter((s) => !s.expires_at || s.expires_at > now);
        if (data.sessions.length !== before) save();
        return;
      }
      const sb = requireSupabase();
      const { error } = await sb.from('sessions_app').delete().lte('expires_at', now);
      if (error) throw error;
    },
  };
}
