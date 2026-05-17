import { card } from '../styles/commonStyles';

/**
 * Checkbox list to pick multiple client companies for a project.
 */
export default function ClientMultiSelect({ clients, value = [], onChange, idPrefix = 'client' }) {
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
      <p style={{ margin: '0.25rem 0 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
        No companies yet. Add clients on the Clients page first.
      </p>
    );
  }

  return (
    <div
      style={{
        ...card,
        padding: '0.65rem',
        maxHeight: '200px',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.35rem',
        marginTop: '0.25rem',
      }}
    >
      {clients.map((c) => (
        <label
          key={c.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            cursor: 'pointer',
            fontSize: '0.9rem',
          }}
        >
          <input
            type="checkbox"
            id={`${idPrefix}-${c.id}`}
            checked={selected.has(c.id)}
            onChange={() => toggle(c.id)}
          />
          <span>{c.name}</span>
        </label>
      ))}
    </div>
  );
}
