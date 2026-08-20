/**
 * Stateless clients repository — Supabase when configured, in-memory when ALLOW_LOCAL_STORE only.
 */
import { formatClientNames } from '../../lib/projectClients.js';
import { nextId } from '../runtime/helpers.js';
import { isDbMode, dbSelect, dbInsert, dbUpdate, dbDelete, dbDeleteWhere } from '../runtime/query.js';

export function createClientsRepository(ctx, getStore) {
  const { getData, save } = ctx;

  async function listClients() {
    if (!isDbMode()) return [...getData().clients];
    return dbSelect('clients', { order: 'id' });
  }

  async function listClientContacts() {
    if (!isDbMode()) return [...(getData().client_contacts || [])];
    return dbSelect('client_contacts', { order: 'id' });
  }

  async function listProjectClients() {
    if (!isDbMode()) return [...(getData().project_clients || [])];
    return dbSelect('project_clients', { order: 'id' });
  }

  async function getClientById(id) {
    if (!isDbMode()) return getData().clients.find((c) => Number(c.id) === Number(id)) || null;
    return dbSelect('clients', { filters: { id: Number(id) }, maybeSingle: true });
  }

  return {
    /** @deprecated Prefer listClients() — sync getter is local-only. */
    get clients() {
      return [...getData().clients];
    },
    get client_contacts() {
      return [...(getData().client_contacts || [])];
    },
    get project_clients() {
      return [...(getData().project_clients || [])];
    },

    listClients,
    listClientContacts,
    listProjectClients,
    getClientById,

    async getClientsForProject(projectId) {
      const pid = Number(projectId);
      if (!isDbMode()) {
        const data = getData();
        const links = (data.project_clients || []).filter((pc) => Number(pc.project_id) === pid);
        return links
          .map((pc) => data.clients.find((c) => Number(c.id) === Number(pc.client_id)))
          .filter(Boolean)
          .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      }
      const links = await dbSelect('project_clients', { filters: { project_id: pid } });
      if (!links.length) return [];
      const ids = links.map((l) => l.client_id);
      const clients = await dbSelect('clients', { inFilters: { id: ids } });
      return clients.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    },

    async getClientIdsForProject(projectId) {
      const clients = await getStore().getClientsForProject(projectId);
      return clients.map((c) => c.id);
    },

    async linkProjectClient(projectId, clientId) {
      const pid = +projectId;
      const cid = +clientId;
      if (!Number.isFinite(pid) || !Number.isFinite(cid)) return false;
      if (!isDbMode()) {
        const data = getData();
        if (!data.project_clients) data.project_clients = [];
        if (data.project_clients.some((pc) => pc.project_id === pid && pc.client_id === cid)) return true;
        data.project_clients.push({
          id: nextId(data.project_clients),
          project_id: pid,
          client_id: cid,
          created_at: new Date().toISOString(),
        });
        save();
        return true;
      }
      const existing = await dbSelect('project_clients', {
        filters: { project_id: pid, client_id: cid },
        maybeSingle: true,
      });
      if (existing) return true;
      await dbInsert('project_clients', {
        project_id: pid,
        client_id: cid,
        created_at: new Date().toISOString(),
      });
      return true;
    },

    async setProjectClients(projectId, clientIds) {
      const pid = +projectId;
      const ids = [...new Set((clientIds || []).map((id) => +id).filter((id) => Number.isFinite(id) && id > 0))];
      if (!isDbMode()) {
        const data = getData();
        if (!data.project_clients) data.project_clients = [];
        data.project_clients = data.project_clients.filter((pc) => pc.project_id !== pid);
        ids.forEach((cid) => {
          if (data.clients.some((c) => c.id === cid)) {
            data.project_clients.push({
              id: nextId(data.project_clients),
              project_id: pid,
              client_id: cid,
              created_at: new Date().toISOString(),
            });
          }
        });
        save();
        return;
      }
      await dbDeleteWhere('project_clients', { project_id: pid });
      if (!ids.length) return;
      const rows = ids.map((cid) => ({
        project_id: pid,
        client_id: cid,
        created_at: new Date().toISOString(),
      }));
      const { dbInsertMany } = await import('../runtime/query.js');
      await dbInsertMany('project_clients', rows, { returning: false });
    },

    async projectWithClients(project) {
      if (!project) return project;
      const clients = await getStore().getClientsForProject(project.id);
      const client_ids = clients.map((c) => c.id);
      const client_name = formatClientNames(clients);
      const { client_id: _legacy, ...rest } = project;
      return {
        ...rest,
        clients,
        client_ids,
        client_name,
        client_id: client_ids[0] ?? null,
      };
    },

    async findClientByName(name) {
      const q = (name || '').trim().toLowerCase();
      if (!q) return null;
      const clients = await listClients();
      return clients.find((c) => (c.name || '').trim().toLowerCase() === q) || null;
    },

    async findClientByShortCode(code) {
      const q = (code || '').trim().toUpperCase();
      if (!q) return null;
      if (!isDbMode()) {
        return getData().clients.find((c) => String(c.short_code || '').toUpperCase() === q) || null;
      }
      return dbSelect('clients', { filters: { short_code: q }, maybeSingle: true });
    },

    async findOrCreateClient(name, shortCode = null) {
      const store = getStore();
      const trimmed = (name || '').trim();
      if (!trimmed && !shortCode) return null;
      if (shortCode) {
        const byCode = await store.findClientByShortCode(shortCode);
        if (byCode) return byCode.id;
      }
      if (trimmed) {
        const existing = await store.findClientByName(trimmed);
        if (existing) {
          if (shortCode && !existing.short_code) {
            await store.updateClient(existing.id, { short_code: shortCode });
          }
          return existing.id;
        }
      }
      return store.addClient({
        name: trimmed || String(shortCode).trim(),
        short_code: shortCode ? String(shortCode).trim().toUpperCase() : null,
      });
    },

    async addClient(row) {
      const created_at = new Date().toISOString();
      const { contact_name: _cn, email: _e, phone: _p, ...company } = row;
      const payload = {
        name: (company.name || '').trim(),
        short_code: company.short_code != null ? String(company.short_code).trim().toUpperCase() || null : null,
        created_at,
      };
      if (!isDbMode()) {
        const data = getData();
        const id = nextId(data.clients);
        data.clients.push({ id, ...payload });
        save();
        return id;
      }
      const saved = await dbInsert('clients', payload);
      return saved.id;
    },

    async addClientContact(row) {
      const payload = {
        client_id: row.client_id,
        contact_name: row.contact_name || null,
        email: row.email || null,
        phone: row.phone || null,
        created_at: new Date().toISOString(),
      };
      if (!isDbMode()) {
        const data = getData();
        if (!data.client_contacts) data.client_contacts = [];
        const id = nextId(data.client_contacts);
        data.client_contacts.push({ id, ...payload });
        save();
        return id;
      }
      const saved = await dbInsert('client_contacts', payload);
      return saved.id;
    },

    async updateClient(id, row) {
      const patch = { ...row };
      delete patch.contact_name;
      delete patch.email;
      delete patch.phone;
      if (patch.name !== undefined) patch.name = (patch.name || '').trim();
      if (!isDbMode()) {
        const data = getData();
        const i = data.clients.findIndex((c) => c.id === id);
        if (i === -1) return false;
        data.clients[i] = { ...data.clients[i], ...patch };
        save();
        return true;
      }
      const saved = await dbUpdate('clients', id, patch);
      return Boolean(saved);
    },

    async updateClientContact(id, row) {
      if (!isDbMode()) {
        const data = getData();
        if (!data.client_contacts) data.client_contacts = [];
        const i = data.client_contacts.findIndex((cc) => cc.id === id);
        if (i === -1) return false;
        data.client_contacts[i] = {
          ...data.client_contacts[i],
          contact_name: row.contact_name !== undefined ? row.contact_name || null : data.client_contacts[i].contact_name,
          email: row.email !== undefined ? row.email || null : data.client_contacts[i].email,
          phone: row.phone !== undefined ? row.phone || null : data.client_contacts[i].phone,
        };
        save();
        return true;
      }
      const patch = {};
      if (row.contact_name !== undefined) patch.contact_name = row.contact_name || null;
      if (row.email !== undefined) patch.email = row.email || null;
      if (row.phone !== undefined) patch.phone = row.phone || null;
      const saved = await dbUpdate('client_contacts', id, patch);
      return Boolean(saved);
    },

    async deleteClientContact(id) {
      if (!isDbMode()) {
        const data = getData();
        if (!data.client_contacts) return false;
        const i = data.client_contacts.findIndex((cc) => cc.id === id);
        if (i === -1) return false;
        data.client_contacts.splice(i, 1);
        save();
        return true;
      }
      await dbDelete('client_contacts', id);
      return true;
    },

    async deleteClient(id) {
      if (!isDbMode()) {
        const data = getData();
        const i = data.clients.findIndex((c) => c.id === id);
        if (i === -1) return false;
        data.clients.splice(i, 1);
        if (data.client_contacts) {
          data.client_contacts = data.client_contacts.filter((cc) => cc.client_id !== id);
        }
        if (data.project_clients) {
          data.project_clients = data.project_clients.filter((pc) => pc.client_id !== id);
        }
        save();
        return true;
      }
      await dbDeleteWhere('client_contacts', { client_id: id });
      await dbDeleteWhere('project_clients', { client_id: id });
      await dbDelete('clients', id);
      return true;
    },

    async getClientContacts(clientId) {
      if (!isDbMode()) {
        return (getData().client_contacts || []).filter((cc) => cc.client_id === clientId);
      }
      return dbSelect('client_contacts', { filters: { client_id: clientId }, order: 'id' });
    },
  };
}
