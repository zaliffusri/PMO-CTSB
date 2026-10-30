import {
  activityCssClass,
  activityDescriptionForCalendarDisplay,
  activityTypeLabel,
  formatActivityDisplayTitle,
  formatActivityShortTime,
  formatActivityTimeRange,
} from '../../utils/calendarUtils.js';

export default function CalendarActivityChip({ activity: a, detailOpen, onToggleDetail }) {
  const rangeLabel = formatActivityTimeRange(a);
  const displayTitle = formatActivityDisplayTitle(a);
  const descForCalendar = activityDescriptionForCalendarDisplay(a.description);
  const shortTime = formatActivityShortTime(a);
  const typeClass = activityCssClass(a.type);
  const label = `${activityTypeLabel(a.type)}: ${displayTitle}. ${a.location ? `${a.location}. ` : ''}${a.person_name ?? ''}. ${rangeLabel}`;

  const handleClick = (e) => {
    e.stopPropagation();
    onToggleDetail(a.id);
  };

  return (
    <div className="calendar-activity-wrap">
      <button
        type="button"
        className={`calendar-activity calendar-activity-${typeClass} calendar-activity-trigger`}
        onClick={handleClick}
        aria-label={label}
        aria-expanded={detailOpen}
        aria-haspopup="dialog"
      >
        <span className="calendar-activity-chip__head">
          {shortTime && <span className="calendar-activity-chip__time">{shortTime}</span>}
          <span className={`calendar-activity-chip__type calendar-activity-chip__type--${typeClass}`}>
            {activityTypeLabel(a.type)}
          </span>
          {Number(a.photo_count) > 0 && (
            <span className="calendar-activity-chip__photo" title={`${a.photo_count} photo${Number(a.photo_count) === 1 ? '' : 's'}`} aria-label={`${a.photo_count} photos`}>
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M4 7h3l2-2h6l2 2h3v12H4z" />
                <circle cx="12" cy="13" r="3.2" />
              </svg>
            </span>
          )}
        </span>
        <span className="calendar-activity-chip__title">{displayTitle}</span>
        {(a.project_name || a.person_name) && (
          <span className="calendar-activity-chip__meta">
            {[a.project_name, a.person_name].filter(Boolean).join(' · ')}
          </span>
        )}
      </button>
      <div className="calendar-activity-popover" role="tooltip">
        <div className="calendar-activity-popover-title">{displayTitle}</div>
        <div className="calendar-activity-popover-meta">
          <span className={`calendar-activity-chip__type calendar-activity-chip__type--${typeClass}`}>
            {activityTypeLabel(a.type)}
          </span>
          {' · '}{a.person_name}
        </div>
        {a.project_name && <div className="calendar-activity-popover-meta">{a.project_name}</div>}
        {a.location && <div className="calendar-activity-popover-meta">{a.location}</div>}
        {Number(a.photo_count) > 0 && (
          <div className="calendar-activity-popover-meta">
            {a.photo_count} site photo{Number(a.photo_count) === 1 ? '' : 's'}
          </div>
        )}
        <div className="calendar-activity-popover-meta">{rangeLabel}</div>
        {descForCalendar && <div className="calendar-activity-popover-desc">{descForCalendar}</div>}
      </div>
    </div>
  );
}
