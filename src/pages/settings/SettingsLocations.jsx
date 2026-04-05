import { useState, useMemo, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../../api';
import { btnPrimary, btnSecondary, btnSecondarySm, card, inputStyle, mapApiToForm } from './settingsStyles';

const listRow = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.75rem',
  padding: '0.65rem 0',
  borderBottom: '1px solid var(--border)',
};

const listRowLast = {
  ...listRow,
  borderBottom: 'none',
};

export default function SettingsLocations() {
  const { form, setForm, reload } = useOutletContext();
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
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

  const locationLines = useMemo(
    () => rows.map((r) => r.name.trim()).filter(Boolean),
    [rows]
  );

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

  const applyModal = () => {
    if (!editModal) return;
    const name = editModal.draft.name.trim();
    if (!name) {
      setModalErr('Site name is required.');
      return;
    }
    const km = editModal.draft.km;
    if (editModal.isNew) {
      setRows((prev) => [...prev, { name, km }]);
    } else {
      const i = editModal.index;
      setRows((prev) => prev.map((r, j) => (j === i ? { name, km } : r)));
    }
    closeModal();
  };

  const removeInModal = () => {
    if (!editModal || editModal.isNew) return;
    if (rows.length <= 1) return;
    const i = editModal.index;
    setRows((prev) => prev.filter((_, j) => j !== i));
    closeModal();
  };

  const formatKm = (km) => {
    if (km === '' || km === undefined) return '—';
    const n = Number(km);
    if (!Number.isFinite(n) || n < 0) return '—';
    return `${n} km`;
  };

  const save = async (e) => {
    e.preventDefault();
    setMsg('');
    setErr('');
    const activity_locations = locationLines;
    if (activity_locations.length === 0) {
      setErr('Add at least one activity location.');
      return;
    }
    const mileage_from_office_km = {};
    for (const r of rows) {
      const loc = r.name.trim();
      if (!loc) continue;
      const n = r.km === '' || r.km === undefined ? 0 : Number(r.km);
      mileage_from_office_km[loc] = Number.isFinite(n) && n >= 0 ? n : 0;
    }
    try {
      setSaving(true);
      const s = await api.settings.update({
        activity_locations,
        mileage_from_office_km,
      });
      setForm(mapApiToForm(s));
      setMsg('Location settings saved.');
    } catch (e2) {
      setErr(e2.message || 'Save failed');
    } finally {
      setSaving(false);
    }
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
                />
              </label>
              {modalErr && <div style={{ color: 'var(--danger)', fontSize: '0.9rem' }}>{modalErr}</div>}
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                <button type="button" style={btnPrimary} onClick={applyModal}>
                  {editModal.isNew ? 'Add' : 'Save'}
                </button>
                <button type="button" style={btnSecondarySm} onClick={closeModal}>
                  Cancel
                </button>
                {!editModal.isNew && rows.length > 1 && (
                  <button
                    type="button"
                    style={{ ...btnSecondarySm, color: 'var(--danger)', borderColor: 'var(--border)' }}
                    onClick={removeInModal}
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div style={card}>
          <h2 style={{ margin: '0 0 0.75rem', fontSize: '1.1rem' }}>Activity locations</h2>
          <p style={{ margin: '0 0 1rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            Sites appear in Calendar when logging activities (with <strong>Others</strong> for custom text). Distances
            are in kilometres from <strong>{form.reference_office_name || 'the reference office'}</strong> (General
            settings).
          </p>
          <div style={{ marginBottom: '0.5rem' }}>
            {rows.map((row, index) => (
              <div key={index} style={index === rows.length - 1 ? listRowLast : listRow}>
                <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{row.name.trim() || '—'}</div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                    {formatKm(row.km)}
                  </div>
                </div>
                <button type="button" style={{ ...btnSecondarySm, flexShrink: 0 }} onClick={() => openEdit(index)}>
                  Edit
                </button>
              </div>
            ))}
          </div>
          <button type="button" style={btnSecondary} onClick={openAdd}>
            + Add location
          </button>
        </div>

        {err && <div style={{ color: 'var(--danger)' }}>{err}</div>}
        {msg && <div style={{ color: 'var(--success)' }}>{msg}</div>}

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button type="submit" style={btnPrimary} disabled={saving}>
            {saving ? 'Saving…' : 'Save locations'}
          </button>
          <button type="button" style={btnSecondary} onClick={() => reload()} disabled={saving}>
            Reload
          </button>
        </div>
      </form>
    </>
  );
}
