import { Router } from 'express';
import { store } from '../db/store.js';

export const clientsRouter = Router();

clientsRouter.get('/', (req, res) => {
  const clients = store.clients.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  res.json(clients);
});

clientsRouter.get('/:id', (req, res) => {
  const id = +req.params.id;
  const client = store.clients.find(c => c.id === id);
  if (!client) return res.status(404).json({ error: 'Client not found' });
  const projects = store.projects.filter(p => p.client_id === id);
  res.json({ ...client, project_count: projects.length, projects });
});

clientsRouter.post('/', (req, res) => {
  const { name, contact_name, email, phone } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
  const id = store.addClient({
    name: (name || '').trim(),
    contact_name: contact_name || null,
    email: email || null,
    phone: phone || null,
  });
  const client = store.clients.find(c => c.id === id);
  res.status(201).json(client);
});

clientsRouter.put('/:id', (req, res) => {
  const { name, contact_name, email, phone } = req.body;
  const id = +req.params.id;
  const existing = store.clients.find(c => c.id === id);
  if (!existing) return res.status(404).json({ error: 'Client not found' });
  store.updateClient(id, {
    name: name !== undefined ? (name || '').trim() : existing.name,
    contact_name: contact_name !== undefined ? contact_name || null : existing.contact_name,
    email: email !== undefined ? email || null : existing.email,
    phone: phone !== undefined ? phone || null : existing.phone,
  });
  const client = store.clients.find(c => c.id === id);
  res.json(client);
});

clientsRouter.delete('/:id', (req, res) => {
  const id = +req.params.id;
  const existing = store.clients.find(c => c.id === id);
  if (!existing) return res.status(404).json({ error: 'Client not found' });
  store.deleteClient(id);
  res.status(204).send();
});
