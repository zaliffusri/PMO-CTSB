import { useTheme, UI_MODES } from '../ThemeContext';

/**
 * Accessible UI mode selector (Default / Dark / Shadcn UI).
 * Renders as a segmented control or radio list depending on `variant`.
 */
export default function ThemeModeSelect({
  variant = 'segmented',
  className = '',
  idPrefix = 'ui-mode',
  showDescriptions = false,
}) {
  const { theme, setTheme } = useTheme();

  if (variant === 'radios') {
    return (
      <fieldset className={`theme-mode-radios ${className}`.trim()}>
        <legend className="theme-mode-legend">UI Mode</legend>
        <div className="theme-mode-radio-list" role="radiogroup" aria-label="UI Mode">
          {UI_MODES.map((mode) => {
            const inputId = `${idPrefix}-${mode.id}`;
            return (
              <label key={mode.id} htmlFor={inputId} className={`theme-mode-radio ${theme === mode.id ? 'is-active' : ''}`}>
                <input
                  id={inputId}
                  type="radio"
                  name={idPrefix}
                  value={mode.id}
                  checked={theme === mode.id}
                  onChange={() => setTheme(mode.id)}
                />
                <span className="theme-mode-radio__body">
                  <span className="theme-mode-radio__label">{mode.label}</span>
                  {showDescriptions ? (
                    <span className="theme-mode-radio__desc">{mode.description}</span>
                  ) : null}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
    );
  }

  return (
    <div className={`theme-mode-select ${className}`.trim()}>
      <span className="theme-mode-select__label" id={`${idPrefix}-label`}>
        UI Mode
      </span>
      <div
        className="theme-mode-segmented"
        role="radiogroup"
        aria-labelledby={`${idPrefix}-label`}
      >
        {UI_MODES.map((mode) => (
          <button
            key={mode.id}
            type="button"
            role="radio"
            aria-checked={theme === mode.id}
            className={`theme-mode-segment ${theme === mode.id ? 'is-active' : ''}`}
            onClick={() => setTheme(mode.id)}
            title={mode.description}
          >
            {mode.label}
          </button>
        ))}
      </div>
    </div>
  );
}
