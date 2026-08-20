import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { withoutCancelledActivityKeys } from '../utils/calendarUtils.js';

/**
 * Loads activities for a month ISO range and filters remembered cancelled keys.
 */
export function useCalendarActivities(rangeStartIso, rangeEndExclusiveIso) {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadActivities = useCallback((from, to) => (
    api.activities.list({ from, to })
      .then((rows) => setActivities(withoutCancelledActivityKeys(rows)))
      .catch(() => setActivities([]))
  ), []);

  useEffect(() => {
    setLoading(true);
    loadActivities(rangeStartIso, rangeEndExclusiveIso).finally(() => setLoading(false));
  }, [rangeStartIso, rangeEndExclusiveIso, loadActivities]);

  return { activities, setActivities, loading, loadActivities };
}
