import { Link } from 'react-router-dom';
import EntityAttachments from '../EntityAttachments';
import { priorityClass, levelClass } from '../../utils/issueUi';
import { statusLabel } from '../../utils/helpdeskUi';
import {
  ISSUE_CATEGORIES,
  resolutionMethodLabel,
  incidentTypeLabel,
  intakeChannelLabel,
} from '../../../lib/issueConstants.js';
import { nextSupportLevel, supportLevelLabel } from '../../../lib/issueWorkflow.js';

export default function HelpdeskIssueDetail({
  issue,
  projects,
  clients,
  mayAssign,
  backlogByIssue,
  saving,
  onClose,
  onPatchIssue,
  onOpenResolve,
  onOpenEscalate,
  onPromoteToBacklog,
  canResolve,
  canEscalate,
}) {
  const nextLevel = nextSupportLevel(issue.support_level);

  return (
    <div className="modal-backdrop" role="presentation" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-dialog modal-dialog--project-create helpdesk-detail-dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="modal-dialog-header project-create-header">
          <div>
            <p className="project-create-eyebrow">{issue.ticket_no}</p>
            <h2 className="modal-dialog-title">{issue.title}</h2>
            <p className="project-create-subtitle">
              <span className={levelClass(issue.helpdesk_stage)}>{issue.helpdesk_stage_label || supportLevelLabel(issue.support_level)}</span>
              {' · '}
              {statusLabel(issue.status)}
              {issue.project_name && ` · ${issue.project_name}`}
            </p>
          </div>
          <button type="button" className="modal-dialog-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="project-create-panel helpdesk-detail-body">
          <div className="helpdesk-detail-meta helpdesk-detail-meta--top">
            {issue.module_code && (
              <span className="project-meta-chip" title={issue.epbt_module_label || issue.epbt_module}>
                {issue.module_code}
                {issue.epbt_module && issue.epbt_module !== issue.module_code
                  ? ` · ${issue.epbt_module}`
                  : ''}
              </span>
            )}
            {issue.incident_type && (
              <span className="project-meta-chip">{incidentTypeLabel(issue.incident_type)}</span>
            )}
            {issue.intake_channel && (
              <span className="project-meta-chip">{intakeChannelLabel(issue.intake_channel)}</span>
            )}
          </div>
          {issue.external_ticket_ref && (
            <div className="form-field">
              <span className="form-field__label">External helpdesk ref</span>
              <p className="helpdesk-detail-desc helpdesk-ext-ref">{issue.external_ticket_ref}</p>
            </div>
          )}
          {(issue.client_pic || issue.l1_assignee_label || issue.l2_assignee_label) && (
            <div className="form-row form-row-2">
              {issue.client_pic && (
                <div className="form-field">
                  <span className="form-field__label">Client PIC</span>
                  <p className="helpdesk-detail-desc">{issue.client_pic}</p>
                </div>
              )}
              {issue.l1_assignee_label && (
                <div className="form-field">
                  <span className="form-field__label">1st level (eTicket)</span>
                  <p className="helpdesk-detail-desc">{issue.l1_assignee_label}</p>
                </div>
              )}
              {issue.l2_assignee_label && (
                <div className="form-field">
                  <span className="form-field__label">2nd level (eTicket)</span>
                  <p className="helpdesk-detail-desc">{issue.l2_assignee_label}</p>
                </div>
              )}
            </div>
          )}
          {issue.description && (
            <div className="form-field">
              <span className="form-field__label">Description</span>
              <p className="helpdesk-detail-desc">{issue.description}</p>
            </div>
          )}
          {(issue.resolution_method || issue.resolution_notes || issue.action_taken) && (
            <div className="form-field">
              <span className="form-field__label">Resolution</span>
              <p className="helpdesk-detail-desc">
                {resolutionMethodLabel(issue.resolution_method)}
                {issue.resolution_notes && ` — ${issue.resolution_notes}`}
              </p>
              {issue.action_taken && (
                <p className="helpdesk-detail-desc helpdesk-detail-desc--sub">
                  <strong>Action taken:</strong> {issue.action_taken}
                </p>
              )}
            </div>
          )}
          {(issue.backlog_ref || issue.issue_attachment_ref || issue.resolution_attachment_ref) && (
            <div className="form-row form-row-2">
              {issue.backlog_ref && (
                <div className="form-field">
                  <span className="form-field__label">Product backlog (PBLID)</span>
                  <p className="helpdesk-detail-desc">
                    {issue.backlog_project_id ? (
                      <Link
                        to={`/projects/${issue.backlog_project_id}?tab=backlog`}
                        className="pmo-link-strong"
                      >
                        {issue.backlog_ref}
                      </Link>
                    ) : (
                      issue.backlog_ref
                    )}
                  </p>
                </div>
              )}
              {issue.issue_attachment_ref && (
                <div className="form-field">
                  <span className="form-field__label">Issue attachment</span>
                  <p className="helpdesk-detail-desc helpdesk-ext-ref">{issue.issue_attachment_ref}</p>
                </div>
              )}
              {issue.resolution_attachment_ref && (
                <div className="form-field">
                  <span className="form-field__label">Resolution attachment</span>
                  <p className="helpdesk-detail-desc helpdesk-ext-ref">{issue.resolution_attachment_ref}</p>
                </div>
              )}
            </div>
          )}
          <EntityAttachments entityType="issue" entityId={issue.id} title="Attachments & references" />
          <div className="helpdesk-detail-meta">
            <span className={`issue-priority ${priorityClass(issue.priority)}`}>{issue.priority}</span>
            <span className="project-meta-chip">{ISSUE_CATEGORIES.find((c) => c.id === issue.category)?.label}</span>
            {issue.assignee_name && <span className="project-meta-chip">Assignee: {issue.assignee_name}</span>}
            {issue.client_name && <span className="project-meta-chip">{issue.client_name}</span>}
          </div>
          {mayAssign && (
            <div className="form-row form-row-2 helpdesk-detail-edit">
              <div className="form-field">
                <label className="form-field__label">Project</label>
                <select
                  className="form-field__input"
                  value={issue.project_id || ''}
                  onChange={(e) => onPatchIssue(issue.id, {
                    project_id: e.target.value ? +e.target.value : null,
                  })}
                >
                  <option value="">— None —</option>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="form-field">
                <label className="form-field__label">Client</label>
                <select
                  className="form-field__input"
                  value={issue.client_id || ''}
                  onChange={(e) => onPatchIssue(issue.id, {
                    client_id: e.target.value ? +e.target.value : null,
                  })}
                >
                  <option value="">— None —</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="form-field">
                <label className="form-field__label">External ticket ref</label>
                <input
                  className="form-field__input"
                  defaultValue={issue.external_ticket_ref || ''}
                  placeholder="QA helpdesk ticket no."
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v !== (issue.external_ticket_ref || '')) {
                      onPatchIssue(issue.id, { external_ticket_ref: v || null });
                    }
                  }}
                />
              </div>
            </div>
          )}
        </div>
        <div className="project-create-footer">
          {issue.project_id && (
            <Link to={`/projects/${issue.project_id}`} className="btn btn-secondary">Open project</Link>
          )}
          {canResolve(issue) && (
            <button type="button" className="btn btn-secondary" onClick={() => onOpenResolve(issue)} disabled={saving}>
              Mark solved
            </button>
          )}
          {canEscalate(issue) && (
            <button type="button" className="btn btn-secondary" onClick={() => onOpenEscalate(issue)} disabled={saving}>
              Escalate to {nextLevel}
            </button>
          )}
          {issue.can_promote_backlog && !backlogByIssue.has(issue.id) && (
            <button type="button" className="btn btn-primary" onClick={() => onPromoteToBacklog(issue)} disabled={saving}>
              Promote to backlog
            </button>
          )}
          {backlogByIssue.has(issue.id) && (
            <Link to={`/projects/${backlogByIssue.get(issue.id).project_id}?tab=backlog`} className="btn btn-primary">
              {backlogByIssue.get(issue.id).ref_no}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
