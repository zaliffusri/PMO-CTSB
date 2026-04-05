import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { inputStyle } from '../styles/commonStyles';

const card = {
  background: 'var(--surface)',
  borderRadius: 'var(--radius)',
  padding: '1.25rem',
  border: '1px solid var(--border)',
};
const btnSecondary = {
  padding: '0.45rem 0.85rem',
  background: 'var(--surface-hover)',
  color: 'var(--text)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  fontWeight: 600,
  fontSize: '0.9rem',
};

const ACTION_LABEL = { create: 'Create', update: 'Update', delete: 'Delete' };

function formatDetail(detail) {
  if (detail == null) return '';
  try {
    return JSON.stringify(detail);
  } catch {
    return String(detail);
  }
}

export default function History() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [offset, setOffset] = useState(0);
  const [userFilter, setUserFilter] = useState('');
  const [users, setUsers] = useState([]);
  const limit = 100;

  useEffect(() => {
    api.users
      .list()
      .then((list) => setUsers(Array.isArray(list) ? list : []))
      .catch(() => setUsers([]));
  }, []);

  const load = useCallback(async () => {
    setErr('');
    setLoading(true);
    try {
      const params = { limit, offset };
      if (userFilter) params.user_id = userFilter;
      const res = await api.auditLog.list(params);
      setData(res);
    } catch (e) {
      setErr(e.message || 'Failed to load history');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [offset, userFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const entries = data?.entries ?? [];
  const total = data?.total ?? 0;
  const hasPrev = offset > 0;
  const hasNext = offset + entries.length < total;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>History log</h1>
          <p style={{ color: 'var(--text-muted)', margin: '0.25rem 0 0', maxWidth: 640 }}>
            Record of important changes (who did what and when). New entries appear as users work in the app. Up to the
            last 5,000 events are kept.
          </p>
        </div>
      </div>

      {err && (
        <p style={{ color: 'var(--danger)', marginBottom: '1rem' }}>
          {err}
          <button type="button" style={{ ...btnSecondary, marginLeft: '0.75rem' }} onClick={() => load()}>
            Retry
          </button>
        </p>
      )}

      {loading && !data ? (
        <div style={{ padding: '2rem', color: 'var(--text-muted)' }}>Loading…</div>
      ) : (
        <div style={card}>
          <div
            className="filter-bar"
            style={{
              marginBottom: '1rem',
              paddingBottom: '1rem',
              borderBottom: '1px solid var(--border)',
              alignItems: 'flex-end',
            }}
          >
            <label style={{ flex: '1 1 220px', minWidth: 0, maxWidth: '360px' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>
                Filter by user
              </span>
              <select
                value={userFilter}
                onChange={(e) => {
                  setUserFilter(e.target.value);
                  setOffset(0);
                }}
                aria-label="Filter history by user"
                style={{ ...inputStyle, marginTop: 0 }}
              >
                <option value="">All users</option>
                {users
                  .slice()
                  .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
                  .map((u) => (
                    <option key={u.id} value={String(u.id)}>
                      {u.name || u.email}
                      {u.email && u.name ? ` (${u.email})` : ''}
                    </option>
                  ))}
              </select>
            </label>
            {userFilter && (
              <button
                type="button"
                style={btnSecondary}
                onClick={() => {
                  setUserFilter('');
                  setOffset(0);
                }}
              >
                Clear user filter
              </button>
            )}
          </div>

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.75rem',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '1rem',
            }}
          >
            <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              {total === 0
                ? userFilter
                  ? 'No entries for this user.'
                  : 'No entries yet.'
                : `Showing ${offset + 1}–${offset + entries.length} of ${total}${userFilter ? ' (filtered)' : ''}`}
            </span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                style={btnSecondary}
                disabled={!hasPrev || loading}
                onClick={() => setOffset((o) => Math.max(0, o - limit))}
              >
                Previous
              </button>
              <button
                type="button"
                style={btnSecondary}
                disabled={!hasNext || loading}
                onClick={() => setOffset((o) => o + limit)}
              >
                Next
              </button>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '0.5rem 0.75rem 0.5rem 0', whiteSpace: 'nowrap' }}>When</th>
                  <th style={{ padding: '0.5rem 0.75rem', whiteSpace: 'nowrap' }}>User</th>
                  <th style={{ padding: '0.5rem 0.75rem', whiteSpace: 'nowrap' }}>Action</th>
                  <th style={{ padding: '0.5rem 0.75rem', whiteSpace: 'nowrap' }}>Type</th>
                  <th style={{ padding: '0.5rem 0 0.5rem 0.75rem' }}>Summary</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((row) => (
                  <tr key={row.id} style={{ borderBottom: '1px solid var(--border)', verticalAlign: 'top' }}>
                    <td style={{ padding: '0.65rem 0.75rem 0.65rem 0', whiteSpace: 'nowrap' }}>
                      {row.at ? new Date(row.at).toLocaleString() : '—'}
                    </td>
                    <td style={{ padding: '0.65rem 0.75rem' }}>
                      <div>{row.user_name || row.user_email || '—'}</div>
                      {row.user_email && row.user_name && (
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{row.user_email}</div>
                      )}
                    </td>
                    <td style={{ padding: '0.65rem 0.75rem' }}>{ACTION_LABEL[row.action] || row.action}</td>
                    <td style={{ padding: '0.65rem 0.75rem', fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}>
                      {row.target_type}
                      {row.target_id != null ? ` #${row.target_id}` : ''}
                    </td>
                    <td style={{ padding: '0.65rem 0 0.65rem 0.75rem' }}>
                      <div>{row.summary}</div>
                      {row.detail != null && (
                        <div
                          style={{
                            marginTop: '0.25rem',
                            fontSize: '0.8rem',
                            color: 'var(--text-muted)',
                            wordBreak: 'break-word',
                          }}
                        >
                          {formatDetail(row.detail)}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
