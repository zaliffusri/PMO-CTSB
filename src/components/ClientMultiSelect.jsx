import { Link } from 'react-router-dom';

/**
 * Checkbox list to pick multiple client companies for a project.
 */
export default function ClientMultiSelect({ clients, value = [], onChange, idPrefix = 'client', variant = 'default' }) {
  const selected = new Set((value || []).map((id) => +id));

  const toggle = (clientId) => {
    const id = +clientId;
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange([...next]);
  };

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
      {clients.map((c) => (
        <label key={c.id} className="client-picker-item" htmlFor={`${idPrefix}-${c.id}`}>
          <input
            type="checkbox"
            id={`${idPrefix}-${c.id}`}
            checked={selected.has(c.id)}
            onChange={() => toggle(c.id)}
            className="client-picker-item__check"
          />
          <span className="client-picker-item__name">{c.name}</span>
          {variant === 'picker' && selected.has(c.id) && (
            <span className="client-picker-item__badge">Selected</span>
          )}
        </label>
      ))}
    </div>
  );
}
