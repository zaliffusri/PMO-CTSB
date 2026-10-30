import { Router } from 'express';
import { store } from '../db/store.js';
import { parseClientIds } from '../lib/projectClients.js';
import {
  PROJECT_CLASSIFICATION_IDS,
  PROJECT_ENGAGEMENT_TYPE_SET,
} from '../lib/projectConstants.js';
import { canCreateProject, canDeleteProject } from '../lib/permissions.js';
import { getVisibleProjectIdSet, canAccessProject } from '../lib/projectScope.js';
import { requireAdmin } from '../middleware/requireAuth.js';
import { validateBody } from '../middleware/validate.js';
import { createProjectSchema } from '../lib/validationSchemas.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { normalizeProjectShortCode, suggestProjectShortCode } from '../lib/projectShortCode.js';
import { buildEotUpdate, eotSummary, parseEotLog } from '../lib/projectEot.js';

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
  const eot = eotSummary({
    ...base,
    eot_log: parseEotLog(base.eot_log ?? project?.eot_log),
    baseline_end_date: base.baseline_end_date ?? project?.baseline_end_date ?? null,
  });
  return {
    ...base,
    baseline_end_date: eot.baseline_end_date,
    eot_log: eot.eot_log,
    eot_count: eot.eot_count,
    eot_total_days: eot.total_days_added,
    is_extended: eot.is_extended,
    ...extra,
  };
}

projectsRouter.get('/', async (req, res) => {
  const rawLimit = req.query.limit != null ? Number(req.query.limit) : 500;
  const rawOffset = req.query.offset != null ? Number(req.query.offset) : 0;
  const limit = Number.isFinite(rawLimit) ? rawLimit : 500;
  const offset = Number.isFinite(rawOffset) ? rawOffset : 0;
  try {
    const list = await store.listProjectsEnriched({ limit, offset });
    const visible = await getVisibleProjectIdSet(store, req.user);
    const rows = Array.isArray(list) ? list : [];
    res.json(visible == null ? rows : rows.filter((p) => visible.has(Number(p.id))));
  } catch (e) {
    console.error('projects GET failed', e);
    res.status(500).json({ error: e.message || 'Failed to load projects' });
  }
});

/** Live uniqueness check for create form — must be registered before /:id. */
projectsRouter.get('/check-short-code', async (req, res) => {
  try {
    const code = normalizeProjectShortCode(req.query.code);
    if (!code || code.length < 2) {
      return res.json({ code: code || '', available: false, reason: 'too_short' });
    }
    const excludeId = req.query.exclude_id != null && req.query.exclude_id !== ''
      ? Number(req.query.exclude_id)
      : null;
    const taken = await store.findProjectByShortCode(code, {
      excludeId: Number.isFinite(excludeId) ? excludeId : null,
    });
    return res.json({
      code,
      available: !taken,
      reason: taken ? 'taken' : 'available',
    });
  } catch (e) {
    console.warn('projects check-short-code failed', e?.message || e);
    // Soft-fail: do not block typing UX if probe fails.
    return res.json({
      code: normalizeProjectShortCode(req.query.code),
      available: true,
      reason: 'check_failed',
    });
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
    const visible = await getVisibleProjectIdSet(store, req.user);
    if (!canAccessProject(req.user, id, visible)) {
      return res.status(403).json({ error: 'You do not have access to this project' });
    }

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
  const { name, description, status, start_date, end_date, classification, engagement_type, short_code, program_name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  let normalizedShortCode = normalizeProjectShortCode(short_code);
  if (!normalizedShortCode) {
    normalizedShortCode = suggestProjectShortCode(name);
  }
  if (!normalizedShortCode || normalizedShortCode.length < 2) {
    return res.status(400).json({ error: 'Unique short code is required (at least 2 characters)' });
  }
  try {
    const taken = await store.findProjectByShortCode(normalizedShortCode);
    if (taken) {
      return res.status(409).json({ error: `Short code "${normalizedShortCode}" is already used by another project` });
    }
  } catch (e) {
    console.warn('project short code check:', e?.message || e);
  }
  const clientIds = parseClientIds(req.body);
  const normalizedEngagementType = normalizeEngagementType(engagement_type);
  if (engagement_type != null && String(engagement_type).trim() && !normalizedEngagementType) {
    return res.status(400).json({ error: 'Invalid engagement type' });
  }
  const normalizedClassification = normalizeDeliveryScope(classification);
  if (classification != null && String(classification).trim() && !normalizedClassification) {
    return res.status(400).json({ error: 'Invalid delivery scope value' });
  }
  let id;
  try {
    id = await store.addProject({
      name,
      short_code: normalizedShortCode,
      description: description || null,
      status: status || 'active',
      start_date: start_date || null,
      end_date: end_date || null,
      engagement_type: normalizedEngagementType,
      classification: normalizedClassification,
      program_name: program_name ? String(program_name).trim() : null,
      client_ids: clientIds ?? [],
    });
  } catch (e) {
    const msg = String(e?.message || e || '');
    if (/already in use|unique|duplicate/i.test(msg)) {
      return res.status(409).json({ error: `Short code "${normalizedShortCode}" is already used by another project` });
    }
    console.error('projects POST addProject failed', e);
    return res.status(500).json({ error: e?.message || 'Failed to create project' });
  }

  // Non-blocking bookkeeping — never hold the create response for these.
  store.appendAuditLog(req.user, {
    action: 'create',
    target_type: 'project',
    target_id: id,
    summary: `Created project "${name}" (${normalizedShortCode})`,
  }).catch((e) => console.warn('audit:', e?.message || e));
  store.persistProjectById(id).catch((e) => console.warn('persist project:', e?.message || e));
  store.persistToSupabase().catch((e) => console.warn('persist full:', e?.message || e));

  try {
    let project = typeof store.findProjectById === 'function'
      ? await store.findProjectById(id, { includeCover: false })
      : null;
    if (!project) {
      project = {
        id,
        name,
        short_code: normalizedShortCode,
        description: description || null,
        status: status || 'active',
        start_date: start_date || null,
        end_date: end_date || null,
        engagement_type: normalizedEngagementType,
        classification: normalizedClassification,
      };
    } else {
      project = {
        ...project,
        short_code: project.short_code || normalizedShortCode,
        engagement_type: project.engagement_type ?? normalizedEngagementType,
        classification: project.classification ?? normalizedClassification,
      };
    }
    return res.status(201).json(await enrichProject(project));
  } catch (e) {
    console.error('projects POST enrich failed', e);
    // Create already succeeded — return minimal payload rather than 5xx/timeout.
    return res.status(201).json({
      id,
      name,
      short_code: normalizedShortCode,
      description: description || null,
      status: status || 'active',
      clients: [],
      client_ids: clientIds ?? [],
      member_count: 0,
    });
  }
});

/** Record Extension of Time — extends end_date and appends to eot_log. */
projectsRouter.post('/:id/eot', asyncHandler(async (req, res) => {
  if (!canCreateProject(req.user)) {
    return res.status(403).json({ error: 'Only PMO officers can record EOT' });
  }
  const id = +req.params.id;
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid project id' });

  const existing = typeof store.findProjectById === 'function'
    ? await store.findProjectById(id, { includeCover: false })
    : (await store.listProjects()).find((p) => Number(p.id) === id) || null;
  if (!existing) return res.status(404).json({ error: 'Project not found' });

  const result = buildEotUpdate(existing, {
    new_end_date: req.body?.new_end_date,
    reason: req.body?.reason,
    approved_by: req.body?.approved_by,
    actorName: req.user?.name || req.user?.email || null,
  });
  if (result.error) return res.status(400).json({ error: result.error });

  try {
    const ok = await store.updateProject(id, result.patch);
    if (ok === false) return res.status(404).json({ error: 'Project not found' });
  } catch (e) {
    const msg = String(e?.message || e || '');
    if (/baseline_end_date|eot_log|schema cache|PGRST204|column/i.test(msg)) {
      return res.status(503).json({
        error: 'EOT columns are missing. Run migration `20261019140000_projects_eot.sql` (or set SUPABASE_DB_URL).',
      });
    }
    throw e;
  }

  await store.appendAuditLog(req.user, {
    action: 'update',
    target_type: 'project',
    target_id: id,
    summary: `Recorded EOT for "${existing.name}" → ${result.patch.end_date} (+${result.entry.days_added ?? '?'} days)`,
  });
  store.persistToSupabase().catch((e) => console.warn('persist:', e?.message || e));

  let project = typeof store.findProjectById === 'function'
    ? await store.findProjectById(id, { includeCover: false })
    : (await store.listProjects()).find((p) => Number(p.id) === id) || null;
  if (!project) {
    project = { ...existing, ...result.patch };
  } else {
    project = {
      ...project,
      end_date: result.patch.end_date,
      baseline_end_date: result.patch.baseline_end_date,
      eot_log: result.patch.eot_log,
    };
  }
  res.status(201).json(await enrichProject(project, { eot_entry: result.entry }));
}));

projectsRouter.put('/:id', asyncHandler(async (req, res) => {
  try {
    const { name, description, status, start_date, end_date, classification, engagement_type, short_code } = req.body || {};
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
    let nextShortCode;
    if (short_code !== undefined) {
      nextShortCode = normalizeProjectShortCode(short_code);
      if (!nextShortCode || nextShortCode.length < 2) {
        return res.status(400).json({ error: 'Short code must be at least 2 characters' });
      }
      try {
        const taken = await store.findProjectByShortCode(nextShortCode, { excludeId: id });
        if (taken) {
          return res.status(409).json({ error: `Short code "${nextShortCode}" is already used by another project` });
        }
      } catch (e) {
        console.warn('project short code check:', e?.message || e);
      }
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
    if (short_code !== undefined) patch.short_code = nextShortCode;
    if (req.body?.program_name !== undefined) {
      patch.program_name = String(req.body.program_name || '').trim() || null;
    }
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
    if (patch.short_code !== undefined) project = { ...project, short_code: patch.short_code };
    res.json(await enrichProject(project));
  } catch (e) {
    console.error('projects PUT/:id failed', e);
    const msg = String(e?.message || e || '');
    if (/already in use|unique|duplicate/i.test(msg)) {
      return res.status(409).json({ error: 'Short code is already used by another project' });
    }
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
