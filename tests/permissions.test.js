import { describe, it, expect } from 'vitest';
import {
  canCreateProject,
  canViewFinance,
  canAssignIssues,
} from '../lib/permissions.js';

describe('permissions', () => {
  it('allows admin and pmo to create projects', () => {
    expect(canCreateProject({ role: 'admin' })).toBe(true);
    expect(canCreateProject({ role: 'pmo' })).toBe(true);
    expect(canCreateProject({ role: 'user' })).toBe(false);
  });

  it('allows finance to view finance', () => {
    expect(canViewFinance({ role: 'finance' })).toBe(true);
    expect(canViewFinance({ role: 'user' })).toBe(false);
  });

  it('allows pmo to assign issues', () => {
    expect(canAssignIssues({ role: 'pmo' })).toBe(true);
    expect(canAssignIssues({ role: 'user' })).toBe(false);
  });
});
