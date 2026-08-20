import { ISSUE_RESOLUTION_METHODS } from '../../../lib/issueConstants.js';
import { supportLevelLabel } from '../../../lib/issueWorkflow.js';

export default function HelpdeskResolveModal({
  issue,
  method,
  onMethodChange,
  notes,
  onNotesChange,
  action,
  onActionChange,
  saving,
  onCancel,
  onSubmit,
}) {
  return (
    <div className="modal-backdrop" role="presentation" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal-dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="modal-dialog-header project-create-header">
          <h2 className="modal-dialog-title">Mark issue solved</h2>
          <p className="project-create-subtitle">Record how "{issue.title}" was resolved at {issue.helpdesk_stage_label || supportLevelLabel(issue.support_level)}.</p>
        </div>
        <form className="project-create-form" onSubmit={onSubmit}>
          <div className="project-create-panel">
            <div className="form-field">
              <label className="form-field__label" htmlFor="resolve-method">Resolution method <span className="form-field__required">*</span></label>
              <select id="resolve-method" className="form-field__input" value={method} onChange={(e) => onMethodChange(e.target.value)} required>
                {ISSUE_RESOLUTION_METHODS.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label className="form-field__label" htmlFor="resolve-action">Action taken</label>
              <textarea id="resolve-action" className="form-field__input form-field__textarea" rows={3} value={action} onChange={(e) => onActionChange(e.target.value)} placeholder="Steps taken, fix applied, or guidance given to client…" />
            </div>
            <div className="form-field">
              <label className="form-field__label" htmlFor="resolve-notes">Notes</label>
              <textarea id="resolve-notes" className="form-field__input form-field__textarea" rows={2} value={notes} onChange={(e) => onNotesChange(e.target.value)} placeholder="Internal summary (optional)…" />
            </div>
          </div>
          <div className="project-create-footer">
            <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>Mark solved</button>
          </div>
        </form>
      </div>
    </div>
  );
}
