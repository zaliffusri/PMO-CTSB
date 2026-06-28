export default function HBarChart({
  data = [],
  max = 100,
  unit = '%',
  showValues = true,
  activeKey,
  onBarClick,
  interactive = false,
}) {
  if (!data.length) {
    return <p className="chart-empty">No data to chart yet.</p>;
  }

  const scaleMax = Math.max(max, ...data.map((d) => d.value || 0), 1);

  return (
    <div className={`hbar-chart ${interactive ? 'hbar-chart--interactive' : ''}`} role="list">
      {data.map((item) => {
        const pct = Math.min(100, ((item.value || 0) / scaleMax) * 100);
        const over = (item.value || 0) > max;
        const isActive = activeKey === item.key;
        const rowClass = `hbar-chart__row ${isActive ? 'hbar-chart__row--active' : ''}`;
        const content = (
          <>
            <span className="hbar-chart__label">{item.label}</span>
            <div className="hbar-chart__track" aria-hidden>
              <div
                className={`hbar-chart__fill ${over ? 'hbar-chart__fill--over' : ''}`}
                style={{ width: `${pct}%`, background: item.color }}
              />
            </div>
            {showValues && (
              <span className="hbar-chart__value">
                {item.value}{unit}
              </span>
            )}
          </>
        );
        if (interactive) {
          return (
            <button
              key={item.key}
              type="button"
              className={rowClass}
              role="listitem"
              onClick={() => onBarClick?.(item)}
              title={item.meta || item.label}
            >
              {content}
            </button>
          );
        }
        return (
          <div key={item.key} className={rowClass} role="listitem" title={item.meta || item.label}>
            {content}
          </div>
        );
      })}
    </div>
  );
}
