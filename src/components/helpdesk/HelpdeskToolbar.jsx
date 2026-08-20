import {
  ISSUE_STATUSES,
  HELPDESK_LEVEL_FILTERS,
  ISSUE_INCIDENT_TYPES,
  EPBT_MODULES,
} from '../../../lib/issueConstants.js';

export default function HelpdeskToolbar({
  searchQuery,
  onSearchQueryChange,
  filter,
  onFilterChange,
  levelFilter,
  onLevelFilterChange,
  moduleFilter,
  onModuleFilterChange,
  incidentFilter,
  onIncidentFilterChange,
  mineOnly,
  onMineOnlyChange,
  hasExtraFilters,
  onResetFilters,
  visibleCount,
  totalCount,
}) {
  return (
    <div className="card section-card helpdesk-toolbar-card">
      <div className="module-toolbar helpdesk-toolbar helpdesk-toolbar--compact">
        <label className="module-toolbar__field module-toolbar__field--grow">
          <span className="module-toolbar__label">Search</span>
          <input
            type="search"
            className="form-field__input helpdesk-filter-input"
            placeholder="Ticket, title, client ref, PBLID…"
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
          />
        </label>
        <label className="module-toolbar__field">
          <span className="module-toolbar__label">Status</span>
          <select className="form-field__input helpdesk-filter-input" value={filter} onChange={(e) => onFilterChange(e.target.value)}>
            <option value="open">Open (active)</option>
            <option value="all">All statuses</option>
            {ISSUE_STATUSES.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </label>
        <label className="module-toolbar__field">
          <span className="module-toolbar__label">Level</span>
          <select className="form-field__input helpdesk-filter-input" value={levelFilter} onChange={(e) => onLevelFilterChange(e.target.value)}>
            <option value="all">All levels</option>
            {HELPDESK_LEVEL_FILTERS.map((l) => (
              <option key={l.id} value={l.id}>{l.label}</option>
            ))}
          </select>
        </label>
        <label className="module-toolbar__field">
          <span className="module-toolbar__label">Module</span>
          <select className="form-field__input helpdesk-filter-input" value={moduleFilter} onChange={(e) => onModuleFilterChange(e.target.value)}>
            <option value="all">All modules</option>
            {EPBT_MODULES.map((m) => (
              <option key={m.code} value={m.code}>{m.code} — {m.label}</option>
            ))}
          </select>
        </label>
        <label className="module-toolbar__field">
          <span className="module-toolbar__label">Type</span>
          <select className="form-field__input helpdesk-filter-input" value={incidentFilter} onChange={(e) => onIncidentFilterChange(e.target.value)}>
            <option value="all">All types</option>
            {ISSUE_INCIDENT_TYPES.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
        </label>
        <label className="module-toolbar__field">
          <span className="module-toolbar__label">View</span>
          <select
            className="form-field__input helpdesk-filter-input"
            value={mineOnly ? 'mine' : 'all'}
            onChange={(e) => onMineOnlyChange(e.target.value === 'mine')}
          >
            <option value="all">All tickets</option>
            <option value="mine">My tickets</option>
          </select>
        </label>
        {hasExtraFilters && (
          <button type="button" className="btn btn-ghost btn-sm helpdesk-filter-reset" onClick={onResetFilters}>
            Reset filters
          </button>
        )}
      </div>
      <p className="helpdesk-filter-summary" aria-live="polite">
        Showing {visibleCount} of {totalCount} tickets
      </p>
    </div>
  );
}
