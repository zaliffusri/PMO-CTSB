import { useState, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../../api';
import { card, inputStyle, btnPrimary, btnSecondary, mapApiToForm } from './settingsStyles';

export default function SettingsLocations() {
  const { form, setForm, reload } = useOutletContext();
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const locationLines = useMemo(
    () =>
      (form?.activity_locations_text || '')
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean),
    [form?.activity_locations_text],
  );

  if (!form) return null;

  const setMileage = (locationName, value) => {
    const n = value === '' ? '' : Number(value);
    setForm((f) => ({
      ...f,
      mileage_from_office_km: {
        ...f.mileage_from_office_km,
        [locationName]: Number.isFinite(n) && n >= 0 ? n : 0,
      },
    }));
  };

  const save = async (e) => {
    e.preventDefault();
    setMsg('');
    setErr('');
    const activity_locations = locationLines;
    if (activity_locations.length === 0) {
      setErr('Add at least one activity location (one per line).');
      return;
    }
    const mileage_from_office_km = {};
    for (const loc of activity_locations) {
      const v = form.mileage_from_office_km[loc];
      const n = v === '' || v === undefined ? 0 : Number(v);
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
        <p style={{ margin: '0 0 0.5rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          One site per line. These names appear in Calendar when logging activities (together with <strong>Others</strong> for custom text).
        </p>
        <label>
          Site list *
          <textarea
            value={form.activity_locations_text}
            onChange={(e) => setForm((f) => ({ ...f, activity_locations_text: e.target.value }))}
            rows={12}
            required
            style={{ ...inputStyle, fontFamily: 'inherit' }}
          />
        </label>
      </div>

      <div style={card}>
        <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.1rem' }}>Mileage from reference office</h2>
        <p style={{ margin: '0 0 0.75rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          Optional distance in kilometres from <strong>{form.reference_office_name || 'the reference office'}</strong> (set under General) to each site.
        </p>
        {locationLines.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Add locations above to edit mileage.</p>
        ) : (
          <div style={{ display: 'grid', gap: '0.5rem', maxWidth: 480 }}>
            {locationLines.map((loc) => (
              <label key={loc} style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: '0.75rem', alignItems: 'center' }}>
                <span style={{ fontSize: '0.9rem' }}>{loc}</span>
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={form.mileage_from_office_km[loc] ?? ''}
                  onChange={(e) => setMileage(loc, e.target.value)}
                  placeholder="km"
                  style={inputStyle}
                />
              </label>
            ))}
          </div>
        )}
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
