import { formatHours } from '../../lib/hoursUtils.js';

/** Compact est / act hours inputs for tables and forms. */
export default function HoursField({
  estimated,
  actual,
  onEstimatedChange,
  onActualChange,
  disabled = false,
  compact = false,
  readOnly = false,
}) {
  if (readOnly) {
    return (
      <span className="hours-field hours-field--readonly" title="Estimated / actual hours">
        {formatHours(estimated)} / {formatHours(actual)}
      </span>
    );
  }

  const inputProps = (value, onChange, label) => ({
    type: 'number',
    min: 0,
    step: 0.5,
    className: `ui-input hours-field__input ${compact ? 'hours-field__input--compact' : ''}`,
    value: value ?? '',
    disabled,
    'aria-label': label,
    placeholder: '0',
    onChange: (e) => onChange?.(e.target.value === '' ? null : e.target.value),
  });

  return (
    <div className={`hours-field ${compact ? 'hours-field--compact' : ''}`}>
      <label className="hours-field__cell" title="Estimated hours">
        <span className="hours-field__abbr">Est</span>
        <input {...inputProps(estimated, onEstimatedChange, 'Estimated hours')} />
      </label>
      <span className="hours-field__sep">/</span>
      <label className="hours-field__cell" title="Actual hours spent">
        <span className="hours-field__abbr">Act</span>
        <input {...inputProps(actual, onActualChange, 'Actual hours')} />
      </label>
    </div>
  );
}
