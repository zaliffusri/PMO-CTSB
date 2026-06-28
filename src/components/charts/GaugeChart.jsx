function point(cx, cy, r, theta) {
  return { x: cx + r * Math.cos(theta), y: cy + r * Math.sin(theta) };
}

function semiArc(cx, cy, r, startTheta, endTheta) {
  const start = point(cx, cy, r, startTheta);
  const end = point(cx, cy, r, endTheta);
  const sweep = endTheta - startTheta;
  const large = sweep > Math.PI ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 1 ${end.x} ${end.y}`;
}

export default function GaugeChart({ value = 0, label = 'Completion', size = 140 }) {
  const clamped = Math.min(100, Math.max(0, value));
  const cx = size / 2;
  const cy = size * 0.55;
  const r = size * 0.36;
  const stroke = size * 0.1;
  const h = size * 0.58;

  const color = clamped >= 70 ? 'var(--success)' : clamped >= 40 ? 'var(--warning)' : 'var(--danger)';
  const start = Math.PI;
  const end = Math.PI + (clamped / 100) * Math.PI;

  return (
    <div className="gauge-chart" style={{ width: size }}>
      <svg width={size} height={h} viewBox={`0 0 ${size} ${h}`} role="img" aria-label={`${label}: ${clamped}%`}>
        <path
          d={semiArc(cx, cy, r, Math.PI, 2 * Math.PI)}
          fill="none"
          stroke="var(--border)"
          strokeWidth={stroke}
          strokeLinecap="round"
        />
        {clamped > 0 && (
          <path
            d={semiArc(cx, cy, r, start, end)}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
          />
        )}
      </svg>
      <div className="gauge-chart__readout">
        <span className="gauge-chart__value">{clamped}%</span>
        <span className="gauge-chart__label">{label}</span>
      </div>
    </div>
  );
}
