/** Format elapsed minutes as "1h 12m" / "45m" / "0m". */
export function formatElapsedMinutes(minutes) {
  const m = Math.max(0, Math.floor(Number(minutes) || 0));
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h <= 0) return `${rem}m`;
  if (rem === 0) return `${h}h`;
  return `${h}h ${rem}m`;
}

/** Live elapsed minutes from a session started_at ISO string. */
export function liveElapsedMinutes(startedAt, nowMs = Date.now()) {
  const start = new Date(startedAt).getTime();
  if (!Number.isFinite(start)) return 0;
  return Math.max(0, Math.floor((nowMs - start) / 60000));
}
