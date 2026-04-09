import { useCallback, useRef, useState } from 'react';

/**
 * Runs an async callback at most once at a time. Overlapping calls are ignored (returns undefined).
 * Use with disabled={pending} on submit buttons to avoid duplicate creates/updates when the API is slow.
 */
export function useSubmitLock() {
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);

  const run = useCallback(async (fn) => {
    if (inFlight.current) return undefined;
    inFlight.current = true;
    setPending(true);
    try {
      return await fn();
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }, []);

  return { pending, run };
}
