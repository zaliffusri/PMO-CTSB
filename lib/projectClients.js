/** Parse client IDs from API body (supports legacy single client_id). */
export function parseClientIds(body) {
  if (body == null || typeof body !== 'object') return null;
  if (Array.isArray(body.client_ids)) {
    return [
      ...new Set(
        body.client_ids
          .map((id) => +id)
          .filter((id) => Number.isFinite(id) && id > 0),
      ),
    ];
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
