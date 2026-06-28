/** Shared layout + form tokens. Prefer className helpers where noted for the design system. */

export const cardClass = 'ui-card';

export const card = {
  background: 'var(--surface)',
  borderRadius: 'var(--radius)',
  padding: 'var(--space-5)',
  border: '1px solid var(--border)',
  boxShadow: 'var(--shadow-sm)',
};

export const inputClass = 'ui-input';

export const inputStyle = {
  display: 'block',
  width: '100%',
  padding: '0.625rem 0.875rem',
  marginTop: '0.35rem',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border)',
  background: 'var(--surface-elevated)',
  color: 'var(--text)',
  fontSize: '0.9375rem',
  lineHeight: 1.4,
  transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
};

export const btnPrimaryClass = 'btn btn-primary';
export const btnSecondaryClass = 'btn btn-secondary';
export const btnGhostClass = 'btn btn-ghost';

export const btnPrimary = {
  padding: '0.625rem 1.125rem',
  background: 'var(--accent)',
  color: '#fff',
  border: 'none',
  borderRadius: 'var(--radius-sm)',
  fontWeight: 600,
  fontSize: '0.9375rem',
  boxShadow: 'var(--shadow-xs)',
};

export const btnSecondary = {
  padding: '0.625rem 1.125rem',
  background: 'var(--surface)',
  color: 'var(--text)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  fontWeight: 600,
  fontSize: '0.9375rem',
};

export const btnSecondarySm = {
  ...btnSecondary,
  padding: '0.4rem 0.75rem',
  fontSize: '0.8125rem',
};

export const thStyle = {
  padding: '0.75rem 1rem',
  color: 'var(--text-muted)',
  fontWeight: 600,
  fontSize: '0.75rem',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

export const tdStyle = {
  padding: '0.85rem 1rem',
  fontSize: '0.9rem',
};
