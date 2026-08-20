import {
  activityCssClass,
  activityDescriptionForCalendarDisplay,
  activityTypeLabel,
  activityWasEditedAfterCreate,
  formatActivityTimeRange,
  formatAuditWhen,
} from '../../utils/calendarUtils.js';

export default function CalendarActivityDetailSheet({
  activity: a,
  onClose,
  onEdit,
  onCancel,
  onNotify,
  actionPending,
  canEdit,
  smtpConfigured,
}) {
  if (!a) return null;
  const rangeLabel = formatActivityTimeRange(a);
  const descForCalendar = activityDescriptionForCalendarDisplay(a.description);
  const typeClass = activityCssClass(a.type);
  return (
    <div className="calendar-detail-backdrop" onClick={onClose} role="presentation">
      <div
        className="calendar-detail-sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="calendar-detail-heading"
      >
        <div className="calendar-detail-sheet-handle" aria-hidden />
        <div className="calendar-detail-sheet__hero">
          <span className={`calendar-activity-chip__type calendar-activity-chip__type--${typeClass}`}>
            {activityTypeLabel(a.type)}
          </span>
          <h3 id="calendar-detail-heading" className="calendar-detail-sheet-title">{a.title}</h3>
          <p className="calendar-detail-sheet-line calendar-detail-sheet-muted">{rangeLabel}</p>
        </div>
        <dl className="calendar-detail-facts">
          <div>
            <dt>Team</dt>
            <dd>{a.person_name || '—'}</dd>
          </div>
          {a.project_name && (
            <div>
              <dt>Project</dt>
              <dd>{a.project_name}</dd>
            </div>
          )}
          {a.location && (
            <div>
              <dt>Location</dt>
              <dd>{a.location}</dd>
            </div>
          )}
          <div>
            <dt>Created by</dt>
            <dd>
              <strong>{a.created_by_name || '—'}</strong>
              {a.created_at ? (
                <span className="calendar-detail-facts__meta"> · {formatAuditWhen(a.created_at)}</span>
              ) : null}
            </dd>
          </div>
          {activityWasEditedAfterCreate(a) ? (
            <div>
              <dt>Last edited by</dt>
              <dd>
                <strong>{a.updated_by_name}</strong>
                <span className="calendar-detail-facts__meta"> · {formatAuditWhen(a.updated_at)}</span>
              </dd>
            </div>
          ) : null}
        </dl>
        {descForCalendar && (
          <div className="calendar-detail-notes">
            <h4 className="calendar-detail-notes__title">Notes</h4>
            <p className="calendar-detail-sheet-desc">{descForCalendar}</p>
          </div>
        )}
        {canEdit && (
          <div className="calendar-detail-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => onEdit?.(a)}
              disabled={actionPending}
            >
              Edit activity
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => onNotify?.(a)}
              disabled={actionPending || !smtpConfigured}
              title={!smtpConfigured ? 'SMTP is not configured on the server' : undefined}
            >
              {actionPending ? 'Please wait…' : 'Resend email'}
            </button>
            <button
              type="button"
              className="btn btn-ghost calendar-detail-actions__danger"
              onClick={() => onCancel?.(a)}
              disabled={actionPending}
            >
              {actionPending ? 'Please wait…' : 'Cancel activity'}
            </button>
          </div>
        )}
        <button type="button" className="calendar-detail-close" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
