import { Router } from 'express';
import { store } from '../db/store.js';
import { parseClientIds } from '../lib/projectClients.js';
import {
  PROJECT_CLASSIFICATION_IDS,
  PROJECT_ENGAGEMENT_TYPE_SET,
} from '../lib/projectConstants.js';
import { canCreateProject, canDeleteProject } from '../lib/permissions.js';
import { requireAdmin } from '../middleware/requireAuth.js';
import { validateBody } from '../middleware/validate.js';
import { createProjectSchema } from '../lib/validationSchemas.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

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
  const rawLimit = req.query.limit != null ? Number(req.query.limit) : 500;
  const rawOffset = req.query.offset != null ? Number(req.query.offset) : 0;
  const limit = Number.isFinite(rawLimit) ? rawLimit : 500;
  const offset = Number.isFinite(rawOffset) ? rawOffset : 0;
  try {
    const list = await store.listProjectsEnriched({ limit, offset });
    res.json(Array.isArray(list) ? list : []);
  } catch (e) {
    console.error('projects GET failed', e);
    res.status(500).json({ error: e.message || 'Failed to load projects' });
  }
});

projectsRouter.get('/:id', async (req, res) => {
  const id = +req.params.id;
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid project id' });

  try {
    let project = typeof store.findProjectById === 'function'
      ? await store.findProjectById(id)
      : (await store.listProjects()).find((p) => Number(p.id) === id) || null;

    if (!project) {
      try {
        await store.reloadFromSupabase();
      } catch (e) {
        console.warn('reload:', e.message);
      }
      project = typeof store.findProjectById === 'function'
        ? await store.findProjectById(id)
        : (await store.listProjects()).find((p) => Number(p.id) === id) || null;
    }
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const assignments = await store.listAssignments({ project_id: id });
    const personIds = [...new Set(
      assignments.map((a) => Number(a.person_id)).filter(Number.isFinite),
    )];
    let people = [];
    if (personIds.length) {
      const allPeople = await store.listPeople();
      const wanted = new Set(personIds);
      people = allPeople.filter((pe) => wanted.has(Number(pe.id)));
    }
    const peopleById = new Map(people.map((pe) => [Number(pe.id), pe]));
    const members = assignments.map((a) => {
      const person = peopleById.get(Number(a.person_id));
      return { ...a, name: person?.name, email: person?.email, role: person?.role };
    });
    res.json(await enrichProject(project, { members }));
  } catch (e) {
    console.error('projects GET/:id failed', e);
    res.status(500).json({ error: e.message || 'Failed to load project' });
  }
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

projectsRouter.put('/:id', asyncHandler(async (req, res) => {
  try {
    const { name, description, status, start_date, end_date, classification, engagement_type } = req.body || {};
    const id = +req.params.id;
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid project id' });

    const existing = typeof store.findProjectById === 'function'
      ? await store.findProjectById(id, { includeCover: false })
      : (await store.listProjects()).find((p) => Number(p.id) === id) || null;
    if (!existing) return res.status(404).json({ error: 'Project not found' });

    const clientIds = parseClientIds(req.body);
    const nextEngagementType = engagement_type !== undefined
      ? normalizeEngagementType(engagement_type)
      : undefined;
    if (engagement_type !== undefined && engagement_type != null && String(engagement_type).trim() && !nextEngagementType) {
      return res.status(400).json({ error: 'Invalid engagement type' });
    }
    const nextClassification = classification !== undefined
      ? normalizeDeliveryScope(classification)
      : undefined;
    if (classification !== undefined && classification != null && String(classification).trim() && !nextClassification) {
      return res.status(400).json({ error: 'Invalid delivery scope value' });
    }

    // Only include fields the client actually sent — avoids wiping / rewriting heavy columns.
    const patch = {};
    if (name !== undefined) patch.name = (name || '').trim() || existing.name;
    if (description !== undefined) patch.description = description;
    if (status !== undefined) patch.status = status;
    if (start_date !== undefined) patch.start_date = start_date;
    if (end_date !== undefined) patch.end_date = end_date;
    if (engagement_type !== undefined) patch.engagement_type = nextEngagementType;
    if (classification !== undefined) patch.classification = nextClassification;
    if (clientIds !== null) patch.client_ids = clientIds;

    const ok = await store.updateProject(id, patch);
    if (ok === false) return res.status(404).json({ error: 'Project not found' });

    const updatedName = patch.name || existing.name || id;
    await store.appendAuditLog(req.user, {
      action: 'update',
      target_type: 'project',
      target_id: id,
      summary: `Updated project "${updatedName}"`,
    });

    // Writes are already durable in DB mode; never block the response on a full snapshot sync.
    store.persistToSupabase().catch((e) => console.warn('persist:', e?.message || e));

    // Omit heavy cover from DB reload — large data URLs slow Vercel responses.
    let project = typeof store.findProjectById === 'function'
      ? await store.findProjectById(id, { includeCover: false })
      : (await store.listProjects()).find((p) => Number(p.id) === id) || null;
    if (!project) return res.status(404).json({ error: 'Project not found after update' });
    // Keep fields we just persisted even if a lite-column select cache omits them briefly.
    if (patch.engagement_type !== undefined) project = { ...project, engagement_type: patch.engagement_type };
    if (patch.classification !== undefined) project = { ...project, classification: patch.classification };
    res.json(await enrichProject(project));
  } catch (e) {
    console.error('projects PUT/:id failed', e);
    res.status(500).json({ error: e?.message || 'Failed to save project changes' });
  }
}));

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
