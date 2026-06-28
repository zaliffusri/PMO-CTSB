export default function ModuleTabs({ tabs, active, onChange, ariaLabel = 'Section tabs' }) {
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
          <span>{tab.label}</span>
          {tab.badge != null && tab.badge !== '' && (
            <span className="module-tab-badge">{tab.badge}</span>
          )}
        </button>
      ))}
    </nav>
  );
}
