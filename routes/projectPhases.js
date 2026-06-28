import { Router } from 'express';
import { store } from '../db/store.js';
import {
  PHASE_STATUS_SET,
  PAYMENT_STATUS_SET,
  templateForClassification,
} from '../lib/phaseConstants.js';
import { buildMaintenanceRenewals } from '../lib/financeRenewals.js';
import { canCreateProject, canViewFinance } from '../lib/permissions.js';

export const projectPhasesRouter = Router();

function enrichPhase(phase) {
  const project = store.projects.find((p) => p.id === phase.project_id);
  const wp = phase.work_package_id
    ? (store.work_packages || []).find((w) => w.id === phase.work_package_id)
    : null;
  const backlogCount = (store.backlogs || []).filter((b) => b.phase_id === phase.id).length;
  return {
    ...phase,
    project_name: project?.name ?? null,
    project_classification: project?.classification ?? null,
    project_engagement_type: project?.engagement_type ?? null,
    work_package_name: wp?.name ?? null,
    work_package_classification: wp?.classification ?? null,
    backlog_count: backlogCount,
  };
}

projectPhasesRouter.get('/finance-summary', (req, res) => {
  if (!canViewFinance(req.user)) {
    return res.status(403).json({ error: 'Finance access required' });
  }
  const phases = (store.project_phases || []).map(enrichPhase);
  const readyToBill = phases.filter(
    (p) => p.status === 'completed'
      && p.payment_status === 'pending'
      && p.payment_amount != null
      && +p.payment_amount > 0,
  );
  const invoiced = phases.filter((p) => p.payment_status === 'invoiced');
  const paid = phases.filter((p) => p.payment_status === 'paid');
  const byProject = {};
  const byWorkPackage = {};
  for (const p of phases) {
    if (!byProject[p.project_id]) {
      const project = store.projects.find((pr) => pr.id === p.project_id);
      byProject[p.project_id] = {
        project_id: p.project_id,
        project_name: project?.name,
        client_name: project?.client_name,
        classification: project?.classification,
        engagement_type: project?.engagement_type,
        current_phase: null,
        phases: [],
        work_packages: [],
        total_contract: 0,
        total_paid: 0,
        total_invoiced: 0,
      };
    }
    byProject[p.project_id].phases.push(p);
    if (p.work_package_id) {
      if (!byWorkPackage[p.work_package_id]) {
        const wp = (store.work_packages || []).find((w) => w.id === p.work_package_id);
        byWorkPackage[p.work_package_id] = {
          work_package_id: p.work_package_id,
          work_package_name: wp?.name || p.work_package_name,
          classification: wp?.classification || p.work_package_classification,
          project_id: p.project_id,
          project_name: p.project_name,
          current_phase: null,
          phases: [],
          total_contract: 0,
          total_paid: 0,
          total_invoiced: 0,
        };
        if (!byProject[p.project_id].work_packages.some((w) => w.work_package_id === p.work_package_id)) {
          byProject[p.project_id].work_packages.push(byWorkPackage[p.work_package_id]);
        }
      }
      byWorkPackage[p.work_package_id].phases.push(p);
    }
    if (p.payment_amount) {
      const amt = +p.payment_amount || 0;
      byProject[p.project_id].total_contract += amt;
      if (p.payment_status === 'paid') byProject[p.project_id].total_paid += amt;
      if (p.payment_status === 'invoiced') byProject[p.project_id].total_invoiced += amt;
    }
    if (p.status === 'in_progress') {
      byProject[p.project_id].current_phase = p.name;
      if (p.work_package_id && byWorkPackage[p.work_package_id]) {
        byWorkPackage[p.work_package_id].current_phase = p.name;
      }
    }
  }
  for (const row of Object.values(byWorkPackage)) {
    if (!row.current_phase) {
      const active = row.phases.find((ph) => ph.status === 'in_progress')
        || row.phases.find((ph) => ph.status === 'pending');
      row.current_phase = active?.name || row.phases[row.phases.length - 1]?.name || '—';
    }
    row.phases.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    for (const ph of row.phases) {
      const amt = +ph.payment_amount || 0;
      row.total_contract += amt;
      if (ph.payment_status === 'paid') row.total_paid += amt;
      if (ph.payment_status === 'invoiced') row.total_invoiced += amt;
    }
  }
  for (const row of Object.values(byProject)) {
    if (!row.current_phase) {
      const active = row.phases.find((ph) => ph.status === 'in_progress')
        || row.phases.find((ph) => ph.status === 'pending');
      row.current_phase = active?.name || row.phases[row.phases.length - 1]?.name || '—';
    }
    row.phases.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    row.work_packages.sort((a, b) => (a.work_package_name || '').localeCompare(b.work_package_name || ''));
  }
  res.json({
    ready_to_bill: readyToBill,
    invoiced,
    paid: paid.sort((a, b) => String(b.paid_date || '').localeCompare(String(a.paid_date || ''))),
    maintenance_renewals: buildMaintenanceRenewals(
      store.projects,
      phases,
      store.work_packages || [],
    ),
    work_packages: Object.values(byWorkPackage).sort((a, b) =>
      (a.project_name || '').localeCompare(b.project_name || '') ||
      (a.work_package_name || '').localeCompare(b.work_package_name || '')),
    projects: Object.values(byProject).sort((a, b) => (a.project_name || '').localeCompare(b.project_name || '')),
  });
});

projectPhasesRouter.get('/', (req, res) => {
  const projectId = req.query.project_id ? +req.query.project_id : null;
  const workPackageId = req.query.work_package_id ? +req.query.work_package_id : null;
  let list = (store.project_phases || []).map(enrichPhase);
  if (projectId) list = list.filter((p) => p.project_id === projectId);
  if (workPackageId) list = list.filter((p) => p.work_package_id === workPackageId);
  list.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  res.json(list);
});

projectPhasesRouter.post('/init-template', (req, res) => {
  if (!canCreateProject(req.user)) {
    return res.status(403).json({ error: 'Only PMO can initialize phases' });
  }
  const projectId = req.body?.project_id ? +req.body.project_id : null;
  const workPackageId = req.body?.work_package_id ? +req.body.work_package_id : null;
  if (!projectId) return res.status(400).json({ error: 'project_id is required' });
  const project = store.projects.find((p) => p.id === projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const projectPackages = (store.work_packages || []).filter((w) => w.project_id === projectId);
  if (projectPackages.length > 0 && !workPackageId) {
    return res.status(400).json({
      error: 'This project uses work packages. Initialize delivery phases on each work package instead.',
    });
  }

  let classification = project.classification;
  if (workPackageId) {
    const wp = projectPackages.find((w) => w.id === workPackageId);
    if (!wp) return res.status(404).json({ error: 'Work package not found' });
    classification = wp.classification;
    const existingForPackage = (store.project_phases || []).filter((p) => p.work_package_id === workPackageId);
    if (existingForPackage.length > 0) {
      return res.status(400).json({ error: 'This work package already has phases' });
    }
  } else {
    const existing = (store.project_phases || []).filter((p) => p.project_id === projectId);
    if (existing.length > 0) {
      return res.status(400).json({ error: 'Project already has phases. Delete or edit existing phases first.' });
    }
  }

  const template = templateForClassification(classification);
  const ids = store.initProjectPhasesFromTemplate(projectId, template, workPackageId || null);
  const phases = ids.map((id) => enrichPhase(store.project_phases.find((p) => p.id === id)));
  store.appendAuditLog(req.user, {
    action: 'create',
    target_type: 'project_phases',
    target_id: projectId,
    summary: `Initialized ${phases.length} delivery phases for ${project.name}`,
  });
  res.status(201).json(phases);
});

projectPhasesRouter.post('/', (req, res) => {
  if (!canCreateProject(req.user)) {
    return res.status(403).json({ error: 'Only PMO can create phases' });
  }
  const body = req.body || {};
  if (!body.project_id || !body.name) {
    return res.status(400).json({ error: 'project_id and name are required' });
  }
  const id = store.addProjectPhase({
    project_id: +body.project_id,
    work_package_id: body.work_package_id != null && body.work_package_id !== '' ? +body.work_package_id : null,
    name: String(body.name).trim(),
    phase_key: body.phase_key || 'custom',
    sort_order: body.sort_order != null ? +body.sort_order : 99,
    status: PHASE_STATUS_SET.has(body.status) ? body.status : 'pending',
    target_date: body.target_date || null,
    completed_date: body.completed_date || null,
    progress_percent: body.progress_percent != null ? +body.progress_percent : 0,
    payment_amount: body.payment_amount != null && body.payment_amount !== '' ? +body.payment_amount : null,
    payment_currency: body.payment_currency || 'MYR',
    invoice_no: body.invoice_no || null,
    invoice_date: body.invoice_date || null,
    paid_date: body.paid_date || null,
    payment_status: PAYMENT_STATUS_SET.has(body.payment_status) ? body.payment_status : 'pending',
    notes: body.notes || null,
  });
  res.status(201).json(enrichPhase(store.project_phases.find((p) => p.id === id)));
});

projectPhasesRouter.put('/:id', (req, res) => {
  const id = +req.params.id;
  const cur = (store.project_phases || []).find((p) => p.id === id);
  if (!cur) return res.status(404).json({ error: 'Phase not found' });
  const canFinance = canViewFinance(req.user);
  const canPmo = canCreateProject(req.user);
  if (!canFinance && !canPmo) {
    return res.status(403).json({ error: 'PMO or Finance access required' });
  }
  const body = req.body || {};
  const patch = {};
  if (canPmo) {
    if (body.name != null) patch.name = String(body.name).trim();
    if (body.status != null && PHASE_STATUS_SET.has(body.status)) patch.status = body.status;
    if (body.target_date !== undefined) patch.target_date = body.target_date || null;
    if (body.completed_date !== undefined) patch.completed_date = body.completed_date || null;
    if (body.progress_percent != null) patch.progress_percent = Math.min(100, Math.max(0, +body.progress_percent || 0));
    if (body.notes !== undefined) patch.notes = body.notes || null;
    if (body.sort_order != null) patch.sort_order = +body.sort_order;
  }
  if (canFinance || canPmo) {
    if (body.payment_amount !== undefined) {
      patch.payment_amount = body.payment_amount != null && body.payment_amount !== '' ? +body.payment_amount : null;
    }
    if (body.payment_currency != null) patch.payment_currency = body.payment_currency;
    if (body.invoice_no !== undefined) patch.invoice_no = body.invoice_no || null;
    if (body.invoice_date !== undefined) patch.invoice_date = body.invoice_date || null;
    if (body.paid_date !== undefined) patch.paid_date = body.paid_date || null;
    if (body.payment_status != null && PAYMENT_STATUS_SET.has(body.payment_status)) {
      patch.payment_status = body.payment_status;
      if (body.payment_status === 'paid' && body.paid_date === undefined && !cur.paid_date) {
        patch.paid_date = new Date().toISOString().slice(0, 10);
      }
      if (body.payment_status === 'invoiced' && body.invoice_date === undefined && !cur.invoice_date) {
        patch.invoice_date = new Date().toISOString().slice(0, 10);
      }
    }
  }
  store.updateProjectPhase(id, patch);
  res.json(enrichPhase(store.project_phases.find((p) => p.id === id)));
});
