import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { btnPrimary, btnSecondary, btnSecondarySm, card, inputStyle } from '../styles/commonStyles';
import { useSubmitLock } from '../hooks/useSubmitLock';

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
  if (pic.contact_name) parts.push(pic.contact_name);
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

export default function Clients() {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
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

  useEffect(() => {
    load();
  }, []);

  const resetForm = () => setForm(emptyForm);

  const openForm = (preset = {}) => {
    setForm({ ...emptyForm, ...preset });
    setShowForm(true);
  };

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

  if (loading) return <div style={{ padding: '2rem' }}>Loading...</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Clients</h1>
          <p style={{ color: 'var(--text-muted)', margin: '0.25rem 0 0' }}>
            Manage companies and their persons in charge (PIC). Projects link to the company, not individual PICs.
          </p>
        </div>
        <button type="button" onClick={() => (showForm ? (setShowForm(false), resetForm()) : openForm())} style={btnPrimary}>
          {showForm ? 'Cancel' : '+ Add PIC'}
        </button>
      </div>

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
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="submit" style={btnPrimary} disabled={saving}>
                  {saving ? 'Saving…' : 'Save PIC'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {companies.length > 0 && (
        <div className="filter-bar" style={{ ...card, marginBottom: '0.75rem', padding: '1rem' }}>
          <label style={{ flex: '1 1 240px', minWidth: 0, maxWidth: '400px' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>
              Search
            </span>
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Company, PIC, email, phone, or project…"
              aria-label="Search clients"
              style={{ ...inputStyle, marginTop: 0 }}
            />
          </label>
          {searchActive && (
            <button
              type="button"
              style={{ ...btnSecondary, alignSelf: 'flex-end', whiteSpace: 'nowrap' }}
              onClick={() => setSearchQuery('')}
            >
              Clear search
            </button>
          )}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {companies.length === 0 && !showForm ? (
          <div style={card}>
            <p style={{ color: 'var(--text-muted)' }}>No companies yet. Add a PIC to create a company and contact.</p>
          </div>
        ) : !filteredCompanies.length ? (
          <div style={card}>
            <p style={{ color: 'var(--text-muted)' }}>
              No companies match your search.
              {searchActive && (
                <>
                  {' '}
                  <button
                    type="button"
                    style={{ ...btnSecondarySm, verticalAlign: 'baseline' }}
                    onClick={() => setSearchQuery('')}
                  >
                    Clear search
                  </button>
                </>
              )}
            </p>
          </div>
        ) : (
          <>
            {searchActive && (
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Showing {filteredCompanies.length} of {companies.length} compan{companies.length !== 1 ? 'ies' : 'y'}
              </p>
            )}
            {filteredCompanies.map((company) => (
              <div key={company.id} style={{ ...card, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    flexWrap: 'wrap',
                    gap: '1rem',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '1.05rem' }}>{company.name}</div>
                    <p style={{ margin: '0.25rem 0 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      {(company.contacts?.length ?? 0) === 0
                        ? 'No PIC on file'
                        : `${company.contacts.length} PIC${company.contacts.length !== 1 ? 's' : ''}`}
                      {company.project_count > 0 &&
                        ` · ${company.project_count} project${company.project_count !== 1 ? 's' : ''}`}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      style={btnSecondary}
                      onClick={() =>
                        openForm({ companyMode: 'existing', company_id: String(company.id), company_name: '' })
                      }
                    >
                      + Add PIC
                    </button>
                    {(company.projects?.length ?? 0) > 0 &&
                      company.projects.map((p) => (
                        <Link key={p.id} to={`/projects/${p.id}`} style={btnSecondary}>
                          {company.projects.length === 1 ? 'View project' : p.name}
                        </Link>
                      ))}
                    <button
                      type="button"
                      onClick={() => removeCompany(company.id, company.name)}
                      style={{ ...btnSecondary, color: 'var(--danger)' }}
                      disabled={saving}
                    >
                      Remove company
                    </button>
                  </div>
                </div>

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
                        <button
                          type="button"
                          style={{ ...btnSecondarySm, color: 'var(--danger)' }}
                          disabled={saving}
                          onClick={() =>
                            removeContact(pic.id, company.name, pic.contact_name || pic.email || 'this contact')
                          }
                        >
                          Remove PIC
                        </button>
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
