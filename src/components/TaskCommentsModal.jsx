import { useEffect, useState } from 'react';
import { api } from '../api';

export default function TaskCommentsModal({ task, onClose }) {
  const [rows, setRows] = useState([]);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => {
    api.taskComments.list(task.id).then(setRows).catch(() => setRows([]));
  };

  useEffect(() => { load(); }, [task.id]);

  const submit = async (e) => {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    try {
      await api.taskComments.add(task.id, { body: body.trim() });
      setBody('');
      load();
    } catch (err) {
      alert(err.message || 'Could not add comment');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="modal-dialog-header project-create-header">
          <div>
            <h2 className="modal-dialog-title">Task comments</h2>
            <p className="project-create-subtitle">{task.name}</p>
          </div>
          <button type="button" className="modal-dialog-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="project-create-panel">
          {rows.length === 0 ? (
            <p className="pmo-data-list__meta">No comments yet.</p>
          ) : (
            <ol className="project-activity-feed">
              {rows.map((c) => (
                <li key={c.id}>
                  <strong>{c.author_name || 'User'}</strong>
                  {' — '}
                  {c.body}
                  {c.created_at && (
                    <span className="pmo-data-list__meta"> {new Date(c.created_at).toLocaleString()}</span>
                  )}
                </li>
              ))}
            </ol>
          )}
          <form className="task-comment-form" onSubmit={submit}>
            <label className="form-field">
              <span className="form-field__label">Add comment</span>
              <textarea
                className="form-field__input form-field__textarea"
                rows={3}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Update, blocker, or note for the team…"
              />
            </label>
            <button type="submit" className="btn btn-primary btn-sm" disabled={busy || !body.trim()}>
              {busy ? 'Posting…' : 'Post'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
