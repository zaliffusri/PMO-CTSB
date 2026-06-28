import { notifyInApp, notifyPersonInApp } from './notifyUser.js';
import { backlogStatusLabel, normalizeBacklogStatus } from './backlogConstants.js';

function backlogLink(projectId, backlogId) {
  return `/projects/${projectId}?tab=backlog&backlog=${backlogId}`;
}

/** Notify assignee when backlog is created or assigned. */
export function notifyBacklogAssigned(store, backlog, { actorUser, isNew = false } = {}) {
  if (!backlog?.assignee_person_id) return;
  const actorName = actorUser?.name || 'Someone';
  notifyPersonInApp(backlog.assignee_person_id, {
    type: 'backlog_assigned',
    title: isNew ? `New backlog: ${backlog.ref_no}` : `Backlog assigned: ${backlog.ref_no}`,
    body: `${actorName} assigned you — ${backlog.title}`,
    link: backlogLink(backlog.project_id, backlog.id),
    entity_type: 'backlog',
    entity_id: backlog.id,
  });
}

/** Notify creator when assignee (or anyone) changes status. */
export function notifyBacklogStatusChanged(store, backlog, { actorUser, previousStatus } = {}) {
  const creatorId = backlog.created_by_user_id;
  if (!creatorId || creatorId === actorUser?.id) return;
  const prev = backlogStatusLabel(previousStatus);
  const next = backlogStatusLabel(backlog.status);
  const actorName = actorUser?.name || 'Assignee';
  notifyInApp({
    user_id: creatorId,
    type: 'backlog_status',
    title: `${backlog.ref_no} → ${next}`,
    body: `${actorName} updated status from ${prev} to ${next}`,
    link: backlogLink(backlog.project_id, backlog.id),
    entity_type: 'backlog',
    entity_id: backlog.id,
  });
}

/** Notify creator, assignee, and @mentioned people on new comment. */
export function notifyBacklogComment(store, backlog, comment, { actorUser, mentionedPersonIds = [] } = {}) {
  const link = backlogLink(backlog.project_id, backlog.id);
  const actorName = actorUser?.name || 'Someone';
  const preview = String(comment.body || '').slice(0, 120);
  const notifiedUsers = new Set();
  if (actorUser?.id) notifiedUsers.add(actorUser.id);

  const ping = (userId, title, type = 'backlog_comment') => {
    if (!userId || notifiedUsers.has(userId)) return;
    notifiedUsers.add(userId);
    notifyInApp({
      user_id: userId,
      type,
      title,
      body: `${actorName}: ${preview}`,
      link,
      entity_type: 'backlog',
      entity_id: backlog.id,
    });
  };

  for (const personId of mentionedPersonIds) {
    const user = store.users?.find((u) => {
      const email = String(u.email || '').toLowerCase();
      const person = store.people.find((p) => p.id === +personId);
      return person && (String(person.email || '').toLowerCase() === email
        || String(person.name || '').toLowerCase() === String(u.name || '').toLowerCase());
    });
    if (user) ping(user.id, `Mentioned on ${backlog.ref_no}`, 'backlog_mention');
    else notifyPersonInApp(personId, {
      type: 'backlog_mention',
      title: `Mentioned on ${backlog.ref_no}`,
      body: `${actorName}: ${preview}`,
      link,
      entity_type: 'backlog',
      entity_id: backlog.id,
    });
  }

  if (backlog.created_by_user_id) {
    ping(backlog.created_by_user_id, `Comment on ${backlog.ref_no}`);
  }
  if (backlog.assignee_person_id) {
    const assigneeUserId = store.users?.find((u) => {
      const person = store.people.find((p) => p.id === backlog.assignee_person_id);
      if (!person) return false;
      return String(person.email || '').toLowerCase() === String(u.email || '').toLowerCase()
        || String(person.name || '').toLowerCase() === String(u.name || '').toLowerCase();
    })?.id;
    if (assigneeUserId) ping(assigneeUserId, `Comment on ${backlog.ref_no}`);
  }
}

export function canPromoteBacklogToTask(backlog) {
  if (!backlog || backlog.task_id) return false;
  const st = normalizeBacklogStatus(backlog.status);
  return st !== 'closed';
}
