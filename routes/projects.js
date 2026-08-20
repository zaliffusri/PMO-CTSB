import { Router } from 'express';
import { store } from '../db/store.js';
import { parseClientIds } from '../lib/projectClients.js';
import { validateImageDataUrl } from '../lib/validateImageDataUrl.js';
import {
  PROJECT_CLASSIFICATION_IDS,
  PROJECT_ENGAGEMENT_TYPE_SET,
} from '../lib/projectConstants.js';
import { canCreateProject, canDeleteProject } from '../lib/permissions.js';
import { requireAdmin } from '../middleware/requireAuth.js';
import { validateBody } from '../middleware/validate.js';
import { createProjectSchema } from '../lib/validationSchemas.js';

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

async function enrichProject(project, extra = {}) {
  const { tags: _tags, ...base } = await store.projectWithClients(project);
  return { ...base, ...extra };
}

projectsRouter.get('/', async (req, res) => {
  try {
    await store.reloadFromSupabase();
  } catch (e) {
    console.warn('projects GET: could not refresh from Supabase', e?.message || e);
  }
  const projects = await store.listProjects();
  const assignments = await store.listAssignments();
  let list = await Promise.all(projects.map(async (p) => {
    const member_count = assignments.filter((a) => a.project_id === p.id).length;
    return enrichProject(p, { member_count });
  }));
  list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  res.json(list);
});

projectsRouter.get('/:id', async (req, res) => {
  const id = +req.params.id;
  const findProject = async () => {
    const projects = await store.listProjects();
    return projects.find((p) => Number(p.id) === id);
  };
  let project = await findProject();
  if (!project) {
    // Warm serverless instances may still have a pre-create in-memory snapshot.
    try {
      await store.reloadFromSupabase();
    } catch (e) {
      console.warn('reload:', e.message);
    }
    project = await findProject();
  }
  if (!project) return res.status(404).json({ error: 'Project not found' });
  const assignments = await store.listAssignments();
  const people = await store.listPeople();
  const members = assignments
    .filter((a) => Number(a.project_id) === id)
    .map((a) => {
      const person = people.find((pe) => Number(pe.id) === Number(a.person_id));
      return { ...a, name: person?.name, email: person?.email, role: person?.role };
    });
  res.json(await enrichProject(project, { members }));
});

projectsRouter.post('/', validateBody(createProjectSchema), async (req, res) => {
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
  const id = await store.addProject({
    name,
    description: description || null,
    status: status || 'active',
    start_date: start_date || null,
    end_date: end_date || null,
    engagement_type: normalizedEngagementType,
    classification: normalizedClassification,
    client_ids: clientIds ?? [],
  });
  await store.appendAuditLog(req.user, {
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
  const projects = await store.listProjects();
  const project = projects.find((p) => Number(p.id) === id);
  res.status(201).json(await enrichProject(project));
});

projectsRouter.put('/:id', async (req, res) => {
  const { name, description, status, start_date, end_date, classification, engagement_type } = req.body;
  const id = +req.params.id;
  const projects = await store.listProjects();
  const existing = projects.find((p) => Number(p.id) === id);
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
  await store.updateProject(id, patch);
  const updatedProjects = await store.listProjects();
  const updatedName = updatedProjects.find((p) => Number(p.id) === id)?.name || id;
  await store.appendAuditLog(req.user, {
    action: 'update',
    target_type: 'project',
    target_id: id,
    summary: `Updated project "${updatedName}"`,
  });
  try {
    await store.persistToSupabase();
  } catch (e) {
    console.warn('persist:', e.message);
    return res.status(500).json({ error: 'Failed to save project changes', detail: e.message });
  }
  const project = updatedProjects.find((p) => Number(p.id) === id);
  res.json(await enrichProject(project));
});

projectsRouter.delete('/:id', requireAdmin, async (req, res) => {
  const id = +req.params.id;
  if (!canDeleteProject(req.user)) {
    return res.status(403).json({ error: 'Only admins can delete projects' });
  }

  try {
    await store.reloadFromSupabase();
  } catch (e) {
    console.warn('project delete reload:', e?.message || e);
  }

  const projects = await store.listProjects();
  const existing = projects.find((p) => Number(p.id) === id);
  if (!existing) return res.status(404).json({ error: 'Project not found' });

  // Durable DB delete first so other serverless instances cannot re-upsert this project.
  try {
    await store.purgeProjectFromSupabase(id);
  } catch (e) {
    console.warn('project delete purge:', e.message);
    return res.status(500).json({ error: 'Failed to delete project in database', detail: e.message });
  }

  await store.deleteProject(id, { skipSave: true });
  await store.appendAuditLog(req.user, {
    action: 'delete',
    target_type: 'project',
    target_id: id,
    summary: `Deleted project "${existing.name}"`,
  });

  // Do not run full persistToSupabase here — it is slow and can race. DB purge is source of truth.
  res.status(204).send();
});
