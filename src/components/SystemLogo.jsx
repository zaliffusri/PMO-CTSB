const SYSTEM_LOGO = '/brand/c360-pm.png';
const SYSTEM_MARK = '/brand/c360.png';

export default function SystemLogo({
  size = 'md',
  markOnly = false,
  className = '',
  alt = 'C360 Project Management',
}) {
  return (
    <img
      src={markOnly ? SYSTEM_MARK : SYSTEM_LOGO}
      alt={alt}
      className={`system-logo system-logo--${size} ${className}`.trim()}
    />
  );
}

export { SYSTEM_LOGO, SYSTEM_MARK };
