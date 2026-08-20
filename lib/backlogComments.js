/**
 * Backlog discussion: @mentions against project roster.
 */

export async function projectRosterPeople(store, projectId) {
  const pid = +projectId;
  if (!Number.isFinite(pid)) return [];
  const assignments = await store.listAssignments();
  const backlogs = await store.listBacklogs();
  const people = await store.listPeople();
  const personIds = new Set(
    (assignments || [])
      .filter((a) => a.project_id === pid)
      .map((a) => a.person_id),
  );
  const backlogAssignees = (backlogs || [])
    .filter((b) => b.project_id === pid && b.assignee_person_id)
    .map((b) => b.assignee_person_id);
  backlogAssignees.forEach((id) => personIds.add(id));
  return (people || []).filter((p) => personIds.has(p.id));
}

/** Parse @Name or @email mentions from comment body. */
export function parseMentionedPersonIds(body, rosterPeople = []) {
  const text = String(body || '');
  if (!text.includes('@')) return [];
  const mentioned = new Set();
  const sorted = [...rosterPeople].sort((a, b) => String(b.name || '').length - String(a.name || '').length);
  for (const person of sorted) {
    const name = String(person.name || '').trim();
    const email = String(person.email || '').trim();
    if (name && text.includes(`@${name}`)) {
      mentioned.add(person.id);
      continue;
    }
    if (email && text.toLowerCase().includes(`@${email.toLowerCase()}`)) {
      mentioned.add(person.id);
      continue;
    }
    const first = name.split(/\s+/)[0];
    if (first && first.length >= 2) {
      const re = new RegExp(`@${first.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (re.test(text)) mentioned.add(person.id);
    }
  }
  return [...mentioned];
}

export function renderMentionText(body, rosterPeople = []) {
  let html = String(body || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const sorted = [...rosterPeople].sort((a, b) => String(b.name || '').length - String(a.name || '').length);
  for (const person of sorted) {
    const name = String(person.name || '').trim();
    const email = String(person.email || '').trim();
    if (name) {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      html = html.replace(new RegExp(`@${escaped}`, 'g'), `<span class="backlog-mention">@${name}</span>`);
    }
    if (email) {
      const escaped = email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      html = html.replace(new RegExp(`@${escaped}`, 'gi'), `<span class="backlog-mention">@${email}</span>`);
    }
  }
  return html.replace(/\n/g, '<br />');
}
