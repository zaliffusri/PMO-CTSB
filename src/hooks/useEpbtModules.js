import { useEffect, useState } from 'react';
import { api } from '../api';
import { EPBT_MODULES, resolveEpbtModules } from '../../lib/epbtModules.js';

/**
 * Load editable ePBT modules from settings, falling back to hardcoded defaults.
 */
export function useEpbtModules() {
  const [modules, setModules] = useState(EPBT_MODULES);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api.settings.get()
      .then((s) => {
        if (cancelled) return;
        setModules(resolveEpbtModules(s?.epbt_modules));
      })
      .catch(() => {
        if (!cancelled) setModules(EPBT_MODULES);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { modules, loading };
}
