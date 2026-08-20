import {
  activityCssClass,
  activityDescriptionForCalendarDisplay,
  activityTypeLabel,
  formatActivityShortTime,
  formatActivityTimeRange,
} from '../../utils/calendarUtils.js';

export default function CalendarActivityChip({ activity: a, detailOpen, onToggleDetail }) {
  const rangeLabel = formatActivityTimeRange(a);
  const descForCalendar = activityDescriptionForCalendarDisplay(a.description);
  const shortTime = formatActivityShortTime(a);
  const typeClass = activityCssClass(a.type);
  const label = `${activityTypeLabel(a.type)}: ${a.title}. ${a.location ? `${a.location}. ` : ''}${a.person_name ?? ''}. ${rangeLabel}`;

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
        </span>
        <span className="calendar-activity-chip__title">{a.title}</span>
        {(a.project_name || a.person_name) && (
          <span className="calendar-activity-chip__meta">
            {[a.project_name, a.person_name].filter(Boolean).join(' · ')}
          </span>
        )}
      </button>
      <div className="calendar-activity-popover" role="tooltip">
        <div className="calendar-activity-popover-title">{a.title}</div>
        <div className="calendar-activity-popover-meta">
          <span className={`calendar-activity-chip__type calendar-activity-chip__type--${typeClass}`}>
            {activityTypeLabel(a.type)}
          </span>
          {' · '}{a.person_name}
        </div>
        {a.project_name && <div className="calendar-activity-popover-meta">{a.project_name}</div>}
        {a.location && <div className="calendar-activity-popover-meta">{a.location}</div>}
        <div className="calendar-activity-popover-meta">{rangeLabel}</div>
        {descForCalendar && <div className="calendar-activity-popover-desc">{descForCalendar}</div>}
      </div>
    </div>
  );
}
