import { Link } from 'react-router-dom';

/**
 * Standard KPI row — same look as Command Center stat cards.
 */
export default function KpiStrip({
  items,
  className = '',
  secondary = false,
  'aria-label': ariaLabel = 'Summary',
}) {
  if (!items?.length) return null;

  return (
    <section
      className={`dashboard-stats kpi-strip ${secondary ? 'dashboard-stats--secondary' : ''} ${className}`.trim()}
      aria-label={ariaLabel}
    >
      {items.map((item) => {
        const cardClass = [
          'dashboard-stat-card',
          item.issue ? 'has-issue' : '',
          item.onClick || item.href ? 'dashboard-stat-card--clickable' : '',
          item.className || '',
        ].filter(Boolean).join(' ');

        const body = (
          <>
            <span className="dashboard-stat-label">{item.label}</span>
            <span className={`dashboard-stat-value ${item.valueClass || ''}`.trim()}>{item.value}</span>
            {item.hint ? <span className="dashboard-stat-hint">{item.hint}</span> : null}
          </>
        );

        if (item.href) {
          return (
            <Link key={item.id} to={item.href} className={cardClass}>
              {body}
            </Link>
          );
        }
        if (item.onClick) {
          return (
            <button key={item.id} type="button" className={cardClass} onClick={item.onClick}>
              {body}
            </button>
          );
        }
        return (
          <div key={item.id} className={cardClass}>
            {body}
          </div>
        );
      })}
    </section>
  );
}
