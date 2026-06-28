/**
 * Standard scrollable data table shell — sticky header, footer count, card frame.
 */
export default function DataListShell({
  children,
  count,
  total,
  className = '',
  stickyHeader = true,
  compact = false,
  comfortable = true,
  fluid = true,
  maxHeight,
  footer = true,
  scrollHint = false,
  'aria-label': ariaLabel,
}) {
  const wrapClass = [
    'table-wrap',
    'pmo-data-list-wrap',
    stickyHeader ? 'pmo-data-list-wrap--sticky' : '',
    compact ? 'pmo-data-list-wrap--compact' : '',
    comfortable && !compact ? 'pmo-data-list-wrap--comfortable' : '',
  ].filter(Boolean).join(' ');

  const wrapStyle = maxHeight ? { maxHeight } : undefined;

  let footerText = null;
  if (footer && count != null) {
    if (total != null && total !== count) {
      footerText = `Showing ${count} of ${total}`;
    } else {
      footerText = `${count} row${count === 1 ? '' : 's'}`;
    }
  }

  const cardClass = [
    'pmo-data-list-card',
    'ui-card',
    'section-card',
    fluid ? 'pmo-data-list-card--fluid' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <div className={cardClass} aria-label={ariaLabel}>
      <div className={wrapClass} style={wrapStyle}>
        {children}
      </div>
      {footerText && (
        <p
          className={['pmo-data-list-footer', scrollHint ? 'pmo-data-list-footer--scroll-hint' : ''].filter(Boolean).join(' ')}
          aria-live="polite"
        >
          {footerText}
        </p>
      )}
    </div>
  );
}
