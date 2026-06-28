import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { MAX_ATTACHMENT_BYTES } from './attachmentConstants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const UPLOADS_ROOT = path.resolve(__dirname, '../data/uploads');

export function ensureUploadsDir() {
  fs.mkdirSync(UPLOADS_ROOT, { recursive: true });
}

function safeFileName(name) {
  return String(name || 'file')
    .replace(/[/\\?%*:|"<>]/g, '_')
    .slice(0, 180) || 'file';
}

export function parseDataUrl(dataUrl) {
  const m = String(dataUrl || '').match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return null;
  const buffer = Buffer.from(m[2], 'base64');
  return { mimeType: m[1], buffer };
}

export function saveAttachmentFile(entityType, entityId, fileName, buffer, mimeType) {
  if (!buffer || buffer.length > MAX_ATTACHMENT_BYTES) {
    throw new Error(`File too large (max ${Math.round(MAX_ATTACHMENT_BYTES / (1024 * 1024))} MB)`);
  }
  ensureUploadsDir();
  const dir = path.join(UPLOADS_ROOT, entityType, String(entityId));
  fs.mkdirSync(dir, { recursive: true });
  const token = crypto.randomBytes(8).toString('hex');
  const storedName = `${token}-${safeFileName(fileName)}`;
  const fullPath = path.join(dir, storedName);
  fs.writeFileSync(fullPath, buffer);
  const relative = path.relative(UPLOADS_ROOT, fullPath).split(path.sep).join('/');
  return {
    storage_path: relative,
    mime_type: mimeType || 'application/octet-stream',
    file_size: buffer.length,
  };
}

export function resolveAttachmentPath(storagePath) {
  if (!storagePath) return null;
  const full = path.resolve(UPLOADS_ROOT, storagePath);
  if (!full.startsWith(UPLOADS_ROOT)) return null;
  return full;
}

export function deleteAttachmentFile(storagePath) {
  const full = resolveAttachmentPath(storagePath);
  if (full && fs.existsSync(full)) {
    try { fs.unlinkSync(full); } catch { /* ignore */ }
  }
}
