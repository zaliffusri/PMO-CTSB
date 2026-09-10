import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../../api';
import { useSubmitLock } from '../../hooks/useSubmitLock';
import { EPBT_MODULES, resolveEpbtModules } from '../../../lib/epbtModules.js';
import { mapApiToForm } from './settingsStyles';

export default function SettingsModules() {
  const { form, setForm } = useOutletContext();
  const { pending: saving, run } = useSubmitLock();
  const [msg, setMsg] = useState('');
  const [rows, setRows] = useState(() => EPBT_MODULES.map((m) => ({ ...m })));
  /** null | { draft, index } | { draft, isNew: true } */
  const [editModal, setEditModal] = useState(null);
  const [modalErr, setModalErr] = useState('');

  useEffect(() => {
    if (!form) return;
    setRows(resolveEpbtModules(form.epbt_modules));
  }, [form?.epbt_modules]);

  if (!form) return null;

  const closeModal = () => {
    setEditModal(null);
    setModalErr('');
  };

  const openEdit = (index) => {
    const r = rows[index];
    setModalErr('');
    setEditModal({ draft: { code: r.code, label: r.label }, index });
  };

  const openAdd = () => {
    setModalErr('');
    setEditModal({ draft: { code: '', label: '' }, isNew: true });
  };

  const setDraft = (patch) => {
    setEditModal((m) => (m ? { ...m, draft: { ...m.draft, ...patch } } : m));
  };

  const persistRows = async (nextRows) => run(async () => {
    try {
      setMsg('');
      const s = await api.settings.update({
        epbt_modules: nextRows,
      });
      setForm(mapApiToForm(s));
      setMsg('Modules saved.');
      return { ok: true };
    } catch (e2) {
      return { ok: false, err: e2.message || 'Save failed' };
    }
  });

  const applyModal = async () => {
    if (!editModal) return;
    const code = String(editModal.draft.code || '').trim().toUpperCase();
    const label = String(editModal.draft.label || '').trim();
    if (!code) {
      setModalErr('Module code is required.');
      return;
    }
    if (!/^[A-Z0-9]{1,12}$/.test(code)) {
      setModalErr('Code must be A–Z / 0–9, max 12 characters.');
      return;
    }
    if (!label) {
      setModalErr('Module label is required.');
      return;
    }
    const duplicate = rows.some((r, i) => (
      r.code === code && (editModal.isNew || i !== editModal.index)
    ));
    if (duplicate) {
      setModalErr(`Module code "${code}" already exists.`);
      return;
    }
    const nextRows = editModal.isNew
      ? [...rows, { code, label }]
      : rows.map((r, j) => (j === editModal.index ? { code, label } : r));

    const result = await persistRows(nextRows);
    if (result == null) return;
    if (!result.ok) {
      setModalErr(result.err || 'Save failed');
      return;
    }
    closeModal();
  };

  const removeInModal = async () => {
    if (!editModal || editModal.isNew) return;
    if (rows.length <= 1) {
      setModalErr('Keep at least one module.');
      return;
    }
    const i = editModal.index;
    const nextRows = rows.filter((_, j) => j !== i);
    const result = await persistRows(nextRows);
    if (result == null) return;
    if (!result.ok) {
      setModalErr(result.err || 'Save failed');
      return;
    }
    closeModal();
  };

  const resetDefaults = async () => {
    if (!confirm('Reset module list to the default ePBT catalog?')) return;
    const result = await persistRows(EPBT_MODULES.map((m) => ({ ...m })));
    if (result && !result.ok) setMsg(result.err || 'Reset failed');
  };

  const modalTitle = editModal?.isNew ? 'Add module' : 'Edit module';

  return (
    <>
      {editModal && (
        <div className="modal-backdrop" role="presentation">
          <div
            className="modal-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="module-modal-title"
          >
            <div className="modal-dialog-header">
              <h2 id="module-modal-title" className="modal-dialog-title">
                {modalTitle}
              </h2>
              <button type="button" className="modal-dialog-close" onClick={closeModal} aria-label="Close dialog">
                ×
              </button>
            </div>
            <form
              className="project-create-form"
              onSubmit={(e) => {
                e.preventDefault();
                applyModal();
              }}
            >
              <div className="project-create-panel form-stack">
                <div className="form-field">
                  <label className="form-field__label" htmlFor="module-code">
                    Code <span className="form-field__required">*</span>
                  </label>
                  <input
                    id="module-code"
                    type="text"
                    className="form-field__input ui-input"
                    value={editModal.draft.code}
                    onChange={(e) => setDraft({ code: e.target.value.toUpperCase() })}
                    placeholder="e.g. CK"
                    maxLength={12}
                    disabled={saving}
                    autoComplete="off"
                  />
                  <p className="form-field__hint" style={{ margin: '0.35rem 0 0', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                    Used in ticket / backlog refs (e.g. eT-CK-0164). Letters and numbers only.
                  </p>
                </div>
                <div className="form-field">
                  <label className="form-field__label" htmlFor="module-label">
                    Label <span className="form-field__required">*</span>
                  </label>
                  <input
                    id="module-label"
                    type="text"
                    className="form-field__input ui-input"
                    value={editModal.draft.label}
                    onChange={(e) => setDraft({ label: e.target.value })}
                    placeholder="e.g. Cukai"
                    maxLength={120}
                    disabled={saving}
                  />
                </div>
                {modalErr && <div className="form-field__error">{modalErr}</div>}
              </div>
              <div className="project-create-footer">
                {!editModal.isNew && rows.length > 1 && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ color: 'var(--danger)' }}
                    onClick={removeInModal}
                    disabled={saving}
                  >
                    Remove
                  </button>
                )}
                <button type="submit" className="btn btn-primary project-create-footer__primary" disabled={saving}>
                  {saving ? 'Saving…' : editModal.isNew ? 'Add' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="settings-locations-form">
        <div className="settings-panel ui-card">
          <div className="settings-panel__header">
            <div className="settings-panel__header-text">
              <h2 className="settings-panel__title">Modules</h2>
              <p className="settings-panel__desc">
                Module codes appear in Helpdesk and Backlog forms, and in ticket / backlog reference prefixes.
              </p>
            </div>
          </div>

          <div className="settings-panel__body">
            {msg && <p className="settings-alert settings-alert--ok" role="status">{msg}</p>}

            <div className="settings-locations-toolbar">
              <p className="settings-locations-meta">
                {rows.length} module{rows.length === 1 ? '' : 's'}
              </p>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={resetDefaults}
                  disabled={saving}
                >
                  Reset defaults
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={openAdd}
                  disabled={saving}
                >
                  + Add module
                </button>
              </div>
            </div>

            <div className="locations-list">
              <div className="locations-list-head" aria-hidden="true">
                <div className="locations-list-name">Code</div>
                <div className="locations-list-km">Label</div>
                <div className="locations-list-actions">Action</div>
              </div>
              {rows.map((row, index) => (
                <div key={`${row.code}-${index}`} className="locations-list-row">
                  <div className="locations-list-name"><strong>{row.code}</strong></div>
                  <div className="locations-list-km">{row.label}</div>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm locations-list-edit"
                    onClick={() => openEdit(index)}
                    disabled={saving}
                  >
                    Edit
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
