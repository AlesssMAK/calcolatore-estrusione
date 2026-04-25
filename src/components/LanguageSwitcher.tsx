import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES } from '../i18n';
import type { SupportedLanguage } from '../i18n';

function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  const current = (i18n.resolvedLanguage ?? 'it') as SupportedLanguage;

  return (
    <div
      className="inline-flex items-center gap-0.5 rounded-md border border-neutral-200 bg-white p-0.5 shadow-sm sm:gap-1 sm:rounded-lg sm:p-1"
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
                ? 'rounded bg-brand-600 px-1.5 py-0.5 text-[11px] font-semibold tracking-wide text-white uppercase sm:rounded-md sm:px-2.5 sm:py-1 sm:text-sm'
                : 'rounded px-1.5 py-0.5 text-[11px] font-medium tracking-wide text-ink-soft uppercase hover:bg-neutral-100 sm:rounded-md sm:px-2.5 sm:py-1 sm:text-sm'
            }
          >
            {lng}
          </button>
        );
      })}
    </div>
  );
}

export default LanguageSwitcher;
