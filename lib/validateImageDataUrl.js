export const IMAGE_DATA_URL_RE = /^data:image\/(jpeg|png|webp|gif);base64,/i;

export function validateImageDataUrl(value, { maxBytes = 200_000, field = 'image' } = {}) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || !IMAGE_DATA_URL_RE.test(value)) {
    throw new Error(`${field} must be a base64 image data URL`);
  }
  if (value.length > maxBytes) {
    throw new Error(`${field} is too large — use a smaller image`);
  }
  return value;
}
