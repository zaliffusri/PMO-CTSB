import { useState, useMemo, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../../api';
import { card, inputStyle, btnPrimary, btnSecondary, mapApiToForm } from './settingsStyles';

const btnRemove = {
  ...btnSecondary,
  padding: '0.45rem 0.75rem',
  fontSize: '0.85rem',
  color: 'var(--danger)',
  borderColor: 'var(--border)',
  flexShrink: 0,
};

export default function SettingsLocations() {
  const { form, setForm, reload } = useOutletContext();
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  /** One row per site: name + optional km from reference office */
  const [rows, setRows] = useState([{ name: '', km: '' }]);

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

  const addRow = () => setRows((prev) => [...prev, { name: '', km: '' }]);

  const updateRowName = (index, value) => {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, name: value } : r)));
  };

  const updateRowKm = (index, value) => {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, km: value } : r)));
  };

  const removeRow = (index) => {
    setRows((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, i) => i !== index);
    });
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

  return (
    <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={card}>
        <h2 style={{ margin: '0 0 0.75rem', fontSize: '1.1rem' }}>Activity locations</h2>
        <p style={{ margin: '0 0 1rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          Each row is a site name and optional distance in kilometres from{' '}
          <strong>{form.reference_office_name || 'the reference office'}</strong> (set under General). These names
          appear in Calendar when logging activities, together with <strong>Others</strong> for custom text.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {rows.map((row, index) => (
            <div
              key={index}
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '0.5rem',
                alignItems: 'flex-start',
              }}
            >
              <label style={{ flex: '1 1 160px', minWidth: 0, margin: 0 }}>
                <input
                  type="text"
                  value={row.name}
                  onChange={(e) => updateRowName(index, e.target.value)}
                  placeholder={`Site name ${index + 1}`}
                  aria-label={`Location ${index + 1} name`}
                  style={{ ...inputStyle, marginTop: 0 }}
                />
              </label>
              <label
                style={{
                  flex: '0 1 110px',
                  minWidth: 88,
                  margin: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.2rem',
                }}
              >
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>km</span>
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={row.km}
                  onChange={(e) => updateRowKm(index, e.target.value)}
                  placeholder="—"
                  aria-label={`Distance to location ${index + 1} in km`}
                  style={{ ...inputStyle, marginTop: 0 }}
                />
              </label>
              <button
                type="button"
                style={{ ...btnRemove, alignSelf: 'flex-end' }}
                onClick={() => removeRow(index)}
                disabled={rows.length <= 1}
                title={rows.length <= 1 ? 'Keep at least one row' : 'Remove this location'}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        <button type="button" style={{ ...btnSecondary, marginTop: '0.75rem' }} onClick={addRow}>
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
  );
}
