import { formatClientNames } from '../../lib/projectClients.js';
import { nextId } from '../runtime/helpers.js';

export function createClientsRepository(ctx, getStore) {
  const { getData, save } = ctx;

  return {
    get clients() {
      return [...getData().clients];
    },
    get client_contacts() {
      return [...(getData().client_contacts || [])];
    },
    get project_clients() {
      return [...(getData().project_clients || [])];
    },

    getClientsForProject(projectId) {
      const data = getData();
      const links = (data.project_clients || []).filter((pc) => pc.project_id === projectId);
      return links
        .map((pc) => data.clients.find((c) => c.id === pc.client_id))
        .filter(Boolean)
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    },

    getClientIdsForProject(projectId) {
      return getStore().getClientsForProject(projectId).map((c) => c.id);
    },

    linkProjectClient(projectId, clientId) {
      const data = getData();
      if (!data.project_clients) data.project_clients = [];
      const pid = +projectId;
      const cid = +clientId;
      if (!Number.isFinite(pid) || !Number.isFinite(cid)) return false;
      if (data.project_clients.some((pc) => pc.project_id === pid && pc.client_id === cid)) return true;
      data.project_clients.push({
        id: nextId(data.project_clients),
        project_id: pid,
        client_id: cid,
        created_at: new Date().toISOString(),
      });
      save();
      return true;
    },

    setProjectClients(projectId, clientIds) {
      const data = getData();
      if (!data.project_clients) data.project_clients = [];
      const pid = +projectId;
      const ids = [...new Set((clientIds || []).map((id) => +id).filter((id) => Number.isFinite(id) && id > 0))];
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
    },

    projectWithClients(project) {
      if (!project) return project;
      const store = getStore();
      const clients = store.getClientsForProject(project.id);
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

    findClientByName(name) {
      const data = getData();
      const q = (name || '').trim().toLowerCase();
      if (!q) return null;
      return data.clients.find((c) => (c.name || '').trim().toLowerCase() === q) || null;
    },

    findClientByShortCode(code) {
      const data = getData();
      const q = (code || '').trim().toUpperCase();
      if (!q) return null;
      return data.clients.find((c) => String(c.short_code || '').toUpperCase() === q) || null;
    },

    findOrCreateClient(name, shortCode = null) {
      const store = getStore();
      const trimmed = (name || '').trim();
      if (!trimmed && !shortCode) return null;
      if (shortCode) {
        const byCode = store.findClientByShortCode(shortCode);
        if (byCode) return byCode.id;
      }
      if (trimmed) {
        const existing = store.findClientByName(trimmed);
        if (existing) {
          if (shortCode && !existing.short_code) {
            store.updateClient(existing.id, { short_code: shortCode });
          }
          return existing.id;
        }
      }
      return store.addClient({
        name: trimmed || String(shortCode).trim(),
        short_code: shortCode ? String(shortCode).trim().toUpperCase() : null,
      });
    },

    addClient(row) {
      const data = getData();
      const id = nextId(data.clients);
      const created_at = new Date().toISOString();
      const { contact_name: _cn, email: _e, phone: _p, ...company } = row;
      data.clients.push({
        id,
        name: (company.name || '').trim(),
        short_code: company.short_code != null ? String(company.short_code).trim().toUpperCase() || null : null,
        created_at,
      });
      save();
      return id;
    },

    addClientContact(row) {
      const data = getData();
      if (!data.client_contacts) data.client_contacts = [];
      const id = nextId(data.client_contacts);
      const created_at = new Date().toISOString();
      data.client_contacts.push({
        id,
        client_id: row.client_id,
        contact_name: row.contact_name || null,
        email: row.email || null,
        phone: row.phone || null,
        created_at,
      });
      save();
      return id;
    },

    updateClient(id, row) {
      const data = getData();
      const i = data.clients.findIndex((c) => c.id === id);
      if (i === -1) return false;
      const patch = { ...row };
      delete patch.contact_name;
      delete patch.email;
      delete patch.phone;
      if (patch.name !== undefined) patch.name = (patch.name || '').trim();
      data.clients[i] = { ...data.clients[i], ...patch };
      save();
      return true;
    },

    updateClientContact(id, row) {
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
    },

    deleteClientContact(id) {
      const data = getData();
      if (!data.client_contacts) return false;
      const i = data.client_contacts.findIndex((cc) => cc.id === id);
      if (i === -1) return false;
      data.client_contacts.splice(i, 1);
      save();
      return true;
    },

    deleteClient(id) {
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
    },

    getClientContacts(clientId) {
      const data = getData();
      return (data.client_contacts || []).filter((cc) => cc.client_id === clientId);
    },
  };
}
