import { nextId, normalizeUserRow } from '../runtime/helpers.js';
import { supabase } from '../runtime/supabaseSync.js';

export function createAuthRepository(ctx, getStore) {
  const { getData, save } = ctx;

  return {
    get users() {
      return [...getData().users];
    },
    get sessions() {
      return [...getData().sessions];
    },

    addUser(row) {
      const data = getData();
      const id = nextId(data.users);
      const created_at = new Date().toISOString();
      const user = normalizeUserRow({ id, role: 'admin', active: true, ...row, created_at });
      data.users.push(user);
      save();
      return id;
    },

    findUserByEmail(email) {
      const data = getData();
      return data.users.find((u) => u.email.toLowerCase() === String(email).toLowerCase()) || null;
    },

    findUserById(id) {
      const data = getData();
      if (id == null || id === '') return null;
      const n = Number(id);
      if (Number.isNaN(n)) return null;
      return data.users.find((u) => Number(u.id) === n) || null;
    },

    async findUserByIdAny(id) {
      const store = getStore();
      const local = store.findUserById(id);
      if (local) return local;
      if (!supabase) return null;
      const data = getData();
      const { data: row, error } = await supabase.from('users_app').select('*').eq('id', id).maybeSingle();
      if (error || !row) return null;
      const normalized = normalizeUserRow(row);
      data.users.push(normalized);
      return normalized;
    },

    updateUser(id, row) {
      const data = getData();
      const n = Number(id);
      const i = data.users.findIndex((u) => Number(u.id) === n);
      if (i === -1) return false;
      data.users[i] = normalizeUserRow({ ...data.users[i], ...row });
      save();
      return true;
    },

    async createSession(user_id, token, expires_at) {
      const data = getData();
      const created_at = new Date().toISOString();
      const row = { user_id, token, expires_at, created_at };
      if (supabase) {
        // Upsert by token — never by surrogate id (serverless instances skew ids and overwrite valid sessions).
        const { data: saved, error } = await supabase
          .from('sessions_app')
          .upsert([row], { onConflict: 'token' })
          .select('*')
          .maybeSingle();
        if (error) throw error;
        const session = saved || { id: nextId(data.sessions), ...row };
        const existingIdx = data.sessions.findIndex((s) => s.token === token);
        if (existingIdx === -1) data.sessions.push(session);
        else data.sessions[existingIdx] = session;
      } else {
        const id = nextId(data.sessions);
        data.sessions.push({ id, ...row });
      }
      save();
      return data.sessions.find((s) => s.token === token) || row;
    },

    findSessionByToken(token) {
      const data = getData();
      return data.sessions.find((s) => s.token === token) || null;
    },

    async findSessionByTokenAny(token) {
      const store = getStore();
      const local = store.findSessionByToken(token);
      if (local) return local;
      if (!supabase) return null;
      const data = getData();
      const { data: row, error } = await supabase
        .from('sessions_app')
        .select('*')
        .eq('token', token)
        .maybeSingle();
      if (error || !row) return null;
      data.sessions.push(row);
      return row;
    },

    async deleteSessionByToken(token) {
      const data = getData();
      const i = data.sessions.findIndex((s) => s.token === token);
      if (i === -1 && !supabase) return false;
      if (i !== -1) data.sessions.splice(i, 1);
      if (supabase) {
        const { error } = await supabase.from('sessions_app').delete().eq('token', token);
        if (error) throw error;
      } else if (i === -1) return false;
      if (i !== -1) save();
      return true;
    },

    /** Remove all sessions for a user (e.g. when account deactivated). */
    async deleteSessionsForUser(userId) {
      const data = getData();
      const n = Number(userId);
      if (Number.isNaN(n)) return;
      const before = data.sessions.length;
      data.sessions = data.sessions.filter((s) => Number(s.user_id) !== n);
      if (data.sessions.length !== before) save();
      if (supabase) {
        const { error } = await supabase.from('sessions_app').delete().eq('user_id', n);
        if (error) throw error;
      }
    },

    clearExpiredSessions() {
      const data = getData();
      const now = new Date().toISOString();
      const before = data.sessions.length;
      data.sessions = data.sessions.filter((s) => !s.expires_at || s.expires_at > now);
      if (data.sessions.length !== before) save();
    },
  };
}
