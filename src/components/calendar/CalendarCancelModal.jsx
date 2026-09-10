import { formatActivityDisplayTitle } from '../../utils/calendarUtils.js';

export default function CalendarCancelModal({
  activity,
  mutating,
  onConfirm,
  onClose,
}) {
  if (!activity) return null;
  const displayTitle = formatActivityDisplayTitle(activity);

  return (
    <div className="modal-backdrop" role="presentation" onClick={() => !mutating && onClose()}>
      <div
        className="modal-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancel-activity-modal-title"
      >
        <div className="modal-dialog-header">
          <h2 id="cancel-activity-modal-title" className="modal-dialog-title">
            Cancel activity
          </h2>
          <button
            type="button"
            className="modal-dialog-close"
            onClick={onClose}
            aria-label="Close dialog"
            disabled={mutating}
          >
            ×
          </button>
        </div>
        <div className="modal-dialog-body" style={{ display: 'grid', gap: '0.85rem' }}>
          <p style={{ margin: 0 }}>
            Cancel <strong>{displayTitle}</strong>? This removes it from the calendar
            {Array.isArray(activity.person_ids) && activity.person_ids.length > 1
              ? ` (including all ${activity.person_ids.length} assignee records)`
              : ''}
            .
          </p>
          <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-muted)' }}>
            Assignees get an in-app cancellation notice. No Outlook / Teams email is sent.
          </p>
        </div>
        <div className="modal-dialog-footer" style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={mutating}>
            Keep activity
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onConfirm}
            disabled={mutating}
          >
            {mutating ? 'Cancelling…' : 'Cancel activity'}
          </button>
        </div>
      </div>
    </div>
  );
}
