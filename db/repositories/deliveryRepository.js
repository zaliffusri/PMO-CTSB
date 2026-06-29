import { nextId } from '../runtime/helpers.js';

export function createDeliveryRepository(ctx, getStore) {
  const { getData, save } = ctx;

  return {
    get project_phases() {
      return [...(getData().project_phases || [])];
    },
    get work_packages() {
      return [...(getData().work_packages || [])];
    },

    addProjectPhase(row) {
      const data = getData();
      if (!data.project_phases) data.project_phases = [];
      const id = nextId(data.project_phases);
      const now = new Date().toISOString();
      const phase = {
        id,
        project_id: +row.project_id,
        work_package_id: row.work_package_id != null && row.work_package_id !== '' ? +row.work_package_id : null,
        name: String(row.name || '').trim(),
        phase_key: row.phase_key || 'custom',
        sort_order: row.sort_order != null ? +row.sort_order : 99,
        status: row.status || 'pending',
        target_date: row.target_date || null,
        completed_date: row.completed_date || null,
        progress_percent: row.progress_percent != null ? +row.progress_percent : 0,
        payment_amount: row.payment_amount != null && row.payment_amount !== '' ? +row.payment_amount : null,
        payment_currency: row.payment_currency || 'MYR',
        invoice_no: row.invoice_no || null,
        invoice_date: row.invoice_date || null,
        paid_date: row.paid_date || null,
        payment_status: row.payment_status || 'pending',
        notes: row.notes || null,
        created_at: now,
        updated_at: now,
      };
      data.project_phases.push(phase);
      save();
      return id;
    },

    updateProjectPhase(id, patch) {
      const data = getData();
      if (!data.project_phases) data.project_phases = [];
      const i = data.project_phases.findIndex((p) => p.id === +id);
      if (i === -1) return false;
      const next = { ...data.project_phases[i], ...patch, updated_at: new Date().toISOString() };
      if (patch.status === 'completed' && !data.project_phases[i].completed_date && !patch.completed_date) {
        next.completed_date = new Date().toISOString().slice(0, 10);
      }
      data.project_phases[i] = next;
      save();
      return true;
    },

    initProjectPhasesFromTemplate(projectId, template, workPackageId = null) {
      const store = getStore();
      const ids = [];
      for (const row of template) {
        const id = store.addProjectPhase({
          project_id: projectId,
          work_package_id: workPackageId,
          name: row.name,
          phase_key: row.phase_key,
          sort_order: row.sort_order,
          payment_status: row.payment_status || 'pending',
          status: row.sort_order === 1 ? 'in_progress' : 'pending',
          progress_percent: row.sort_order === 1 ? 0 : 0,
        });
        ids.push(id);
      }
      return ids;
    },

    addWorkPackage(row) {
      const data = getData();
      if (!data.work_packages) data.work_packages = [];
      const id = nextId(data.work_packages);
      const now = new Date().toISOString();
      const siblings = data.work_packages.filter((w) => w.project_id === +row.project_id);
      const sort_order = row.sort_order != null
        ? +row.sort_order
        : siblings.reduce((m, w) => Math.max(m, w.sort_order ?? 0), -1) + 1;
      const wp = {
        id,
        project_id: +row.project_id,
        name: String(row.name || '').trim(),
        description: row.description != null ? String(row.description) : null,
        classification: String(row.classification || '').trim(),
        status: row.status || 'active',
        start_date: row.start_date || null,
        end_date: row.end_date || null,
        sort_order,
        created_at: now,
        updated_at: now,
      };
      data.work_packages.push(wp);
      save();
      return id;
    },

    updateWorkPackage(id, patch) {
      const data = getData();
      if (!data.work_packages) data.work_packages = [];
      const i = data.work_packages.findIndex((w) => w.id === +id);
      if (i === -1) return false;
      data.work_packages[i] = { ...data.work_packages[i], ...patch, updated_at: new Date().toISOString() };
      save();
      return true;
    },

    deleteWorkPackage(id) {
      const data = getData();
      if (!data.work_packages) data.work_packages = [];
      const i = data.work_packages.findIndex((w) => w.id === +id);
      if (i === -1) return false;
      data.work_packages.splice(i, 1);
      if (data.project_phases) {
        data.project_phases = data.project_phases.filter((p) => p.work_package_id !== +id);
      }
      data.project_tasks.forEach((t, idx) => {
        if (t.work_package_id === +id) {
          data.project_tasks[idx] = { ...t, work_package_id: null };
        }
      });
      if (data.backlogs) {
        data.backlogs.forEach((b, idx) => {
          if (b.work_package_id === +id) {
            data.backlogs[idx] = { ...b, work_package_id: null };
          }
        });
      }
      save();
      return true;
    },
  };
}
