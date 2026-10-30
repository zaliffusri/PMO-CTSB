import { describe, it, expect } from 'vitest';
import { formatElapsedMinutes, liveElapsedMinutes } from '../src/utils/timeSessionUi.js';

describe('timeSessionUi', () => {
  it('formats elapsed minutes', () => {
    expect(formatElapsedMinutes(0)).toBe('0m');
    expect(formatElapsedMinutes(45)).toBe('45m');
    expect(formatElapsedMinutes(60)).toBe('1h');
    expect(formatElapsedMinutes(75)).toBe('1h 15m');
  });

  it('computes live elapsed from started_at', () => {
    const started = new Date(Date.now() - 90 * 60 * 1000).toISOString();
    const mins = liveElapsedMinutes(started);
    expect(mins).toBeGreaterThanOrEqual(89);
    expect(mins).toBeLessThanOrEqual(91);
  });
});
