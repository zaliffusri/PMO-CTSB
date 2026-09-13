import { describe, it, expect } from 'vitest';
import { normalizeProjectShortCode, suggestProjectShortCode } from '../lib/projectShortCode.js';

describe('projectShortCode', () => {
  it('normalizes to uppercase alphanumeric', () => {
    expect(normalizeProjectShortCode(' pkpj-01 ')).toBe('PKPJ01');
    expect(normalizeProjectShortCode('mbip')).toBe('MBIP');
  });

  it('suggests from first token when short', () => {
    expect(suggestProjectShortCode('PKPJ Implementation')).toBe('PKPJ');
    expect(suggestProjectShortCode('MBIP')).toBe('MBIP');
  });

  it('falls back to initials for long multi-word names', () => {
    expect(suggestProjectShortCode('Digital Portal Rollout Phase')).toMatch(/^[A-Z]{2,8}$/);
  });
});
