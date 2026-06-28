import { useState, useEffect } from 'react';
import { api } from '../api';
import { useSubmitLock } from '../hooks/useSubmitLock';
import UiEmptyState from './UiEmptyState';
import { DELIVERY_SCOPE_TYPES, deliveryScopeLabel } from '../../lib/projectConstants.js';
import { WORK_PACKAGE_STATUSES, workPackageStatusLabel } from '../../lib/workPackageConstants.js';

const EMPTY_FORM = {
  name: '',
  description: '',
  classification: DELIVERY_SCOPE_TYPES[0]?.id || '',
  status: 'active',
  start_date: '',
  end_date: '',
};

function formatMoney(amount) {
  if (amount == null) return '—';
  const n = +amount;
  if (!Number.isFinite(n)) return '—';
  return `MYR ${n.toLocaleString('en-MY', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export default function ProjectWorkPackagesPanel({
  projectId,
  canManage = false,
  onPackagesChange,
  onFocusPackage,
}) {
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const { pending: busy, run } = useSubmitLock();

  const load = () => {
    setLoading(true);
    api.workPackages.list({ project_id: projectId })
      .then((list) => {
        setPackages(list);
        onPackagesChange?.(list);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [projectId]);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  const openEdit = (wp) => {
    setEditingId(wp.id);
    setForm({
      name: wp.name || '',
      description: wp.description || '',
      classification: wp.classification || '',
      status: wp.status || 'active',
      start_date: wp.start_date || '',
      end_date: wp.end_date || '',
    });
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.classification) return;
    await run(async () => {
      try {
        const body = {
          project_id: projectId,
          name: form.name.trim(),
          description: form.description || null,
          classification: form.classification,
          status: form.status,
          start_date: form.start_date || null,
          end_date: form.end_date || null,
        };
        if (editingId) {
          await api.workPackages.update(editingId, body);
        } else {
          await api.workPackages.create(body);
        }
        closeForm();
        load();
      } catch (err) {
        alert(err.message);
      }
    });
  };

  const initPhases = async (wp) => {
    if (!confirm(`Initialize delivery phases for "${wp.name}" (${deliveryScopeLabel(wp.classification)})?`)) return;
    await run(async () => {
      try {
        await api.workPackages.initPhases(wp.id);
        load();
      } catch (err) {
        alert(err.message);
      }
    });
  };

  const removePackage = async (wp) => {
    if (!confirm(`Delete work package "${wp.name}"? Delivery phases for this line will be removed. Tasks and backlog items will be unassigned.`)) return;
    await run(async () => {
      try {
        await api.workPackages.delete(wp.id);
        load();
      } catch (err) {
        alert(err.message);
      }
    });
  };

  if (loading) return <div className="page-loading">Loading work packages…</div>;

  return (
    <div className="project-work-packages">
      <div className="section-card__header section-card__header--compact work-packages-header">
        <div>
          <h2 className="section-card__title">Work packages</h2>
          <p className="section-card__desc">
            Split this project into delivery lines — each with its own delivery scope, phases, tasks, and backlog.
          </p>
        </div>
        {canManage && (
          <button type="button" className="btn btn-primary btn-sm" onClick={openCreate} disabled={busy}>
            + Add work package
          </button>
        )}
      </div>

      {packages.length === 0 ? (
        <UiEmptyState
          title="No work packages yet"
          description="Add work packages when one engagement includes multiple delivery scopes — e.g. portal development, API integration, and data migration under a single contract."
          action={
            canManage ? (
              <button type="button" className="btn btn-primary btn-sm" onClick={openCreate}>
                + Add work package
              </button>
            ) : null
          }
        />
      ) : (
        <div className="work-packages-grid">
          {packages.map((wp) => (
            <article key={wp.id} className={`work-package-card work-package-card--${wp.status}`}>
              <div className="work-package-card__head">
                <div>
                  <h3 className="work-package-card__title">{wp.name}</h3>
                  <span className="work-package-card__type">{deliveryScopeLabel(wp.classification)}</span>
                </div>
                <span className={`dashboard-badge dashboard-badge-${wp.status === 'completed' ? 'completed' : wp.status === 'on-hold' ? 'on-hold' : 'active'}`}>
                  {workPackageStatusLabel(wp.status)}
                </span>
              </div>

              {wp.description && (
                <p className="work-package-card__desc">{wp.description}</p>
              )}

              <div className="work-package-card__stats">
                <div className="work-package-card__stat">
                  <span className="work-package-card__stat-value">{wp.phase_count}</span>
                  <span className="work-package-card__stat-label">Phases</span>
                </div>
                <div className="work-package-card__stat">
                  <span className="work-package-card__stat-value">{wp.task_count}</span>
                  <span className="work-package-card__stat-label">Tasks</span>
                </div>
                <div className="work-package-card__stat">
                  <span className="work-package-card__stat-value">{wp.open_backlog_count}</span>
                  <span className="work-package-card__stat-label">Open backlog</span>
                </div>
                <div className="work-package-card__stat">
                  <span className="work-package-card__stat-value work-package-card__stat-value--money">
                    {formatMoney(wp.total_contract)}
                  </span>
                  <span className="work-package-card__stat-label">Contract</span>
                </div>
              </div>

              <p className="work-package-card__meta">
                {wp.current_phase ? (
                  <>Current phase: <strong>{wp.current_phase}</strong></>
                ) : (
                  'No active delivery phase'
                )}
                {(wp.start_date || wp.end_date) && (
                  <> · {wp.start_date || '—'} → {wp.end_date || 'Open'}</>
                )}
              </p>

              <div className="work-package-card__actions">
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => onFocusPackage?.(wp.id)}>
                  View work
                </button>
                {canManage && wp.phase_count === 0 && (
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => initPhases(wp)} disabled={busy}>
                    Init phases
                  </button>
                )}
                {canManage && (
                  <>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => openEdit(wp)} disabled={busy}>
                      Edit
                    </button>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => removePackage(wp)} disabled={busy} style={{ color: 'var(--danger)' }}>
                      Delete
                    </button>
                  </>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {showForm && (
        <div className="modal-backdrop" role="presentation" onClick={(e) => e.target === e.currentTarget && closeForm()}>
          <div className="modal-dialog" role="dialog" aria-modal="true">
            <div className="modal-dialog-header project-create-header">
              <div>
                <p className="project-create-eyebrow">Work package</p>
                <h2 className="modal-dialog-title">{editingId ? 'Edit work package' : 'Add work package'}</h2>
              </div>
              <button type="button" className="modal-dialog-close" onClick={closeForm} aria-label="Close">×</button>
            </div>
            <form className="project-create-form" onSubmit={submit}>
              <div className="project-create-panel form-stack">
                <div className="form-field">
                  <label className="form-field__label" htmlFor="wp-name">Name <span className="form-field__required">*</span></label>
                  <input id="wp-name" className="form-field__input ui-input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required placeholder="e.g. Citizen portal modules" />
                </div>
                <div className="form-field">
                  <label className="form-field__label" htmlFor="wp-type">Delivery scope <span className="form-field__required">*</span></label>
                  <select id="wp-type" className="form-field__input ui-input" value={form.classification} onChange={(e) => setForm((f) => ({ ...f, classification: e.target.value }))} required>
                    {DELIVERY_SCOPE_TYPES.map((c) => (
                      <option key={c.id} value={c.id}>{c.label}</option>
                    ))}
                  </select>
                  <span className="form-field__hint">
                    {DELIVERY_SCOPE_TYPES.find((c) => c.id === form.classification)?.hint}
                  </span>
                </div>
                <div className="form-field">
                  <label className="form-field__label" htmlFor="wp-desc">Description</label>
                  <textarea id="wp-desc" className="form-field__input form-field__textarea ui-input" rows={2} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
                </div>
                <div className="form-row form-row-2">
                  <div className="form-field">
                    <label className="form-field__label" htmlFor="wp-status">Status</label>
                    <select id="wp-status" className="form-field__input ui-input" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
                      {WORK_PACKAGE_STATUSES.map((s) => (
                        <option key={s.id} value={s.id}>{s.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-field">
                    <label className="form-field__label" htmlFor="wp-start">Start date</label>
                    <input id="wp-start" type="date" className="form-field__input ui-input" value={form.start_date} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))} />
                  </div>
                </div>
                <div className="form-field">
                  <label className="form-field__label" htmlFor="wp-end">End date</label>
                  <input id="wp-end" type="date" className="form-field__input ui-input" value={form.end_date} onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))} />
                </div>
              </div>
              <div className="project-create-footer">
                <button type="button" className="btn btn-secondary" onClick={closeForm}>Cancel</button>
                <button type="submit" className="btn btn-primary project-create-footer__primary" disabled={busy}>
                  {busy ? 'Saving…' : editingId ? 'Save' : 'Add package'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
