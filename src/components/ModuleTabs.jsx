export default function ModuleTabs({ tabs, active, onChange, ariaLabel = 'Section tabs', badgeTone = 'alert' }) {
  return (
    <nav className="module-tabs" aria-label={ariaLabel}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={`module-tab ${active === tab.id ? 'active' : ''}`}
          onClick={() => onChange(tab.id)}
          aria-current={active === tab.id ? 'page' : undefined}
        >
          <span className="module-tab__label">{tab.label}</span>
          {tab.badge != null && tab.badge !== '' && (
            <span className={`module-tab-badge${badgeTone === 'count' ? ' module-tab-badge--count' : ''}`}>
              {tab.badge}
            </span>
          )}
        </button>
      ))}
    </nav>
  );
}
