import { Router } from 'express';
import { store } from '../db/store.js';
import { PROJECT_CLASSIFICATIONS } from '../lib/projectConstants.js';
import { templateForClassification } from '../lib/phaseConstants.js';
import { WORK_PACKAGE_STATUS_SET } from '../lib/workPackageConstants.js';
import { OPEN_BACKLOG_STATUSES } from '../lib/backlogConstants.js';
import { canCreateProject } from '../lib/permissions.js';
import { reloadStore, persistStore } from '../lib/storeSync.js';

export const workPackagesRouter = Router();

const CLASSIFICATION_SET = new Set(PROJECT_CLASSIFICATIONS.map((c) => c.id));

async function enrichWorkPackage(wp, preloaded = null) {
  const pid = wp.project_id;
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
    // Soft-fail empty list so workspace shell still opens when delivery tables lag schema.
    const msg = String(e?.message || e || '');
    if (/does not exist|schema cache|PGRST204/i.test(msg)) {
      return res.json([]);
    }
    res.status(500).json({ error: e?.message || 'Failed to load work packages' });
  }
});

workPackagesRouter.get('/:id', async (req, res) => {
  try {
    const packages = await store.listWorkPackages();
    const wp = packages.find((w) => Number(w.id) === +req.params.id);
    if (!wp) return res.status(404).json({ error: 'Work package not found' });
    const ctx = await loadWorkPackageMetaContext(wp.project_id);
    res.json(enrichWorkPackage(wp, ctx));
  } catch (e) {
    console.error('work-packages GET/:id failed', e);
    res.status(500).json({ error: e?.message || 'Failed to load work package' });
  }
});

workPackagesRouter.post('/', async (req, res) => {
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
  const projects = await store.listProjects();
  const project = projects.find((p) => p.id === +body.project_id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const id = await store.addWorkPackage({
    project_id: +body.project_id,
    name: String(body.name).trim(),
    description: body.description != null ? String(body.description) : null,
    classification,
    status: WORK_PACKAGE_STATUS_SET.has(body.status) ? body.status : 'active',
    start_date: body.start_date || null,
    end_date: body.end_date || null,
    sort_order: body.sort_order != null ? +body.sort_order : undefined,
  });

  const packages = await store.listWorkPackages(+body.project_id);
  const wp = await enrichWorkPackage(packages.find((w) => w.id === id));
  await store.appendAuditLog(req.user, {
    action: 'create',
    target_type: 'work_package',
    target_id: id,
    summary: `Created work package "${wp.name}" (${wp.classification}) in ${project.name}`,
  });
  if (!(await persistStore(res))) return;
  res.status(201).json(wp);
});

workPackagesRouter.put('/:id', async (req, res) => {
  if (!canCreateProject(req.user)) {
    return res.status(403).json({ error: 'Only PMO can update work packages' });
  }
  const id = +req.params.id;
  const packages = await store.listWorkPackages();
  const cur = packages.find((w) => w.id === id);
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
  if (!(await persistStore(res))) return;
  const updated = (await store.listWorkPackages(cur.project_id)).find((w) => w.id === id);
  res.json(await enrichWorkPackage(updated));
});

workPackagesRouter.delete('/:id', async (req, res) => {
  if (!canCreateProject(req.user)) {
    return res.status(403).json({ error: 'Only PMO can delete work packages' });
  }
  const id = +req.params.id;
  const packages = await store.listWorkPackages();
  const cur = packages.find((w) => w.id === id);
  if (!cur) return res.status(404).json({ error: 'Work package not found' });

  await store.deleteWorkPackage(id);
  await store.appendAuditLog(req.user, {
    action: 'delete',
    target_type: 'work_package',
    target_id: id,
    summary: `Deleted work package "${cur.name}"`,
  });
  if (!(await persistStore(res))) return;
  res.json({ ok: true });
});

workPackagesRouter.post('/:id/init-phases', async (req, res) => {
  if (!canCreateProject(req.user)) {
    return res.status(403).json({ error: 'Only PMO can initialize phases' });
  }
  const id = +req.params.id;
  const packages = await store.listWorkPackages();
  const wp = packages.find((w) => w.id === id);
  if (!wp) return res.status(404).json({ error: 'Work package not found' });

  const existing = (await store.listProjectPhases(wp.project_id))
    .filter((p) => p.work_package_id === id);
  if (existing.length > 0) {
    return res.status(400).json({ error: 'This work package already has delivery phases' });
  }

  const template = templateForClassification(wp.classification);
  const phaseIds = await store.initProjectPhasesFromTemplate(wp.project_id, template, id);
  const allPhases = await store.listProjectPhases(wp.project_id);
  const phases = phaseIds.map((pid) => {
    const phase = allPhases.find((p) => p.id === pid);
    return {
      ...phase,
      work_package_name: wp.name,
      work_package_classification: wp.classification,
    };
  });

  const projects = await store.listProjects();
  const project = projects.find((p) => p.id === wp.project_id);
  await store.appendAuditLog(req.user, {
    action: 'create',
    target_type: 'project_phases',
    target_id: wp.project_id,
    summary: `Initialized ${phases.length} delivery phases for work package "${wp.name}" in ${project?.name || 'project'}`,
  });
  if (!(await persistStore(res))) return;
  res.status(201).json(phases);
});
