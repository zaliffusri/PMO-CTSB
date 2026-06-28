import { Router } from 'express';
import { store } from '../db/store.js';
import { parseClientIds } from '../lib/projectClients.js';
import { validateImageDataUrl } from '../lib/validateImageDataUrl.js';
import {
  PROJECT_CLASSIFICATION_IDS,
  PROJECT_ENGAGEMENT_TYPE_SET,
} from '../lib/projectConstants.js';
import { canCreateProject } from '../lib/permissions.js';

export const projectsRouter = Router();
const DELIVERY_SCOPE_SET = new Set(PROJECT_CLASSIFICATION_IDS);

function normalizeEngagementType(value) {
  if (value == null || !String(value).trim()) return null;
  const id = String(value).trim();
  return PROJECT_ENGAGEMENT_TYPE_SET.has(id) ? id : null;
}

function normalizeDeliveryScope(value) {
  if (value == null || !String(value).trim()) return null;
  const id = String(value).trim();
  return DELIVERY_SCOPE_SET.has(id) ? id : null;
}

function enrichProject(project, extra = {}) {
  const { tags: _tags, ...base } = store.projectWithClients(project);
  return { ...base, ...extra };
}

projectsRouter.get('/', (req, res) => {
  let list = store.projects.map((p) => {
    const member_count = store.project_assignments.filter((a) => a.project_id === p.id).length;
    return enrichProject(p, { member_count });
  });
  list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  res.json(list);
});

projectsRouter.get('/:id', (req, res) => {
  const id = +req.params.id;
  const project = store.projects.find((p) => p.id === id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  const members = store.project_assignments
    .filter((a) => a.project_id === id)
    .map((a) => {
      const person = store.people.find((pe) => pe.id === a.person_id);
      return { ...a, name: person?.name, email: person?.email, role: person?.role };
    });
  res.json(enrichProject(project, { members }));
});

projectsRouter.post('/', (req, res) => {
  if (!canCreateProject(req.user)) {
    return res.status(403).json({ error: 'Only PMO officers can create projects' });
  }
  const { name, description, status, start_date, end_date, classification, engagement_type } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  const clientIds = parseClientIds(req.body);
  const normalizedEngagementType = normalizeEngagementType(engagement_type);
  if (engagement_type != null && String(engagement_type).trim() && !normalizedEngagementType) {
    return res.status(400).json({ error: 'Invalid engagement type' });
  }
  const normalizedClassification = normalizeDeliveryScope(classification);
  if (classification != null && String(classification).trim() && !normalizedClassification) {
    return res.status(400).json({ error: 'Invalid delivery scope value' });
  }
  const id = store.addProject({
    name,
    description: description || null,
    status: status || 'active',
    start_date: start_date || null,
    end_date: end_date || null,
    engagement_type: normalizedEngagementType,
    classification: normalizedClassification,
    client_ids: clientIds ?? [],
  });
  store.appendAuditLog(req.user, {
    action: 'create',
    target_type: 'project',
    target_id: id,
    summary: `Created project "${name}"`,
  });
  const project = store.projects.find((p) => p.id === id);
  res.status(201).json(enrichProject(project));
});

projectsRouter.put('/:id', (req, res) => {
  const { name, description, status, start_date, end_date, classification, engagement_type } = req.body;
  const id = +req.params.id;
  const existing = store.projects.find((p) => p.id === id);
  if (!existing) return res.status(404).json({ error: 'Project not found' });
  const clientIds = parseClientIds(req.body);
  const nextEngagementType = engagement_type !== undefined
    ? normalizeEngagementType(engagement_type)
    : existing.engagement_type ?? null;
  if (engagement_type !== undefined && engagement_type != null && String(engagement_type).trim() && !nextEngagementType) {
    return res.status(400).json({ error: 'Invalid engagement type' });
  }
  const nextClassification = classification !== undefined
    ? normalizeDeliveryScope(classification)
    : existing.classification ?? null;
  if (classification !== undefined && classification != null && String(classification).trim() && !nextClassification) {
    return res.status(400).json({ error: 'Invalid delivery scope value' });
  }
  const patch = {
    name: name ?? existing.name,
    description,
    status,
    start_date,
    end_date,
    engagement_type: nextEngagementType,
    classification: nextClassification,
  };
  if (clientIds !== null) patch.client_ids = clientIds;
  if (req.body.cover_image_url !== undefined) {
    patch.cover_image_url = req.body.cover_image_url === null || req.body.cover_image_url === ''
      ? null
      : validateImageDataUrl(req.body.cover_image_url, { maxBytes: 240_000, field: 'cover_image_url' });
  }
  store.updateProject(id, patch);
  store.appendAuditLog(req.user, {
    action: 'update',
    target_type: 'project',
    target_id: id,
    summary: `Updated project "${store.projects.find((p) => p.id === id)?.name || id}"`,
  });
  const project = store.projects.find((p) => p.id === id);
  res.json(enrichProject(project));
});

projectsRouter.delete('/:id', (req, res) => {
  const id = +req.params.id;
  const existing = store.projects.find((p) => p.id === id);
  if (!existing) return res.status(404).json({ error: 'Project not found' });
  store.deleteProject(id);
  store.appendAuditLog(req.user, {
    action: 'delete',
    target_type: 'project',
    target_id: id,
    summary: `Deleted project "${existing.name}"`,
  });
  res.status(204).send();
});
