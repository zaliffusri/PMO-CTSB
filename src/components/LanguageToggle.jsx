import { useLocale } from '../context/LocaleContext';

export default function LanguageToggle({ className = '' }) {
  const { locale, setLocale, t } = useLocale();
  return (
    <div className={`lang-toggle ${className}`.trim()} role="group" aria-label={t('lang.label')}>
      <button
        type="button"
        className={`lang-toggle__btn ${locale === 'en' ? 'is-active' : ''}`}
        onClick={() => setLocale('en')}
        aria-pressed={locale === 'en'}
      >
        EN
      </button>
      <button
        type="button"
        className={`lang-toggle__btn ${locale === 'ms' ? 'is-active' : ''}`}
        onClick={() => setLocale('ms')}
        aria-pressed={locale === 'ms'}
      >
        BM
      </button>
    </div>
  );
}
