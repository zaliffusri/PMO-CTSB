import { MONTH_NAMES } from '../../utils/calendarUtils.js';
import CalendarActivityChip from './CalendarActivityChip.jsx';

export default function CalendarDayActivitiesSheet({
  year,
  month,
  day,
  activities: items,
  onClose,
  detailActivityId,
  onToggleDetail,
}) {
  const title = `${MONTH_NAMES[month - 1]} ${day}, ${year}`;
  return (
    <div className="calendar-detail-backdrop" onClick={onClose} role="presentation">
      <div
        className="calendar-detail-sheet calendar-day-list-sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="calendar-day-list-heading"
      >
        <div className="calendar-detail-sheet-handle" aria-hidden />
        <h3 id="calendar-day-list-heading" className="calendar-detail-sheet-title">{title}</h3>
        <p className="calendar-detail-sheet-line calendar-detail-sheet-muted" style={{ marginBottom: '0.75rem' }}>
          {items.length} {items.length === 1 ? 'activity' : 'activities'}
        </p>
        <div className="calendar-day-list-inner">
          {items.map((a) => (
            <CalendarActivityChip
              key={a.id}
              activity={a}
              detailOpen={detailActivityId === a.id}
              onToggleDetail={onToggleDetail}
            />
          ))}
        </div>
        <button type="button" className="calendar-detail-close" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
