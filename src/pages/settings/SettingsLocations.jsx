import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../../api';
import { useSubmitLock } from '../../hooks/useSubmitLock';
import { mapApiToForm } from './settingsStyles';

export default function SettingsLocations() {
  const { form, setForm } = useOutletContext();
  const { pending: saving, run } = useSubmitLock();
  const [msg, setMsg] = useState('');
  /** One row per site: name + optional km from reference office */
  const [rows, setRows] = useState([{ name: '', km: '' }]);
  /** null | { draft, index } | { draft, isNew: true } */
  const [editModal, setEditModal] = useState(null);
  const [modalErr, setModalErr] = useState('');

  useEffect(() => {
    if (!form) return;
    const parsed = (form.activity_locations_text || '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    const mileage = form.mileage_from_office_km || {};
    setRows(
      parsed.length
        ? parsed.map((name) => ({
            name,
            km:
              mileage[name] !== undefined && mileage[name] !== ''
                ? String(mileage[name])
                : '',
          }))
        : [{ name: '', km: '' }]
    );
  }, [form?.activity_locations_text, form?.mileage_from_office_km]);

  if (!form) return null;

  const closeModal = () => {
    setEditModal(null);
    setModalErr('');
  };

  const openEdit = (index) => {
    const r = rows[index];
    setModalErr('');
    setEditModal({ draft: { name: r.name, km: r.km }, index });
  };

  const openAdd = () => {
    setModalErr('');
    setEditModal({ draft: { name: '', km: '' }, isNew: true });
  };

  const setDraft = (patch) => {
    setEditModal((m) => (m ? { ...m, draft: { ...m.draft, ...patch } } : m));
  };

  const persistRows = async (nextRows) => {
    const activity_locations = nextRows.map((r) => r.name.trim()).filter(Boolean);
    if (activity_locations.length === 0) {
      return { ok: false, err: 'Add at least one activity location.' };
    }
    const mileage_from_office_km = {};
    for (const r of nextRows) {
      const loc = r.name.trim();
      if (!loc) continue;
      const n = r.km === '' || r.km === undefined ? 0 : Number(r.km);
      mileage_from_office_km[loc] = Number.isFinite(n) && n >= 0 ? n : 0;
    }
    return run(async () => {
      try {
        setMsg('');
        const s = await api.settings.update({
          activity_locations,
          mileage_from_office_km,
        });
        setForm(mapApiToForm(s));
        setMsg('Locations saved.');
        return { ok: true };
      } catch (e2) {
        return { ok: false, err: e2.message || 'Save failed' };
      }
    });
  };

  const applyModal = async () => {
    if (!editModal) return;
    const name = editModal.draft.name.trim();
    if (!name) {
      setModalErr('Site name is required.');
      return;
    }
    const km = editModal.draft.km;
    const nextRows = editModal.isNew
      ? [...rows, { name, km }]
      : rows.map((r, j) => (j === editModal.index ? { name, km } : r));

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
    if (rows.length <= 1) return;
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

  const formatKm = (km) => {
    if (km === '' || km === undefined) return '—';
    const n = Number(km);
    if (!Number.isFinite(n) || n < 0) return '—';
    return `${n} km`;
  };

  const locationCount = rows.filter((r) => r.name.trim()).length;
  const modalTitle = editModal?.isNew ? 'Add location' : 'Edit location';
  const officeName = form.reference_office_name || 'reference office';

  return (
    <>
      {editModal && (
        <div className="modal-backdrop" role="presentation">
          <div
            className="modal-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="location-modal-title"
          >
            <div className="modal-dialog-header">
              <h2 id="location-modal-title" className="modal-dialog-title">
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
                  <label className="form-field__label" htmlFor="location-name">
                    Site name <span className="form-field__required">*</span>
                  </label>
                  <input
                    id="location-name"
                    type="text"
                    className="form-field__input ui-input"
                    value={editModal.draft.name}
                    onChange={(e) => setDraft({ name: e.target.value })}
                    placeholder="e.g. Site Alpha"
                    disabled={saving}
                  />
                </div>
                <div className="form-field">
                  <label className="form-field__label" htmlFor="location-km">
                    Distance from {officeName} (km)
                  </label>
                  <input
                    id="location-km"
                    type="number"
                    min={0}
                    step={0.1}
                    className="form-field__input ui-input"
                    value={editModal.draft.km}
                    onChange={(e) => setDraft({ km: e.target.value })}
                    placeholder="Optional"
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
              <h2 className="settings-panel__title">Activity locations</h2>
              <p className="settings-panel__desc">
                Sites appear in Calendar when logging activities (with Others for custom text). Distances are in
                kilometres from <strong>{officeName}</strong>.
              </p>
            </div>
          </div>

          <div className="settings-panel__body">
            {msg && <p className="settings-alert settings-alert--ok" role="status">{msg}</p>}

            <div className="settings-locations-toolbar">
              <p className="settings-locations-meta">
                {locationCount} location{locationCount === 1 ? '' : 's'}
              </p>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={openAdd}
                disabled={saving}
              >
                + Add location
              </button>
            </div>

            <div className="locations-list">
              <div className="locations-list-head" aria-hidden="true">
                <div className="locations-list-name">Site</div>
                <div className="locations-list-km">Distance</div>
                <div className="locations-list-actions">Action</div>
              </div>
              {rows.map((row, index) => (
                <div key={`${row.name}-${index}`} className="locations-list-row">
                  <div className="locations-list-name">{row.name.trim() || '—'}</div>
                  <div className="locations-list-km">{formatKm(row.km)}</div>
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
