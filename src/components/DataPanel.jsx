/**
 * Standard content panel with optional titled header.
 */
export default function DataPanel({ title, desc, children, className = '', headerAction = null }) {
  return (
    <div className={`card section-card data-panel ${className}`.trim()}>
      {(title || desc || headerAction) && (
        <div className="section-card__header section-card__header--compact data-panel__header">
          <div>
            {title ? <h2 className="section-card__title">{title}</h2> : null}
            {desc ? <p className="section-card__desc">{desc}</p> : null}
          </div>
          {headerAction}
        </div>
      )}
      {children}
    </div>
  );
}
