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
import { workPackageStatusLabel } from '../../lib/workPackageConstants.js';

function formatMoney(amount, currency = 'MYR') {
  if (amount == null || amount === '') return '—';
  const n = +amount;
  if (!Number.isFinite(n)) return '—';
  return `${currency} ${n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const EMPTY_PHASE_FORM = {
  name: '',
  work_package_id: '',
  status: 'pending',
  payment_status: 'pending',
  target_date: '',
  payment_amount: '',
};

function summarizePhases(phaseList = []) {
  const total = phaseList.reduce((s, p) => s + (+p.payment_amount || 0), 0);
  const paid = phaseList
    .filter((p) => p.payment_status === 'paid')
    .reduce((s, p) => s + (+p.payment_amount || 0), 0);
  const current = phaseList.find((p) => p.status === 'in_progress')
    || phaseList.find((p) => p.status === 'pending');
  const avgProgress = phaseList.length
    ? Math.round(phaseList.reduce((s, p) => s + (p.progress_percent || 0), 0) / phaseList.length)
    : 0;
  return {
    total,
    paid,
    current,
    avgProgress,
    count: phaseList.length,
    openCount: phaseList.filter((p) => p.status !== 'completed').length,
  };
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

function PackageDeliveryLane({
  title,
  subtitle,
  status,
  phases,
  canManage,
  canFinance,
  showFinance,
  onAddPhase,
  patchPhase,
  busy,
}) {
  const summary = useMemo(() => summarizePhases(phases), [phases]);
  const statusLabel = status ? workPackageStatusLabel(status) : '';

  return (
    <section className="delivery-package-lane">
      <header className="delivery-package-lane__header">
        <div className="delivery-package-lane__identity">
          <p className="delivery-package-lane__eyebrow">Work package delivery</p>
          <h3 className="delivery-package-lane__title">{title}</h3>
          <div className="delivery-package-lane__meta">
            {subtitle && <span className="delivery-package-lane__scope">{subtitle}</span>}
            {status && (
              <span className={`dashboard-badge dashboard-badge-${status === 'completed' ? 'completed' : status === 'on-hold' ? 'on-hold' : 'active'}`}>
                {statusLabel || status}
              </span>
            )}
          </div>
        </div>
        {canManage && (
          <button type="button" className="btn btn-primary btn-sm" onClick={onAddPhase} disabled={busy}>
            + Add phase
          </button>
        )}
      </header>

      <div className="delivery-package-lane__stats" aria-label={`${title} delivery summary`}>
        <div className="delivery-package-stat">
          <span className="delivery-package-stat__label">Current phase</span>
          <span className="delivery-package-stat__value">{summary.current?.name || '—'}</span>
        </div>
        <div className="delivery-package-stat">
          <span className="delivery-package-stat__label">Phases</span>
          <span className="delivery-package-stat__value">{summary.count}</span>
        </div>
        <div className="delivery-package-stat">
          <span className="delivery-package-stat__label">Progress</span>
          <span className="delivery-package-stat__value">{summary.avgProgress}%</span>
        </div>
        {showFinance && (
          <>
            <div className="delivery-package-stat">
              <span className="delivery-package-stat__label">Contract</span>
              <span className="delivery-package-stat__value">{formatMoney(summary.total)}</span>
            </div>
            <div className="delivery-package-stat">
              <span className="delivery-package-stat__label">Paid</span>
              <span className="delivery-package-stat__value delivery-package-stat__value--ok">{formatMoney(summary.paid)}</span>
            </div>
          </>
        )}
      </div>

      {phases.length === 0 ? (
        <div className="delivery-package-lane__empty">
          <p>No delivery phases for this work package yet.</p>
          {canManage && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={onAddPhase} disabled={busy}>
              + Add first phase
            </button>
          )}
        </div>
      ) : (
        <div className="delivery-phase-list">
          {phases.map((phase, idx) => (
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
      )}
    </section>
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
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_PHASE_FORM);
  /** When true, work package was chosen by clicking Add on a specific lane — hide selector. */
  const [packageLocked, setPackageLocked] = useState(false);
  const { pending: busy, run } = useSubmitLock();
  const usesPackages = workPackages.length > 0;
  const showFinance = canFinance || canManage;

  const load = () => {
    setLoading(true);
    // Always load project phases; UI groups/filters by work package.
    api.projectPhases.list({ project_id: projectId })
      .then((list) => setPhases(Array.isArray(list) ? list : []))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [projectId]);

  const packageLanes = useMemo(() => {
    if (!usesPackages) return [];
    const packages = workPackageFilter
      ? workPackages.filter((wp) => String(wp.id) === String(workPackageFilter))
      : workPackages;
    return packages.map((wp) => ({
      key: String(wp.id),
      id: wp.id,
      title: wp.name,
      subtitle: deliveryScopeLabel(wp.classification),
      status: wp.status,
      phases: phases
        .filter((p) => Number(p.work_package_id) === Number(wp.id))
        .slice()
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || Number(a.id) - Number(b.id)),
    }));
  }, [usesPackages, workPackages, workPackageFilter, phases]);

  const unassignedPhases = useMemo(() => {
    if (!usesPackages) return [];
    return phases.filter((p) => !p.work_package_id);
  }, [usesPackages, phases]);

  const projectPhases = useMemo(() => {
    if (usesPackages) return [];
    return phases.slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || Number(a.id) - Number(b.id));
  }, [usesPackages, phases]);

  const projectSummary = useMemo(() => summarizePhases(projectPhases), [projectPhases]);

  const openAddPhase = (presetPackageId = '') => {
    const fromLane = presetPackageId != null && String(presetPackageId).trim() !== '';
    const defaultWp = fromLane
      ? String(presetPackageId)
      : (workPackageFilter || (workPackages.length === 1 ? String(workPackages[0].id) : ''));
    setForm({
      ...EMPTY_PHASE_FORM,
      work_package_id: defaultWp,
    });
    // Hide package picker when opened from a specific work package lane (or only one package exists).
    setPackageLocked(fromLane || workPackages.length === 1);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setPackageLocked(false);
    setForm(EMPTY_PHASE_FORM);
  };

  const submitPhase = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    if (usesPackages && !form.work_package_id) {
      alert('Select a work package for this phase.');
      return;
    }
    await run(async () => {
      try {
        const siblings = usesPackages && form.work_package_id
          ? phases.filter((p) => Number(p.work_package_id) === Number(form.work_package_id))
          : phases;
        const nextOrder = siblings.reduce((m, p) => Math.max(m, p.sort_order ?? 0), 0) + 1;
        await api.projectPhases.create({
          project_id: projectId,
          work_package_id: form.work_package_id ? +form.work_package_id : null,
          name: form.name.trim(),
          phase_key: 'custom',
          sort_order: nextOrder,
          status: form.status,
          payment_status: form.payment_status,
          target_date: form.target_date || null,
          payment_amount: form.payment_amount !== '' ? +form.payment_amount : null,
        });
        closeForm();
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

  // Project without work packages: single delivery stream
  if (!usesPackages) {
    return (
      <div className="project-delivery-panel">
        <section className="dashboard-stats helpdesk-kpis" aria-label="Delivery summary">
          <div className="dashboard-stat-card">
            <span className="dashboard-stat-label">Current phase</span>
            <span className="dashboard-stat-value dashboard-stat-value--sm">{projectSummary.current?.name || '—'}</span>
          </div>
          <div className="dashboard-stat-card">
            <span className="dashboard-stat-label">Phase progress</span>
            <span className="dashboard-stat-value">{projectSummary.avgProgress}%</span>
          </div>
          {showFinance && (
            <>
              <div className="dashboard-stat-card">
                <span className="dashboard-stat-label">Contract value</span>
                <span className="dashboard-stat-value dashboard-stat-value--sm">{formatMoney(projectSummary.total)}</span>
              </div>
              <div className="dashboard-stat-card">
                <span className="dashboard-stat-label">Paid</span>
                <span className="dashboard-stat-value pmo-stat-success dashboard-stat-value--sm">{formatMoney(projectSummary.paid)}</span>
              </div>
            </>
          )}
        </section>

        <div className="section-card__header section-card__header--compact">
          <div>
            <h2 className="section-card__title">Delivery & payment milestones</h2>
            <p className="section-card__desc">
              Add delivery phases manually — URS, UAT, go-live, and payment milestones for Finance.
            </p>
          </div>
          {canManage && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => openAddPhase()} disabled={busy}>
              + Add phase
            </button>
          )}
        </div>

        {projectPhases.length === 0 ? (
          <UiEmptyState
            title="No delivery phases yet"
            description={`PMO can add phases for this delivery scope (${deliveryScopeLabel(classification) || 'general'}).`}
            action={
              canManage ? (
                <button type="button" className="btn btn-primary btn-sm" onClick={() => openAddPhase()} disabled={busy}>
                  + Add phase
                </button>
              ) : null
            }
          />
        ) : (
          <div className="delivery-phase-list delivery-phase-list--project">
            {projectPhases.map((phase, idx) => (
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
        )}

        {showForm && (
          <AddPhaseModal
            form={form}
            setForm={setForm}
            usesPackages={false}
            workPackages={workPackages}
            busy={busy}
            onClose={closeForm}
            onSubmit={submitPhase}
          />
        )}
      </div>
    );
  }

  // With work packages: one delivery lane per package
  return (
    <div className="project-delivery-panel project-delivery-panel--by-package">
      <div className="section-card__header section-card__header--compact">
        <div>
          <h2 className="section-card__title">Delivery by work package</h2>
          <p className="section-card__desc">
            Each work package has its own delivery milestones and payments — they are tracked separately.
          </p>
        </div>
      </div>

      {packageLanes.length === 0 ? (
        <UiEmptyState
          title="No work packages to show"
          description="Add a work package first, then create delivery phases for that line."
        />
      ) : (
        <div className="delivery-package-lanes">
          {packageLanes.map((lane) => (
            <PackageDeliveryLane
              key={lane.key}
              title={lane.title}
              subtitle={lane.subtitle}
              status={lane.status}
              phases={lane.phases}
              canManage={canManage}
              canFinance={canFinance}
              showFinance={showFinance}
              onAddPhase={() => openAddPhase(lane.key)}
              patchPhase={patchPhase}
              busy={busy}
            />
          ))}

          {unassignedPhases.length > 0 && !workPackageFilter && (
            <PackageDeliveryLane
              title="Unassigned phases"
              subtitle="Not linked to a work package"
              status={null}
              phases={unassignedPhases}
              canManage={false}
              canFinance={canFinance}
              showFinance={showFinance}
              onAddPhase={() => {}}
              patchPhase={patchPhase}
              busy={busy}
            />
          )}
        </div>
      )}

      {showForm && (
        <AddPhaseModal
          form={form}
          setForm={setForm}
          usesPackages
          workPackages={workPackages}
          busy={busy}
          onClose={closeForm}
          onSubmit={submitPhase}
          hidePackageSelect={packageLocked}
        />
      )}
    </div>
  );
}

function AddPhaseModal({
  form,
  setForm,
  usesPackages,
  workPackages,
  busy,
  onClose,
  onSubmit,
  hidePackageSelect = false,
}) {
  const lockedPackage = useMemo(() => {
    if (!form.work_package_id) return null;
    return workPackages.find((wp) => String(wp.id) === String(form.work_package_id)) || null;
  }, [form.work_package_id, workPackages]);

  return (
    <div className="modal-backdrop" role="presentation" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-dialog" role="dialog" aria-modal="true">
        <div className="modal-dialog-header project-create-header">
          <div>
            <p className="project-create-eyebrow">Delivery</p>
            <h2 className="modal-dialog-title">Add phase</h2>
            {hidePackageSelect && lockedPackage && (
              <p className="project-create-subtitle">
                For work package <strong>{lockedPackage.name}</strong>
                {lockedPackage.classification ? ` · ${deliveryScopeLabel(lockedPackage.classification)}` : ''}
              </p>
            )}
          </div>
          <button type="button" className="modal-dialog-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <form className="project-create-form" onSubmit={onSubmit}>
          <div className="project-create-panel form-stack">
            <div className="form-field">
              <label className="form-field__label" htmlFor="phase-name">
                Phase name <span className="form-field__required">*</span>
              </label>
              <input
                id="phase-name"
                className="form-field__input ui-input"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
                placeholder="e.g. UAT & sign-off"
                autoFocus
              />
            </div>
            {usesPackages && !hidePackageSelect && (
              <div className="form-field">
                <label className="form-field__label" htmlFor="phase-wp">
                  Work package <span className="form-field__required">*</span>
                </label>
                <select
                  id="phase-wp"
                  className="form-field__input ui-input"
                  value={form.work_package_id}
                  onChange={(e) => setForm((f) => ({ ...f, work_package_id: e.target.value }))}
                  required
                >
                  <option value="">Select work package…</option>
                  {workPackages.map((wp) => (
                    <option key={wp.id} value={wp.id}>
                      {wp.name} ({deliveryScopeLabel(wp.classification)})
                    </option>
                  ))}
                </select>
              </div>
            )}
            {/* Keep locked package id in form for submit without showing a selector */}
            {usesPackages && hidePackageSelect && (
              <input type="hidden" name="work_package_id" value={form.work_package_id || ''} readOnly />
            )}
            <div className="form-row form-row-2">
              <div className="form-field">
                <label className="form-field__label" htmlFor="phase-status">Status</label>
                <select
                  id="phase-status"
                  className="form-field__input ui-input"
                  value={form.status}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                >
                  {PHASE_STATUSES.map((s) => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label className="form-field__label" htmlFor="phase-pay">Payment status</label>
                <select
                  id="phase-pay"
                  className="form-field__input ui-input"
                  value={form.payment_status}
                  onChange={(e) => setForm((f) => ({ ...f, payment_status: e.target.value }))}
                >
                  {PAYMENT_STATUSES.map((s) => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="form-row form-row-2">
              <div className="form-field">
                <label className="form-field__label" htmlFor="phase-target">Target date</label>
                <input
                  id="phase-target"
                  type="date"
                  className="form-field__input ui-input"
                  value={form.target_date}
                  onChange={(e) => setForm((f) => ({ ...f, target_date: e.target.value }))}
                />
              </div>
              <div className="form-field">
                <label className="form-field__label" htmlFor="phase-amount">Amount (MYR)</label>
                <input
                  id="phase-amount"
                  type="number"
                  min={0}
                  step="0.01"
                  className="form-field__input ui-input"
                  value={form.payment_amount}
                  onChange={(e) => setForm((f) => ({ ...f, payment_amount: e.target.value }))}
                  placeholder="Optional"
                />
              </div>
            </div>
          </div>
          <div className="project-create-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary project-create-footer__primary" disabled={busy}>
              {busy ? 'Saving…' : 'Add phase'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
