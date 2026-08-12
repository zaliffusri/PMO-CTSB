import { useEffect, useId, useRef, useState } from 'react';
import { useTheme, UI_MODES } from '../ThemeContext';

export default function ThemeToggle({ className = '' }) {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const menuId = useId();
  const current = UI_MODES.find((m) => m.id === theme) || UI_MODES[0];

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className={`theme-menu ${className}`.trim()} ref={rootRef}>
      <button
        type="button"
        className="theme-toggle"
        aria-label={`UI mode: ${current.label}. Change theme`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        title={`UI Mode: ${current.label}`}
        onClick={() => setOpen((v) => !v)}
      >
        {theme === 'dark' ? (
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M21 14.5A8.5 8.5 0 1110.5 3a6.5 6.5 0 1010.5 11.5z" />
          </svg>
        ) : theme === 'shadcn' ? (
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <rect x="3" y="3" width="7" height="7" rx="1.5" />
            <rect x="14" y="3" width="7" height="7" rx="1.5" />
            <rect x="3" y="14" width="7" height="7" rx="1.5" />
            <rect x="14" y="14" width="7" height="7" rx="1.5" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
          </svg>
        )}
      </button>
      {open ? (
        <div className="theme-menu__panel" id={menuId} role="menu" aria-label="UI Mode">
          <div className="theme-menu__heading">UI Mode</div>
          {UI_MODES.map((mode) => (
            <button
              key={mode.id}
              type="button"
              role="menuitemradio"
              aria-checked={theme === mode.id}
              className={`theme-menu__item ${theme === mode.id ? 'is-active' : ''}`}
              onClick={() => {
                setTheme(mode.id);
                setOpen(false);
              }}
            >
              <span className="theme-menu__item-label">{mode.label}</span>
              <span className="theme-menu__item-desc">{mode.description}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
