import { describe, it, expect } from 'vitest';
import { computeProjectHealth, deadlineSummary } from '../lib/pmoMetrics.js';

describe('pmoMetrics', () => {
  it('flags overdue tasks as at_risk', () => {
    const project = { id: 1, status: 'active', end_date: '2099-01-01' };
    const tasks = [{
      id: 1,
      project_id: 1,
      task_kind: 'task',
      status: 'new',
      progress_percent: 0,
      planned_end_date: '2020-01-01',
    }];
    const h = computeProjectHealth(project, tasks);
    expect(h.health).toBe('at_risk');
    expect(h.overdueTasks).toBe(1);
  });

  it('summarizes deadline tone', () => {
    const past = deadlineSummary('2020-01-01');
    expect(past?.tone).toBe('danger');
  });
});
