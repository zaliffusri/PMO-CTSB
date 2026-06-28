import { Router } from 'express';
import { store } from '../db/store.js';
import { PROJECT_CLASSIFICATIONS } from '../lib/projectConstants.js';
import { templateForClassification } from '../lib/phaseConstants.js';
import { WORK_PACKAGE_STATUS_SET } from '../lib/workPackageConstants.js';
import { OPEN_BACKLOG_STATUSES } from '../lib/backlogConstants.js';
import { canCreateProject } from '../lib/permissions.js';

export const workPackagesRouter = Router();

const CLASSIFICATION_SET = new Set(PROJECT_CLASSIFICATIONS.map((c) => c.id));

function enrichWorkPackage(wp) {
  const tasks = store.project_tasks.filter((t) => t.work_package_id === wp.id);
  const phases = (store.project_phases || []).filter((p) => p.work_package_id === wp.id);
  const backlogs = (store.backlogs || []).filter((b) => b.work_package_id === wp.id);
  const currentPhase = phases.find((p) => p.status === 'in_progress')
    || phases.find((p) => p.status === 'pending');
  const totalContract = phases.reduce((s, p) => s + (+p.payment_amount || 0), 0);
  const totalPaid = phases
    .filter((p) => p.payment_status === 'paid')
    .reduce((s, p) => s + (+p.payment_amount || 0), 0);
  return {
    ...wp,
    task_count: tasks.length,
    phase_count: phases.length,
    backlog_count: backlogs.length,
    open_backlog_count: backlogs.filter((b) => OPEN_BACKLOG_STATUSES.has(b.status)).length,
    current_phase: currentPhase?.name || null,
    total_contract: totalContract,
    total_paid: totalPaid,
  };
}

workPackagesRouter.get('/', (req, res) => {
  const projectId = req.query.project_id ? +req.query.project_id : null;
  let list = (store.work_packages || []).map(enrichWorkPackage);
  if (projectId) list = list.filter((w) => w.project_id === projectId);
  list.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || (a.name || '').localeCompare(b.name || ''));
  res.json(list);
});

workPackagesRouter.get('/:id', (req, res) => {
  const wp = (store.work_packages || []).find((w) => w.id === +req.params.id);
  if (!wp) return res.status(404).json({ error: 'Work package not found' });
  res.json(enrichWorkPackage(wp));
});

workPackagesRouter.post('/', (req, res) => {
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
  const project = store.projects.find((p) => p.id === +body.project_id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const id = store.addWorkPackage({
    project_id: +body.project_id,
    name: String(body.name).trim(),
    description: body.description != null ? String(body.description) : null,
    classification,
    status: WORK_PACKAGE_STATUS_SET.has(body.status) ? body.status : 'active',
    start_date: body.start_date || null,
    end_date: body.end_date || null,
    sort_order: body.sort_order != null ? +body.sort_order : undefined,
  });

  const wp = enrichWorkPackage(store.work_packages.find((w) => w.id === id));
  store.appendAuditLog(req.user, {
    action: 'create',
    target_type: 'work_package',
    target_id: id,
    summary: `Created work package "${wp.name}" (${wp.classification}) in ${project.name}`,
  });
  res.status(201).json(wp);
});

workPackagesRouter.put('/:id', (req, res) => {
  if (!canCreateProject(req.user)) {
    return res.status(403).json({ error: 'Only PMO can update work packages' });
  }
  const id = +req.params.id;
  const cur = (store.work_packages || []).find((w) => w.id === id);
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

  store.updateWorkPackage(id, patch);
  res.json(enrichWorkPackage(store.work_packages.find((w) => w.id === id)));
});

workPackagesRouter.delete('/:id', (req, res) => {
  if (!canCreateProject(req.user)) {
    return res.status(403).json({ error: 'Only PMO can delete work packages' });
  }
  const id = +req.params.id;
  const cur = (store.work_packages || []).find((w) => w.id === id);
  if (!cur) return res.status(404).json({ error: 'Work package not found' });

  store.deleteWorkPackage(id);
  store.appendAuditLog(req.user, {
    action: 'delete',
    target_type: 'work_package',
    target_id: id,
    summary: `Deleted work package "${cur.name}"`,
  });
  res.json({ ok: true });
});

workPackagesRouter.post('/:id/init-phases', (req, res) => {
  if (!canCreateProject(req.user)) {
    return res.status(403).json({ error: 'Only PMO can initialize phases' });
  }
  const id = +req.params.id;
  const wp = (store.work_packages || []).find((w) => w.id === id);
  if (!wp) return res.status(404).json({ error: 'Work package not found' });

  const existing = (store.project_phases || []).filter((p) => p.work_package_id === id);
  if (existing.length > 0) {
    return res.status(400).json({ error: 'This work package already has delivery phases' });
  }

  const template = templateForClassification(wp.classification);
  const phaseIds = store.initProjectPhasesFromTemplate(wp.project_id, template, id);
  const phases = phaseIds.map((pid) => {
    const phase = store.project_phases.find((p) => p.id === pid);
    return {
      ...phase,
      work_package_name: wp.name,
      work_package_classification: wp.classification,
    };
  });

  const project = store.projects.find((p) => p.id === wp.project_id);
  store.appendAuditLog(req.user, {
    action: 'create',
    target_type: 'project_phases',
    target_id: wp.project_id,
    summary: `Initialized ${phases.length} delivery phases for work package "${wp.name}" in ${project?.name || 'project'}`,
  });
  res.status(201).json(phases);
});
