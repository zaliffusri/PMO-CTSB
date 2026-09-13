/** Project short codes — unique identity for refs and display (e.g. PKPJ). */

export function normalizeProjectShortCode(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 16);
}

/**
 * Suggest a short code from the project name.
 * "PKPJ Implementation" → "PKPJ"; multi-word titles fall back to initials.
 */
export function suggestProjectShortCode(name) {
  const raw = String(name || '').trim();
  if (!raw) return '';
  const tokens = raw.split(/[\s/_-]+/).filter(Boolean);
  const first = normalizeProjectShortCode(tokens[0] || '');
  if (first.length >= 2 && first.length <= 12) return first;
  if (tokens.length >= 2) {
    const initials = tokens
      .map((w) => String(w).replace(/[^A-Za-z0-9]/g, '')[0] || '')
      .join('')
      .toUpperCase();
    if (initials.length >= 2) return initials.slice(0, 8);
  }
  return first.slice(0, 8);
}
