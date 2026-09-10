import { useRef } from 'react';
import { DEFAULT_ACCEPT, resizeImageToDataUrl } from '../lib/imageResize';

export default function ImageUploadField({
  label,
  hint,
  value,
  onChange,
  onError,
  preset,
  accept = DEFAULT_ACCEPT,
  variant = 'tile',
  placeholder = 'Upload image',
  busy = false,
  disabled = false,
  fallbackLetter = '',
}) {
  const inputRef = useRef(null);
  const isAvatar = variant === 'avatar';

  const pick = () => {
    if (!busy && !disabled) inputRef.current?.click();
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const dataUrl = await resizeImageToDataUrl(file, preset);
      onChange?.(dataUrl);
    } catch (err) {
      onError?.(err.message || 'Failed to process image');
    }
  };

  if (isAvatar) {
    const letter = (fallbackLetter || placeholder || '?').toString().slice(0, 1).toUpperCase();
    return (
      <div className="image-upload image-upload--avatar">
        {label && <span className="image-upload__label">{label}</span>}
        <div className="image-upload__avatar-wrap">
          <button
            type="button"
            className="image-upload__avatar-btn"
            onClick={pick}
            disabled={busy || disabled}
            aria-label={value ? 'Change logo' : 'Upload logo'}
            title={value ? 'Change logo' : 'Upload logo'}
          >
            {value ? (
              <img src={value} alt="" className="image-upload__avatar-img" />
            ) : (
              <span className="image-upload__avatar-fallback" aria-hidden>
                {letter}
              </span>
            )}
            <span className="image-upload__avatar-overlay">
              {busy ? '…' : value ? 'Change' : 'Add'}
            </span>
          </button>
          {value && (
            <button
              type="button"
              className="image-upload__avatar-clear"
              onClick={() => onChange?.(null)}
              disabled={busy || disabled}
              aria-label="Remove logo"
              title="Remove logo"
            >
              ×
            </button>
          )}
        </div>
        {hint && <p className="image-upload__hint">{hint}</p>}
        <input ref={inputRef} type="file" accept={accept} className="sr-only" onChange={onFile} />
      </div>
    );
  }

  return (
    <div className={`image-upload image-upload--${variant}`}>
      {label && <span className="image-upload__label">{label}</span>}
      <div className="image-upload__frame">
        {value ? (
          <img src={value} alt="" className="image-upload__preview" />
        ) : (
          <div className="image-upload__placeholder">
            <span>{placeholder}</span>
          </div>
        )}
        <div className="image-upload__actions">
          <button type="button" className="btn btn-secondary btn-sm" onClick={pick} disabled={busy || disabled}>
            {value ? 'Change' : 'Upload'}
          </button>
          {value && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => onChange?.(null)}
              disabled={busy || disabled}
            >
              Remove
            </button>
          )}
        </div>
      </div>
      {hint && <p className="image-upload__hint">{hint}</p>}
      <input ref={inputRef} type="file" accept={accept} className="sr-only" onChange={onFile} />
    </div>
  );
}
