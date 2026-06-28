import { useState, useEffect, useMemo } from 'react';
import { deliveryScopeLabel } from '../../lib/projectConstants.js';
import { api } from '../api';
import { useSubmitLock } from '../hooks/useSubmitLock';
import UiEmptyState from './UiEmptyState';
import {
  PHASE_STATUSES,
  PAYMENT_STATUSES,
  phaseStatusLabel,
  paymentStatusLabel,
} from '../../lib/phaseConstants.js';

function formatMoney(amount, currency = 'MYR') {
  if (amount == null || amount === '') return '—';
  const n = +amount;
  if (!Number.isFinite(n)) return '—';
  return `${currency} ${n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function PhaseCard({ phase, idx, canManage, canFinance, patchPhase }) {
  return (
    <div className={`delivery-phase-card delivery-phase-card--${phase.status}`}>
      <div className="delivery-phase-card__header">
        <span className="delivery-phase-card__step">{idx + 1}</span>
        <div className="delivery-phase-card__title-wrap">
          <strong className="delivery-phase-card__title">{phase.name}</strong>
          <span className={`pmo-health-badge pmo-health-${phase.status === 'completed' ? 'on_track' : phase.status === 'blocked' ? 'blocked' : 'at_risk'}`}>
            {phaseStatusLabel(phase.status)}
          </span>
        </div>
        {(canManage || canFinance) && (
          <span className={`delivery-payment-badge delivery-payment-badge--${phase.payment_status}`}>
            {paymentStatusLabel(phase.payment_status)}
          </span>
        )}
      </div>

      <div className="delivery-phase-card__body">
        <div className="pmo-progress-bar" aria-hidden>
          <div className="pmo-progress-fill" style={{ width: `${phase.progress_percent || 0}%` }} />
        </div>

        <div className="delivery-phase-fields">
          {canManage && (
            <>
              <label className="delivery-field">
                Status
                <select className="form-field__input" value={phase.status} onChange={(e) => patchPhase(phase.id, { status: e.target.value })}>
                  {PHASE_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </label>
              <label className="delivery-field">
                Progress %
                <input type="number" min={0} max={100} className="form-field__input" defaultValue={phase.progress_percent || 0} onBlur={(e) => patchPhase(phase.id, { progress_percent: +e.target.value || 0 })} />
              </label>
              <label className="delivery-field">
                Target date
                <input type="date" className="form-field__input" defaultValue={phase.target_date || ''} onBlur={(e) => patchPhase(phase.id, { target_date: e.target.value || null })} />
              </label>
            </>
          )}

          {(canFinance || canManage) && phase.payment_status !== 'not_applicable' && (
            <>
              <label className="delivery-field">
                Amount (MYR)
                <input type="number" min={0} step="0.01" className="form-field__input" defaultValue={phase.payment_amount ?? ''} onBlur={(e) => patchPhase(phase.id, { payment_amount: e.target.value !== '' ? +e.target.value : null })} />
              </label>
              <label className="delivery-field">
                Payment status
                <select className="form-field__input" value={phase.payment_status} onChange={(e) => patchPhase(phase.id, { payment_status: e.target.value })}>
                  {PAYMENT_STATUSES.filter((p) => p.id !== 'not_applicable').map((p) => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                </select>
              </label>
              <label className="delivery-field">
                Invoice no
                <input type="text" className="form-field__input" defaultValue={phase.invoice_no || ''} onBlur={(e) => patchPhase(phase.id, { invoice_no: e.target.value || null })} />
              </label>
              <label className="delivery-field">
                Invoice date
                <input type="date" className="form-field__input" defaultValue={phase.invoice_date || ''} onBlur={(e) => patchPhase(phase.id, { invoice_date: e.target.value || null })} />
              </label>
              <label className="delivery-field">
                Paid date
                <input type="date" className="form-field__input" defaultValue={phase.paid_date || ''} onBlur={(e) => patchPhase(phase.id, { paid_date: e.target.value || null })} />
              </label>
            </>
          )}
        </div>

        {phase.backlog_count > 0 && (
          <p className="delivery-phase-meta">{phase.backlog_count} backlog item(s) in this phase</p>
        )}
      </div>
    </div>
  );
}

export default function ProjectDeliveryPanel({
  projectId,
  classification,
  workPackages = [],
  workPackageFilter = '',
  canManage = false,
  canFinance = false,
}) {
  const [phases, setPhases] = useState([]);
  const [loading, setLoading] = useState(true);
  const { pending: busy, run } = useSubmitLock();
  const usesPackages = workPackages.length > 0;

  const load = () => {
    setLoading(true);
    const params = { project_id: projectId };
    if (workPackageFilter) params.work_package_id = workPackageFilter;
    api.projectPhases.list(params)
      .then(setPhases)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [projectId, workPackageFilter]);

  const summary = useMemo(() => {
    const total = phases.reduce((s, p) => s + (+p.payment_amount || 0), 0);
    const paid = phases.filter((p) => p.payment_status === 'paid').reduce((s, p) => s + (+p.payment_amount || 0), 0);
    const current = phases.find((p) => p.status === 'in_progress') || phases.find((p) => p.status === 'pending');
    const avgProgress = phases.length
      ? Math.round(phases.reduce((s, p) => s + (p.progress_percent || 0), 0) / phases.length)
      : 0;
    return { total, paid, current, avgProgress };
  }, [phases]);

  const phaseGroups = useMemo(() => {
    if (!usesPackages || workPackageFilter) {
      return [{ key: 'all', title: null, subtitle: null, phases }];
    }
    const groups = workPackages.map((wp) => ({
      key: String(wp.id),
      title: wp.name,
      subtitle: deliveryScopeLabel(wp.classification),
      phases: phases.filter((p) => p.work_package_id === wp.id),
    }));
    const unassigned = phases.filter((p) => !p.work_package_id);
    if (unassigned.length) {
      groups.push({ key: 'unassigned', title: 'Unassigned phases', subtitle: 'Not linked to a work package', phases: unassigned });
    }
    return groups.filter((g) => g.phases.length > 0);
  }, [phases, usesPackages, workPackageFilter, workPackages]);

  const initTemplate = async () => {
    if (!confirm(`Initialize delivery phases for "${deliveryScopeLabel(classification) || 'this project'}"?`)) return;
    await run(async () => {
      try {
        await api.projectPhases.initTemplate(projectId);
        load();
      } catch (err) {
        alert(err.message);
      }
    });
  };

  const patchPhase = async (id, partial) => {
    try {
      await api.projectPhases.update(id, partial);
      load();
    } catch (err) {
      alert(err.message);
    }
  };

  if (loading) return <div className="page-loading">Loading delivery phases…</div>;

  return (
    <div className="project-delivery-panel">
      <section className="dashboard-stats helpdesk-kpis" aria-label="Delivery summary">
        <div className="dashboard-stat-card">
          <span className="dashboard-stat-label">Current phase</span>
          <span className="dashboard-stat-value dashboard-stat-value--sm">{summary.current?.name || '—'}</span>
        </div>
        <div className="dashboard-stat-card">
          <span className="dashboard-stat-label">Phase progress</span>
          <span className="dashboard-stat-value">{summary.avgProgress}%</span>
        </div>
        {(canFinance || canManage) && (
          <>
            <div className="dashboard-stat-card">
              <span className="dashboard-stat-label">Contract value</span>
              <span className="dashboard-stat-value dashboard-stat-value--sm">{formatMoney(summary.total)}</span>
            </div>
            <div className="dashboard-stat-card">
              <span className="dashboard-stat-label">Paid</span>
              <span className="dashboard-stat-value pmo-stat-success dashboard-stat-value--sm">{formatMoney(summary.paid)}</span>
            </div>
          </>
        )}
      </section>

      <div className="section-card__header section-card__header--compact">
        <div>
          <h2 className="section-card__title">Delivery & payment milestones</h2>
          <p className="section-card__desc">
            {usesPackages
              ? 'Phases are managed per work package — each line uses its own delivery template.'
              : 'Project delivery phases — URS, UAT, go-live, and payment milestones for Finance.'}
          </p>
        </div>
        {canManage && phases.length === 0 && !usesPackages && (
          <button type="button" className="btn btn-primary btn-sm" onClick={initTemplate} disabled={busy}>
            Initialize template
          </button>
        )}
      </div>

      {phases.length === 0 ? (
        <UiEmptyState
          title={usesPackages ? 'No phases for this selection' : 'No delivery phases yet'}
          description={
            usesPackages
              ? 'Open the Work packages tab and use Init phases on each delivery line.'
              : `PMO can initialize a template for this delivery scope (${deliveryScopeLabel(classification) || 'general'}), or add work packages for mixed engagements.`
          }
        />
      ) : (
        <div className="delivery-phase-groups">
          {phaseGroups.map((group) => (
            <section key={group.key} className="delivery-phase-group">
              {group.title && (
                <header className="delivery-phase-group__header">
                  <h3 className="delivery-phase-group__title">{group.title}</h3>
                  {group.subtitle && <span className="delivery-phase-group__subtitle">{group.subtitle}</span>}
                </header>
              )}
              <div className="delivery-phase-list">
                {group.phases.map((phase, idx) => (
                  <PhaseCard
                    key={phase.id}
                    phase={phase}
                    idx={idx}
                    canManage={canManage}
                    canFinance={canFinance}
                    patchPhase={patchPhase}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
