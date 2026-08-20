import { describe, it, expect } from 'vitest';

/**
 * Mirrors routes/activities.js parseActivityRangeFilter overlap contract used by SQL RPC.
 */
function parseActivityRangeFilter(fromRaw, toRaw) {
  if (fromRaw == null || toRaw == null || fromRaw === '' || toRaw === '') return null;
  const fromStr = String(fromRaw).trim();
  const toStr = String(toRaw).trim();
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/;
  if (dateOnly.test(fromStr) && dateOnly.test(toStr)) {
    const [fy, fm, fd] = fromStr.split('-').map(Number);
    const [ty, tm, td] = toStr.split('-').map(Number);
    const fromMs = Date.UTC(fy, fm - 1, fd, 0, 0, 0, 0);
    const end = new Date(Date.UTC(ty, tm - 1, td));
    end.setUTCDate(end.getUTCDate() + 1);
    const toExclusive = end.getTime();
    if (toExclusive <= fromMs) return null;
    return { fromMs, toExclusive };
  }
  const fromMs = Date.parse(fromStr);
  const toExclusive = Date.parse(toStr);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toExclusive)) return null;
  if (toExclusive <= fromMs) return null;
  return { fromMs, toExclusive };
}

function overlaps(row, fromMs, toExclusive) {
  const s = new Date(row.start_at).getTime();
  const e = new Date(row.end_at).getTime();
  return s < toExclusive && e > fromMs;
}

describe('activities range overlap (GET filter contract)', () => {
  it('parses ISO exclusive end like calendar month query', () => {
    const range = parseActivityRangeFilter(
      '2026-07-31T16:00:00.000Z',
      '2026-08-31T16:00:00.000Z',
    );
    expect(range).toBeTruthy();
    expect(range.toExclusive).toBeGreaterThan(range.fromMs);
  });

  it('includes activities that overlap the window', () => {
    const range = parseActivityRangeFilter(
      '2026-07-31T16:00:00.000Z',
      '2026-08-31T16:00:00.000Z',
    );
    const mid = { start_at: '2026-08-15T02:00:00.000Z', end_at: '2026-08-15T04:00:00.000Z' };
    const before = { start_at: '2026-07-01T00:00:00.000Z', end_at: '2026-07-02T00:00:00.000Z' };
    const after = { start_at: '2026-09-01T00:00:00.000Z', end_at: '2026-09-02T00:00:00.000Z' };
    expect(overlaps(mid, range.fromMs, range.toExclusive)).toBe(true);
    expect(overlaps(before, range.fromMs, range.toExclusive)).toBe(false);
    expect(overlaps(after, range.fromMs, range.toExclusive)).toBe(false);
  });
});
