import { describe, it, expect } from 'vitest';
import { buildPromotedTaskFields } from '../lib/backlogPromoteFields.js';

describe('buildPromotedTaskFields', () => {
  it('copies backlog hours and sets visible plan dates', () => {
    const fields = buildPromotedTaskFields({
      id: 42,
      project_id: 7,
      title: 'Data mismatch in consolidated report',
      status: 'fixed',
      assignee_person_id: 3,
      work_package_id: 9,
      estimated_hours: 20,
      actual_hours: 16,
    });
    expect(fields.name).toBe('Data mismatch in consolidated report');
    expect(fields.backlog_id).toBe(42);
    expect(fields.assignee_id).toBe(3);
    expect(fields.estimated_hours).toBe(20);
    expect(fields.actual_hours).toBe(16);
    expect(fields.status).toBe('ongoing');
    expect(fields.progress_percent).toBe(90);
    expect(fields.planned_start_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(fields.planned_end_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(fields.actual_start_date).toBe(fields.planned_start_date);
  });

  it('keeps open items as new with a default 5-day window', () => {
    const fields = buildPromotedTaskFields({
      id: 1,
      project_id: 2,
      title: 'Inquiry only',
      status: 'open',
    });
    expect(fields.status).toBe('new');
    expect(fields.progress_percent).toBe(0);
    expect(fields.actual_start_date).toBeNull();
  });
});
