import { describe, it, expect } from 'vitest';
import { buildEotUpdate, daysBetween, eotSummary, parseEotLog } from '../lib/projectEot.js';

describe('projectEot', () => {
  it('parses eot log', () => {
    expect(parseEotLog(null)).toEqual([]);
    expect(parseEotLog('[{"id":"a"}]')).toEqual([{ id: 'a' }]);
  });

  it('computes days between dates', () => {
    expect(daysBetween('2026-01-01', '2026-01-31')).toBe(30);
  });

  it('builds EOT update and locks baseline', () => {
    const result = buildEotUpdate(
      { id: 1, name: 'Demo', end_date: '2026-06-30', eot_log: [] },
      { new_end_date: '2026-07-30', reason: 'Client delay', approved_by: 'Ali', actorName: 'Admin' },
    );
    expect(result.error).toBeUndefined();
    expect(result.patch.baseline_end_date).toBe('2026-06-30');
    expect(result.patch.end_date).toBe('2026-07-30');
    expect(result.entry.days_added).toBe(30);
    expect(result.patch.eot_log).toHaveLength(1);
  });

  it('rejects end date not after current', () => {
    const result = buildEotUpdate(
      { end_date: '2026-06-30' },
      { new_end_date: '2026-06-01', reason: 'x' },
    );
    expect(result.error).toMatch(/after/i);
  });

  it('summarises extensions', () => {
    const summary = eotSummary({
      baseline_end_date: '2026-01-01',
      end_date: '2026-03-01',
      eot_log: [
        { days_added: 30 },
        { days_added: 15 },
      ],
    });
    expect(summary.eot_count).toBe(2);
    expect(summary.total_days_added).toBe(45);
    expect(summary.is_extended).toBe(true);
  });
});
