import PageHeader from '../PageHeader';
import { MONTH_NAMES, activityTypeLabel } from '../../utils/calendarUtils.js';
import { useLocale } from '../../context/LocaleContext';

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
  const { t } = useLocale();
  return (
    <>
      <PageHeader
        title={t('page.calendar')}
      />

      <div className="card section-card calendar-toolbar-card">
        <div className="calendar-toolbar">
          <div className="calendar-toolbar__group calendar-toolbar__group--primary">
            {canEditCalendar && (
              <>
                <button type="button" className="btn btn-primary" onClick={onCreate}>
                  {t('action.logActivity')}
                </button>
                <label
                  className={`btn btn-secondary calendar-import-label ${importing || mutating ? 'is-disabled' : ''}`}
                >
                  {importing ? t('action.importing') : t('action.importExcel')}
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
              {t('cal.generateReport')}
            </button>
            {canEditCalendar && (
              <button type="button" className="btn btn-secondary" onClick={onOpenScheduleEmail}>
                {t('cal.emailTeam')}
              </button>
            )}
          </div>
        </div>
      </div>

      <section className="calendar-kpi-row" aria-label={t('cal.monthSummary')}>
        <div className="calendar-kpi">
          <span className="calendar-kpi__value">{monthStats.total}</span>
          <span className="calendar-kpi__label">{t('cal.activities')}</span>
        </div>
        <div className="calendar-kpi calendar-kpi--accent">
          <span className="calendar-kpi__value">{monthStats.daysWithEvents}</span>
          <span className="calendar-kpi__label">{t('cal.activeDays')}</span>
        </div>
        <div className="calendar-kpi">
          <span className="calendar-kpi__value">
            {monthStats.topType ? activityTypeLabel(monthStats.topType.type) : '—'}
          </span>
          <span className="calendar-kpi__label">
            {monthStats.topType ? t('cal.topTypeCount', { n: monthStats.topType.count }) : t('cal.topType')}
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
