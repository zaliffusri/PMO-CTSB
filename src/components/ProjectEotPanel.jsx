import { useMemo, useState } from 'react';
import { api } from '../api';
import { useSubmitLock } from '../hooks/useSubmitLock';
import { formatProjectDate } from '../../lib/pmoMetrics.js';
import { daysBetween, parseEotLog } from '../../lib/projectEot.js';

function addDays(isoDate, days) {
  if (!isoDate || !Number.isFinite(days)) return '';
  const d = new Date(`${String(isoDate).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return '';
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function ProjectEotPanel({ project, canManage = false, onUpdated }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    new_end_date: '',
    days: '',
    reason: '',
    approved_by: '',
  });
  const { pending: busy, run } = useSubmitLock();

  const log = useMemo(() => parseEotLog(project?.eot_log), [project?.eot_log]);
  const baseline = project?.baseline_end_date || (log.length === 0 ? project?.end_date : null);
  const currentEnd = project?.end_date || null;
  const totalDays = log.reduce((s, e) => s + (Number(e.days_added) || 0), 0);

  const openForm = () => {
    const suggested = currentEnd ? addDays(currentEnd, 30) : '';
    setForm({
      new_end_date: suggested,
      days: currentEnd && suggested ? String(daysBetween(currentEnd, suggested) || 30) : '30',
      reason: '',
      approved_by: '',
    });
    setOpen(true);
  };

  const onDaysChange = (raw) => {
    const n = Number(raw);
    setForm((f) => {
      const next = { ...f, days: raw };
      if (currentEnd && Number.isFinite(n) && n > 0) {
        next.new_end_date = addDays(currentEnd, Math.floor(n));
      }
      return next;
    });
  };

  const onDateChange = (raw) => {
    setForm((f) => ({
      ...f,
      new_end_date: raw,
      days: currentEnd && raw ? String(daysBetween(currentEnd, raw) ?? '') : f.days,
    }));
  };

  const submit = async (e) => {
    e.preventDefault();
    await run(async () => {
      try {
        const updated = await api.projects.recordEot(project.id, {
          new_end_date: form.new_end_date,
          reason: form.reason,
          approved_by: form.approved_by || null,
        });
        setOpen(false);
        onUpdated?.(updated);
      } catch (err) {
        alert(err.message || 'Failed to record EOT');
      }
    });
  };

  return (
    <div className="ui-card section-card project-eot-panel">
      <div className="section-card__header section-card__header--compact">
        <div>
          <h2 className="section-card__title">Timeline & EOT</h2>
          <p className="section-card__desc">
            {log.length
              ? `${log.length} extension${log.length === 1 ? '' : 's'} · +${totalDays} day${totalDays === 1 ? '' : 's'} total`
              : 'Original schedule — no extensions recorded yet'}
          </p>
        </div>
        {canManage && (
          <div className="card-actions">
            <button type="button" className="btn btn-primary btn-sm" onClick={openForm} disabled={busy || open}>
              Record EOT
            </button>
          </div>
        )}
      </div>

      <dl className="project-eot-summary">
        <div>
          <dt>Baseline end</dt>
          <dd>{formatProjectDate(baseline) || '—'}</dd>
        </div>
        <div>
          <dt>Current end</dt>
          <dd>
            {formatProjectDate(currentEnd) || '—'}
            {log.length > 0 && <span className="project-eot-badge">Extended</span>}
          </dd>
        </div>
        <div>
          <dt>Start</dt>
          <dd>{formatProjectDate(project?.start_date) || '—'}</dd>
        </div>
      </dl>

      {open && (
        <form className="project-eot-form" onSubmit={submit}>
          <h3 className="project-eot-form__title">Record Extension of Time</h3>
          <div className="form-row form-row-2">
            <label className="form-field">
              <span className="form-field__label">Days to add</span>
              <input
                type="number"
                min={1}
                className="form-field__input ui-input"
                value={form.days}
                onChange={(e) => onDaysChange(e.target.value)}
                placeholder="e.g. 30"
              />
            </label>
            <label className="form-field">
              <span className="form-field__label">New end date <span className="form-field__required">*</span></span>
              <input
                type="date"
                required
                className="form-field__input ui-input"
                value={form.new_end_date}
                min={currentEnd || project?.start_date || undefined}
                onChange={(e) => onDateChange(e.target.value)}
              />
            </label>
          </div>
          <label className="form-field">
            <span className="form-field__label">Reason <span className="form-field__required">*</span></span>
            <textarea
              required
              rows={2}
              maxLength={500}
              className="form-field__input form-field__textarea ui-input"
              value={form.reason}
              onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
              placeholder="e.g. Client delay on UAT sign-off"
            />
          </label>
          <label className="form-field">
            <span className="form-field__label">Approved by <span className="form-field__optional">Optional</span></span>
            <input
              type="text"
              className="form-field__input ui-input"
              value={form.approved_by}
              onChange={(e) => setForm((f) => ({ ...f, approved_by: e.target.value }))}
              placeholder="e.g. Client PM / internal approver"
              maxLength={120}
            />
          </label>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? 'Saving…' : 'Confirm EOT'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {log.length > 0 && (
        <div className="project-eot-history">
          <h3 className="project-eot-history__title">EOT history</h3>
          <ul className="project-eot-list">
            {[...log].reverse().map((entry, idx) => (
              <li key={entry.id || `${entry.created_at}-${idx}`} className="project-eot-item">
                <div className="project-eot-item__head">
                  <strong>
                    EOT #{log.length - idx}
                    {entry.days_added != null ? ` · +${entry.days_added} days` : ''}
                  </strong>
                  <span className="project-eot-item__dates">
                    {formatProjectDate(entry.previous_end_date) || '—'}
                    {' → '}
                    {formatProjectDate(entry.new_end_date) || '—'}
                  </span>
                </div>
                <p className="project-eot-item__reason">{entry.reason}</p>
                <p className="project-eot-item__meta">
                  {[
                    entry.approved_by ? `Approved by ${entry.approved_by}` : null,
                    entry.recorded_by ? `Recorded by ${entry.recorded_by}` : null,
                    entry.created_at
                      ? new Date(entry.created_at).toLocaleString(undefined, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })
                      : null,
                  ].filter(Boolean).join(' · ')}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
