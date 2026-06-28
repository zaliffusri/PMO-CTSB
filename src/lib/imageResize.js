const DEFAULT_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif';

export async function resizeImageToDataUrl(file, options = {}) {
  const {
    maxDim = 256,
    maxWidth,
    maxHeight,
    quality = 0.85,
    maxInputBytes = 5 * 1024 * 1024,
    cover = true,
    mime = 'image/jpeg',
  } = options;

  if (!file.type.startsWith('image/')) {
    throw new Error('Please select an image file (PNG, JPG, WebP, or GIF).');
  }
  if (file.size > maxInputBytes) {
    throw new Error('Image is too large. Please choose a file under 5 MB.');
  }

  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read the selected file.'));
    reader.readAsDataURL(file);
  });

  const img = await new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Selected file is not a valid image.'));
    image.src = dataUrl;
  });

  const targetW = maxWidth ?? maxDim;
  const targetH = maxHeight ?? maxDim;
  let sx = 0;
  let sy = 0;
  let sw = img.width;
  let sh = img.height;

  if (cover) {
    const scale = Math.max(targetW / img.width, targetH / img.height);
    sw = targetW / scale;
    sh = targetH / scale;
    sx = Math.max(0, (img.width - sw) / 2);
    sy = Math.max(0, (img.height - sh) / 2);
  } else {
    const scale = Math.min(targetW / img.width, targetH / img.height, 1);
    const outW = Math.round(img.width * scale);
    const outH = Math.round(img.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Browser does not support image processing.');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, outW, outH);
    return canvas.toDataURL(mime, quality);
  }

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Browser does not support image processing.');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, targetW, targetH);
  return canvas.toDataURL(mime, quality);
}

export const IMAGE_PRESETS = {
  avatar: { maxDim: 256, quality: 0.85 },
  logo: { maxWidth: 160, maxHeight: 64, quality: 0.9, cover: false },
  banner: { maxWidth: 1200, maxHeight: 320, quality: 0.82 },
  projectCover: { maxWidth: 960, maxHeight: 240, quality: 0.82 },
  clientLogo: { maxDim: 128, quality: 0.88 },
};

export { DEFAULT_ACCEPT };
