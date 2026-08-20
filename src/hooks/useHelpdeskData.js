import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';

/**
 * Loads helpdesk list data (issues, projects, clients, people, backlogs).
 */
export function useHelpdeskData(mineOnly) {
  const [issues, setIssues] = useState([]);
  const [projects, setProjects] = useState([]);
  const [clients, setClients] = useState([]);
  const [people, setPeople] = useState([]);
  const [backlogs, setBacklogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    return Promise.all([
      api.issues.list(mineOnly ? { mine: '1' } : {}),
      api.projects.list(),
      api.clients.list(),
      api.people.list(),
      api.backlogs.list(),
    ])
      .then(([iss, pr, cl, pe, bl]) => {
        setIssues(iss);
        setProjects(pr);
        setClients(cl);
        setPeople(pe);
        setBacklogs(bl);
      })
      .catch((err) => setLoadError(err.message || 'Failed to load helpdesk'))
      .finally(() => setLoading(false));
  }, [mineOnly]);

  useEffect(() => { load(); }, [load]);

  return {
    issues,
    setIssues,
    projects,
    clients,
    people,
    backlogs,
    setBacklogs,
    loading,
    loadError,
    load,
  };
}
