const PARTNERS = [
  { src: '/brand/cybersolution.png', alt: 'Cybersolution Technologies' },
  { src: '/brand/cyberport.png', alt: 'Cyberport' },
];

export default function PartnerLogos({ variant = 'auth', className = '' }) {
  return (
    <div className={`partner-logos partner-logos--${variant} ${className}`.trim()} role="group" aria-label="Partner companies">
      {PARTNERS.map((p) => (
        <img key={p.src} src={p.src} alt={p.alt} className="partner-logos__img" />
      ))}
    </div>
  );
}
