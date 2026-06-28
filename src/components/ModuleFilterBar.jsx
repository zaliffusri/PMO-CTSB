/**
 * Standard compact filter toolbar used across list modules.
 */
export default function ModuleFilterBar({ children, summary, className = '' }) {
  return (
    <div className={`card section-card module-filter-card helpdesk-toolbar-card ${className}`.trim()}>
      <div className="module-toolbar helpdesk-toolbar helpdesk-toolbar--compact">
        {children}
      </div>
      {summary ? (
        <p className="helpdesk-filter-summary pmo-filter-summary" aria-live="polite">
          {summary}
        </p>
      ) : null}
    </div>
  );
}
