import { Link } from 'react-router-dom';

/**
 * Pick client company(ies) for a project.
 * Default is single-select (one client per project). Pass multiple={true} only if needed.
 */
export default function ClientMultiSelect({
  clients,
  value = [],
  onChange,
  idPrefix = 'client',
  variant = 'default',
  loading = false,
  error = '',
  onRetry,
  multiple = false,
}) {
  const selectedIds = (value || [])
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id));
  const selectedId = multiple ? null : (selectedIds[0] ?? null);
  const selected = new Set(selectedIds);

  const selectOne = (clientId) => {
    const id = Number(clientId);
    if (!Number.isFinite(id)) {
      onChange([]);
      return;
    }
    onChange(selectedId === id ? [] : [id]);
  };

  const toggleMany = (clientId) => {
    const id = Number(clientId);
    if (!Number.isFinite(id)) return;
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange([...next]);
  };

  if (loading) {
    return (
      <div className="client-picker-empty">
        <p>Loading companies…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="client-picker-empty">
        <p>{error}</p>
        {onRetry && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry}>
            Retry
          </button>
        )}
      </div>
    );
  }

  if (!clients?.length) {
    return (
      <div className="client-picker-empty">
        <p>No companies yet.</p>
        <Link to="/clients" className="client-picker-empty__link">Add clients first →</Link>
      </div>
    );
  }

  const listClass = variant === 'picker'
    ? 'client-picker-list'
    : 'client-picker-list client-picker-list--compact';

  if (!multiple) {
    return (
      <div className={listClass} role="radiogroup" aria-label="Client company">
        <label className="client-picker-item" htmlFor={`${idPrefix}-none`}>
          <input
            type="radio"
            id={`${idPrefix}-none`}
            name={`${idPrefix}-single`}
            checked={selectedId == null}
            onChange={() => onChange([])}
            className="client-picker-item__check"
          />
          <span className="client-picker-item__name">No client</span>
        </label>
        {clients.map((c) => {
          const cid = Number(c.id);
          return (
            <label key={c.id} className="client-picker-item" htmlFor={`${idPrefix}-${c.id}`}>
              <input
                type="radio"
                id={`${idPrefix}-${c.id}`}
                name={`${idPrefix}-single`}
                checked={selectedId === cid}
                onChange={() => selectOne(cid)}
                className="client-picker-item__check"
              />
              <span className="client-picker-item__name">{c.name}</span>
              {variant === 'picker' && selectedId === cid && (
                <span className="client-picker-item__badge">Selected</span>
              )}
            </label>
          );
        })}
      </div>
    );
  }

  return (
    <div className={listClass}>
      {clients.map((c) => {
        const cid = Number(c.id);
        return (
          <label key={c.id} className="client-picker-item" htmlFor={`${idPrefix}-${c.id}`}>
            <input
              type="checkbox"
              id={`${idPrefix}-${c.id}`}
              checked={selected.has(cid)}
              onChange={() => toggleMany(cid)}
              className="client-picker-item__check"
            />
            <span className="client-picker-item__name">{c.name}</span>
            {variant === 'picker' && selected.has(cid) && (
              <span className="client-picker-item__badge">Selected</span>
            )}
          </label>
        );
      })}
    </div>
  );
}
