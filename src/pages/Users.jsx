import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { useSubmitLock } from '../hooks/useSubmitLock';
import PageHeader from '../components/PageHeader';
import UiEmptyState from '../components/UiEmptyState';
import ModuleFilterBar from '../components/ModuleFilterBar';
import PageLoadingState from '../components/PageLoadingState';
import DataPanel from '../components/DataPanel';

const ROLE_LABELS = { admin: 'Admin', pmo: 'PMO', finance: 'Finance', hr: 'HR', user: 'User' };
const ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin' },
  { value: 'pmo', label: 'PMO' },
  { value: 'finance', label: 'Finance' },
  { value: 'hr', label: 'HR' },
  { value: 'user', label: 'User' },
];

function roleLabel(role) {
  return ROLE_LABELS[role] || role;
}

function UserFormModal({ open, title, subtitle, onClose, onSubmit, pending, submitLabel, children }) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="presentation" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-dialog" role="dialog" aria-modal="true">
        <div className="modal-dialog-header project-create-header">
          <div>
            {subtitle && <p className="project-create-eyebrow">{subtitle}</p>}
            <h2 className="modal-dialog-title">{title}</h2>
          </div>
          <button type="button" className="modal-dialog-close" onClick={onClose} aria-label="Close dialog">
            ×
          </button>
        </div>
        <form className="project-create-form" onSubmit={onSubmit}>
          <div className="project-create-panel form-stack">{children}</div>
          <div className="project-create-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary project-create-footer__primary" disabled={pending}>
              {pending ? 'Saving…' : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Users() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', role: 'user' });
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', email: '', role: 'user', password: '', active: true });
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const { pending: createPending, run: runCreate } = useSubmitLock();
  const { pending: editPending, run: runEdit } = useSubmitLock();
  const { pending: statusBusy, run: runStatus } = useSubmitLock();
  const createFirstFieldRef = useRef(null);
  const editFirstFieldRef = useRef(null);

  const load = () => api.users.list().then(setUsers).catch(console.error).finally(() => setLoading(false));

  const filteredUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter && u.role !== roleFilter) return false;
      if (statusFilter === 'active' && u.active === false) return false;
      if (statusFilter === 'inactive' && u.active !== false) return false;
      if (!q) return true;
      const name = (u.name || '').toLowerCase();
      const email = (u.email || '').toLowerCase();
      return name.includes(q) || email.includes(q);
    });
  }, [users, searchQuery, roleFilter, statusFilter]);

  const filtersActive = Boolean(searchQuery.trim() || roleFilter || statusFilter);

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (editingId != null) editFirstFieldRef.current?.focus();
  }, [editingId]);

  useEffect(() => {
    if (showForm) createFirstFieldRef.current?.focus();
  }, [showForm]);

  const clearFilters = () => {
    setSearchQuery('');
    setRoleFilter('');
    setStatusFilter('');
  };

  const cancelCreate = () => {
    setShowForm(false);
    setForm({ name: '', email: '', role: 'user' });
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim()) return;
    await runCreate(async () => {
      try {
        await api.users.create({
          name: form.name.trim(),
          email: form.email.trim(),
          role: form.role,
        });
        cancelCreate();
        load();
      } catch (err) {
        alert(err.message);
      }
    });
  };

  const startEdit = (u) => {
    setEditingId(u.id);
    setEditForm({
      name: u.name || '',
      email: u.email || '',
      role: u.role || 'user',
      password: '',
      active: u.active !== false,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({ name: '', email: '', role: 'user', password: '', active: true });
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    if (!editForm.name.trim() || !editForm.email.trim()) return;
    await runEdit(async () => {
      try {
        const body = {
          name: editForm.name.trim(),
          email: editForm.email.trim(),
          role: editForm.role,
          active: editForm.active,
        };
        if (editForm.password.trim()) body.password = editForm.password;
        await api.users.update(editingId, body);
        cancelEdit();
        load();
      } catch (err) {
        alert(err.message);
      }
    });
  };

  const setUserActiveInline = async (u, nextActive) => {
    const current = u.active !== false;
    if (current === nextActive) return;
    await runStatus(async () => {
      try {
        await api.users.update(u.id, { active: nextActive });
        await load();
      } catch (err) {
        alert(err.message);
      }
    });
  };

  if (loading) return <PageLoadingState message="Loading users…" />;

  return (
    <div className="page-module users-page">
      <PageHeader
        eyebrow="Administration"
        title="System users"
        subtitle="Create and manage user accounts, roles, and access for this workspace."
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setShowForm(true)}>
            + Create user
          </button>
        }
      />

      <UserFormModal
        open={showForm}
        title="Create user"
        onClose={cancelCreate}
        onSubmit={submit}
        pending={createPending}
        submitLabel="Create"
      >
        <div className="form-field">
          <label className="form-field__label" htmlFor="create-user-name">
            Name <span className="form-field__required">*</span>
          </label>
          <input
            ref={createFirstFieldRef}
            id="create-user-name"
            type="text"
            className="form-field__input ui-input"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
          />
        </div>
        <div className="form-field">
          <label className="form-field__label" htmlFor="create-user-email">
            Email <span className="form-field__required">*</span>
          </label>
          <input
            id="create-user-email"
            type="email"
            className="form-field__input ui-input"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            required
          />
        </div>
        <div className="form-field">
          <label className="form-field__label" htmlFor="create-user-role">Role</label>
          <select
            id="create-user-role"
            className="form-field__input ui-input"
            value={form.role}
            onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
          >
            {ROLE_OPTIONS.map(({ value, label }) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        <p className="form-field__hint">
          New users get default password: <code>P@ssw0rd</code>
        </p>
      </UserFormModal>

      <UserFormModal
        open={editingId != null}
        title="Edit user"
        subtitle={editForm.email || undefined}
        onClose={cancelEdit}
        onSubmit={saveEdit}
        pending={editPending}
        submitLabel="Save"
      >
        <div className="form-field">
          <label className="form-field__label" htmlFor="edit-user-name">
            Name <span className="form-field__required">*</span>
          </label>
          <input
            ref={editFirstFieldRef}
            id="edit-user-name"
            type="text"
            className="form-field__input ui-input"
            value={editForm.name}
            onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
            required
          />
        </div>
        <div className="form-field">
          <label className="form-field__label" htmlFor="edit-user-email">
            Email <span className="form-field__required">*</span>
          </label>
          <input
            id="edit-user-email"
            type="email"
            className="form-field__input ui-input"
            value={editForm.email}
            onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
            required
          />
        </div>
        <div className="form-field">
          <label className="form-field__label" htmlFor="edit-user-role">Role</label>
          <select
            id="edit-user-role"
            className="form-field__input ui-input"
            value={editForm.role}
            onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value }))}
          >
            {ROLE_OPTIONS.map(({ value, label }) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        <div className="form-field">
          <label className="form-field__label" htmlFor="edit-user-password">New password</label>
          <input
            id="edit-user-password"
            type="password"
            minLength={6}
            className="form-field__input ui-input"
            value={editForm.password}
            onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))}
            placeholder="Leave blank to keep current"
          />
        </div>
        <label className="form-field" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={editForm.active}
            onChange={(e) => setEditForm((f) => ({ ...f, active: e.target.checked }))}
          />
          <span>Account active (inactive users cannot sign in)</span>
        </label>
      </UserFormModal>

      {users.length > 0 && (
        <ModuleFilterBar
          summary={filtersActive ? `Showing ${filteredUsers.length} of ${users.length} users` : `${users.length} user${users.length !== 1 ? 's' : ''}`}
        >
          <label className="module-toolbar__field module-toolbar__field--grow">
            <span className="module-toolbar__label">Search</span>
            <input
              type="search"
              className="form-field__input pmo-filter-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Name or email…"
              aria-label="Search users by name or email"
            />
          </label>
          <label className="module-toolbar__field">
            <span className="module-toolbar__label">Role</span>
            <select
              className="form-field__input pmo-filter-input"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              aria-label="Filter by role"
            >
              <option value="">All roles</option>
              {ROLE_OPTIONS.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label className="module-toolbar__field">
            <span className="module-toolbar__label">Status</span>
            <select
              className="form-field__input pmo-filter-input"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter by account status"
            >
              <option value="">All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>
          {filtersActive && (
            <button type="button" className="btn btn-ghost btn-sm helpdesk-filter-reset" onClick={clearFilters}>
              Reset
            </button>
          )}
        </ModuleFilterBar>
      )}

      <DataPanel>
        {!users.length ? (
          <UiEmptyState
            title="No users yet"
            description="Create the first user account to get started."
            action={
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowForm(true)}>
                + Create user
              </button>
            }
          />
        ) : !filteredUsers.length ? (
          <UiEmptyState
            title="No users match your filters"
            description="Try adjusting search, role, or status filters."
            action={
              filtersActive ? (
                <button type="button" className="btn btn-secondary btn-sm" onClick={clearFilters}>
                  Clear filters
                </button>
              ) : null
            }
          />
        ) : (
          <>
            <div className="section-card__header section-card__header--compact">
              <p className="results-summary" style={{ margin: 0 }}>
                Showing {filteredUsers.length} of {users.length} user{users.length !== 1 ? 's' : ''}
                {filtersActive ? ' (filtered)' : ''}
              </p>
            </div>
            <div className="table-wrap pmo-data-list-wrap pmo-data-list-wrap--sticky pmo-data-list-wrap--comfortable">
              <table className="pmo-data-list pmo-portfolio-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((u) => (
                    <tr key={u.id}>
                      <td>{u.name}</td>
                      <td>{u.email}</td>
                      <td>{roleLabel(u.role)}</td>
                      <td>
                        <select
                          className="ui-input"
                          style={{ minWidth: '7.5rem', padding: '0.35rem 0.5rem' }}
                          value={u.active === false ? 'inactive' : 'active'}
                          disabled={statusBusy}
                          onChange={(e) => setUserActiveInline(u, e.target.value === 'active')}
                          aria-label={`Status for ${u.name}`}
                        >
                          <option value="active">Active</option>
                          <option value="inactive">Inactive</option>
                        </select>
                      </td>
                      <td>{new Date(u.created_at).toLocaleString()}</td>
                      <td>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => startEdit(u)}>
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </DataPanel>
    </div>
  );
}
