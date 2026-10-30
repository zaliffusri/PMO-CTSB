import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useLocale } from '../context/LocaleContext';
import {
  activityCssClass,
  activityTypeLabel,
  formatActivityDisplayTitle,
  formatActivityShortTime,
  groupActivitiesForCalendar,
  isActivityOnDate,
  withoutCancelledActivityKeys,
} from '../utils/calendarUtils';

const SITE_TYPES = new Set(['outstation', 'task', 'uat', 'fat', 'go-live', 'training', 'demo']);
const PHOTO_CAP = 8;
const LIST_CAP = 8;

function startOfWeekMonday(d = new Date()) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const back = x.getDay() === 0 ? 6 : x.getDay() - 1;
  x.setDate(x.getDate() - back);
  return x;
}

function endOfWeekExclusive(weekStart) {
  const x = new Date(weekStart);
  x.setDate(x.getDate() + 7);
  return x;
}

function isSiteWork(a) {
  return SITE_TYPES.has(String(a.type || '')) || Number(a.photo_count) > 0;
}

function rankActivities(list) {
  return [...list].sort((a, b) => {
    const pa = Number(a.photo_count) > 0 ? 1 : 0;
    const pb = Number(b.photo_count) > 0 ? 1 : 0;
    if (pb !== pa) return pb - pa;
    const sa = SITE_TYPES.has(String(a.type || '')) ? 1 : 0;
    const sb = SITE_TYPES.has(String(b.type || '')) ? 1 : 0;
    if (sb !== sa) return sb - sa;
    return new Date(a.start_at) - new Date(b.start_at);
  });
}

function SitePhotoThumb({ photoId, alt }) {
  const [src, setSrc] = useState(null);

  useEffect(() => {
    if (!photoId) return undefined;
    let cancelled = false;
    let objectUrl = null;
    api.attachments.fetchFileBlob(photoId)
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) setSrc(objectUrl);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [photoId]);

  if (!src) {
    return (
      <span className="dash-week-photo__placeholder" aria-hidden>
        <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.7">
          <path d="M4 7h3l2-2h6l2 2h3v12H4z" />
          <circle cx="12" cy="13" r="3.2" />
        </svg>
      </span>
    );
  }
  return <img className="dash-week-photo__img" src={src} alt={alt || ''} />;
}

export default function DashboardWeekFeed() {
  const { t, locale } = useLocale();
  const loc = locale === 'ms' ? 'ms-MY' : 'en-MY';
  const [tab, setTab] = useState('today');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const weekStart = useMemo(() => startOfWeekMonday(), []);
  const weekEnd = useMemo(() => endOfWeekExclusive(weekStart), [weekStart]);

  useEffect(() => {
    let cancelled = false;
    api.activities.list({ from: weekStart.toISOString(), to: weekEnd.toISOString() })
      .then((list) => {
        if (!cancelled) setRows(Array.isArray(list) ? list : []);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [weekStart, weekEnd]);

  const grouped = useMemo(
    () => groupActivitiesForCalendar(withoutCancelledActivityKeys(rows)),
    [rows],
  );

  const now = new Date();
  const todayY = now.getFullYear();
  const todayM = now.getMonth() + 1;
  const todayD = now.getDate();

  const todayItems = useMemo(
    () => grouped.filter((a) => isActivityOnDate(a, todayY, todayM, todayD)),
    [grouped, todayY, todayM, todayD],
  );

  const scoped = tab === 'today' ? todayItems : grouped;
  const photos = rankActivities(scoped.filter((a) => Number(a.photo_count) > 0)).slice(0, PHOTO_CAP);
  const schedule = rankActivities(
    tab === 'today' ? scoped : scoped.filter(isSiteWork),
  ).slice(0, LIST_CAP);
  const photoEventCount = scoped.filter((a) => Number(a.photo_count) > 0).length;

  function dayLabel(iso) {
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return '';
    if (d.getFullYear() === todayY && d.getMonth() + 1 === todayM && d.getDate() === todayD) {
      return t('dash.weekToday');
    }
    return d.toLocaleDateString(loc, { weekday: 'short', day: 'numeric', month: 'short' });
  }

  const empty = !loading && scoped.length === 0;

  return (
    <section className="dashboard-section dash-week" aria-label={t('dash.weekOnSite')}>
      <div className="dashboard-section-header">
        <div className="dash-week__heading">
          <h2 className="dashboard-section-title">{t('dash.weekOnSite')}</h2>
          <p className="dash-week__hint">{t('dash.weekHint')}</p>
        </div>
        <div className="dash-week__actions">
          <div className="dashboard-tabs" role="tablist" aria-label={t('dash.weekOnSite')}>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'today'}
              className={tab === 'today' ? 'active' : ''}
              onClick={() => setTab('today')}
            >
              {t('dash.weekToday')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'week'}
              className={tab === 'week' ? 'active' : ''}
              onClick={() => setTab('week')}
            >
              {t('dash.weekThisWeek')}
            </button>
          </div>
          <Link to="/calendar" className="btn btn-ghost btn-sm">{t('dash.openCalendar')}</Link>
        </div>
      </div>

      <div className="dashboard-section-body dash-week__body">
        {loading ? (
          <p className="dashboard-empty">{t('common.loading')}</p>
        ) : empty ? (
          <p className="dashboard-empty">
            {tab === 'today' ? t('dash.weekEmptyToday') : t('dash.weekEmptyWeek')}
            {' '}
            <Link to="/calendar">{t('dash.openCalendar')}</Link>
          </p>
        ) : (
          <>
            {photos.length > 0 && (
              <div className="dash-week-photos" aria-label={t('dash.weekPhotos')}>
                {photos.map((a) => {
                  const title = formatActivityDisplayTitle(a);
                  const typeClass = activityCssClass(a.type);
                  return (
                    <Link
                      key={a.id}
                      to={`/calendar?activity=${a.id}`}
                      className="dash-week-photo"
                    >
                      <SitePhotoThumb photoId={a.preview_photo_id} alt={title} />
                      <span className="dash-week-photo__overlay">
                        <span className={`calendar-activity-chip__type calendar-activity-chip__type--${typeClass}`}>
                          {activityTypeLabel(a.type)}
                        </span>
                        <span className="dash-week-photo__title">{title}</span>
                        <span className="dash-week-photo__meta">
                          {dayLabel(a.start_at)}
                          {a.location ? ` · ${a.location}` : ''}
                        </span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}

            <ul className="dash-week-list">
              {schedule.map((a) => {
                const title = formatActivityDisplayTitle(a);
                const typeClass = activityCssClass(a.type);
                return (
                  <li key={a.id}>
                    <Link to={`/calendar?activity=${a.id}`} className="dash-week-row">
                      <span className="dash-week-row__when">
                        <span className="dash-week-row__day">{dayLabel(a.start_at)}</span>
                        <span className="dash-week-row__time">{formatActivityShortTime(a)}</span>
                      </span>
                      <span className={`calendar-activity-chip__type calendar-activity-chip__type--${typeClass}`}>
                        {activityTypeLabel(a.type)}
                      </span>
                      <span className="dash-week-row__main">
                        <strong>{title}</strong>
                        <span className="dash-week-row__meta">
                          {[a.location, a.project_name, a.person_name].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                      {Number(a.photo_count) > 0 && (
                        <span className="dash-week-row__photos">
                          {Number(a.photo_count) === 1
                            ? t('dash.weekPhotoOne')
                            : t('dash.weekPhotoCount', { n: a.photo_count })}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>

            <p className="dash-week__footer">
              {t('dash.weekActivityCount', { n: scoped.length })}
              {photoEventCount > 0 ? ` · ${t('dash.weekPhotoEvents', { n: photoEventCount })}` : ''}
            </p>
          </>
        )}
      </div>
    </section>
  );
}
