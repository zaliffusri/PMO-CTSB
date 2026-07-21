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

projectsRouter.get('/:id', async (req, res) => {
  const id = +req.params.id;
  const findProject = () => store.projects.find((p) => Number(p.id) === id);
  let project = findProject();
  if (!project) {
    // Warm serverless instances may still have a pre-create in-memory snapshot.
    try {
      await store.reloadFromSupabase();
    } catch (e) {
      console.warn('reload:', e.message);
    }
    project = findProject();
  }
  if (!project) return res.status(404).json({ error: 'Project not found' });
  const members = store.project_assignments
    .filter((a) => Number(a.project_id) === id)
    .map((a) => {
      const person = store.people.find((pe) => Number(pe.id) === Number(a.person_id));
      return { ...a, name: person?.name, email: person?.email, role: person?.role };
    });
  res.json(enrichProject(project, { members }));
});

projectsRouter.post('/', async (req, res) => {
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
  try {
    // Persist only this project (+ its client links) to avoid full-snapshot / id-skew failures.
    await store.persistProjectById(id);
  } catch (e) {
    const detail = e?.message || String(e);
    console.warn('persist:', detail);
    return res.status(500).json({
      error: `Failed to save project: ${detail}`,
    });
  }
  // Best-effort full sync (audit log, etc.) — do not block the response.
  store.persistToSupabase().catch((e) => console.warn('persist full:', e.message));
  const project = store.projects.find((p) => Number(p.id) === id);
  res.status(201).json(enrichProject(project));
});

projectsRouter.put('/:id', async (req, res) => {
  const { name, description, status, start_date, end_date, classification, engagement_type } = req.body;
  const id = +req.params.id;
  const existing = store.projects.find((p) => Number(p.id) === id);
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
    summary: `Updated project "${store.projects.find((p) => Number(p.id) === id)?.name || id}"`,
  });
  try {
    await store.persistToSupabase();
  } catch (e) {
    console.warn('persist:', e.message);
    return res.status(500).json({ error: 'Failed to save project changes', detail: e.message });
  }
  const project = store.projects.find((p) => Number(p.id) === id);
  res.json(enrichProject(project));
});

projectsRouter.delete('/:id', async (req, res) => {
  const id = +req.params.id;
  const existing = store.projects.find((p) => Number(p.id) === id);
  if (!existing) return res.status(404).json({ error: 'Project not found' });
  store.deleteProject(id);
  store.appendAuditLog(req.user, {
    action: 'delete',
    target_type: 'project',
    target_id: id,
    summary: `Deleted project "${existing.name}"`,
  });
  try {
    await store.persistToSupabase();
  } catch (e) {
    console.warn('persist:', e.message);
    return res.status(500).json({ error: 'Failed to delete project in database', detail: e.message });
  }
  res.status(204).send();
});
