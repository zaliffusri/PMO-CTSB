import { MAX_ATTACHMENT_BYTES } from '../../lib/attachmentConstants.js';
import { resizeImageToDataUrl } from './imageResize.js';

function maxMbLabel() {
  return `${MAX_ATTACHMENT_BYTES / (1024 * 1024)}`.replace(/\.0$/, '');
}

function dataUrlByteLength(dataUrl) {
  const i = String(dataUrl).indexOf(',');
  if (i < 0) return 0;
  return Math.ceil(((String(dataUrl).length - i - 1) * 3) / 4);
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Build upload payload under Vercel body-size limits.
 * Images are resized/compressed; other files must already fit MAX_ATTACHMENT_BYTES.
 */
export async function prepareAttachmentUpload(file) {
  if (!file) throw new Error('No file selected');

  if (String(file.type || '').startsWith('image/')) {
    const data_url = await resizeImageToDataUrl(file, {
      maxDim: 1600,
      quality: 0.82,
      cover: false,
      maxInputBytes: 25 * 1024 * 1024,
      mime: 'image/jpeg',
    });
    const size = dataUrlByteLength(data_url);
    if (size > MAX_ATTACHMENT_BYTES) {
      throw new Error(`Image is still too large after compression (max ${maxMbLabel()} MB). Try a smaller screenshot.`);
    }
    const base = String(file.name || 'image').replace(/\.[^.]+$/, '');
    return {
      file_name: `${base || 'image'}.jpg`,
      mime_type: 'image/jpeg',
      data_url,
      file_size: size,
    };
  }

  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new Error(
      `File too large (max ${maxMbLabel()} MB). Compress the file or upload a smaller copy.`,
    );
  }

  const data_url = await fileToDataUrl(file);
  return {
    file_name: file.name,
    mime_type: file.type || 'application/octet-stream',
    data_url,
    file_size: file.size,
  };
}
