import { useState, useEffect, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useSubmitLock } from '../hooks/useSubmitLock';
import EntityAttachments from './EntityAttachments';
import HoursField from './HoursField';
import {
  BACKLOG_TYPES,
  BACKLOG_SOURCES,
  BACKLOG_STATUSES,
  BACKLOG_PRIORITIES,
  backlogStatusLabel,
  backlogStatusTone,
} from '../../lib/backlogConstants.js';
import { personIdForUser } from '../../lib/permissions.js';

function typeLabel(id) {
  return BACKLOG_TYPES.find((t) => t.id === id)?.label || id;
}

function sourceLabel(id) {
  return BACKLOG_SOURCES.find((s) => s.id === id)?.label || id;
}

function priorityLabel(id) {
  return BACKLOG_PRIORITIES.find((p) => p.id === id)?.label || id;
}

export default function BacklogDetailModal({
  item,
  people = [],
  user,
  canManage = false,
  onClose,
  onUpdated,
}) {
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState('');
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const [loadingComments, setLoadingComments] = useState(true);
  const textareaRef = useRef(null);
  const { pending: busy, run } = useSubmitLock();

  const myPersonId = personIdForUser(user, people);
  const isAssignee = myPersonId != null && item.assignee_person_id === myPersonId;
  const canUpdateStatus = canManage || isAssignee;
  const canUpdateHours = canManage || isAssignee;

  const roster = useMemo(() => {
    const ids = new Set(people.map((p) => p.id));
    return people.filter((p) => ids.has(p.id));
  }, [people]);

  const mentionCandidates = useMemo(() => {
    const q = mentionFilter.trim().toLowerCase();
    if (!q) return roster.slice(0, 8);
    return roster
      .filter((p) => String(p.name || '').toLowerCase().includes(q)
        || String(p.email || '').toLowerCase().includes(q))
      .slice(0, 8);
  }, [roster, mentionFilter]);

  const loadComments = () => {
    setLoadingComments(true);
    api.backlogs.listComments(item.id)
      .then(setComments)
      .catch(console.error)
      .finally(() => setLoadingComments(false));
  };

  useEffect(() => {
    loadComments();
  }, [item.id]);

  const patchItem = async (partial) => {
    try {
      const updated = await api.backlogs.update(item.id, partial);
      onUpdated?.(updated);
    } catch (err) {
      alert(err.message);
    }
  };

  const insertMention = (person) => {
    const name = person.name || person.email || 'user';
    const el = textareaRef.current;
    const prefix = commentText && !commentText.endsWith(' ') ? `${commentText} ` : commentText;
    setCommentText(`${prefix}@${name} `);
    setMentionOpen(false);
    setMentionFilter('');
    el?.focus();
  };

  const onCommentInput = (e) => {
    const val = e.target.value;
    setCommentText(val);
    const at = val.lastIndexOf('@');
    if (at >= 0 && (at === 0 || /\s/.test(val[at - 1]))) {
      const frag = val.slice(at + 1);
      if (!frag.includes(' ')) {
        setMentionFilter(frag);
        setMentionOpen(true);
        return;
      }
    }
    setMentionOpen(false);
  };

  const submitComment = async (e) => {
    e.preventDefault();
    const body = commentText.trim();
    if (!body) return;
    await run(async () => {
      try {
        const created = await api.backlogs.addComment(item.id, { body });
        setComments((prev) => [...prev, created]);
        setCommentText('');
        setMentionOpen(false);
        onUpdated?.({ ...item, comment_count: (item.comment_count || 0) + 1 });
      } catch (err) {
        alert(err.message);
      }
    });
  };

  const tone = backlogStatusTone(item.status);

  return (
    <div className="modal-backdrop" role="presentation" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-dialog modal-dialog--wide" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="modal-dialog-header project-create-header">
          <div>
            <p className="backlog-detail__ref">{item.ref_no}</p>
            <h2 className="modal-dialog-title">{item.title}</h2>
            <div className="backlog-detail__meta">
              <span className={`backlog-status-badge backlog-status-badge--${tone}`}>
                {backlogStatusLabel(item.status)}
              </span>
              <span className="project-meta-chip">{typeLabel(item.item_type)}</span>
              <span className="pmo-table-muted">{sourceLabel(item.source)} · {priorityLabel(item.priority)}</span>
            </div>
          </div>
          <button type="button" className="modal-dialog-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="backlog-detail__body">
          <section className="backlog-detail__section">
            <h3 className="backlog-detail__section-title">Details</h3>
            {item.description && (
              <p className="backlog-detail__description">{item.description}</p>
            )}
            <dl className="backlog-detail__facts">
              <div>
                <dt>Assignee</dt>
                <dd>
                  {canManage ? (
                    <select
                      className="form-field__input"
                      value={item.assignee_person_id || ''}
                      onChange={(e) => patchItem({
                        assignee_person_id: e.target.value ? +e.target.value : null,
                      })}
                    >
                      <option value="">Unassigned</option>
                      {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  ) : (item.assignee_name || 'Unassigned')}
                </dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>
                  {canUpdateStatus ? (
                    <select
                      className="form-field__input"
                      value={item.status}
                      onChange={(e) => patchItem({ status: e.target.value })}
                    >
                      {BACKLOG_STATUSES.map((s) => (
                        <option key={s.id} value={s.id}>{s.label}</option>
                      ))}
                    </select>
                  ) : (
                    <span className={`backlog-status-badge backlog-status-badge--${tone}`}>
                      {backlogStatusLabel(item.status)}
                    </span>
                  )}
                </dd>
              </div>
              <div>
                <dt>Hours</dt>
                <dd>
                  <HoursField
                    estimated={item.estimated_hours}
                    actual={item.actual_hours}
                    compact={false}
                    disabled={!canUpdateHours && !canManage}
                    onEstimatedChange={canManage ? (v) => patchItem({ estimated_hours: v }) : undefined}
                    onActualChange={(v) => patchItem({ actual_hours: v })}
                  />
                </dd>
              </div>
              {item.created_by_name && (
                <div>
                  <dt>Created by</dt>
                  <dd>{item.created_by_name}</dd>
                </div>
              )}
              {item.issue_ticket_no && (
                <div>
                  <dt>Helpdesk</dt>
                  <dd>
                    <Link to={`/helpdesk?issue=${item.issue_id}`} className="pmo-link-strong">
                      {item.issue_ticket_no}
                    </Link>
                    {item.issue_external_ticket_ref && ` · ${item.issue_external_ticket_ref}`}
                  </dd>
                </div>
              )}
              {item.task_name && (
                <div>
                  <dt>Task</dt>
                  <dd>{item.task_name}</dd>
                </div>
              )}
            </dl>
          </section>

          <section className="backlog-detail__section">
            <h3 className="backlog-detail__section-title">Attachments</h3>
            <EntityAttachments entityType="backlog" entityId={item.id} />
          </section>

          <section className="backlog-detail__section backlog-detail__comments">
            <h3 className="backlog-detail__section-title">
              Discussion
              <span className="backlog-detail__count">{comments.length}</span>
            </h3>
            <p className="backlog-detail__hint">
              Use @name to mention project team members. Creator and assignee are notified on status changes and new comments.
            </p>

            {loadingComments ? (
              <p className="pmo-table-muted">Loading comments…</p>
            ) : comments.length === 0 ? (
              <p className="pmo-table-muted">No comments yet — start the discussion.</p>
            ) : (
              <ul className="backlog-comment-list">
                {comments.map((c) => (
                  <li key={c.id} className="backlog-comment">
                    <div className="backlog-comment__head">
                      <strong>{c.author_name}</strong>
                      <time dateTime={c.created_at}>
                        {new Date(c.created_at).toLocaleString()}
                      </time>
                    </div>
                    <p className="backlog-comment__body">{c.body}</p>
                    {c.mentioned_names?.length > 0 && (
                      <p className="backlog-comment__mentions">
                        Mentioned: {c.mentioned_names.join(', ')}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}

            <form className="backlog-comment-form" onSubmit={submitComment}>
              <div className="backlog-comment-form__wrap">
                <textarea
                  ref={textareaRef}
                  className="form-field__input form-field__textarea backlog-comment-form__input"
                  rows={3}
                  placeholder="Add a comment… Type @ to mention someone"
                  value={commentText}
                  onChange={onCommentInput}
                  disabled={busy}
                />
                {mentionOpen && mentionCandidates.length > 0 && (
                  <ul className="backlog-mention-suggest" role="listbox">
                    {mentionCandidates.map((p) => (
                      <li key={p.id}>
                        <button type="button" onClick={() => insertMention(p)}>
                          @{p.name}
                          {p.email && <span className="pmo-table-muted"> · {p.email}</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="backlog-comment-form__actions">
                <button type="submit" className="btn btn-primary btn-sm" disabled={busy || !commentText.trim()}>
                  {busy ? 'Posting…' : 'Post comment'}
                </button>
              </div>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}
