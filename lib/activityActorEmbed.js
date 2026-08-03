/**
 * Persist activity creator/editor inside `description` so it survives when
 * activities.created_by_* / updated_by_* columns are missing in Supabase.
 * Calendar UI strips this marker from notes display.
 */
export const ACTOR_EMBED_MARKER = '__pmo_act_audit__:';

function trimName(v) {
  const s = v == null ? '' : String(v).trim();
  return s || null;
}

export function buildActorPayload({
  created_by_user_id = null,
  created_by_name = null,
  created_at = null,
  updated_by_user_id = null,
  updated_by_name = null,
  updated_at = null,
} = {}) {
  return {
    cid: created_by_user_id == null || created_by_user_id === '' ? null : Number(created_by_user_id),
    cn: trimName(created_by_name),
    ca: created_at || null,
    uid: updated_by_user_id == null || updated_by_user_id === '' ? null : Number(updated_by_user_id),
    un: trimName(updated_by_name),
    ua: updated_at || null,
  };
}

export function encodeActorEmbed(actors) {
  return `${ACTOR_EMBED_MARKER}${JSON.stringify(buildActorPayload(actors))}`;
}

/** Remove embed segment(s) from description text. */
export function stripActorEmbedFromDescription(description) {
  const raw = description == null ? '' : String(description);
  if (!raw) return '';
  const kept = raw
    .split(/\s*\|\s*/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((seg) => !seg.startsWith(ACTOR_EMBED_MARKER));
  return kept.join(' | ');
}

/** Parse first embed found in description. */
export function parseActorEmbedFromDescription(description) {
  const raw = description == null ? '' : String(description);
  if (!raw.includes(ACTOR_EMBED_MARKER)) return null;
  const parts = raw.split(/\s*\|\s*/).map((s) => s.trim()).filter(Boolean);
  for (const seg of parts) {
    if (!seg.startsWith(ACTOR_EMBED_MARKER)) continue;
    const json = seg.slice(ACTOR_EMBED_MARKER.length);
    try {
      const o = JSON.parse(json);
      if (!o || typeof o !== 'object') return null;
      return {
        created_by_user_id: o.cid != null && Number.isFinite(Number(o.cid)) ? Number(o.cid) : null,
        created_by_name: trimName(o.cn),
        created_at: o.ca || null,
        updated_by_user_id: o.uid != null && Number.isFinite(Number(o.uid)) ? Number(o.uid) : null,
        updated_by_name: trimName(o.un),
        updated_at: o.ua || null,
      };
    } catch {
      return null;
    }
  }
  return null;
}

/** Write/refresh embed into description; keeps human notes intact. */
export function withActorEmbedInDescription(description, actors) {
  const clean = stripActorEmbedFromDescription(description);
  const embed = encodeActorEmbed(actors);
  return clean ? `${clean} | ${embed}` : embed;
}

/** Prefer flat columns; fall back to description embed. */
export function resolveActivityActors(row = {}) {
  const embedded = parseActorEmbedFromDescription(row.description);
  const created_by_name = trimName(row.created_by_name) || embedded?.created_by_name || null;
  const updated_by_name = trimName(row.updated_by_name) || embedded?.updated_by_name || null;
  const created_by_user_id =
    row.created_by_user_id != null && Number.isFinite(Number(row.created_by_user_id))
      ? Number(row.created_by_user_id)
      : (embedded?.created_by_user_id ?? null);
  const updated_by_user_id =
    row.updated_by_user_id != null && Number.isFinite(Number(row.updated_by_user_id))
      ? Number(row.updated_by_user_id)
      : (embedded?.updated_by_user_id ?? null);
  const created_at = row.created_at || embedded?.created_at || null;
  let updated_at = row.updated_at || embedded?.updated_at || null;
  let outUpdatedName = updated_by_name;
  let outUpdatedId = updated_by_user_id;

  // Hide "last edited" when it is the same instant as create.
  if (created_at && updated_at) {
    const c = new Date(created_at).getTime();
    const u = new Date(updated_at).getTime();
    if (Number.isFinite(c) && Number.isFinite(u) && u <= c + 2000) {
      outUpdatedName = null;
      outUpdatedId = null;
      updated_at = null;
    }
  }

  return {
    created_by_user_id,
    created_by_name,
    created_at,
    updated_by_user_id: outUpdatedId,
    updated_by_name: outUpdatedName,
    updated_at,
  };
}

export function applyActorsToActivityRow(row, actors) {
  const payload = buildActorPayload(actors);
  const next = {
    ...row,
    created_by_user_id: payload.cid,
    created_by_name: payload.cn,
    updated_by_user_id: payload.uid,
    updated_by_name: payload.un,
    updated_at: payload.ua,
    description: withActorEmbedInDescription(row.description, {
      created_by_user_id: payload.cid,
      created_by_name: payload.cn,
      created_at: payload.ca || row.created_at,
      updated_by_user_id: payload.uid,
      updated_by_name: payload.un,
      updated_at: payload.ua,
    }),
  };
  if (payload.ca) next.created_at = payload.ca;
  return next;
}
