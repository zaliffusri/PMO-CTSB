import { Router } from 'express';
import { store } from '../db/store.js';
import { validateImageDataUrl } from '../lib/validateImageDataUrl.js';

export const clientsRouter = Router();

function companyProjects(clientId) {
  const projectIds = new Set(
    (store.project_clients || [])
      .filter((pc) => pc.client_id === clientId)
      .map((pc) => pc.project_id),
  );
  return store.projects
    .filter((p) => projectIds.has(p.id))
    .map((p) => ({ id: p.id, name: p.name, status: p.status }))
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

function buildCompanyResponse(client) {
  const contacts = store
    .getClientContacts(client.id)
    .sort((a, b) => (a.contact_name || '').localeCompare(b.contact_name || ''));
  const projects = companyProjects(client.id);
  return {
    id: client.id,
    name: client.name,
    logo_url: client.logo_url || null,
    created_at: client.created_at,
    contacts,
    project_count: projects.length,
    projects,
  };
}

clientsRouter.get('/', (req, res) => {
  const clients = store.clients
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    .map((c) => buildCompanyResponse(c));
  res.json(clients);
});

clientsRouter.get('/:id', (req, res) => {
  const id = +req.params.id;
  const client = store.clients.find((c) => c.id === id);
  if (!client) return res.status(404).json({ error: 'Client not found' });
  res.json(buildCompanyResponse(client));
});

/** Add a PIC to an existing company or create company + PIC */
clientsRouter.post('/', (req, res) => {
  const {
    company_id,
    company_name,
    name: legacyName,
    contact_name,
    email,
    phone,
  } = req.body;
  let clientId = company_id != null && company_id !== '' ? +company_id : null;
  const newCompanyName = (company_name || legacyName || '').trim();

  if (clientId) {
    const existing = store.clients.find((c) => c.id === clientId);
    if (!existing) return res.status(404).json({ error: 'Company not found' });
  } else if (newCompanyName) {
    clientId = store.findOrCreateClient(newCompanyName);
    if (!clientId) return res.status(400).json({ error: 'Company name is required' });
  } else {
    return res.status(400).json({ error: 'Select an existing company or enter a new company name' });
  }

  const hasPic = [contact_name, email, phone].some((v) => v != null && String(v).trim() !== '');
  if (hasPic) {
    store.addClientContact({
      client_id: clientId,
      contact_name: contact_name || null,
      email: email || null,
      phone: phone || null,
    });
  }

  const client = store.clients.find((c) => c.id === clientId);
  const label = client?.name || String(clientId);
  store.appendAuditLog(req.user, {
    action: 'create',
    target_type: 'client',
    target_id: clientId,
    summary: hasPic ? `Added PIC for company "${label}"` : `Created company "${label}"`,
  });
  res.status(201).json(buildCompanyResponse(client));
});

clientsRouter.put('/contacts/:contactId', (req, res) => {
  const contactId = +req.params.contactId;
  const existing = store.client_contacts.find((cc) => cc.id === contactId);
  if (!existing) return res.status(404).json({ error: 'Contact not found' });
  const { contact_name, email, phone } = req.body;
  store.updateClientContact(contactId, {
    contact_name: contact_name !== undefined ? contact_name || null : existing.contact_name,
    email: email !== undefined ? email || null : existing.email,
    phone: phone !== undefined ? phone || null : existing.phone,
  });
  const client = store.clients.find((c) => c.id === existing.client_id);
  store.appendAuditLog(req.user, {
    action: 'update',
    target_type: 'client_contact',
    target_id: contactId,
    summary: `Updated PIC for company "${client?.name || existing.client_id}"`,
  });
  res.json(buildCompanyResponse(client));
});

clientsRouter.delete('/contacts/:contactId', (req, res) => {
  const contactId = +req.params.contactId;
  const existing = store.client_contacts.find((cc) => cc.id === contactId);
  if (!existing) return res.status(404).json({ error: 'Contact not found' });
  const client = store.clients.find((c) => c.id === existing.client_id);
  store.deleteClientContact(contactId);
  store.appendAuditLog(req.user, {
    action: 'delete',
    target_type: 'client_contact',
    target_id: contactId,
    summary: `Removed PIC from company "${client?.name || existing.client_id}"`,
  });
  res.status(204).send();
});

clientsRouter.put('/:id', (req, res) => {
  const { name } = req.body;
  const id = +req.params.id;
  const existing = store.clients.find((c) => c.id === id);
  if (!existing) return res.status(404).json({ error: 'Client not found' });
  if (name !== undefined && !(name || '').trim()) {
    return res.status(400).json({ error: 'Company name is required' });
  }
  const trimmedName = name !== undefined ? (name || '').trim() : existing.name;
  const duplicate = store.clients.find(
    (c) => c.id !== id && (c.name || '').trim().toLowerCase() === trimmedName.toLowerCase(),
  );
  if (duplicate) return res.status(400).json({ error: 'A company with this name already exists' });
  const patch = { name: trimmedName };
  if (req.body.logo_url !== undefined) {
    patch.logo_url = req.body.logo_url === null || req.body.logo_url === ''
      ? null
      : validateImageDataUrl(req.body.logo_url, { maxBytes: 120_000, field: 'logo_url' });
  }
  store.updateClient(id, patch);
  store.appendAuditLog(req.user, {
    action: 'update',
    target_type: 'client',
    target_id: id,
    summary: `Updated company "${trimmedName}"`,
  });
  const client = store.clients.find((c) => c.id === id);
  res.json(buildCompanyResponse(client));
});

clientsRouter.delete('/:id', (req, res) => {
  const id = +req.params.id;
  const existing = store.clients.find((c) => c.id === id);
  if (!existing) return res.status(404).json({ error: 'Client not found' });
  store.deleteClient(id);
  store.appendAuditLog(req.user, {
    action: 'delete',
    target_type: 'client',
    target_id: id,
    summary: `Deleted company "${existing.name}"`,
  });
  res.status(204).send();
});
