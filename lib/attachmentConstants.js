export const ATTACHMENT_ENTITY_TYPES = new Set(['issue', 'backlog', 'task']);

/**
 * Max decoded file size. Kept under Vercel serverless request body limit (~4.5 MB):
 * base64 data URLs expand ~33%, so ~2.5 MB raw stays within the platform cap.
 */
export const MAX_ATTACHMENT_BYTES = 2.5 * 1024 * 1024;

export const ATTACHMENT_STORAGE_BUCKET = 'attachments';

export const ATTACHMENT_ACCEPT = '.pdf,.png,.jpg,.jpeg,.gif,.webp,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip,.rar,.7z';
