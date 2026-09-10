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
import PageLoadError from '../components/PageLoadError';
import { IMAGE_PRESETS } from '../lib/imageResize';

function companyMatchesSearch(company, q) {
  if (!q) return true;
  const haystack = [
    company.name,
    company.short_code,
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
  short_code: '',
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
    projects.length === 1 ? 'Projects' : `Projects (${projects.length})`;

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        {label}
        <span aria-hidden="true" style={{ marginLeft: '0.25rem', opacity: 0.7 }}>
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
  const [loadError, setLoadError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingPic, setEditingPic] = useState(null);
  const [editingCompany, setEditingCompany] = useState(null);
  const [addingCompany, setAddingCompany] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [form, setForm] = useState(emptyForm);
  const { pending: saving, run } = useSubmitLock();

  const load = () => {
    setLoading(true);
    setLoadError('');
    return api.clients
      .list()
      .then((rows) => {
        setCompanies(Array.isArray(rows) ? rows : []);
      })
      .catch((err) => {
        console.error(err);
        setCompanies([]);
        setLoadError(err?.message || 'Could not load clients');
      })
      .finally(() => setLoading(false));
  };

  const filteredCompanies = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return companies.filter((c) => companyMatchesSearch(c, q));
  }, [companies, searchQuery]);

  const searchActive = Boolean(searchQuery.trim());
  const canEditLogo = user?.role === 'admin' || user?.role === 'pmo';

  const saveCompanyLogo = async (companyId, logo_url) => {
    await run(async () => {
      try {
        const updated = await api.clients.update(companyId, { logo_url });
        setCompanies((list) => list.map((c) => (c.id === companyId ? { ...c, ...updated } : c)));
      } catch (err) {
        alert(err.message || 'Could not update logo');
      }
    });
  };

  useEffect(() => {
    load();
  }, []);

  const resetForm = () => setForm(emptyForm);

  const openForm = (preset = {}) => {
    setEditingPic(null);
    setEditingCompany(null);
    setAddingCompany(null);
    setForm({ ...emptyForm, ...preset });
    setShowForm(true);
  };

  const openEditPic = (pic, companyName) => {
    setShowForm(false);
    setEditingCompany(null);
    setAddingCompany(null);
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

  const openAddCompany = () => {
    setShowForm(false);
    setEditingPic(null);
    resetForm();
    setEditingCompany(null);
    setAddingCompany({
      name: '',
      short_code: '',
      logo_url: null,
    });
  };

  const closeAddCompany = () => setAddingCompany(null);

  const saveAddCompany = async (e) => {
    e.preventDefault();
    if (!addingCompany) return;
    const name = String(addingCompany.name || '').trim();
    const shortCode = String(addingCompany.short_code || '').trim();
    if (!name) {
      alert('Company name is required.');
      return;
    }
    if (!shortCode) {
      alert('Short code is required.');
      return;
    }
    await run(async () => {
      try {
        const body = {
          company_name: name,
          short_code: shortCode,
        };
        if (canEditLogo && addingCompany.logo_url) {
          body.logo_url = addingCompany.logo_url;
        }
        await api.clients.create(body);
        closeAddCompany();
        load();
      } catch (err) {
        alert(err.message);
      }
    });
  };

  const openEditCompany = (company) => {
    setShowForm(false);
    setEditingPic(null);
    setAddingCompany(null);
    resetForm();
    setEditingCompany({
      id: company.id,
      name: company.name || '',
      short_code: company.short_code || '',
      logo_url: company.logo_url || null,
    });
  };

  const closeEditCompany = () => setEditingCompany(null);

  const saveEditCompany = async (e) => {
    e.preventDefault();
    if (!editingCompany) return;
    const name = String(editingCompany.name || '').trim();
    const shortCode = String(editingCompany.short_code || '').trim();
    if (!name) {
      alert('Company name is required.');
      return;
    }
    if (!shortCode) {
      alert('Short code is required.');
      return;
    }
    await run(async () => {
      try {
        const body = {
          name,
          short_code: shortCode,
        };
        if (canEditLogo) {
          body.logo_url = editingCompany.logo_url || null;
        }
        const updated = await api.clients.update(editingCompany.id, body);
        setCompanies((list) => list.map((c) => (c.id === editingCompany.id ? { ...c, ...updated } : c)));
        closeEditCompany();
      } catch (err) {
        alert(err.message);
      }
    });
  };

  const submit = async (e) => {
    e.preventDefault();
    const shortCode = form.short_code.trim();
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
            short_code: shortCode,
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
    if (form.companyMode === 'new' && !shortCode) {
      alert('Short code is required.');
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
  if (loadError) {
    return (
      <PageLoadError
        title="Could not load clients"
        message={loadError}
        onRetry={load}
      />
    );
  }

  return (
    <div className="page-module clients-page">
      <PageHeader
        title="Clients"
        subtitle="Companies, short codes, and PICs."
        actions={
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => (addingCompany ? closeAddCompany() : openAddCompany())}
            >
              {addingCompany ? 'Cancel' : '+ Add client'}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => (showForm ? (setShowForm(false), resetForm()) : openForm())}
            >
              {showForm ? 'Cancel' : '+ Add PIC'}
            </button>
          </div>
        }
      />

      {addingCompany && (
        <div className="modal-backdrop" role="presentation">
          <div
            className="modal-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="client-add-company-modal-title"
          >
            <div className="modal-dialog-header">
              <h2 id="client-add-company-modal-title" className="modal-dialog-title">
                Add client
              </h2>
              <button
                type="button"
                className="modal-dialog-close"
                onClick={closeAddCompany}
                aria-label="Close dialog"
              >
                ×
              </button>
            </div>
            <form onSubmit={saveAddCompany} style={{ display: 'grid', gap: '0.75rem' }}>
              <label>
                Company / organisation name <span className="form-field__required">*</span>
                <input
                  type="text"
                  value={addingCompany.name}
                  onChange={(e) => setAddingCompany((c) => ({ ...c, name: e.target.value }))}
                  style={inputStyle}
                  required
                  autoFocus
                />
              </label>
              <label>
                Short code <span className="form-field__required">*</span>
                <input
                  type="text"
                  value={addingCompany.short_code}
                  onChange={(e) => setAddingCompany((c) => ({ ...c, short_code: e.target.value }))}
                  style={inputStyle}
                  placeholder="e.g. PKPJ"
                  maxLength={32}
                  required
                />
                <span style={{ display: 'block', marginTop: '0.35rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Required code used in helpdesk / imports
                </span>
              </label>
              {canEditLogo && (
                <div className="client-modal-logo">
                  <ImageUploadField
                    value={addingCompany.logo_url}
                    onChange={(logo_url) => setAddingCompany((c) => ({ ...c, logo_url }))}
                    onError={(m) => alert(m)}
                    preset={IMAGE_PRESETS.clientLogo}
                    variant="avatar"
                    fallbackLetter={addingCompany.name || 'C'}
                    busy={saving}
                  />
                  <p className="client-modal-logo__hint">
                    Click the square to add a logo. Optional.
                  </p>
                </div>
              )}
              <div className="project-create-footer">
                <button type="button" className="btn btn-secondary" onClick={closeAddCompany} disabled={saving}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary project-create-footer__primary" disabled={saving}>
                  {saving ? 'Creating…' : 'Create client'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editingCompany && (
        <div className="modal-backdrop" role="presentation">
          <div
            className="modal-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="client-edit-company-modal-title"
          >
            <div className="modal-dialog-header">
              <h2 id="client-edit-company-modal-title" className="modal-dialog-title">
                Edit company
              </h2>
              <button
                type="button"
                className="modal-dialog-close"
                onClick={closeEditCompany}
                aria-label="Close dialog"
              >
                ×
              </button>
            </div>
            <form onSubmit={saveEditCompany} style={{ display: 'grid', gap: '0.75rem' }}>
              <label>
                Company / organisation name <span className="form-field__required">*</span>
                <input
                  type="text"
                  value={editingCompany.name}
                  onChange={(e) => setEditingCompany((c) => ({ ...c, name: e.target.value }))}
                  style={inputStyle}
                  required
                  autoFocus
                />
              </label>
              <label>
                Short code <span className="form-field__required">*</span>
                <input
                  type="text"
                  value={editingCompany.short_code}
                  onChange={(e) => setEditingCompany((c) => ({ ...c, short_code: e.target.value }))}
                  style={inputStyle}
                  placeholder="e.g. PKPJ"
                  maxLength={32}
                  required
                />
                <span style={{ display: 'block', marginTop: '0.35rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Required code used in helpdesk / imports
                </span>
              </label>
              {canEditLogo && (
                <div className="client-modal-logo">
                  <ImageUploadField
                    value={editingCompany.logo_url}
                    onChange={(logo_url) => setEditingCompany((c) => ({ ...c, logo_url }))}
                    onError={(m) => alert(m)}
                    preset={IMAGE_PRESETS.clientLogo}
                    variant="avatar"
                    fallbackLetter={editingCompany.name || 'C'}
                    busy={saving}
                  />
                  <p className="client-modal-logo__hint">
                    Click the square to change the logo.
                  </p>
                </div>
              )}
              <div className="project-create-footer">
                <button type="button" className="btn btn-secondary" onClick={closeEditCompany} disabled={saving}>
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
                      onChange={() => setForm((f) => ({ ...f, companyMode: 'existing', company_name: '', short_code: '' }))}
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
                    <>
                      <input
                        type="text"
                        value={form.company_name}
                        onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))}
                        style={inputStyle}
                        placeholder="Company or organisation name"
                        required={form.companyMode === 'new'}
                        aria-label="New company name"
                      />
                      <label>
                        Short code <span className="form-field__required">*</span>
                        <input
                          type="text"
                          value={form.short_code}
                          onChange={(e) => setForm((f) => ({ ...f, short_code: e.target.value }))}
                          style={inputStyle}
                          placeholder="e.g. PKPJ"
                          maxLength={32}
                          required={form.companyMode === 'new'}
                          aria-label="Company short code"
                        />
                      </label>
                    </>
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
              description="Add a client company first, then attach persons in charge (PIC) as needed."
              action={
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                  <button type="button" className="btn btn-primary btn-sm" onClick={openAddCompany}>
                    + Add client
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => openForm()}>
                    + Add PIC
                  </button>
                </div>
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
          <div className="clients-list ui-card">
            {filteredCompanies.map((company) => {
              const picCount = company.contacts?.length ?? 0;
              const metaParts = [];
              if (picCount === 0) metaParts.push('No PIC');
              else metaParts.push(`${picCount} PIC${picCount !== 1 ? 's' : ''}`);
              if (company.project_count > 0) {
                metaParts.push(
                  `${company.project_count} project${company.project_count !== 1 ? 's' : ''}`,
                );
              }

              return (
                <article key={company.id} className="client-row">
                  <div className="client-row__main">
                    <div className="client-row__identity">
                      {canEditLogo ? (
                        <ImageUploadField
                          value={company.logo_url}
                          onChange={(logo_url) => saveCompanyLogo(company.id, logo_url)}
                          onError={(m) => alert(m)}
                          preset={IMAGE_PRESETS.clientLogo}
                          variant="avatar"
                          fallbackLetter={company.name || 'C'}
                          busy={saving}
                        />
                      ) : company.logo_url ? (
                        <img src={company.logo_url} alt="" className="client-row__logo" />
                      ) : (
                        <div className="client-row__logo client-row__logo--placeholder" aria-hidden>
                          {company.name?.slice(0, 1)?.toUpperCase() || 'C'}
                        </div>
                      )}
                      <div>
                        <div className="client-row__name">{company.name}</div>
                        <p className="client-row__meta">
                          {company.short_code ? (
                            <span className="client-row__code">{company.short_code}</span>
                          ) : null}
                          {company.short_code ? ' · ' : ''}
                          {metaParts.join(' · ')}
                        </p>
                      </div>
                    </div>
                    <div className="client-row__actions">
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => openEditCompany(company)}
                        disabled={saving}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() =>
                          openForm({ companyMode: 'existing', company_id: String(company.id), company_name: '' })
                        }
                      >
                        + PIC
                      </button>
                      <ProjectViewMenu projects={company.projects} />
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => removeCompany(company.id, company.name)}
                        style={{ color: 'var(--danger)' }}
                        disabled={saving}
                      >
                        Remove
                      </button>
                    </div>
                  </div>

                  {picCount > 0 && (
                    <ul className="client-row__pics">
                      {company.contacts.map((pic) => (
                        <li key={pic.id} className="client-row__pic">
                          <span>{formatPicLine(pic) || 'Unnamed contact'}</span>
                          <div className="client-row__pic-actions">
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              disabled={saving}
                              onClick={() => openEditPic(pic, company.name)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              style={{ color: 'var(--danger)' }}
                              disabled={saving}
                              onClick={() =>
                                removeContact(pic.id, company.name, pic.contact_name || pic.email || 'this contact')
                              }
                            >
                              Remove
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
