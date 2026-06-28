import { useState } from 'react';

export default function VBarChart({
  data = [],
  max,
  unit = '',
  activeKey,
  onBarClick,
  interactive = false,
}) {
  const [hoverKey, setHoverKey] = useState(null);
  if (!data.length) {
    return <p className="chart-empty">No data to chart yet.</p>;
  }

  const scaleMax = max ?? Math.max(...data.map((d) => d.value || 0), 1);
  const focusKey = hoverKey || activeKey;

  return (
    <div className={`vbar-chart ${interactive ? 'vbar-chart--interactive' : ''}`}>
      <div className="vbar-chart__scroll" tabIndex={0}>
        <div className="vbar-chart__bars">
        {data.map((item) => {
          const h = Math.max(4, ((item.value || 0) / scaleMax) * 100);
          const dimmed = focusKey && focusKey !== item.key;
          const active = focusKey === item.key;
          const colClass = `vbar-chart__col ${dimmed ? 'vbar-chart__col--dim' : ''} ${active ? 'vbar-chart__col--active' : ''}`;
          const content = (
            <>
              <div className="vbar-chart__bar-wrap">
                <div
                  className="vbar-chart__bar"
                  style={{ height: `${h}%`, background: item.color }}
                />
              </div>
              <span className="vbar-chart__value">{item.value}{unit}</span>
              <span className="vbar-chart__label">{item.label}</span>
            </>
          );
          if (interactive) {
            return (
              <button
                key={item.key}
                type="button"
                className={colClass}
                title={`${item.label}: ${item.value}${unit}`}
                onMouseEnter={() => setHoverKey(item.key)}
                onMouseLeave={() => setHoverKey(null)}
                onClick={() => onBarClick?.(item)}
              >
                {content}
              </button>
            );
          }
          return (
            <div key={item.key} className={colClass} title={`${item.label}: ${item.value}${unit}`}>
              {content}
            </div>
          );
        })}
        </div>
      </div>
    </div>
  );
}
