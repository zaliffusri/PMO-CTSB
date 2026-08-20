/**
 * Optimistic list updates with automatic rollback on failure.
 * Does not change API contracts — only local React state.
 */
import { useCallback } from 'react';

/**
 * @param {Function} setItems - React setState for an array of entities with `id`
 */
export function useOptimisticList(setItems) {
  const patchItem = useCallback((id, partial) => {
    const nid = Number(id);
    setItems((prev) => prev.map((row) => (Number(row.id) === nid ? { ...row, ...partial } : row)));
  }, [setItems]);

  const removeItem = useCallback((id) => {
    const nid = Number(id);
    setItems((prev) => prev.filter((row) => Number(row.id) !== nid));
  }, [setItems]);

  const upsertItem = useCallback((item) => {
    const nid = Number(item.id);
    setItems((prev) => {
      const idx = prev.findIndex((row) => Number(row.id) === nid);
      if (idx === -1) return [item, ...prev];
      const next = [...prev];
      next[idx] = { ...next[idx], ...item };
      return next;
    });
  }, [setItems]);

  /**
   * Apply `apply(prev)` immediately, then `request()`.
   * On failure: restore snapshot. On success: optional `reconcile(prev, result)`.
   */
  const runOptimistic = useCallback(async ({
    apply,
    request,
    reconcile,
    onError,
  }) => {
    let snapshot = null;
    setItems((prev) => {
      snapshot = prev;
      return typeof apply === 'function' ? apply(prev) : prev;
    });
    try {
      const result = await request();
      if (typeof reconcile === 'function') {
        setItems((prev) => reconcile(prev, result));
      }
      return result;
    } catch (err) {
      if (snapshot != null) setItems(snapshot);
      if (onError) onError(err);
      else throw err;
      return undefined;
    }
  }, [setItems]);

  return {
    patchItem,
    removeItem,
    upsertItem,
    runOptimistic,
  };
}
