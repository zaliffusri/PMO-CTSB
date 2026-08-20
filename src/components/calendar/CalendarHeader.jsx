import PageHeader from '../PageHeader';
import { MONTH_NAMES, activityTypeLabel } from '../../utils/calendarUtils.js';

export default function CalendarHeader({
  canEditCalendar,
  importing,
  mutating,
  onCreate,
  onImportFile,
  onOpenReport,
  onOpenScheduleEmail,
  monthStats,
  month,
  year,
}) {
  return (
    <>
      <PageHeader
        title="Calendar & activities"
        subtitle="Plan meetings, site visits, UAT, and team schedules. Filter by type, click a day to log work, or open an event for details."
      />

      <div className="card section-card calendar-toolbar-card">
        <div className="calendar-toolbar">
          <div className="calendar-toolbar__group calendar-toolbar__group--primary">
            {canEditCalendar && (
              <>
                <button type="button" className="btn btn-primary" onClick={onCreate}>
                  + Log activity
                </button>
                <label
                  className={`btn btn-secondary calendar-import-label ${importing || mutating ? 'is-disabled' : ''}`}
                >
                  {importing ? 'Importing…' : 'Import Excel'}
                  <input
                    type="file"
                    accept=".xls,.xlsx,.csv"
                    style={{ display: 'none' }}
                    disabled={importing || mutating}
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      e.target.value = '';
                      await onImportFile(f);
                    }}
                  />
                </label>
              </>
            )}
          </div>
          <div className="calendar-toolbar__group calendar-toolbar__group--secondary">
            <button type="button" className="btn btn-secondary" onClick={onOpenReport}>
              Generate report
            </button>
            {canEditCalendar && (
              <button type="button" className="btn btn-secondary" onClick={onOpenScheduleEmail}>
                Email team schedule
              </button>
            )}
          </div>
        </div>
      </div>

      <section className="calendar-kpi-row" aria-label="Month summary">
        <div className="calendar-kpi">
          <span className="calendar-kpi__value">{monthStats.total}</span>
          <span className="calendar-kpi__label">Activities</span>
        </div>
        <div className="calendar-kpi calendar-kpi--accent">
          <span className="calendar-kpi__value">{monthStats.daysWithEvents}</span>
          <span className="calendar-kpi__label">Active days</span>
        </div>
        <div className="calendar-kpi">
          <span className="calendar-kpi__value">
            {monthStats.topType ? activityTypeLabel(monthStats.topType.type) : '—'}
          </span>
          <span className="calendar-kpi__label">
            {monthStats.topType ? `Top type (${monthStats.topType.count})` : 'Top type'}
          </span>
        </div>
        <div className="calendar-kpi calendar-kpi--muted">
          <span className="calendar-kpi__value">{MONTH_NAMES[month - 1]}</span>
          <span className="calendar-kpi__label">{year}</span>
        </div>
      </section>
    </>
  );
}
