import { useEffect, useState } from 'react';
import { api } from '../api';

const RECIPIENT_MODES = [
  { id: 'team', label: 'Whole team', hint: 'Everyone with an email on Team or Users' },
  { id: 'assignees', label: 'People on this schedule', hint: 'Assignees and guest emails in the period' },
  { id: 'custom', label: 'Custom list', hint: 'Comma-separated addresses' },
];

export default function ScheduleEmailModal({
  open,
  onClose,
  rangeFrom,
  rangeTo,
  periodLabel,
  onSent,
}) {
  const [mode, setMode] = useState('team');
  const [customEmails, setCustomEmails] = useState('');
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setLoadingPreview(true);
    const params = {
      from: rangeFrom,
      to: rangeTo,
      mode,
      message: message.trim(),
    };
    if (mode === 'custom') params.emails = customEmails;
    api.activities
      .scheduleEmailPreview(params)
      .then(setPreview)
      .catch((e) => {
        setPreview(null);
        setError(e?.message || 'Could not load email preview');
      })
      .finally(() => setLoadingPreview(false));
  }, [open, rangeFrom, rangeTo, mode, customEmails, message]);

  if (!open) return null;

  const handleSend = async () => {
    if (!preview?.smtp_configured) {
      setError('SMTP is not configured. Set SMTP_* in server .env (see README).');
      return;
    }
    if (!preview.recipient_count) {
      setError('No recipients found for this option. Try another recipient mode or add emails on Team.');
      return;
    }
    if (!confirm(`Send schedule email to ${preview.recipient_count} recipient(s)?`)) return;

    setSending(true);
    setError('');
    try {
      const result = await api.activities.sendScheduleEmail({
        from: rangeFrom,
        to: rangeTo,
        mode,
        emails: mode === 'custom'
          ? customEmails.split(/[,;]/).map((x) => x.trim()).filter(Boolean)
          : undefined,
        message: message.trim() || undefined,
      });
      onSent?.(result);
      alert(`Schedule emailed to ${result.sent} recipient(s).${result.failed ? ` ${result.failed} failed.` : ''}`);
      onClose();
    } catch (e) {
      setError(e?.message || 'Failed to send email');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <div
        className="modal-dialog modal-dialog--wide schedule-email-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="schedule-email-modal-title"
      >
        <div className="modal-dialog-header">
          <div>
            <h2 id="schedule-email-modal-title" className="modal-dialog-title">
              Email team schedule
            </h2>
            <p className="schedule-email-modal__subtitle">
              {periodLabel || 'Selected period'} — designed HTML email your team can read on any device.
            </p>
          </div>
          <button type="button" className="modal-dialog-close" onClick={onClose} aria-label="Close dialog" disabled={sending}>
            ×
          </button>
        </div>

        {!preview?.smtp_configured && !loadingPreview && (
          <div className="schedule-email-modal__banner schedule-email-modal__banner--warn">
            SMTP is not configured on the server. Preview is shown, but sending is disabled until an admin sets <code>SMTP_*</code> in <code>.env</code>.
          </div>
        )}

        <div className="schedule-email-modal__layout">
          <div className="schedule-email-modal__form">
            <label className="form-field">
              <span className="form-field__label">Recipients</span>
              <select
                className="ui-input"
                value={mode}
                onChange={(e) => setMode(e.target.value)}
                disabled={sending}
              >
                {RECIPIENT_MODES.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
              <span className="form-field__hint">
                {RECIPIENT_MODES.find((m) => m.id === mode)?.hint}
              </span>
            </label>

            {mode === 'custom' && (
              <label className="form-field">
                <span className="form-field__label">Email addresses</span>
                <textarea
                  className="ui-input"
                  rows={3}
                  value={customEmails}
                  onChange={(e) => setCustomEmails(e.target.value)}
                  placeholder="pmo@company.com, team@company.com"
                  disabled={sending}
                />
              </label>
            )}

            <label className="form-field">
              <span className="form-field__label">Message (optional)</span>
              <textarea
                className="ui-input"
                rows={3}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="e.g. Please confirm your availability for the sessions below."
                disabled={sending}
              />
            </label>

            {preview && (
              <div className="schedule-email-modal__meta">
                <span>{preview.activity_count} activities</span>
                <span>{preview.recipient_count} recipients</span>
                <span className="schedule-email-modal__subject" title={preview.subject}>
                  Subject: {preview.subject}
                </span>
              </div>
            )}

            {error && <p className="schedule-email-modal__error">{error}</p>}

            <div className="schedule-email-modal__actions">
              <button type="button" className="btn btn-secondary" onClick={onClose} disabled={sending}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSend}
                disabled={sending || loadingPreview || !preview}
              >
                {sending ? 'Sending…' : `Send to ${preview?.recipient_count ?? 0} recipient(s)`}
              </button>
            </div>
          </div>

          <div className="schedule-email-modal__preview-wrap">
            <div className="schedule-email-modal__preview-head">Email preview</div>
            {loadingPreview ? (
              <p className="schedule-email-modal__loading">Loading preview…</p>
            ) : preview?.html ? (
              <iframe
                className="schedule-email-modal__preview-frame"
                title="Schedule email preview"
                srcDoc={preview.html}
                sandbox=""
              />
            ) : (
              <p className="schedule-email-modal__loading">No preview available.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
