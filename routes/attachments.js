import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { store } from '../db/store.js';
import { ATTACHMENT_ENTITY_TYPES } from '../lib/attachmentConstants.js';
import {
  parseDataUrl,
  saveAttachmentFile,
  resolveAttachmentPath,
  deleteAttachmentFile,
} from '../lib/attachmentStorage.js';
import { canAssignIssues } from '../lib/permissions.js';

export const attachmentsRouter = Router();

async function enrichAttachment(att) {
  const uploader = att.uploaded_by_user_id ? await store.findUserById(att.uploaded_by_user_id) : null;
  return {
    ...att,
    uploaded_by_name: uploader?.name ?? null,
    download_url: att.kind === 'file' && att.storage_path ? `/api/attachments/${att.id}/file` : null,
    open_url: att.kind === 'url' ? att.external_url : (att.storage_path ? `/api/attachments/${att.id}/file` : null),
  };
}

async function entityExists(entityType, entityId) {
  const id = +entityId;
  if (entityType === 'issue') {
    const issues = await store.listIssues();
    return issues.some((i) => i.id === id);
  }
  if (entityType === 'backlog') {
    const backlogs = await store.listBacklogs();
    return backlogs.some((b) => b.id === id);
  }
  if (entityType === 'task') {
    const tasks = await store.listProjectTasks();
    return tasks.some((t) => t.id === id);
  }
  return false;
}

attachmentsRouter.get('/', async (req, res) => {
  const entityType = String(req.query.entity_type || '');
  const entityId = req.query.entity_id ? +req.query.entity_id : null;
  if (!ATTACHMENT_ENTITY_TYPES.has(entityType) || !entityId) {
    return res.status(400).json({ error: 'entity_type and entity_id are required' });
  }
  if (!(await entityExists(entityType, entityId))) {
    return res.status(404).json({ error: 'Entity not found' });
  }
  const list = await Promise.all(
    (await store.listAttachments(entityType, entityId)).map((att) => enrichAttachment(att)),
  );
  res.json(list);
});

attachmentsRouter.post('/', async (req, res) => {
  const body = req.body || {};
  const entityType = String(body.entity_type || '');
  const entityId = body.entity_id != null ? +body.entity_id : null;
  if (!ATTACHMENT_ENTITY_TYPES.has(entityType) || !entityId) {
    return res.status(400).json({ error: 'entity_type and entity_id are required' });
  }
  if (!(await entityExists(entityType, entityId))) {
    return res.status(404).json({ error: 'Entity not found' });
  }

  const kind = body.kind === 'url' ? 'url' : 'file';
  let row = {
    entity_type: entityType,
    entity_id: entityId,
    kind,
    file_name: String(body.file_name || body.label || 'attachment').trim(),
    label: body.label != null ? String(body.label).trim() || null : null,
    uploaded_by_user_id: req.user.id,
  };

  if (kind === 'url') {
    const url = body.url != null ? String(body.url).trim() : '';
    if (!url) return res.status(400).json({ error: 'url is required for link attachments' });
    row = { ...row, external_url: url, mime_type: 'text/uri-list' };
  } else {
    const fileName = String(body.file_name || 'upload').trim();
    let buffer;
    let mimeType = body.mime_type || 'application/octet-stream';
    if (body.data_url) {
      const parsed = parseDataUrl(body.data_url);
      if (!parsed) return res.status(400).json({ error: 'Invalid data_url' });
      buffer = parsed.buffer;
      mimeType = parsed.mimeType || mimeType;
    } else if (body.content_base64) {
      buffer = Buffer.from(String(body.content_base64), 'base64');
    } else {
      return res.status(400).json({ error: 'data_url or content_base64 required for file upload' });
    }
    try {
      const saved = saveAttachmentFile(entityType, entityId, fileName, buffer, mimeType);
      row = { ...row, file_name: fileName, ...saved };
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
  }

  const id = await store.addAttachment(row);
  const att = await enrichAttachment(await store.findAttachment(id));
  await store.appendAuditLog(req.user, {
    action: 'create',
    target_type: 'attachment',
    target_id: id,
    summary: `Attached ${att.file_name} to ${entityType} #${entityId}`,
  });
  try { await store.persistToSupabase(); } catch (e) { console.warn('persist:', e.message); }
  res.status(201).json(att);
});

attachmentsRouter.get('/:id/file', async (req, res) => {
  const att = await store.findAttachment(+req.params.id);
  if (!att || att.kind !== 'file' || !att.storage_path) {
    return res.status(404).json({ error: 'File not found' });
  }
  const full = resolveAttachmentPath(att.storage_path);
  if (!full || !fs.existsSync(full)) {
    return res.status(404).json({ error: 'File missing on server' });
  }
  res.setHeader('Content-Type', att.mime_type || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${path.basename(att.file_name)}"`);
  fs.createReadStream(full).pipe(res);
});

attachmentsRouter.delete('/:id', async (req, res) => {
  const att = await store.findAttachment(+req.params.id);
  if (!att) return res.status(404).json({ error: 'Attachment not found' });

  const isOwner = att.uploaded_by_user_id === req.user.id;
  if (!isOwner && !canAssignIssues(req.user)) {
    return res.status(403).json({ error: 'You can only delete your own attachments' });
  }

  if (att.kind === 'file' && att.storage_path) {
    const siblings = await store.listAttachments(att.entity_type, att.entity_id);
    const stillUsed = siblings.some(
      (a) => a.id !== att.id && a.storage_path === att.storage_path,
    );
    if (!stillUsed) deleteAttachmentFile(att.storage_path);
  }
  await store.deleteAttachment(att.id);
  await store.appendAuditLog(req.user, {
    action: 'delete',
    target_type: 'attachment',
    target_id: att.id,
    summary: `Removed attachment ${att.file_name} from ${att.entity_type} #${att.entity_id}`,
  });
  try { await store.persistToSupabase(); } catch (e) { console.warn('persist:', e.message); }
  res.json({ ok: true });
});
