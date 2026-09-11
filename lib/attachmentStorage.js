import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { MAX_ATTACHMENT_BYTES, ATTACHMENT_STORAGE_BUCKET } from './attachmentConstants.js';
import { hasSupabase, supabase } from '../db/runtime/config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const UPLOADS_ROOT = path.resolve(__dirname, '../data/uploads');

let bucketReady = false;

function safeFileName(name) {
  return String(name || 'file')
    .replace(/[/\\?%*:|"<>]/g, '_')
    .slice(0, 180) || 'file';
}

function useSupabaseStorage() {
  return Boolean(hasSupabase && supabase);
}

export function ensureUploadsDir() {
  fs.mkdirSync(UPLOADS_ROOT, { recursive: true });
}

export async function ensureAttachmentBucket() {
  if (!useSupabaseStorage() || bucketReady) return;
  const { data, error: getErr } = await supabase.storage.getBucket(ATTACHMENT_STORAGE_BUCKET);
  if (data) {
    bucketReady = true;
    return;
  }
  // getBucket returns an error when missing — create it.
  if (getErr && !/not found|does not exist/i.test(String(getErr.message || ''))) {
    console.warn('ensureAttachmentBucket getBucket:', getErr.message || getErr);
  }
  const { error } = await supabase.storage.createBucket(ATTACHMENT_STORAGE_BUCKET, {
    public: false,
    fileSizeLimit: MAX_ATTACHMENT_BYTES,
  });
  if (error && !/already exists|duplicate/i.test(String(error.message || ''))) {
    throw new Error(`Could not create storage bucket "${ATTACHMENT_STORAGE_BUCKET}": ${error.message}`);
  }
  bucketReady = true;
}

export function parseDataUrl(dataUrl) {
  const m = String(dataUrl || '').match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return null;
  const buffer = Buffer.from(m[2], 'base64');
  return { mimeType: m[1], buffer };
}

/**
 * Persist file bytes. On Vercel/production uses Supabase Storage (no local disk).
 * Local ALLOW_LOCAL_STORE without Supabase falls back to data/uploads.
 */
export async function saveAttachmentFile(entityType, entityId, fileName, buffer, mimeType) {
  if (!buffer || buffer.length > MAX_ATTACHMENT_BYTES) {
    throw new Error(`File too large (max ${Math.round(MAX_ATTACHMENT_BYTES / (1024 * 1024))} MB)`);
  }

  const token = crypto.randomBytes(8).toString('hex');
  const relative = `${entityType}/${entityId}/${token}-${safeFileName(fileName)}`;
  const contentType = mimeType || 'application/octet-stream';

  if (useSupabaseStorage()) {
    await ensureAttachmentBucket();
    const { error } = await supabase.storage
      .from(ATTACHMENT_STORAGE_BUCKET)
      .upload(relative, buffer, {
        contentType,
        upsert: false,
      });
    if (error) {
      throw new Error(error.message || 'Failed to upload attachment to storage');
    }
    return {
      storage_path: relative,
      mime_type: contentType,
      file_size: buffer.length,
    };
  }

  ensureUploadsDir();
  const dir = path.join(UPLOADS_ROOT, entityType, String(entityId));
  fs.mkdirSync(dir, { recursive: true });
  const fullPath = path.join(UPLOADS_ROOT, relative);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, buffer);
  return {
    storage_path: relative.split(path.sep).join('/'),
    mime_type: contentType,
    file_size: buffer.length,
  };
}

export function resolveAttachmentPath(storagePath) {
  if (!storagePath || useSupabaseStorage()) return null;
  const full = path.resolve(UPLOADS_ROOT, storagePath);
  if (!full.startsWith(UPLOADS_ROOT)) return null;
  return full;
}

export async function readAttachmentFile(storagePath) {
  if (!storagePath) return null;

  if (useSupabaseStorage()) {
    const { data, error } = await supabase.storage
      .from(ATTACHMENT_STORAGE_BUCKET)
      .download(storagePath);
    if (error || !data) {
      throw new Error(error?.message || 'File missing in storage');
    }
    const ab = await data.arrayBuffer();
    return Buffer.from(ab);
  }

  const full = resolveAttachmentPath(storagePath);
  if (!full || !fs.existsSync(full)) {
    throw new Error('File missing on server');
  }
  return fs.readFileSync(full);
}

export async function deleteAttachmentFile(storagePath) {
  if (!storagePath) return;

  if (useSupabaseStorage()) {
    const { error } = await supabase.storage
      .from(ATTACHMENT_STORAGE_BUCKET)
      .remove([storagePath]);
    if (error) {
      console.warn('deleteAttachmentFile storage:', error.message || error);
    }
    return;
  }

  const full = resolveAttachmentPath(storagePath);
  if (full && fs.existsSync(full)) {
    try { fs.unlinkSync(full); } catch { /* ignore */ }
  }
}
