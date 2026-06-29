import { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../AuthContext';
import { inputStyle } from '../styles/commonStyles';
import { useSubmitLock } from '../hooks/useSubmitLock';
import PageHeader from '../components/PageHeader';
import ImageUploadField from '../components/ImageUploadField';
import UiEmptyState from '../components/UiEmptyState';
import ModuleFilterBar from '../components/ModuleFilterBar';
import PageLoadingState from '../components/PageLoadingState';
import { IMAGE_PRESETS } from '../lib/imageResize';

function companyMatchesSearch(company, q) {
  if (!q) return true;
  const haystack = [
    company.name,
    ...(company.contacts || []).flatMap((pic) => [pic.contact_name, pic.email, pic.phone]),
    ...(company.projects || []).map((p) => p.name),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(q);
}

function formatPicLine(pic) {
  const parts = [];
  if (pic.contact_name && !pic.contact_name.trim().startsWith('__pmo_contacts__:')) {
    parts.push(pic.contact_name);
  }
  if (pic.title) parts.push(pic.title);
  if (pic.email) parts.push(pic.email);
  if (pic.phone) parts.push(pic.phone);
  return parts.join(' · ');
}

const emptyForm = {
  companyMode: 'existing',
  company_id: '',
  company_name: '',
  contact_name: '',
  email: '',
  phone: '',
};

const projectMenuPanel = {
  position: 'absolute',
  right: 0,
  top: 'calc(100% + 0.35rem)',
  zIndex: 40,
  minWidth: 'min(320px, 90vw)',
  maxWidth: '360px',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.18)',
  padding: '0.65rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5rem',
};

function ProjectViewMenu({ projects }) {
  const [open, setOpen] = useState(false);
  const [projectSearch, setProjectSearch] = useState('');
  const wrapRef = useRef(null);

  const filteredProjects = useMemo(() => {
    const q = projectSearch.trim().toLowerCase();
    const list = projects || [];
    if (!q) return list;
    return list.filter((p) => (p.name || '').toLowerCase().includes(q));
  }, [projects, projectSearch]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
        setProjectSearch('');
      }
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        setOpen(false);
        setProjectSearch('');
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const close = () => {
    setOpen(false);
    setProjectSearch('');
  };

  if (!projects?.length) return null;

  const label =
    projects.length === 1 ? 'View project' : `View projects (${projects.length})`;

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        {label}
        <span aria-hidden="true" style={{ marginLeft: '0.35rem', opacity: 0.7 }}>
          {open ? '▴' : '▾'}
        </span>
      </button>
      {open && (
        <div style={projectMenuPanel} role="listbox" aria-label="Linked projects">
          <input
            type="search"
            value={projectSearch}
            onChange={(e) => setProjectSearch(e.target.value)}
            placeholder="Search projects…"
            aria-label="Search linked projects"
            style={{ ...inputStyle, marginTop: 0 }}
            autoFocus
          />
          <ul
            style={{
              margin: 0,
              padding: 0,
              listStyle: 'none',
              maxHeight: '240px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.25rem',
            }}
          >
            {filteredProjects.length === 0 ? (
              <li style={{ padding: '0.5rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                No projects match your search.
              </li>
            ) : (
              filteredProjects.map((p) => (
                <li key={p.id}>
                  <Link
                    to={`/projects/${p.id}`}
                    onClick={close}
                    style={{
                      display: 'block',
                      padding: '0.5rem 0.65rem',
                      borderRadius: 6,
                      color: 'var(--text)',
                      textDecoration: 'none',
                      fontSize: '0.9rem',
                    }}
                    className="client-project-menu-link"
                  >
                    <span style={{ fontWeight: 500 }}>{p.name}</span>
                    {p.status && (
                      <span style={{ marginLeft: '0.35rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                        · {p.status}
                      </span>
                    )}
                  </Link>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function Clients() {
  const { user } = useAuth();
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingPic, setEditingPic] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [form, setForm] = useState(emptyForm);
  const { pending: saving, run } = useSubmitLock();

  const load = () =>
    api.clients
      .list()
      .then(setCompanies)
      .catch(console.error)
      .finally(() => setLoading(false));

  const filteredCompanies = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return companies.filter((c) => companyMatchesSearch(c, q));
  }, [companies, searchQuery]);

  const searchActive = Boolean(searchQuery.trim());
  const canEditLogo = user?.role === 'admin' || user?.role === 'pmo';

  const saveCompanyLogo = async (companyId, logo_url) => {
    await run(async () => {
      const updated = await api.clients.update(companyId, { logo_url });
      setCompanies((list) => list.map((c) => (c.id === companyId ? updated : c)));
    });
  };

  useEffect(() => {
    load();
  }, []);

  const resetForm = () => setForm(emptyForm);

  const openForm = (preset = {}) => {
    setEditingPic(null);
    setForm({ ...emptyForm, ...preset });
    setShowForm(true);
  };

  const openEditPic = (pic, companyName) => {
    setShowForm(false);
    resetForm();
    setEditingPic({
      id: pic.id,
      companyName,
      contact_name: pic.contact_name || '',
      email: pic.email || '',
      phone: pic.phone || '',
    });
  };

  const closeEditPic = () => setEditingPic(null);

  const submit = async (e) => {
    e.preventDefault();
    const body =
      form.companyMode === 'existing'
        ? {
            company_id: form.company_id ? +form.company_id : undefined,
            contact_name: form.contact_name,
            email: form.email,
            phone: form.phone,
          }
        : {
            company_name: form.company_name.trim(),
            contact_name: form.contact_name,
            email: form.email,
            phone: form.phone,
          };

    if (form.companyMode === 'existing' && !body.company_id) {
      alert('Please select a company.');
      return;
    }
    if (form.companyMode === 'new' && !body.company_name) {
      alert('Please enter a company or organisation name.');
      return;
    }

    await run(async () => {
      try {
        await api.clients.create(body);
        resetForm();
        setShowForm(false);
        load();
      } catch (err) {
        alert(err.message);
      }
    });
  };

  const removeCompany = async (id, name) => {
    if (!confirm(`Remove company "${name}" and all its contacts? Linked projects will be unlinked.`)) return;
    await run(async () => {
      try {
        await api.clients.delete(id);
        load();
      } catch (err) {
        alert(err.message);
      }
    });
  };

  const saveEditPic = async (e) => {
    e.preventDefault();
    if (!editingPic) return;
    await run(async () => {
      try {
        await api.clients.updateContact(editingPic.id, {
          contact_name: editingPic.contact_name,
          email: editingPic.email,
          phone: editingPic.phone,
        });
        closeEditPic();
        load();
      } catch (err) {
        alert(err.message);
      }
    });
  };

  const removeContact = async (contactId, companyName, picLabel) => {
    if (!confirm(`Remove contact "${picLabel}" from ${companyName}?`)) return;
    await run(async () => {
      try {
        await api.clients.deleteContact(contactId);
        load();
      } catch (err) {
        alert(err.message);
      }
    });
  };

  if (loading) return <PageLoadingState message="Loading clients…" />;

  return (
    <div className="page-module clients-page">
      <PageHeader
        title="Clients"
        subtitle="Manage companies and their persons in charge (PIC). Projects link to the company, not individual PICs."
        actions={
          <button type="button" className="btn btn-primary" onClick={() => (showForm ? (setShowForm(false), resetForm()) : openForm())}>
            {showForm ? 'Cancel' : '+ Add PIC'}
          </button>
        }
      />

      {editingPic && (
        <div className="modal-backdrop" role="presentation">
          <div
            className="modal-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="client-edit-pic-modal-title"
          >
            <div className="modal-dialog-header">
              <h2 id="client-edit-pic-modal-title" className="modal-dialog-title">
                Edit person in charge (PIC)
              </h2>
              <button
                type="button"
                className="modal-dialog-close"
                onClick={closeEditPic}
                aria-label="Close dialog"
              >
                ×
              </button>
            </div>
            <p style={{ margin: '0 0 0.75rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              Company: <strong style={{ color: 'var(--text)' }}>{editingPic.companyName}</strong>
            </p>
            <form onSubmit={saveEditPic} style={{ display: 'grid', gap: '0.75rem' }}>
              <label>
                Contact person (PIC)
                <input
                  type="text"
                  value={editingPic.contact_name}
                  onChange={(e) => setEditingPic((p) => ({ ...p, contact_name: e.target.value }))}
                  style={inputStyle}
                  placeholder="Name"
                />
              </label>
              <label>
                Email
                <input
                  type="email"
                  value={editingPic.email}
                  onChange={(e) => setEditingPic((p) => ({ ...p, email: e.target.value }))}
                  style={inputStyle}
                />
              </label>
              <label>
                Phone
                <input
                  type="text"
                  value={editingPic.phone}
                  onChange={(e) => setEditingPic((p) => ({ ...p, phone: e.target.value }))}
                  style={inputStyle}
                />
              </label>
              <div className="project-create-footer">
                <button type="button" className="btn btn-secondary" onClick={closeEditPic} disabled={saving}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary project-create-footer__primary" disabled={saving}>
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showForm && (
        <div className="modal-backdrop" role="presentation">
          <div
            className="modal-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="client-create-modal-title"
          >
            <div className="modal-dialog-header">
              <h2 id="client-create-modal-title" className="modal-dialog-title">
                Add person in charge (PIC)
              </h2>
              <button
                type="button"
                className="modal-dialog-close"
                onClick={() => {
                  setShowForm(false);
                  resetForm();
                }}
                aria-label="Close dialog"
              >
                ×
              </button>
            </div>
            <form onSubmit={submit} style={{ display: 'grid', gap: '0.75rem' }}>
              <fieldset style={{ border: 'none', margin: 0, padding: 0 }}>
                <legend style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                  Company / organisation
                </legend>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="companyMode"
                      checked={form.companyMode === 'existing'}
                      onChange={() => setForm((f) => ({ ...f, companyMode: 'existing', company_name: '' }))}
                    />
                    <span>Choose existing</span>
                  </label>
                  {form.companyMode === 'existing' && (
                    <select
                      value={form.company_id}
                      onChange={(e) => setForm((f) => ({ ...f, company_id: e.target.value }))}
                      style={inputStyle}
                      required={form.companyMode === 'existing'}
                      aria-label="Select company"
                    >
                      <option value="">Select company…</option>
                      {companies.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  )}
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="companyMode"
                      checked={form.companyMode === 'new'}
                      onChange={() => setForm((f) => ({ ...f, companyMode: 'new', company_id: '' }))}
                    />
                    <span>Add new company</span>
                  </label>
                  {form.companyMode === 'new' && (
                    <input
                      type="text"
                      value={form.company_name}
                      onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))}
                      style={inputStyle}
                      placeholder="Company or organisation name"
                      required={form.companyMode === 'new'}
                      aria-label="New company name"
                    />
                  )}
                </div>
              </fieldset>

              <label>
                Contact person (PIC)
                <input
                  type="text"
                  value={form.contact_name}
                  onChange={(e) => setForm((f) => ({ ...f, contact_name: e.target.value }))}
                  style={inputStyle}
                  placeholder="Name"
                />
              </label>
              <label>
                Email
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  style={inputStyle}
                />
              </label>
              <label>
                Phone
                <input
                  type="text"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  style={inputStyle}
                />
              </label>
              <div className="project-create-footer">
                <button type="submit" className="btn btn-primary project-create-footer__primary" disabled={saving}>
                  {saving ? 'Saving…' : 'Save PIC'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {companies.length > 0 && (
        <ModuleFilterBar
          summary={
            searchActive
              ? `Showing ${filteredCompanies.length} of ${companies.length} compan${companies.length !== 1 ? 'ies' : 'y'}`
              : `${companies.length} compan${companies.length !== 1 ? 'ies' : 'y'}`
          }
        >
          <label className="module-toolbar__field module-toolbar__field--grow">
            <span className="module-toolbar__label">Search</span>
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Company, PIC, email, phone, or project…"
              aria-label="Search clients"
              className="form-field__input pmo-filter-input"
            />
          </label>
          {searchActive && (
            <button type="button" className="btn btn-ghost btn-sm helpdesk-filter-reset" onClick={() => setSearchQuery('')}>
              Reset
            </button>
          )}
        </ModuleFilterBar>
      )}

      <div className="clients-grid">
        {companies.length === 0 && !showForm ? (
          <div className="ui-card section-card">
            <UiEmptyState
              title="No companies yet"
              description="Add a person in charge (PIC) to create a company and contact."
              action={
                <button type="button" className="btn btn-primary btn-sm" onClick={() => openForm()}>
                  + Add PIC
                </button>
              }
            />
          </div>
        ) : !filteredCompanies.length ? (
          <div className="ui-card section-card">
            <UiEmptyState
              title="No companies match your search"
              description="Try a different search term or clear the filter."
              action={
                searchActive ? (
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSearchQuery('')}>
                    Clear search
                  </button>
                ) : null
              }
            />
          </div>
        ) : (
          <>
            {filteredCompanies.map((company) => (
              <div key={company.id} className="client-card ui-card">
                <div className="client-card__head">
                  <div className="client-card__identity">
                    {company.logo_url ? (
                      <img src={company.logo_url} alt="" className="client-card__logo" />
                    ) : (
                      <div className="client-card__logo client-card__logo--placeholder" aria-hidden>
                        {company.name?.slice(0, 1)?.toUpperCase() || 'C'}
                      </div>
                    )}
                    <div>
                      <div className="client-card__name">{company.name}</div>
                      <p className="client-card__meta">
                        {(company.contacts?.length ?? 0) === 0
                          ? 'No PIC on file'
                          : `${company.contacts.length} PIC${company.contacts.length !== 1 ? 's' : ''}`}
                        {company.project_count > 0 &&
                          ` · ${company.project_count} project${company.project_count !== 1 ? 's' : ''}`}
                      </p>
                    </div>
                  </div>
                  <div className="client-card__actions">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() =>
                        openForm({ companyMode: 'existing', company_id: String(company.id), company_name: '' })
                      }
                    >
                      + Add PIC
                    </button>
                    <ProjectViewMenu projects={company.projects} />
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => removeCompany(company.id, company.name)}
                      style={{ color: 'var(--danger)' }}
                      disabled={saving}
                    >
                      Remove company
                    </button>
                  </div>
                </div>

                {canEditLogo && (
                  <div className="client-card__logo-upload">
                    <ImageUploadField
                      label="Company logo"
                      value={company.logo_url}
                      onChange={(logo_url) => saveCompanyLogo(company.id, logo_url)}
                      onError={(m) => alert(m)}
                      preset={IMAGE_PRESETS.clientLogo}
                      variant="logo"
                      placeholder="Upload logo"
                      busy={saving}
                    />
                  </div>
                )}

                {(company.contacts?.length ?? 0) > 0 && (
                  <ul
                    style={{
                      margin: 0,
                      padding: 0,
                      listStyle: 'none',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.5rem',
                      borderTop: '1px solid var(--border)',
                      paddingTop: '0.75rem',
                    }}
                  >
                    {company.contacts.map((pic) => (
                      <li
                        key={pic.id}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          gap: '0.5rem',
                          fontSize: '0.9rem',
                          color: 'var(--text-muted)',
                        }}
                      >
                        <span>{formatPicLine(pic) || 'Unnamed contact'}</span>
                        <div className="card-actions">
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            disabled={saving}
                            onClick={() => openEditPic(pic, company.name)}
                          >
                            Edit PIC
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            style={{ color: 'var(--danger)' }}
                            disabled={saving}
                            onClick={() =>
                              removeContact(pic.id, company.name, pic.contact_name || pic.email || 'this contact')
                            }
                          >
                            Remove PIC
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
