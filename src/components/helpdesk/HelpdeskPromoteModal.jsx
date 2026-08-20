export default function HelpdeskPromoteModal({
  issue,
  projects,
  people,
  projectId,
  onProjectIdChange,
  assignee,
  onAssigneeChange,
  saving,
  onCancel,
  onSubmit,
}) {
  return (
    <div className="modal-backdrop" role="presentation" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal-dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="modal-dialog-header project-create-header">
          <h2 className="modal-dialog-title">Promote to product backlog</h2>
          <p className="project-create-subtitle">"{issue.title}" — select project and assign staff for the backlog item.</p>
        </div>
        <form className="project-create-form" onSubmit={onSubmit}>
          <div className="project-create-panel">
            <div className="form-field">
              <label className="form-field__label" htmlFor="promote-project">Project <span className="form-field__required">*</span></label>
              <select id="promote-project" className="form-field__input" value={projectId} onChange={(e) => onProjectIdChange(e.target.value)} required>
                <option value="">— Select project —</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="form-field">
              <label className="form-field__label" htmlFor="promote-assignee">Assign to staff <span className="form-field__required">*</span></label>
              <select id="promote-assignee" className="form-field__input" value={assignee} onChange={(e) => onAssigneeChange(e.target.value)} required>
                <option value="">— Select team member —</option>
                {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>
          <div className="project-create-footer">
            <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving || !projectId || !assignee}>Promote</button>
          </div>
        </form>
      </div>
    </div>
  );
}
