import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../../api';
import { btnPrimary, btnSecondary, btnSecondarySm, card, inputStyle, mapApiToForm } from './settingsStyles';

const cardFullWidth = {
  ...card,
  width: '100%',
  maxWidth: '100%',
  boxSizing: 'border-box',
};

export default function SettingsLocations() {
  const { form, setForm } = useOutletContext();
  const [saving, setSaving] = useState(false);
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
  }, [form.activity_locations_text]);

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
    try {
      setSaving(true);
      setMsg('');
      const s = await api.settings.update({
        activity_locations,
        mileage_from_office_km,
      });
      setForm(mapApiToForm(s));
      setMsg('Saved.');
      return { ok: true };
    } catch (e2) {
      return { ok: false, err: e2.message || 'Save failed' };
    } finally {
      setSaving(false);
    }
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

  const modalTitle = editModal?.isNew ? 'Add location' : 'Edit location';

  return (
    <>
      {editModal && (
        <div className="modal-backdrop" onClick={closeModal} role="presentation">
          <div
            className="modal-dialog"
            onClick={(e) => e.stopPropagation()}
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
            <div style={{ display: 'grid', gap: '0.75rem' }}>
              <label>
                Site name <span style={{ color: 'var(--danger)' }}>*</span>
                <input
                  type="text"
                  value={editModal.draft.name}
                  onChange={(e) => setDraft({ name: e.target.value })}
                  placeholder="e.g. Site Alpha"
                  style={inputStyle}
                  disabled={saving}
                />
              </label>
              <label>
                Distance from {form.reference_office_name || 'reference office'} (km)
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={editModal.draft.km}
                  onChange={(e) => setDraft({ km: e.target.value })}
                  placeholder="Optional"
                  style={inputStyle}
                  disabled={saving}
                />
              </label>
              {modalErr && <div style={{ color: 'var(--danger)', fontSize: '0.9rem' }}>{modalErr}</div>}
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                <button type="button" style={btnPrimary} onClick={applyModal} disabled={saving}>
                  {saving ? 'Saving…' : editModal.isNew ? 'Add' : 'Save'}
                </button>
                <button type="button" style={btnSecondarySm} onClick={closeModal} disabled={saving}>
                  Cancel
                </button>
                {!editModal.isNew && rows.length > 1 && (
                  <button
                    type="button"
                    style={{ ...btnSecondarySm, color: 'var(--danger)', borderColor: 'var(--border)' }}
                    onClick={removeInModal}
                    disabled={saving}
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div
        className="settings-locations-form"
        style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', width: '100%', maxWidth: '100%' }}
      >
        <div style={cardFullWidth}>
          <h2 style={{ margin: '0 0 0.75rem', fontSize: 'clamp(1rem, 2.5vw, 1.1rem)' }}>Activity locations</h2>
          <p
            style={{
              margin: '0 0 1rem',
              color: 'var(--text-muted)',
              fontSize: 'clamp(0.85rem, 2vw, 0.9rem)',
              lineHeight: 1.5,
              maxWidth: 70ch,
            }}
          >
            Sites appear in Calendar when logging activities (with <strong>Others</strong> for custom text). Distances
            are in kilometres from <strong>{form.reference_office_name || 'the reference office'}</strong> (General
            settings). Changes apply when you save in the dialog.
          </p>
          <div className="locations-list" style={{ marginBottom: '0.5rem' }}>
            {rows.map((row, index) => (
              <div key={index} className="locations-list-row">
                <div className="locations-list-name">{row.name.trim() || '—'}</div>
                <div className="locations-list-km">{formatKm(row.km)}</div>
                <button
                  type="button"
                  className="locations-list-edit"
                  style={btnSecondarySm}
                  onClick={() => openEdit(index)}
                  disabled={saving}
                >
                  Edit
                </button>
              </div>
            ))}
          </div>
          <button type="button" style={btnSecondary} onClick={openAdd} disabled={saving}>
            + Add location
          </button>
        </div>

        {msg && <div style={{ color: 'var(--success)' }}>{msg}</div>}
      </div>
    </>
  );
}
