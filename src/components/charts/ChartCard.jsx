export default function ChartCard({ title, subtitle, children, className = '' }) {
  return (
    <article className={`chart-card ui-card ${className}`.trim()}>
      <header className="chart-card__header">
        <h3 className="chart-card__title">{title}</h3>
        {subtitle && <p className="chart-card__subtitle">{subtitle}</p>}
      </header>
      <div className="chart-card__body">{children}</div>
    </article>
  );
}
