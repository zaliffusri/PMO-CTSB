import { nextSupportLevel, supportLevelLabel } from '../../../lib/issueWorkflow.js';

export default function HelpdeskEscalateModal({
  issue,
  people,
  assignee,
  onAssigneeChange,
  note,
  onNoteChange,
  saving,
  onCancel,
  onSubmit,
}) {
  const nextLevel = nextSupportLevel(issue.support_level);

  return (
    <div className="modal-backdrop" role="presentation" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal-dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="modal-dialog-header project-create-header">
          <h2 className="modal-dialog-title">Escalate to {nextLevel}</h2>
          <p className="project-create-subtitle">
            Pass "{issue.title}" from {supportLevelLabel(issue.support_level)} to {supportLevelLabel(nextLevel)}.
          </p>
        </div>
        <form className="project-create-form" onSubmit={onSubmit}>
          <div className="project-create-panel">
            <div className="form-field">
              <label className="form-field__label" htmlFor="escalate-assignee">Assign to <span className="form-field__required">*</span></label>
              <select id="escalate-assignee" className="form-field__input" value={assignee} onChange={(e) => onAssigneeChange(e.target.value)} required>
                <option value="">— Select team member —</option>
                {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="form-field">
              <label className="form-field__label" htmlFor="escalate-note">Handover note</label>
              <textarea id="escalate-note" className="form-field__input form-field__textarea" rows={2} value={note} onChange={(e) => onNoteChange(e.target.value)} placeholder="What was tried, client context…" />
            </div>
          </div>
          <div className="project-create-footer">
            <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving || !assignee}>Escalate</button>
          </div>
        </form>
      </div>
    </div>
  );
}
