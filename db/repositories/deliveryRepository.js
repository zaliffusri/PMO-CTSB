import { nextId } from '../runtime/helpers.js';
import {
  isDbMode,
  dbSelect,
  dbInsert,
  dbUpdate,
  dbDelete,
  dbDeleteWhere,
  dbUpdateWhere,
} from '../runtime/query.js';

function buildPhasePayload(row, { now = new Date().toISOString() } = {}) {
  return {
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
    created_at: row.created_at || now,
    updated_at: row.updated_at || now,
  };
}

function buildWorkPackagePayload(row, { sort_order, now = new Date().toISOString() } = {}) {
  return {
    project_id: +row.project_id,
    name: String(row.name || '').trim(),
    description: row.description != null ? String(row.description) : null,
    classification: String(row.classification || '').trim(),
    status: row.status || 'active',
    start_date: row.start_date || null,
    end_date: row.end_date || null,
    sort_order,
    created_at: row.created_at || now,
    updated_at: row.updated_at || now,
  };
}

export function createDeliveryRepository(ctx, getStore) {
  const { getData, save } = ctx;

  return {
    /** @deprecated Prefer listProjectPhases() — sync getter is local-only. */
    get project_phases() {
      return [...(getData().project_phases || [])];
    },
    get work_packages() {
      return [...(getData().work_packages || [])];
    },

    async listProjectPhases(projectId) {
      if (!isDbMode()) {
        const rows = getData().project_phases || [];
        if (projectId == null) return [...rows];
        return rows.filter((p) => Number(p.project_id) === Number(projectId));
      }
      const filters = projectId != null ? { project_id: Number(projectId) } : {};
      return dbSelect('project_phases_app', { filters, order: 'id' });
    },

    async listWorkPackages(projectId) {
      if (!isDbMode()) {
        const rows = getData().work_packages || [];
        if (projectId == null) return [...rows];
        return rows.filter((w) => Number(w.project_id) === Number(projectId));
      }
      const filters = projectId != null ? { project_id: Number(projectId) } : {};
      return dbSelect('project_work_packages_app', { filters, order: 'id' });
    },

    async addProjectPhase(row) {
      const now = new Date().toISOString();
      const payload = buildPhasePayload(row, { now });
      if (!isDbMode()) {
        const data = getData();
        if (!data.project_phases) data.project_phases = [];
        const id = nextId(data.project_phases);
        data.project_phases.push({ id, ...payload });
        save();
        return id;
      }
      const saved = await dbInsert('project_phases_app', payload);
      return saved.id;
    },

    async updateProjectPhase(id, patch) {
      const updated_at = new Date().toISOString();
      if (!isDbMode()) {
        const data = getData();
        if (!data.project_phases) data.project_phases = [];
        const i = data.project_phases.findIndex((p) => p.id === +id);
        if (i === -1) return false;
        const next = { ...data.project_phases[i], ...patch, updated_at };
        if (patch.status === 'completed' && !data.project_phases[i].completed_date && !patch.completed_date) {
          next.completed_date = new Date().toISOString().slice(0, 10);
        }
        data.project_phases[i] = next;
        save();
        return true;
      }
      let nextPatch = { ...patch, updated_at };
      if (patch.status === 'completed' && !patch.completed_date) {
        const existing = await dbSelect('project_phases_app', {
          filters: { id: +id },
          maybeSingle: true,
        });
        if (existing && !existing.completed_date) {
          nextPatch.completed_date = new Date().toISOString().slice(0, 10);
        }
      }
      const saved = await dbUpdate('project_phases_app', +id, nextPatch);
      return Boolean(saved);
    },

    async initProjectPhasesFromTemplate(projectId, template, workPackageId = null) {
      const store = getStore();
      const ids = [];
      for (const row of template) {
        const id = await store.addProjectPhase({
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

    async addWorkPackage(row) {
      const now = new Date().toISOString();
      if (!isDbMode()) {
        const data = getData();
        if (!data.work_packages) data.work_packages = [];
        const id = nextId(data.work_packages);
        const siblings = data.work_packages.filter((w) => w.project_id === +row.project_id);
        const sort_order = row.sort_order != null
          ? +row.sort_order
          : siblings.reduce((m, w) => Math.max(m, w.sort_order ?? 0), -1) + 1;
        data.work_packages.push({ id, ...buildWorkPackagePayload(row, { sort_order, now }) });
        save();
        return id;
      }
      let sort_order = row.sort_order != null ? +row.sort_order : null;
      if (sort_order == null) {
        const siblings = await dbSelect('project_work_packages_app', {
          filters: { project_id: +row.project_id },
        });
        sort_order = siblings.reduce((m, w) => Math.max(m, w.sort_order ?? 0), -1) + 1;
      }
      const saved = await dbInsert(
        'project_work_packages_app',
        buildWorkPackagePayload(row, { sort_order, now }),
      );
      return saved.id;
    },

    async updateWorkPackage(id, patch) {
      const updated_at = new Date().toISOString();
      if (!isDbMode()) {
        const data = getData();
        if (!data.work_packages) data.work_packages = [];
        const i = data.work_packages.findIndex((w) => w.id === +id);
        if (i === -1) return false;
        data.work_packages[i] = { ...data.work_packages[i], ...patch, updated_at };
        save();
        return true;
      }
      const saved = await dbUpdate('project_work_packages_app', +id, { ...patch, updated_at });
      return Boolean(saved);
    },

    async deleteWorkPackage(id) {
      const wid = +id;
      if (!isDbMode()) {
        const data = getData();
        if (!data.work_packages) data.work_packages = [];
        const i = data.work_packages.findIndex((w) => w.id === wid);
        if (i === -1) return false;
        data.work_packages.splice(i, 1);
        if (data.project_phases) {
          data.project_phases = data.project_phases.filter((p) => p.work_package_id !== wid);
        }
        data.project_tasks.forEach((t, idx) => {
          if (t.work_package_id === wid) {
            data.project_tasks[idx] = { ...t, work_package_id: null };
          }
        });
        if (data.backlogs) {
          data.backlogs.forEach((b, idx) => {
            if (b.work_package_id === wid) {
              data.backlogs[idx] = { ...b, work_package_id: null };
            }
          });
        }
        save();
        return true;
      }
      await dbUpdateWhere('project_tasks', { work_package_id: wid }, { work_package_id: null });
      await dbUpdateWhere('backlogs_app', { work_package_id: wid }, { work_package_id: null });
      await dbDeleteWhere('project_phases_app', { work_package_id: wid });
      await dbDelete('project_work_packages_app', wid);
      return true;
    },
  };
}
