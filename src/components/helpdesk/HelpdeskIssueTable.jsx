import { Link } from 'react-router-dom';
import UiEmptyState from '../UiEmptyState';
import { priorityClass, levelClass } from '../../utils/issueUi';
import { statusLabel, helpdeskStageShortLabel } from '../../utils/helpdeskUi';
import {
  ISSUE_STATUSES,
  ISSUE_CATEGORIES,
  incidentTypeLabel,
  intakeChannelLabel,
} from '../../../lib/issueConstants.js';
import { nextSupportLevel, supportLevelLabel } from '../../../lib/issueWorkflow.js';

export default function HelpdeskIssueTable({
  visible,
  issuesLength,
  selectedIssueId,
  people,
  mayAssign,
  backlogByIssue,
  saving,
  onOpenIssue,
  onPatchIssue,
  onOpenResolve,
  onOpenEscalate,
  onPromoteToBacklog,
  onShowForm,
  canResolve,
  canEscalate,
}) {
  if (visible.length === 0) {
    return (
      <div className="card section-card pmo-data-list-card pmo-data-list-card--fluid">
        <UiEmptyState
          title="No issues match this filter"
          action={<button type="button" className="btn btn-primary btn-sm" onClick={onShowForm}>+ Log ticket</button>}
        />
      </div>
    );
  }

  return (
    <div className="card section-card pmo-data-list-card pmo-data-list-card--fluid">
      <div className="table-wrap pmo-data-list-wrap pmo-data-list-wrap--sticky pmo-data-list-wrap--comfortable">
        <table className="pmo-data-list pmo-portfolio-table helpdesk-table">
          <colgroup>
            <col className="col-ticket" />
            <col className="col-narrow" />
            <col className="col-narrow" />
            <col className="col-issue" />
            <col className="col-priority" />
            <col className="col-status" />
            <col className="col-dates hide-mobile" />
            <col className="col-package hide-mobile" />
            <col className="col-assignee" />
            <col className="col-actions" />
          </colgroup>
          <thead>
            <tr>
              <th>Ticket</th>
              <th>Mod</th>
              <th>Level</th>
              <th className="pmo-data-list__col-primary">Issue</th>
              <th>Priority</th>
              <th>Status</th>
              <th className="hide-mobile">Client ref</th>
              <th className="hide-mobile">Project</th>
              <th>Assignee</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((issue) => {
              const nextLevel = nextSupportLevel(issue.support_level);
              return (
                <tr key={issue.id} className={selectedIssueId === issue.id ? 'helpdesk-row--selected' : ''}>
                  <td className="helpdesk-ticket">{issue.ticket_no}</td>
                  <td>
                    <span className="project-meta-chip" title={issue.epbt_module_label || issue.epbt_module}>
                      {issue.module_code || '—'}
                    </span>
                  </td>
                  <td>
                    <span className={levelClass(issue.helpdesk_stage)} title={issue.helpdesk_stage_label || supportLevelLabel(issue.support_level)}>
                      {helpdeskStageShortLabel(issue)}
                    </span>
                  </td>
                  <td className="pmo-data-list__primary">
                    <button type="button" className="helpdesk-title helpdesk-title--link" onClick={() => onOpenIssue(issue)}>
                      {issue.title}
                    </button>
                    <div className="pmo-table-muted">
                      {incidentTypeLabel(issue.incident_type) || ISSUE_CATEGORIES.find((c) => c.id === issue.category)?.label}
                      {issue.intake_channel && ` · ${intakeChannelLabel(issue.intake_channel)}`}
                      {issue.client_name && ` · ${issue.client_name}`}
                    </div>
                  </td>
                  <td>
                    <span className={`issue-priority ${priorityClass(issue.priority)}`}>{issue.priority}</span>
                  </td>
                  <td>
                    {mayAssign ? (
                      <select
                        className="pmo-cell-select gantt-input gantt-input--select helpdesk-select"
                        value={issue.status}
                        onChange={(e) => onPatchIssue(issue.id, { status: e.target.value })}
                      >
                        {ISSUE_STATUSES.map((s) => (
                          <option key={s.id} value={s.id}>{s.label}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="project-meta-chip">{statusLabel(issue.status)}</span>
                    )}
                  </td>
                  <td className="hide-mobile helpdesk-ext-ref">
                    {issue.external_ticket_ref || '—'}
                  </td>
                  <td className="hide-mobile">
                    {issue.project_id ? (
                      <Link to={`/projects/${issue.project_id}`} className="pmo-link-strong">{issue.project_name}</Link>
                    ) : '—'}
                  </td>
                  <td>
                    {mayAssign ? (
                      <select
                        className="pmo-cell-select gantt-input gantt-input--select helpdesk-select"
                        value={issue.assignee_person_id || ''}
                        onChange={(e) => onPatchIssue(issue.id, {
                          assignee_person_id: e.target.value ? +e.target.value : null,
                        })}
                      >
                        <option value="">Unassigned</option>
                        {people.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    ) : (
                      issue.assignee_name || '—'
                    )}
                  </td>
                  <td className="table-actions-col pmo-row-actions">
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => onOpenIssue(issue)}>View</button>
                    {backlogByIssue.has(issue.id) ? (
                      <Link
                        to={`/projects/${backlogByIssue.get(issue.id).project_id}?tab=backlog`}
                        className="btn btn-ghost btn-sm"
                      >
                        {backlogByIssue.get(issue.id).ref_no}
                      </Link>
                    ) : (
                      <>
                        {canResolve(issue) && (
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenResolve(issue)} disabled={saving}>
                            Solved
                          </button>
                        )}
                        {canEscalate(issue) && (
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenEscalate(issue)} disabled={saving}>
                            → {nextLevel}
                          </button>
                        )}
                        {issue.can_promote_backlog && (
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => onPromoteToBacklog(issue)}
                            disabled={saving}
                          >
                            → Backlog
                          </button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="pmo-data-list-footer pmo-data-list-footer--scroll-hint" aria-live="polite">
        Showing {visible.length} of {issuesLength} tickets
      </p>
    </div>
  );
}
