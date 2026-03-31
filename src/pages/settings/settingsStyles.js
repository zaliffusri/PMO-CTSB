export const card = {
  background: 'var(--surface)',
  borderRadius: 'var(--radius)',
  padding: '1.25rem',
  border: '1px solid var(--border)',
};
export const inputStyle = {
  display: 'block',
  width: '100%',
  padding: '0.5rem 0.75rem',
  marginTop: '0.25rem',
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'var(--bg)',
  color: 'var(--text)',
};
export const btnPrimary = {
  padding: '0.5rem 1rem',
  background: 'var(--accent)',
  color: 'white',
  border: 'none',
  borderRadius: 8,
  fontWeight: 600,
};
export const btnSecondary = {
  padding: '0.5rem 1rem',
  background: 'var(--surface-hover)',
  color: 'var(--text)',
  border: '1px solid var(--border)',
  borderRadius: 8,
};
export const labelMuted = { color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.35rem' };

export function mapApiToForm(s) {
  return {
    activity_locations_text: (s.activity_locations || []).join('\n'),
    reference_office_name: s.reference_office_name || '',
    general_notes: s.general_notes || '',
    currency_code: s.currency_code || 'MYR',
    mileage_from_office_km: { ...(s.mileage_from_office_km || {}) },
  };
}
