import {
  ISSUE_PRIORITIES,
  ISSUE_CATEGORIES,
  ISSUE_INCIDENT_TYPES,
  ISSUE_INTAKE_CHANNELS,
  EPBT_MODULES,
} from '../../../lib/issueConstants.js';

export default function HelpdeskCreateForm({
  form,
  onFormChange,
  projects,
  clients,
  people,
  mayAssign,
  saving,
  onCancel,
  onSubmit,
}) {
  const setField = (key, value) => onFormChange((f) => ({ ...f, [key]: value }));

  return (
    <div className="modal-backdrop" role="presentation" onClick={(e) => e.target === e.currentTarget && !saving && onCancel()}>
      <div className="modal-dialog modal-dialog--project-create" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="modal-dialog-header project-create-header">
          <div>
            <p className="project-create-eyebrow">Helpdesk · 1st level</p>
            <h2 className="modal-dialog-title">Log client ticket</h2>
            <p className="project-create-subtitle">New tickets start at L1. Link the external QA helpdesk reference if available.</p>
          </div>
          <button type="button" className="modal-dialog-close" onClick={onCancel} aria-label="Close">×</button>
        </div>
        <form className="project-create-form" onSubmit={onSubmit}>
          <div className="project-create-panel">
            <div className="form-field">
              <label className="form-field__label" htmlFor="issue-title">Issue title <span className="form-field__required">*</span></label>
              <input id="issue-title" className="form-field__input" value={form.title} onChange={(e) => setField('title', e.target.value)} required placeholder="e.g. API login fails after deploy" />
            </div>
            <div className="form-field">
              <label className="form-field__label" htmlFor="issue-ext-ref">External helpdesk ref (No Tiket)</label>
              <input id="issue-ext-ref" className="form-field__input" value={form.external_ticket_ref} onChange={(e) => setField('external_ticket_ref', e.target.value)} placeholder="e.g. 13203 or QA-HD-2026-0142" />
            </div>
            <div className="form-field">
              <label className="form-field__label" htmlFor="issue-pblid">Product backlog ref (PBLID)</label>
              <input id="issue-pblid" className="form-field__input" value={form.backlog_ref} onChange={(e) => setField('backlog_ref', e.target.value)} placeholder="e.g. ABB-1351 — auto-links if exists" />
            </div>
            <div className="form-field">
              <label className="form-field__label" htmlFor="issue-desc">Description</label>
              <textarea id="issue-desc" className="form-field__input form-field__textarea" rows={3} value={form.description} onChange={(e) => setField('description', e.target.value)} placeholder="Steps to reproduce, impact, references…" />
            </div>
            <div className="form-row form-row-2">
              <div className="form-field">
                <label className="form-field__label">ePBTP module</label>
                <select className="form-field__input" value={form.module_code} onChange={(e) => setField('module_code', e.target.value)}>
                  {EPBT_MODULES.map((m) => (
                    <option key={m.code} value={m.code}>{m.code} — {m.label}</option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label className="form-field__label">Incident type</label>
                <select className="form-field__input" value={form.incident_type} onChange={(e) => setField('incident_type', e.target.value)}>
                  {ISSUE_INCIDENT_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </div>
            </div>
            <div className="form-row form-row-2">
              <div className="form-field">
                <label className="form-field__label">Intake channel</label>
                <select className="form-field__input" value={form.intake_channel} onChange={(e) => setField('intake_channel', e.target.value)}>
                  {ISSUE_INTAKE_CHANNELS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </div>
              <div className="form-field">
                <label className="form-field__label" htmlFor="issue-pic">Client PIC</label>
                <input id="issue-pic" className="form-field__input" value={form.client_pic} onChange={(e) => setField('client_pic', e.target.value)} placeholder="Name / contact at client" />
              </div>
            </div>
            <div className="form-field">
              <label className="form-field__label" htmlFor="issue-attach">Issue attachment ref</label>
              <input id="issue-attach" className="form-field__input" value={form.issue_attachment_ref} onChange={(e) => setField('issue_attachment_ref', e.target.value)} placeholder="File name or link from client" />
            </div>
            <div className="form-row form-row-2">
              <div className="form-field">
                <label className="form-field__label">Category</label>
                <select className="form-field__input" value={form.category} onChange={(e) => setField('category', e.target.value)}>
                  {ISSUE_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </div>
              <div className="form-field">
                <label className="form-field__label">Priority</label>
                <select className="form-field__input" value={form.priority} onChange={(e) => setField('priority', e.target.value)}>
                  {ISSUE_PRIORITIES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
              </div>
            </div>
            <div className="form-row form-row-2">
              <div className="form-field">
                <label className="form-field__label">Project</label>
                <select className="form-field__input" value={form.project_id} onChange={(e) => setField('project_id', e.target.value)}>
                  <option value="">— None / general —</option>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="form-field">
                <label className="form-field__label">Client</label>
                <select className="form-field__input" value={form.client_id} onChange={(e) => setField('client_id', e.target.value)}>
                  <option value="">— Select client —</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
            {mayAssign && (
              <div className="form-field">
                <label className="form-field__label">Assign to (L1)</label>
                <select className="form-field__input" value={form.assignee_person_id} onChange={(e) => setField('assignee_person_id', e.target.value)}>
                  <option value="">— Later —</option>
                  {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            )}
          </div>
          <div className="project-create-footer">
            <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Submitting…' : 'Log ticket'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
