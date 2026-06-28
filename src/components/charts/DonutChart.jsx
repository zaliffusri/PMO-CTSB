import { useState } from 'react';

function polar(cx, cy, r, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx, cy, r, startAngle, endAngle) {
  const start = polar(cx, cy, r, endAngle);
  const end = polar(cx, cy, r, startAngle);
  const large = endAngle - startAngle <= 180 ? 0 : 1;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 0 ${end.x} ${end.y}`;
}

export default function DonutChart({
  data = [],
  size = 168,
  thickness = 26,
  centerLabel,
  centerValue,
  activeKey,
  onSegmentClick,
  interactive = false,
}) {
  const [hoverKey, setHoverKey] = useState(null);
  const total = data.reduce((s, d) => s + (d.value || 0), 0);
  if (!total) {
    return <p className="chart-empty">No data to chart yet.</p>;
  }

  const cx = size / 2;
  const cy = size / 2;
  const r = (size - thickness) / 2;
  let cursor = 0;

  const segments = data
    .filter((d) => d.value > 0)
    .map((d) => {
      const sweep = (d.value / total) * 360;
      const start = cursor;
      cursor += sweep;
      return { ...d, start, end: cursor, pct: Math.round((d.value / total) * 100) };
    });

  const focusKey = hoverKey || activeKey;
  const hovered = segments.find((s) => s.key === hoverKey);

  return (
    <div className={`donut-chart ${interactive ? 'donut-chart--interactive' : ''}`}>
      <div className="donut-chart__viz" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-hidden>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--border)" strokeWidth={thickness} />
          {segments.map((seg) => {
            const dimmed = focusKey && focusKey !== seg.key;
            const expanded = focusKey === seg.key;
            return (
              <path
                key={seg.key}
                d={arcPath(cx, cy, r, seg.start, seg.end)}
                fill="none"
                stroke={seg.color}
                strokeWidth={expanded ? thickness + 4 : thickness}
                strokeLinecap="butt"
                className={`donut-chart__segment ${dimmed ? 'donut-chart__segment--dim' : ''} ${expanded ? 'donut-chart__segment--active' : ''}`}
                style={{ cursor: interactive ? 'pointer' : undefined }}
                onMouseEnter={() => interactive && setHoverKey(seg.key)}
                onMouseLeave={() => interactive && setHoverKey(null)}
                onClick={() => interactive && onSegmentClick?.(seg)}
              />
            );
          })}
        </svg>
        {(centerLabel || centerValue != null) && (
          <div className="donut-chart__center">
            {hovered ? (
              <>
                <span className="donut-chart__value">{hovered.value}</span>
                <span className="donut-chart__label">{hovered.label} · {hovered.pct}%</span>
              </>
            ) : (
              <>
                {centerValue != null && <span className="donut-chart__value">{centerValue}</span>}
                {centerLabel && <span className="donut-chart__label">{centerLabel}</span>}
              </>
            )}
          </div>
        )}
      </div>
      <ul className="chart-legend">
        {data.map((d) => (
          <li key={d.key}>
            <button
              type="button"
              className={`chart-legend__btn ${activeKey === d.key ? 'chart-legend__btn--active' : ''} ${hoverKey === d.key ? 'chart-legend__btn--hover' : ''}`}
              disabled={!interactive}
              onMouseEnter={() => interactive && setHoverKey(d.key)}
              onMouseLeave={() => interactive && setHoverKey(null)}
              onClick={() => interactive && onSegmentClick?.(d)}
            >
              <span className="chart-legend__dot" style={{ background: d.color }} />
              <span className="chart-legend__text">{d.label}</span>
              <span className="chart-legend__value">{d.value}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
