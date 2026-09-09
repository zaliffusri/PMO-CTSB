import { Link } from 'react-router-dom';

/**
 * Checkbox list to pick multiple client companies for a project.
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
}) {
  const selected = new Set((value || []).map((id) => Number(id)).filter((id) => Number.isFinite(id)));

  const toggle = (clientId) => {
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
              onChange={() => toggle(cid)}
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
