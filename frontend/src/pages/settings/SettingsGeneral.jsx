import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../../api';
import { card, inputStyle, btnPrimary, btnSecondary, labelMuted, mapApiToForm } from './settingsStyles';

export default function SettingsGeneral() {
  const { form, setForm, reload } = useOutletContext();
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  if (!form) return null;

  const save = async (e) => {
    e.preventDefault();
    setMsg('');
    setErr('');
    try {
      setSaving(true);
      const s = await api.settings.update({
        reference_office_name: form.reference_office_name.trim() || undefined,
        general_notes: form.general_notes,
        currency_code: form.currency_code.trim() || 'MYR',
      });
      setForm(mapApiToForm(s));
      setMsg('General settings saved.');
    } catch (e2) {
      setErr(e2.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={card}>
        <h2 style={{ margin: '0 0 0.75rem', fontSize: '1.1rem' }}>General</h2>
        <p style={{ margin: '0 0 1rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          Reference office, currency, and internal notes. Location site lists and mileage are under <strong>Locations</strong>.
        </p>
        <label>
          Reference office name
          <input
            type="text"
            value={form.reference_office_name}
            onChange={(e) => setForm((f) => ({ ...f, reference_office_name: e.target.value }))}
            placeholder="e.g. JB Office"
            style={inputStyle}
          />
        </label>
        <p style={labelMuted}>Used as the label for mileage distances (distance from this office to each site).</p>
        <label style={{ marginTop: '0.75rem' }}>
          Currency code
          <input
            type="text"
            value={form.currency_code}
            onChange={(e) => setForm((f) => ({ ...f, currency_code: e.target.value }))}
            placeholder="MYR"
            maxLength={8}
            style={{ ...inputStyle, maxWidth: 120 }}
          />
        </label>
        <label style={{ marginTop: '0.75rem' }}>
          General notes
          <textarea
            value={form.general_notes}
            onChange={(e) => setForm((f) => ({ ...f, general_notes: e.target.value }))}
            rows={4}
            placeholder="Internal notes (policies, reminders)…"
            style={inputStyle}
          />
        </label>
      </div>

      {err && <div style={{ color: 'var(--danger)' }}>{err}</div>}
      {msg && <div style={{ color: 'var(--success)' }}>{msg}</div>}

      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <button type="submit" style={btnPrimary} disabled={saving}>
          {saving ? 'Saving…' : 'Save general'}
        </button>
        <button type="button" style={btnSecondary} onClick={() => reload()} disabled={saving}>
          Reload
        </button>
      </div>
    </form>
  );
}
