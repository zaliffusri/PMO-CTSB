import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Standard async data loading for list/detail pages.
 * Returns `{ data, loading, error, reload, setData }`.
 */
export function useAsyncData(loader, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const reload = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const result = await loaderRef.current();
      setData(result);
      return result;
    } catch (e) {
      setError(e?.message || 'Failed to load data');
      setData(null);
      throw e;
    } finally {
      setLoading(false);
    }
  }, deps);

  useEffect(() => {
    reload().catch(() => {});
  }, [reload]);

  return { data, loading, error, reload, setData };
}
