import { Router } from 'express';
import { store } from '../db/store.js';
import { PROJECT_CLASSIFICATIONS } from '../lib/projectConstants.js';
import { templateForClassification } from '../lib/phaseConstants.js';
import { WORK_PACKAGE_STATUS_SET } from '../lib/workPackageConstants.js';
import { OPEN_BACKLOG_STATUSES } from '../lib/backlogConstants.js';
import { canCreateProject } from '../lib/permissions.js';

export const workPackagesRouter = Router();

const CLASSIFICATION_SET = new Set(PROJECT_CLASSIFICATIONS.map((c) => c.id));

function isMissingRelationError(err) {
  const msg = String(err?.message || err || '');
  return /does not exist|schema cache|PGRST204|PGRST205|Could not find the table/i.test(msg);
}

async function enrichWorkPackage(wp, preloaded = null) {
  const tasks = preloaded?.tasks ?? [];
  const phases = preloaded?.phases ?? [];
  const backlogs = preloaded?.backlogs ?? [];
  const wpTasks = tasks.filter((t) => Number(t.work_package_id) === Number(wp.id));
  const wpPhases = phases.filter((p) => Number(p.work_package_id) === Number(wp.id));
  const wpBacklogs = backlogs.filter((b) => Number(b.work_package_id) === Number(wp.id));
  const currentPhase = wpPhases.find((p) => p.status === 'in_progress')
    || wpPhases.find((p) => p.status === 'pending');
  const totalContract = wpPhases.reduce((s, p) => s + (+p.payment_amount || 0), 0);
  const totalPaid = wpPhases
    .filter((p) => p.payment_status === 'paid')
    .reduce((s, p) => s + (+p.payment_amount || 0), 0);
  return {
    ...wp,
    task_count: wpTasks.length,
    phase_count: wpPhases.length,
    backlog_count: wpBacklogs.length,
    open_backlog_count: wpBacklogs.filter((b) => OPEN_BACKLOG_STATUSES.has(b.status)).length,
    current_phase: currentPhase?.name || null,
    total_contract: totalContract,
    total_paid: totalPaid,
  };
}

async function loadWorkPackageMetaContext(projectId = null) {
  const pid = Number.isFinite(Number(projectId)) ? Number(projectId) : null;
  const taskFilters = pid != null
    ? { project_id: pid, columns: 'id,work_package_id' }
    : { columns: 'id,work_package_id,project_id' };
  const backlogFilters = pid != null
    ? { project_id: pid, columns: 'id,work_package_id,status' }
    : { columns: 'id,work_package_id,status,project_id' };

  const [tasks, phases, backlogs] = await Promise.all([
    store.listProjectTasks(taskFilters).catch(() => []),
    store.listProjectPhases(pid ?? undefined).catch(() => []),
    store.listBacklogs(backlogFilters).catch(() => []),
  ]);
  return { tasks, phases, backlogs };
}

function emptyMetaContext() {
  return { tasks: [], phases: [], backlogs: [] };
}

async function resolveProjectLite(projectId) {
  const pid = Number(projectId);
  if (!Number.isFinite(pid)) return null;
  if (typeof store.findProjectById === 'function') {
    return store.findProjectById(pid, { includeCover: false }).catch(() => null);
  }
  const projects = await store.listProjects().catch(() => []);
  return projects.find((p) => Number(p.id) === pid) || null;
}

workPackagesRouter.get('/', async (req, res) => {
  try {
    const projectId = req.query.project_id ? +req.query.project_id : null;
    const packages = projectId
      ? await store.listWorkPackages(projectId)
      : await store.listWorkPackages();
    if (!packages?.length) return res.json([]);

    const ctx = await loadWorkPackageMetaContext(Number.isFinite(projectId) ? projectId : null);
    const list = packages.map((w) => enrichWorkPackage(w, ctx));
    list.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || (a.name || '').localeCompare(b.name || ''));
    res.json(list);
  } catch (e) {
    console.error('work-packages GET failed', e);
    if (isMissingRelationError(e)) return res.json([]);
    res.status(500).json({ error: e?.message || 'Failed to load work packages' });
  }
});

workPackagesRouter.get('/:id', async (req, res) => {
  try {
    const wp = typeof store.findWorkPackageById === 'function'
      ? await store.findWorkPackageById(+req.params.id)
      : (await store.listWorkPackages()).find((w) => Number(w.id) === +req.params.id) || null;
    if (!wp) return res.status(404).json({ error: 'Work package not found' });
    const ctx = await loadWorkPackageMetaContext(wp.project_id);
    res.json(enrichWorkPackage(wp, ctx));
  } catch (e) {
    console.error('work-packages GET/:id failed', e);
    res.status(500).json({ error: e?.message || 'Failed to load work package' });
  }
});

workPackagesRouter.post('/', async (req, res) => {
  try {
    if (!canCreateProject(req.user)) {
      return res.status(403).json({ error: 'Only PMO can create work packages' });
    }
    const body = req.body || {};
    if (!body.project_id || !body.name || !body.classification) {
      return res.status(400).json({ error: 'project_id, name, and delivery scope are required' });
    }
    const classification = String(body.classification).trim();
    if (!CLASSIFICATION_SET.has(classification)) {
      return res.status(400).json({ error: 'Invalid delivery scope' });
    }

    const projectId = +body.project_id;
    const project = await resolveProjectLite(projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const saved = await store.addWorkPackage({
      project_id: projectId,
      name: String(body.name).trim(),
      description: body.description != null ? String(body.description) : null,
      classification,
      status: WORK_PACKAGE_STATUS_SET.has(body.status) ? body.status : 'active',
      start_date: body.start_date || null,
      end_date: body.end_date || null,
      sort_order: body.sort_order != null ? +body.sort_order : undefined,
    });
    const row = saved && typeof saved === 'object' ? saved : { id: saved, project_id: projectId };
    const wp = enrichWorkPackage(row, emptyMetaContext());

    // Non-blocking: do not hold the Vercel response on audit/persist.
    store.appendAuditLog(req.user, {
      action: 'create',
      target_type: 'work_package',
      target_id: wp.id,
      summary: `Created work package "${wp.name}" (${wp.classification}) in ${project.name}`,
    }).catch((e) => console.warn('work-package audit:', e?.message || e));
    store.persistToSupabase().catch((e) => console.warn('persist:', e?.message || e));

    res.status(201).json(wp);
  } catch (e) {
    console.error('work-packages POST failed', e);
    if (isMissingRelationError(e)) {
      return res.status(503).json({
        error: 'Work packages table is missing. Run migration `20260627160000_work_packages.sql`.',
      });
    }
    res.status(500).json({ error: e?.message || 'Failed to create work package' });
  }
});

workPackagesRouter.put('/:id', async (req, res) => {
  try {
    if (!canCreateProject(req.user)) {
      return res.status(403).json({ error: 'Only PMO can update work packages' });
    }
    const id = +req.params.id;
    const cur = typeof store.findWorkPackageById === 'function'
      ? await store.findWorkPackageById(id)
      : (await store.listWorkPackages()).find((w) => Number(w.id) === id) || null;
    if (!cur) return res.status(404).json({ error: 'Work package not found' });

    const body = req.body || {};
    const patch = {};
    if (body.name != null) patch.name = String(body.name).trim();
    if (body.description !== undefined) patch.description = body.description || null;
    if (body.classification != null) {
      const classification = String(body.classification).trim();
      if (!CLASSIFICATION_SET.has(classification)) {
        return res.status(400).json({ error: 'Invalid classification' });
      }
      patch.classification = classification;
    }
    if (body.status != null && WORK_PACKAGE_STATUS_SET.has(body.status)) patch.status = body.status;
    if (body.start_date !== undefined) patch.start_date = body.start_date || null;
    if (body.end_date !== undefined) patch.end_date = body.end_date || null;
    if (body.sort_order != null) patch.sort_order = +body.sort_order;

    await store.updateWorkPackage(id, patch);
    store.persistToSupabase().catch((e) => console.warn('persist:', e?.message || e));

    const updated = typeof store.findWorkPackageById === 'function'
      ? await store.findWorkPackageById(id)
      : { ...cur, ...patch };
    const ctx = await loadWorkPackageMetaContext(cur.project_id);
    res.json(enrichWorkPackage(updated || { ...cur, ...patch }, ctx));
  } catch (e) {
    console.error('work-packages PUT failed', e);
    res.status(500).json({ error: e?.message || 'Failed to update work package' });
  }
});

workPackagesRouter.delete('/:id', async (req, res) => {
  try {
    if (!canCreateProject(req.user)) {
      return res.status(403).json({ error: 'Only PMO can delete work packages' });
    }
    const id = +req.params.id;
    const cur = typeof store.findWorkPackageById === 'function'
      ? await store.findWorkPackageById(id)
      : (await store.listWorkPackages()).find((w) => Number(w.id) === id) || null;
    if (!cur) return res.status(404).json({ error: 'Work package not found' });

    await store.deleteWorkPackage(id);
    store.appendAuditLog(req.user, {
      action: 'delete',
      target_type: 'work_package',
      target_id: id,
      summary: `Deleted work package "${cur.name}"`,
    }).catch((e) => console.warn('work-package audit:', e?.message || e));
    store.persistToSupabase().catch((e) => console.warn('persist:', e?.message || e));
    res.json({ ok: true });
  } catch (e) {
    console.error('work-packages DELETE failed', e);
    res.status(500).json({ error: e?.message || 'Failed to delete work package' });
  }
});

workPackagesRouter.post('/:id/init-phases', async (req, res) => {
  try {
    if (!canCreateProject(req.user)) {
      return res.status(403).json({ error: 'Only PMO can initialize phases' });
    }
    const id = +req.params.id;
    const wp = typeof store.findWorkPackageById === 'function'
      ? await store.findWorkPackageById(id)
      : (await store.listWorkPackages()).find((w) => Number(w.id) === id) || null;
    if (!wp) return res.status(404).json({ error: 'Work package not found' });

    const existing = (await store.listProjectPhases(wp.project_id))
      .filter((p) => Number(p.work_package_id) === id);
    if (existing.length > 0) {
      return res.status(400).json({ error: 'This work package already has delivery phases' });
    }

    const template = templateForClassification(wp.classification);
    const phaseIds = await store.initProjectPhasesFromTemplate(wp.project_id, template, id);
    const allPhases = await store.listProjectPhases(wp.project_id);
    const phases = phaseIds.map((pid) => {
      const phase = allPhases.find((p) => Number(p.id) === Number(pid));
      return {
        ...phase,
        work_package_name: wp.name,
        work_package_classification: wp.classification,
      };
    });

    const project = await resolveProjectLite(wp.project_id);
    store.appendAuditLog(req.user, {
      action: 'create',
      target_type: 'project_phases',
      target_id: wp.project_id,
      summary: `Initialized ${phases.length} delivery phases for work package "${wp.name}" in ${project?.name || 'project'}`,
    }).catch((e) => console.warn('work-package audit:', e?.message || e));
    store.persistToSupabase().catch((e) => console.warn('persist:', e?.message || e));
    res.status(201).json(phases);
  } catch (e) {
    console.error('work-packages init-phases failed', e);
    if (isMissingRelationError(e)) {
      return res.status(503).json({
        error: 'Delivery tables are missing. Run work-package / phase migrations.',
      });
    }
    res.status(500).json({ error: e?.message || 'Failed to initialize phases' });
  }
});
