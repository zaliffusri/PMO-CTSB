const MAINTENANCE_SCOPE = 'Maintenance & Support';
const RENEWAL_SOON_DAYS = 90;

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function isMaintenanceProject(project, workPackages) {
  if (project.classification === MAINTENANCE_SCOPE) return true;
  return (workPackages || []).some(
    (w) => w.project_id === project.id && w.classification === MAINTENANCE_SCOPE,
  );
}

/**
 * Maintenance contracts that expired or are ending soon — for PMO / Finance follow-up.
 */
export function buildMaintenanceRenewals(projects, phases, workPackages) {
  const today = todayStr();
  const soonCutoff = addDays(RENEWAL_SOON_DAYS);
  const rows = [];

  for (const project of projects) {
    if (!isMaintenanceProject(project, workPackages)) continue;

    const projectPhases = phases.filter((p) => p.project_id === project.id);
    const maintPhase = projectPhases.find((p) => p.phase_key === 'maintenance')
      || projectPhases.find((p) => (p.name || '').toLowerCase().includes('maintenance'));
    const paidPhases = projectPhases
      .filter((p) => p.payment_status === 'paid' && p.payment_amount != null && +p.payment_amount > 0)
      .sort((a, b) => String(b.paid_date || '').localeCompare(String(a.paid_date || '')));
    const lastPaid = paidPhases[0];
    const totalPaid = paidPhases.reduce((s, p) => s + (+p.payment_amount || 0), 0);

    let renewal_status = null;
    if (project.end_date && project.end_date < today) renewal_status = 'expired';
    else if (project.end_date && project.end_date <= soonCutoff) renewal_status = 'ending_soon';
    if (!renewal_status) continue;

    rows.push({
      project_id: project.id,
      project_name: project.name,
      client_name: project.client_name,
      project_status: project.status,
      end_date: project.end_date,
      renewal_status,
      maintenance_phase: maintPhase?.name || null,
      maintenance_phase_status: maintPhase?.status || null,
      maintenance_payment_status: maintPhase?.payment_status || null,
      claimed_phases: paidPhases.length,
      total_paid: totalPaid,
      last_paid_date: lastPaid?.paid_date || null,
      last_paid_phase: lastPaid?.name || null,
    });
  }

  const order = { expired: 0, ending_soon: 1 };
  return rows.sort((a, b) => {
    const sa = order[a.renewal_status] ?? 9;
    const sb = order[b.renewal_status] ?? 9;
    if (sa !== sb) return sa - sb;
    return String(a.end_date || '').localeCompare(String(b.end_date || ''));
  });
}

export function renewalStatusLabel(status) {
  if (status === 'expired') return 'Expired';
  if (status === 'ending_soon') return 'Ending soon';
  return status || '—';
}
