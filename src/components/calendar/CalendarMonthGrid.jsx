import { card } from '../../styles/commonStyles';
import {
  ACTIVITY_TYPE_OPTIONS,
  CALENDAR_DAY_MAX_VISIBLE,
  DAY_NAMES,
  DAY_NAMES_SHORT,
  LEGEND_TYPES,
  MONTH_NAMES,
  activityCssClass,
  activityTypeLabel,
} from '../../utils/calendarUtils.js';
import CalendarActivityChip from './CalendarActivityChip.jsx';

export default function CalendarMonthGrid({
  year,
  month,
  grid,
  activitiesByDay,
  loading,
  canEditCalendar,
  detailActivityId,
  typeFilter,
  setTypeFilter,
  groupedCalendarActivities,
  filteredCalendarActivities,
  isToday,
  today,
  prevMonth,
  nextMonth,
  goToToday,
  openCreateForDay,
  toggleActivityDetail,
  onOpenDayList,
}) {
  return (
    <div style={card} className="calendar-card calendar-shell">
      <div className="calendar-nav">
        <div className="calendar-nav__controls">
          <button type="button" className="calendar-nav__btn" onClick={prevMonth} aria-label="Previous month">
            ‹
          </button>
          <div className="calendar-nav__title-wrap">
            <h2 className="calendar-month-title">{MONTH_NAMES[month - 1]} {year}</h2>
            {isToday(today.getDate()) && year === today.getFullYear() && month === today.getMonth() + 1 && (
              <span className="calendar-nav__today-pill">This month</span>
            )}
          </div>
          <button type="button" className="calendar-nav__btn" onClick={nextMonth} aria-label="Next month">
            ›
          </button>
        </div>
        <button type="button" className="btn btn-secondary btn-sm calendar-nav__today" onClick={goToToday}>
          Today
        </button>
      </div>

      <div className="calendar-type-bar" role="toolbar" aria-label="Filter by activity type">
        <button
          type="button"
          className={`calendar-type-chip ${typeFilter === 'all' ? 'calendar-type-chip--active' : ''}`}
          onClick={() => setTypeFilter('all')}
        >
          All
          <span className="calendar-type-chip__count">{groupedCalendarActivities.length}</span>
        </button>
        {ACTIVITY_TYPE_OPTIONS.map((t) => {
          const count = groupedCalendarActivities.filter((a) => a.type === t.value || activityCssClass(a.type) === t.value).length;
          if (count === 0 && typeFilter !== t.value) return null;
          return (
            <button
              key={t.value}
              type="button"
              className={`calendar-type-chip calendar-type-chip--${activityCssClass(t.value)} ${typeFilter === t.value ? 'calendar-type-chip--active' : ''}`}
              onClick={() => setTypeFilter(t.value)}
            >
              {t.label}
              <span className="calendar-type-chip__count">{count}</span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="calendar-loading" aria-busy="true" aria-label="Loading activities">
          <div className="calendar-skeleton-grid">
            {Array.from({ length: 35 }).map((_, i) => (
              <div key={i} className="calendar-skeleton-cell" />
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="calendar-scroll">
            <div className="calendar-grid">
              {DAY_NAMES.map((day, idx) => (
                <div key={day} className={`calendar-cell calendar-day-name ${idx === 0 || idx === 6 ? 'calendar-day-name--weekend' : ''}`}>
                  <span className="calendar-day-name-full">{day}</span>
                  <span className="calendar-day-name-short">{DAY_NAMES_SHORT[idx]}</span>
                </div>
              ))}
              {grid.flat().map((day, i) => {
                const col = i % 7;
                const isWeekend = col === 0 || col === 6;
                const dayCount = day != null ? (activitiesByDay[day]?.length || 0) : 0;
                return (
                  <div
                    key={i}
                    className={[
                      'calendar-cell',
                      'calendar-day',
                      day === null ? 'calendar-day-empty' : '',
                      day !== null && isToday(day) ? 'calendar-day-today' : '',
                      day !== null && isWeekend ? 'calendar-day--weekend' : '',
                      day !== null && dayCount > 0 ? 'calendar-day--has-events' : '',
                    ].filter(Boolean).join(' ')}
                    onClick={day !== null && canEditCalendar ? () => openCreateForDay(day) : undefined}
                    onKeyDown={day !== null && canEditCalendar ? (e) => { if (e.key === 'Enter') openCreateForDay(day); } : undefined}
                    role={day !== null && canEditCalendar ? 'button' : undefined}
                    tabIndex={day !== null && canEditCalendar ? 0 : undefined}
                    title={day !== null && canEditCalendar ? `Log activity on ${MONTH_NAMES[month - 1]} ${day}` : undefined}
                  >
                    {day !== null && (
                      <span className="calendar-day-num">
                        {day}
                        {dayCount > 0 && <span className="calendar-day-count">{dayCount}</span>}
                      </span>
                    )}
                    {day !== null && activitiesByDay[day]?.length > 0 && (() => {
                      const list = activitiesByDay[day];
                      const visible = list.slice(0, CALENDAR_DAY_MAX_VISIBLE);
                      const extra = list.length - CALENDAR_DAY_MAX_VISIBLE;
                      return (
                        <div className="calendar-day-activities" onClick={(e) => e.stopPropagation()}>
                          {visible.map((a) => (
                            <CalendarActivityChip
                              key={a.id}
                              activity={a}
                              detailOpen={detailActivityId === a.id}
                              onToggleDetail={toggleActivityDetail}
                            />
                          ))}
                          {extra > 0 && (
                            <button
                              type="button"
                              className="calendar-day-see-more"
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenDayList(day);
                              }}
                            >
                              +{extra} more
                            </button>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
            </div>
          </div>
          <details className="calendar-legend-details">
            <summary className="calendar-legend-details__summary">Activity types</summary>
            <div className="calendar-legend">
              {LEGEND_TYPES.map(({ css, label }) => (
                <span key={css} className="calendar-legend-item">
                  <span className={`calendar-legend-swatch calendar-activity-${css}`} aria-hidden />
                  {label}
                </span>
              ))}
            </div>
          </details>
          {typeFilter !== 'all' && filteredCalendarActivities.length === 0 && (
            <p className="calendar-filter-empty">
              No {activityTypeLabel(typeFilter)} activities this month.
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setTypeFilter('all')}>
                Show all
              </button>
            </p>
          )}
        </>
      )}
    </div>
  );
}
