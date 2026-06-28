export { btnPrimary, btnSecondary, btnSecondarySm, card, inputStyle } from '../../styles/commonStyles';
export const labelMuted = { color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.35rem' };

export function mapApiToForm(s) {
  return {
    activity_locations_text: (s.activity_locations || []).join('\n'),
    reference_office_name: s.reference_office_name || '',
    general_notes: s.general_notes || '',
    currency_code: s.currency_code || 'MYR',
    mileage_from_office_km: { ...(s.mileage_from_office_km || {}) },
    org_display_name: s.org_display_name || 'PMO CTSB',
    org_tagline: s.org_tagline || '',
    org_logo_url: s.org_logo_url || null,
    org_banner_url: s.org_banner_url || null,
  };
}
