import { useState, useEffect, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import ClientMultiSelect from './ClientMultiSelect';

import { PROJECT_ENGAGEMENT_TYPES } from '../../lib/projectConstants.js';

export { PROJECT_ENGAGEMENT_TYPES };

const STATUS_OPTIONS = [
  { id: 'active', label: 'Active', hint: 'Work in progress' },
  { id: 'on-hold', label: 'On hold', hint: 'Paused temporarily' },
  { id: 'completed', label: 'Completed', hint: 'Closed out' },
];

const EMPTY_FORM = {
  name: '',
  description: '',
  engagement_type: '',
  status: 'active',
  start_date: '',
  end_date: '',
  client_ids: [],
};

function formatPreviewDate(str) {
  if (!str) return '—';
  const d = new Date(str);
  if (Number.isNaN(d.getTime())) return str;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ProjectCreateModal({ open, clients, saving, onClose, onSubmit }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(EMPTY_FORM);
  const [touched, setTouched] = useState({});
  const nameRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    setStep(1);
    setForm(EMPTY_FORM);
    setTouched({});
    const t = setTimeout(() => nameRef.current?.focus(), 120);
    const onKey = (e) => { if (e.key === 'Escape' && !saving) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose, saving]);

  const errors = useMemo(() => {
    const e = {};
    if (touched.name && !form.name.trim()) e.name = 'Project name is required';
    if (form.start_date && form.end_date && form.end_date < form.start_date) {
      e.end_date = 'End date must be on or after start date';
    }
    return e;
  }, [form, touched]);

  const canContinue = form.name.trim().length > 0;

  const clientNames = useMemo(() => {
    if (!form.client_ids.length) return [];
    const map = new Map((clients || []).map((c) => [c.id, c.name]));
    return form.client_ids.map((id) => map.get(id)).filter(Boolean);
  }, [form.client_ids, clients]);

  if (!open) return null;

  const handleBackdrop = (e) => {
    if (e.target === e.currentTarget && !saving) onClose();
  };

  const goNext = () => {
    setTouched((t) => ({ ...t, name: true }));
    if (!canContinue) return;
    setStep(2);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setTouched({ name: true, end_date: true });
    if (!form.name.trim() || errors.end_date) return;
    onSubmit(form);
  };

  return (
    <div className="modal-backdrop" role="presentation" onClick={handleBackdrop}>
      <div
        className="modal-dialog modal-dialog--project-create"
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-create-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-dialog-header project-create-header">
          <div>
            <p className="project-create-eyebrow">New delivery workspace</p>
            <h2 id="project-create-title" className="modal-dialog-title">Create project</h2>
            <p className="project-create-subtitle">
              {step === 1 ? 'Start with the essentials — you can add tasks and team after.' : 'Set the timeline and link client companies.'}
            </p>
          </div>
          <button type="button" className="modal-dialog-close" onClick={onClose} disabled={saving} aria-label="Close">×</button>
        </div>

        <div className="project-create-steps" aria-label="Form progress">
          <div className={`project-create-step ${step >= 1 ? 'active' : ''} ${step > 1 ? 'done' : ''}`}>
            <span className="project-create-step__num">1</span>
            <span className="project-create-step__label">Details</span>
          </div>
          <div className="project-create-step__line" aria-hidden />
          <div className={`project-create-step ${step >= 2 ? 'active' : ''}`}>
            <span className="project-create-step__num">2</span>
            <span className="project-create-step__label">Schedule & clients</span>
          </div>
        </div>

        <form className="project-create-form" onSubmit={handleSubmit} noValidate>
          {step === 1 && (
            <div className="project-create-panel">
              <div className="form-field">
                <label className="form-field__label" htmlFor="project-create-name">
                  Project name <span className="form-field__required">*</span>
                </label>
                <input
                  ref={nameRef}
                  id="project-create-name"
                  type="text"
                  className={`form-field__input ${errors.name ? 'form-field__input--error' : ''}`}
                  placeholder="e.g. Digital portal rollout"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  onBlur={() => setTouched((t) => ({ ...t, name: true }))}
                  maxLength={120}
                  required
                />
                {errors.name && <span className="form-field__error">{errors.name}</span>}
              </div>

              <div className="form-field">
                <label className="form-field__label" htmlFor="project-create-desc">
                  Description
                  <span className="form-field__optional">Optional</span>
                </label>
                <textarea
                  id="project-create-desc"
                  className="form-field__input form-field__textarea"
                  placeholder="Brief scope, goals, or context for your team…"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={3}
                  maxLength={500}
                />
                <span className="form-field__hint">{form.description.length}/500</span>
              </div>

              <fieldset className="form-fieldset">
                <legend className="form-field__label">Engagement type</legend>
                <p className="form-field__legend-hint">Contract instrument — e.g. contract, letter of offer (LO), or purchase order.</p>
                <div className="project-type-grid">
                  {PROJECT_ENGAGEMENT_TYPES.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className={`project-type-card ${form.engagement_type === c.id ? 'selected' : ''}`}
                      onClick={() => setForm((f) => ({
                        ...f,
                        engagement_type: f.engagement_type === c.id ? '' : c.id,
                      }))}
                    >
                      <span className="project-type-card__label">{c.label}</span>
                      <span className="project-type-card__hint">{c.hint}</span>
                    </button>
                  ))}
                </div>
                <p className="form-field__hint">Add work packages later to define delivery scope (development, API, migration, etc.).</p>
              </fieldset>

              <fieldset className="form-fieldset">
                <legend className="form-field__label">Status</legend>
                <div className="project-status-row">
                  {STATUS_OPTIONS.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className={`project-status-chip ${form.status === s.id ? 'selected' : ''}`}
                      onClick={() => setForm((f) => ({ ...f, status: s.id }))}
                      title={s.hint}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </fieldset>
            </div>
          )}

          {step === 2 && (
            <div className="project-create-panel">
              <div className="form-row form-row-2">
                <div className="form-field">
                  <label className="form-field__label" htmlFor="project-create-start">Start date</label>
                  <input
                    id="project-create-start"
                    type="date"
                    className="form-field__input"
                    value={form.start_date}
                    onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
                  />
                </div>
                <div className="form-field">
                  <label className="form-field__label" htmlFor="project-create-end">End date</label>
                  <input
                    id="project-create-end"
                    type="date"
                    className={`form-field__input ${errors.end_date ? 'form-field__input--error' : ''}`}
                    value={form.end_date}
                    min={form.start_date || undefined}
                    onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
                    onBlur={() => setTouched((t) => ({ ...t, end_date: true }))}
                  />
                  {errors.end_date && <span className="form-field__error">{errors.end_date}</span>}
                </div>
              </div>
              <p className="form-field__legend-hint">Dates power the Gantt chart and deadline alerts.</p>

              <div className="form-field">
                <label className="form-field__label">Client companies</label>
                <p className="form-field__legend-hint">
                  Link one or more clients. <Link to="/clients">Manage clients</Link>
                </p>
                <ClientMultiSelect
                  clients={clients}
                  value={form.client_ids}
                  onChange={(client_ids) => setForm((f) => ({ ...f, client_ids }))}
                  idPrefix="project-create-client"
                  variant="picker"
                />
              </div>

              <div className="project-create-preview" aria-live="polite">
                <h3 className="project-create-preview__title">Summary</h3>
                <dl className="project-create-preview__list">
                  <div><dt>Name</dt><dd>{form.name.trim() || '—'}</dd></div>
                  <div><dt>Engagement</dt><dd>{PROJECT_ENGAGEMENT_TYPES.find((t) => t.id === form.engagement_type)?.label || 'Not set'}</dd></div>
                  <div><dt>Status</dt><dd>{STATUS_OPTIONS.find((s) => s.id === form.status)?.label}</dd></div>
                  <div><dt>Timeline</dt><dd>{formatPreviewDate(form.start_date)} → {formatPreviewDate(form.end_date)}</dd></div>
                  <div><dt>Clients</dt><dd>{clientNames.length ? clientNames.join(', ') : 'None linked'}</dd></div>
                </dl>
              </div>
            </div>
          )}

          <div className="project-create-footer">
            {step === 2 ? (
              <button type="button" className="btn btn-secondary" onClick={() => setStep(1)} disabled={saving}>
                Back
              </button>
            ) : (
              <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
                Cancel
              </button>
            )}
            <div className="project-create-footer__primary">
              {step === 1 ? (
                <button type="button" className="btn btn-primary" onClick={goNext} disabled={!canContinue}>
                  Continue
                </button>
              ) : (
                <button type="submit" className="btn btn-primary" disabled={saving || !canContinue || !!errors.end_date}>
                  {saving ? 'Creating…' : 'Create project'}
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
