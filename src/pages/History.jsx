import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import PageHeader from '../components/PageHeader';
import UiEmptyState from '../components/UiEmptyState';
import ModuleFilterBar from '../components/ModuleFilterBar';
import PageLoadingState from '../components/PageLoadingState';
import PageLoadError from '../components/PageLoadError';
import DataPanel from '../components/DataPanel';
import { useAsyncData } from '../hooks/useAsyncData';

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

  const loadAudit = useCallback(async () => {
    const params = { limit, offset };
    if (userFilter) params.user_id = userFilter;
    return api.auditLog.list(params);
  }, [offset, userFilter]);

  const { data, loading, error, reload } = useAsyncData(loadAudit, [offset, userFilter]);

  const entries = data?.entries ?? [];
  const total = data?.total ?? 0;
  const hasPrev = offset > 0;
  const hasNext = offset + entries.length < total;

  if (loading && !data) {
    return <PageLoadingState message="Loading audit history…" />;
  }

  if (error && !data) {
    return (
      <PageLoadError
        title="Could not load audit history"
        message={error}
        onRetry={reload}
      />
    );
  }

  const userLabel = userFilter
    ? users.find((u) => String(u.id) === userFilter)?.name || 'Selected user'
    : null;

  return (
    <div className="page-module history-page">
      <PageHeader
        eyebrow="Compliance"
        title="Audit history"
        subtitle="Record of important changes — who did what and when. Up to the last 5,000 events are kept."
      />

      {error && (
        <div className="alert-banner" role="alert">
          <span>{error}</span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => reload()}>
            Retry
          </button>
        </div>
      )}

      <ModuleFilterBar
        summary={userLabel ? `Filtered by ${userLabel} · ${total} event${total !== 1 ? 's' : ''}` : `${total} event${total !== 1 ? 's' : ''} in log`}
      >
        <label className="module-toolbar__field module-toolbar__field--grow">
          <span className="module-toolbar__label">User</span>
          <select
            value={userFilter}
            onChange={(e) => {
              setUserFilter(e.target.value);
              setOffset(0);
            }}
            aria-label="Filter history by user"
            className="form-field__input pmo-filter-input"
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
            className="btn btn-ghost btn-sm helpdesk-filter-reset"
            onClick={() => {
              setUserFilter('');
              setOffset(0);
            }}
          >
            Reset
          </button>
        )}
      </ModuleFilterBar>

      <DataPanel>
        <div className="module-list-footer">
          <span className="results-summary">
            {total === 0
              ? userFilter
                ? 'No entries for this user.'
                : 'No entries yet.'
              : `Showing ${offset + 1}–${offset + entries.length} of ${total}${userFilter ? ' (filtered)' : ''}`}
          </span>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={!hasPrev || loading}
              onClick={() => setOffset((o) => Math.max(0, o - limit))}
            >
              Previous
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={!hasNext || loading}
              onClick={() => setOffset((o) => o + limit)}
            >
              Next
            </button>
          </div>
        </div>

        {!entries.length ? (
          <UiEmptyState
            title={userFilter ? 'No entries for this user' : 'No audit entries yet'}
            description={
              userFilter
                ? 'Try clearing the user filter or choose a different account.'
                : 'Changes to projects, users, and settings will appear here.'
            }
            action={
              userFilter ? (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    setUserFilter('');
                    setOffset(0);
                  }}
                >
                  Clear filter
                </button>
              ) : null
            }
          />
        ) : (
          <div className="table-wrap pmo-data-list-wrap pmo-data-list-wrap--sticky pmo-data-list-wrap--comfortable">
            <table className="pmo-data-list pmo-portfolio-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>User</th>
                  <th>Action</th>
                  <th>Type</th>
                  <th>Summary</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((row) => (
                  <tr key={row.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {row.at ? new Date(row.at).toLocaleString() : '—'}
                    </td>
                    <td>
                      <div>{row.user_name || row.user_email || '—'}</div>
                      {row.user_email && row.user_name && (
                        <div className="history-user-sub">{row.user_email}</div>
                      )}
                    </td>
                    <td>{ACTION_LABEL[row.action] || row.action}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}>
                      {row.target_type}
                      {row.target_id != null ? ` #${row.target_id}` : ''}
                    </td>
                    <td>
                      <div>{row.summary}</div>
                      {row.detail != null && (
                        <div className="history-detail">{formatDetail(row.detail)}</div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DataPanel>
    </div>
  );
}
