import { Router } from 'express';
import { store } from '../db/store.js';
import { validateImageDataUrl } from '../lib/validateImageDataUrl.js';
import {
  expandClientContacts,
  repairAllLegacyClientContacts,
  isLegacyContactBlob,
} from '../lib/clientContactLegacy.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

export const clientsRouter = Router();

function isMissingRelationError(err) {
  const msg = String(err?.message || err || '');
  return /schema cache|Could not find|does not exist|PGRST204|relation .* does not exist/i.test(msg);
}

async function safeList(label, fn, fallback = []) {
  try {
    const rows = await fn();
    return Array.isArray(rows) ? rows : fallback;
  } catch (e) {
    if (isMissingRelationError(e)) {
      console.warn(`clients: ${label} unavailable — ${e.message || e}`);
      return fallback;
    }
    throw e;
  }
}

function contactsByClientId(allContacts) {
  const map = new Map();
  for (const cc of allContacts || []) {
    const cid = Number(cc.client_id);
    if (!Number.isFinite(cid)) continue;
    if (!map.has(cid)) map.set(cid, []);
    map.get(cid).push(cc);
  }
  for (const list of map.values()) {
    list.sort((a, b) => (a.contact_name || '').localeCompare(b.contact_name || ''));
  }
  return map;
}

function projectsByClientId(projectClients, projects) {
  const projectById = new Map(
    (projects || [])
      .filter((p) => p && p.id != null)
      .map((p) => [Number(p.id), p]),
  );
  const map = new Map();
  for (const pc of projectClients || []) {
    const cid = Number(pc.client_id);
    const pid = Number(pc.project_id);
    if (!Number.isFinite(cid) || !Number.isFinite(pid)) continue;
    const project = projectById.get(pid);
    if (!project) continue;
    if (!map.has(cid)) map.set(cid, []);
    map.get(cid).push({
      id: project.id,
      name: project.name,
      status: project.status,
    });
  }
  for (const list of map.values()) {
    list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }
  return map;
}

function buildCompanyFromMaps(client, contactMap, projectMap) {
  const cid = Number(client.id);
  const rawContacts = contactMap.get(cid) || [];
  const contacts = expandClientContacts(rawContacts);
  const projects = projectMap.get(cid) || [];
  return {
    id: client.id,
    name: client.name,
    logo_url: client.logo_url || null,
    short_code: client.short_code || null,
    created_at: client.created_at,
    contacts,
    project_count: projects.length,
    projects,
  };
}

async function loadCompanyMaps() {
  const [allContacts, projectClients, projects] = await Promise.all([
    safeList('client_contacts', () => store.listClientContacts()),
    safeList('project_clients', () => store.listProjectClients()),
    safeList('projects', () => store.listProjects()),
  ]);
  return {
    contactMap: contactsByClientId(allContacts),
    projectMap: projectsByClientId(projectClients, projects),
  };
}

async function buildCompanyResponse(client) {
  const { contactMap, projectMap } = await loadCompanyMaps();
  return buildCompanyFromMaps(client, contactMap, projectMap);
}

async function maybeRepairLegacyContacts() {
  try {
    const { contactsCreated } = await repairAllLegacyClientContacts(store);
    if (contactsCreated > 0) {
      try {
        await store.persistToSupabase();
      } catch (e) {
        console.warn('clients: legacy contact repair persist failed', e.message);
      }
    }
  } catch (e) {
    // Never block the clients list on repair failures (missing table, etc.).
    console.warn('clients: legacy contact repair skipped', e?.message || e);
  }
}

clientsRouter.get('/', asyncHandler(async (req, res) => {
  await maybeRepairLegacyContacts();
  const clients = await store.listClients();
  const sorted = [...(Array.isArray(clients) ? clients : [])].sort((a, b) =>
    (a.name || '').localeCompare(b.name || ''),
  );
  const { contactMap, projectMap } = await loadCompanyMaps();
  res.json(sorted.map((c) => buildCompanyFromMaps(c, contactMap, projectMap)));
}));

clientsRouter.get('/:id', asyncHandler(async (req, res) => {
  await maybeRepairLegacyContacts();
  const id = +req.params.id;
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid client id' });
  const client = await store.getClientById(id);
  if (!client) return res.status(404).json({ error: 'Client not found' });
  res.json(await buildCompanyResponse(client));
}));

/** Add a PIC to an existing company or create company (+ optional PIC) */
clientsRouter.post('/', asyncHandler(async (req, res) => {
  const {
    company_id,
    company_name,
    name: legacyName,
    short_code,
    contact_name,
    email,
    phone,
    logo_url,
  } = req.body;
  let clientId = company_id != null && company_id !== '' ? +company_id : null;
  const newCompanyName = (company_name || legacyName || '').trim();
  const shortCode = short_code == null || short_code === ''
    ? null
    : String(short_code).trim().toUpperCase();

  if (clientId) {
    const existing = await store.getClientById(clientId);
    if (!existing) return res.status(404).json({ error: 'Company not found' });
  } else if (newCompanyName) {
    if (!shortCode) {
      return res.status(400).json({ error: 'Short code is required' });
    }
    const clients = await store.listClients();
    const nameDup = clients.find(
      (c) => (c.name || '').trim().toLowerCase() === newCompanyName.toLowerCase(),
    );
    if (nameDup) return res.status(400).json({ error: 'A company with this name already exists' });
    const codeDup = clients.find(
      (c) => String(c.short_code || '').trim().toUpperCase() === shortCode,
    );
    if (codeDup) return res.status(400).json({ error: 'Another company already uses this short code' });

    const createPayload = {
      name: newCompanyName,
      short_code: shortCode,
    };
    if (logo_url !== undefined && logo_url !== null && logo_url !== '') {
      createPayload.logo_url = validateImageDataUrl(logo_url, { maxBytes: 120_000, field: 'logo_url' });
    }
    clientId = await store.addClient(createPayload);
    if (!clientId) return res.status(400).json({ error: 'Company name is required' });
  } else {
    return res.status(400).json({ error: 'Select an existing company or enter a new company name' });
  }

  const hasPic = [contact_name, email, phone].some((v) => v != null && String(v).trim() !== '');
  if (hasPic) {
    if (isLegacyContactBlob(contact_name)) {
      return res.status(400).json({ error: 'Invalid contact name — use separate PIC fields, not embedded JSON.' });
    }
    await store.addClientContact({
      client_id: clientId,
      contact_name: contact_name || null,
      email: email || null,
      phone: phone || null,
    });
  }

  const client = await store.getClientById(clientId);
  const label = client?.name || String(clientId);
  await store.appendAuditLog(req.user, {
    action: 'create',
    target_type: 'client',
    target_id: clientId,
    summary: hasPic ? `Added PIC for company "${label}"` : `Created company "${label}"`,
  });
  res.status(201).json(await buildCompanyResponse(client));
}));

clientsRouter.put('/contacts/:contactId', asyncHandler(async (req, res) => {
  const contactId = +req.params.contactId;
  const contacts = await store.listClientContacts();
  const existing = contacts.find((cc) => Number(cc.id) === contactId);
  if (!existing) return res.status(404).json({ error: 'Contact not found' });
  const { contact_name, email, phone } = req.body;
  await store.updateClientContact(contactId, {
    contact_name: contact_name !== undefined ? contact_name || null : existing.contact_name,
    email: email !== undefined ? email || null : existing.email,
    phone: phone !== undefined ? phone || null : existing.phone,
  });
  const client = await store.getClientById(existing.client_id);
  await store.appendAuditLog(req.user, {
    action: 'update',
    target_type: 'client_contact',
    target_id: contactId,
    summary: `Updated PIC for company "${client?.name || existing.client_id}"`,
  });
  res.json(await buildCompanyResponse(client));
}));

clientsRouter.delete('/contacts/:contactId', asyncHandler(async (req, res) => {
  const contactId = +req.params.contactId;
  const contacts = await store.listClientContacts();
  const existing = contacts.find((cc) => Number(cc.id) === contactId);
  if (!existing) return res.status(404).json({ error: 'Contact not found' });
  const client = await store.getClientById(existing.client_id);
  await store.deleteClientContact(contactId);
  await store.appendAuditLog(req.user, {
    action: 'delete',
    target_type: 'client_contact',
    target_id: contactId,
    summary: `Removed PIC from company "${client?.name || existing.client_id}"`,
  });
  res.status(204).send();
}));

clientsRouter.put('/:id', asyncHandler(async (req, res) => {
  const { name } = req.body;
  const id = +req.params.id;
  const existing = await store.getClientById(id);
  if (!existing) return res.status(404).json({ error: 'Client not found' });
  if (name !== undefined && !(name || '').trim()) {
    return res.status(400).json({ error: 'Company name is required' });
  }
  const trimmedName = name !== undefined ? (name || '').trim() : existing.name;
  const clients = await store.listClients();
  const duplicate = clients.find(
    (c) => Number(c.id) !== id && (c.name || '').trim().toLowerCase() === trimmedName.toLowerCase(),
  );
  if (duplicate) return res.status(400).json({ error: 'A company with this name already exists' });
  const patch = { name: trimmedName };
  if (req.body.logo_url !== undefined) {
    patch.logo_url = req.body.logo_url === null || req.body.logo_url === ''
      ? null
      : validateImageDataUrl(req.body.logo_url, { maxBytes: 120_000, field: 'logo_url' });
  }
  if (req.body.short_code !== undefined) {
    const code = req.body.short_code == null || req.body.short_code === ''
      ? null
      : String(req.body.short_code).trim().toUpperCase();
    if (!code) {
      return res.status(400).json({ error: 'Short code is required' });
    }
    const codeDup = clients.find(
      (c) => Number(c.id) !== id && String(c.short_code || '').trim().toUpperCase() === code,
    );
    if (codeDup) return res.status(400).json({ error: 'Another company already uses this short code' });
    patch.short_code = code;
  }
  await store.updateClient(id, patch);
  await store.appendAuditLog(req.user, {
    action: 'update',
    target_type: 'client',
    target_id: id,
    summary: `Updated company "${trimmedName}"`,
  });
  const client = await store.getClientById(id);
  res.json(await buildCompanyResponse(client));
}));

clientsRouter.delete('/:id', asyncHandler(async (req, res) => {
  const id = +req.params.id;
  const existing = await store.getClientById(id);
  if (!existing) return res.status(404).json({ error: 'Client not found' });
  await store.deleteClient(id);
  await store.appendAuditLog(req.user, {
    action: 'delete',
    target_type: 'client',
    target_id: id,
    summary: `Deleted company "${existing.name}"`,
  });
  res.status(204).send();
}));
