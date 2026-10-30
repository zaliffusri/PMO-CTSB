import { createContext, useContext, useMemo, useState, useEffect } from 'react';
import { STRINGS, interpolate } from '../i18n/strings.js';

const LocaleContext = createContext({
  locale: 'en',
  t: (k) => k,
  setLocale: () => {},
});

export function LocaleProvider({ children }) {
  const [locale, setLocale] = useState(() => {
    const stored = localStorage.getItem('pmo-locale');
    return stored === 'ms' || stored === 'en' ? stored : 'en';
  });
  useEffect(() => {
    localStorage.setItem('pmo-locale', locale);
    document.documentElement.lang = locale === 'ms' ? 'ms' : 'en';
  }, [locale]);
  const value = useMemo(() => ({
    locale,
    setLocale: (next) => setLocale(next === 'ms' ? 'ms' : 'en'),
    t: (key, vars) => {
      const raw = STRINGS[locale]?.[key] || STRINGS.en[key] || key;
      return interpolate(raw, vars);
    },
  }), [locale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  return useContext(LocaleContext);
}
