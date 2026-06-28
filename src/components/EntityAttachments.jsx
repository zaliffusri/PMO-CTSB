import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import { ATTACHMENT_ACCEPT } from '../../lib/attachmentConstants.js';

function formatBytes(n) {
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export default function EntityAttachments({
  entityType,
  entityId,
  title = 'Attachments',
  compact = false,
}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkLabel, setLinkLabel] = useState('');
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    if (!entityType || !entityId) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    api.attachments.list(entityType, entityId)
      .then(setItems)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [entityType, entityId]);

  useEffect(() => { load(); }, [load]);

  const uploadFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const data_url = await fileToDataUrl(file);
      await api.attachments.create({
        entity_type: entityType,
        entity_id: entityId,
        kind: 'file',
        file_name: file.name,
        mime_type: file.type || undefined,
        data_url,
      });
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const addLink = async (ev) => {
    ev.preventDefault();
    if (!linkUrl.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.attachments.create({
        entity_type: entityType,
        entity_id: entityId,
        kind: 'url',
        url: linkUrl.trim(),
        file_name: linkLabel.trim() || linkUrl.trim(),
        label: linkLabel.trim() || null,
      });
      setLinkUrl('');
      setLinkLabel('');
      setShowLinkForm(false);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const openAttachment = async (att) => {
    try {
      if (att.kind === 'url' && att.external_url) {
        window.open(att.external_url, '_blank', 'noopener,noreferrer');
        return;
      }
      if (att.kind === 'file') {
        await api.attachments.openFile(att.id);
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const remove = async (id) => {
    if (!confirm('Remove this attachment?')) return;
    setBusy(true);
    try {
      await api.attachments.remove(id);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (!entityId) return null;

  return (
    <div className={`entity-attachments ${compact ? 'entity-attachments--compact' : ''}`}>
      <div className="entity-attachments__head">
        <span className="form-field__label">{title}</span>
        <div className="entity-attachments__actions">
          <label className="btn btn-secondary btn-sm entity-attachments__upload-btn">
            {busy ? 'Uploading…' : '+ Upload file'}
            <input type="file" accept={ATTACHMENT_ACCEPT} className="sr-only" onChange={uploadFile} disabled={busy} />
          </label>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowLinkForm((v) => !v)} disabled={busy}>
            + Add link
          </button>
        </div>
      </div>

      {showLinkForm && (
        <form className="entity-attachments__link-form" onSubmit={addLink}>
          <input
            className="form-field__input"
            placeholder="https://… or SharePoint / BIRT URL"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            required
          />
          <input
            className="form-field__input"
            placeholder="Label (optional)"
            value={linkLabel}
            onChange={(e) => setLinkLabel(e.target.value)}
          />
          <div className="entity-attachments__link-actions">
            <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>Save link</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowLinkForm(false)}>Cancel</button>
          </div>
        </form>
      )}

      {error && <p className="entity-attachments__error">{error}</p>}

      {loading ? (
        <p className="pmo-table-muted">Loading attachments…</p>
      ) : items.length === 0 ? (
        <p className="pmo-table-muted entity-attachments__empty">No attachments — upload screenshot, PDF, or paste a reference link.</p>
      ) : (
        <ul className="entity-attachments__list">
          {items.map((att) => (
            <li key={att.id} className="entity-attachments__item">
              <span className="entity-attachments__icon" aria-hidden>{att.kind === 'url' ? '🔗' : '📎'}</span>
              <div className="entity-attachments__meta">
                <button type="button" className="pmo-link-strong entity-attachments__open" onClick={() => openAttachment(att)}>
                  {att.label || att.file_name}
                </button>
                <span className="pmo-table-muted">
                  {att.kind === 'file' && formatBytes(att.file_size)}
                  {att.uploaded_by_name && ` · ${att.uploaded_by_name}`}
                </span>
              </div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => remove(att.id)} disabled={busy} title="Remove">
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
