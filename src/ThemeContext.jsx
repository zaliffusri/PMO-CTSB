import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'pmo-theme';

/** Product UI modes (persisted). Legacy `light` maps to `default`. */
export const UI_MODES = [
  {
    id: 'default',
    label: 'Default',
    description: 'Original PMO light workspace look.',
  },
  {
    id: 'dark',
    label: 'Dark',
    description: 'Dark surfaces with high-contrast text.',
  },
  {
    id: 'shadcn',
    label: 'Shadcn UI',
    description: 'Clean shadcn/ui-inspired spacing, borders, and controls.',
  },
];

export const UI_MODE_IDS = UI_MODES.map((m) => m.id);

function normalizeTheme(value) {
  if (value === 'light') return 'default';
  if (UI_MODE_IDS.includes(value)) return value;
  return null;
}

function readThemeFromDom() {
  if (typeof document === 'undefined') return null;
  return normalizeTheme(document.documentElement.getAttribute('data-theme'));
}

function getInitialTheme() {
  const fromDom = readThemeFromDom();
  if (fromDom) return fromDom;
  try {
    const stored = normalizeTheme(localStorage.getItem(STORAGE_KEY));
    if (stored) return stored;
  } catch {
    /* ignore */
  }
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: light)').matches) {
    return 'default';
  }
  return 'dark';
}

function applyThemeToDocument(theme) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.uiMode = theme;
}

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(getInitialTheme);

  useEffect(() => {
    applyThemeToDocument(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  const setTheme = useCallback((next) => {
    setThemeState((current) => {
      const value = typeof next === 'function' ? next(current) : next;
      return normalizeTheme(value) || current;
    });
  }, []);

  const cycleTheme = useCallback(() => {
    setThemeState((current) => {
      const idx = UI_MODE_IDS.indexOf(current);
      return UI_MODE_IDS[(idx + 1) % UI_MODE_IDS.length];
    });
  }, []);

  /** @deprecated Prefer cycleTheme — kept for older call sites. */
  const toggleTheme = cycleTheme;

  const value = useMemo(
    () => ({
      theme,
      uiMode: theme,
      setTheme,
      cycleTheme,
      toggleTheme,
      modes: UI_MODES,
    }),
    [theme, setTheme, cycleTheme],
  );

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
