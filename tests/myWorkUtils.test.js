import { describe, it, expect } from 'vitest';
import { resolveMyPerson, taskDueMeta, sortWorkItems } from '../lib/myWorkUtils.js';

describe('myWorkUtils', () => {
  const people = [{ id: 5, name: 'Ahmad Rizal', email: 'ahmad@company.com' }];

  it('resolves person by email', () => {
    const p = resolveMyPerson(people, { name: 'X', email: 'ahmad@company.com' });
    expect(p?.id).toBe(5);
  });

  it('detects overdue tasks', () => {
    const meta = taskDueMeta({
      status: 'ongoing',
      planned_end_date: '2020-01-01',
    });
    expect(meta.tone).toBe('danger');
  });

  it('sorts by urgency score', () => {
    const sorted = sortWorkItems([
      { id: 'a', urgencyScore: 10 },
      { id: 'b', urgencyScore: 90 },
    ], 'urgency');
    expect(sorted[0].id).toBe('b');
  });
});
