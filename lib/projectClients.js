/** Keep at most one client id (projects link to a single company). */
export function normalizeProjectClientIds(ids) {
  if (!Array.isArray(ids)) return [];
  const cleaned = [
    ...new Set(
      ids
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id) && id > 0),
    ),
  ];
  return cleaned.slice(0, 1);
}

/** Parse client IDs from API body (supports legacy single client_id). Max one client. */
export function parseClientIds(body) {
  if (body == null || typeof body !== 'object') return null;
  if (Array.isArray(body.client_ids)) {
    return normalizeProjectClientIds(body.client_ids);
  }
  if (body.client_id !== undefined && body.client_id !== null && body.client_id !== '') {
    const id = +body.client_id;
    return Number.isFinite(id) && id > 0 ? [id] : [];
  }
  if (body.client_id === null || body.client_id === '') return [];
  return null;
}

export function formatClientNames(clients) {
  if (!clients?.length) return null;
  return clients
    .map((c) => c.name)
    .filter(Boolean)
    .join(', ');
}
