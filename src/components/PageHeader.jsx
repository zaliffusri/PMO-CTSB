export default function PageHeader({ title, subtitle, actions, eyebrow, compact = true, badge }) {
  const className = compact ? 'page-header page-header--compact' : 'page-header';
  return (
    <header className={className}>
      <div className="page-header__copy">
        {eyebrow && <p className="page-eyebrow">{eyebrow}</p>}
        <h1>
          {title}
          {badge && <span className="page-header-badge">{badge}</span>}
        </h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="page-header-actions">{actions}</div>}
    </header>
  );
}
