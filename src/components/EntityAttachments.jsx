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

function isImageAttachment(att) {
  const mime = String(att?.mime_type || '').toLowerCase();
  if (mime.startsWith('image/')) return true;
  return /\.(png|jpe?g|gif|webp)$/i.test(String(att?.file_name || ''));
}

function AttachmentThumb({ att }) {
  const [src, setSrc] = useState(null);

  useEffect(() => {
    if (att._previewUrl) {
      setSrc(att._previewUrl);
      return undefined;
    }
    if (!isImageAttachment(att) || att.kind !== 'file' || !att.id || att._pending) {
      setSrc(null);
      return undefined;
    }
    let cancelled = false;
    let objectUrl = null;
    api.attachments.fetchFileBlob(att.id)
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) setSrc(objectUrl);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [att.id, att.kind, att.mime_type, att.file_name, att._previewUrl, att._pending]);

  if (att.kind === 'url') {
    return <span className="entity-attachments__icon" aria-hidden>🔗</span>;
  }
  if (src) {
    return <img className="entity-attachments__thumb" src={src} alt="" />;
  }
  return <span className="entity-attachments__icon" aria-hidden>📎</span>;
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
    const tempId = `temp-${Date.now()}`;
    const previewUrl = file.type?.startsWith('image/') ? URL.createObjectURL(file) : null;
    setItems((prev) => [
      {
        id: tempId,
        kind: 'file',
        file_name: file.name,
        mime_type: file.type || null,
        file_size: file.size,
        _previewUrl: previewUrl,
        _pending: true,
      },
      ...prev,
    ]);
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
      setItems((prev) => prev.filter((a) => a.id !== tempId));
    } finally {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
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
      if (att._pending) return;
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
    if (String(id).startsWith('temp-')) return;
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
      </div>

      {error && <p className="entity-attachments__error">{error}</p>}

      {loading && items.length === 0 ? (
        <p className="pmo-table-muted">Loading attachments…</p>
      ) : items.length === 0 ? (
        <p className="pmo-table-muted entity-attachments__empty">No attachments — upload screenshot, PDF, or paste a reference link.</p>
      ) : (
        <ul className="entity-attachments__list">
          {items.map((att) => (
            <li key={att.id} className="entity-attachments__item">
              <AttachmentThumb att={att} />
              <div className="entity-attachments__meta">
                <button
                  type="button"
                  className="pmo-link-strong entity-attachments__open"
                  onClick={() => openAttachment(att)}
                  disabled={att._pending}
                >
                  {att.label || att.file_name}
                  {att._pending ? ' (uploading…)' : ''}
                </button>
                <span className="pmo-table-muted">
                  {att.kind === 'file' && formatBytes(att.file_size)}
                  {att.uploaded_by_name && ` · ${att.uploaded_by_name}`}
                </span>
              </div>
              {!att._pending && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => remove(att.id)} disabled={busy} title="Remove">
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="entity-attachments__actions entity-attachments__actions--below">
        <label className="btn btn-secondary btn-sm entity-attachments__upload-btn">
          {busy ? 'Uploading…' : '+ Upload file'}
          <input type="file" accept={ATTACHMENT_ACCEPT} className="sr-only" onChange={uploadFile} disabled={busy} />
        </label>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowLinkForm((v) => !v)} disabled={busy}>
          + Add link
        </button>
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
    </div>
  );
}
