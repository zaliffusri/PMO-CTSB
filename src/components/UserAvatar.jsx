function initialsFrom(name, email) {
  const source = (name || email || '').trim();
  if (!source) return '?';
  const parts = source.split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function UserAvatar({
  name,
  email,
  src,
  size = 'md',
  className = '',
  title,
}) {
  const initials = initialsFrom(name, email);
  const label = title || name || email || 'User';

  return (
    <span
      className={`user-avatar user-avatar--${size} ${className}`.trim()}
      title={label}
      aria-label={label}
    >
      {src ? (
        <img src={src} alt="" className="user-avatar__img" />
      ) : (
        <span className="user-avatar__initials" aria-hidden>{initials}</span>
      )}
    </span>
  );
}
