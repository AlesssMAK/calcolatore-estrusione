import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES } from '../i18n';
import type { SupportedLanguage } from '../i18n';

const LANGUAGE_FLAGS: Record<SupportedLanguage, string> = {
  it: '🇮🇹',
  en: '🇬🇧',
  es: '🇪🇸',
};

function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  const current = (i18n.resolvedLanguage ?? 'it') as SupportedLanguage;

  return (
    <div
      className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 bg-white p-1 shadow-sm"
      role="radiogroup"
      aria-label={t('language.label')}
    >
      {SUPPORTED_LANGUAGES.map((lng) => {
        const active = current === lng;
        return (
          <button
            key={lng}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => void i18n.changeLanguage(lng)}
            className={
              active
                ? 'flex items-center gap-1 rounded-md bg-brand-600 px-2.5 py-1 text-sm font-semibold text-white'
                : 'flex items-center gap-1 rounded-md px-2.5 py-1 text-sm font-medium text-ink-soft hover:bg-neutral-100'
            }
          >
            <span aria-hidden>{LANGUAGE_FLAGS[lng]}</span>
            <span className="uppercase">{lng}</span>
          </button>
        );
      })}
    </div>
  );
}

export default LanguageSwitcher;
