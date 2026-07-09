import { useTranslation } from 'react-i18next';
import LanguageSwitcher from './LanguageSwitcher';
import { useCatalog } from '../contexts/CatalogContext';

interface Props {
  /** Heading text. Defaults to the app title (calculator). */
  title?: string;
  /** When set, the logo links here in the SAME tab (subpages use this to go
   *  back). When omitted the calculator behaviour is kept: home in a new tab. */
  homeHref?: string;
}

function Header({ title, homeHref }: Props) {
  const { t } = useTranslation();
  const { company, loading, error } = useCatalog();
  const heading = title ?? t('app.title');
  const logoProps = homeHref
    ? { href: homeHref }
    : { href: '/', target: '_blank' as const, rel: 'noreferrer' };

  return (
    <header className="no-print border-b border-neutral-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-2 px-3 py-3 sm:flex-nowrap sm:gap-4 sm:px-4 sm:py-4">
        <a {...logoProps} className="block shrink-0" aria-label={heading}>
          <img src="/logo.png" alt={heading} className="h-10 w-50 md:h-12" />
        </a>
        <h1 className="order-last w-full text-center text-base font-semibold text-ink leading-tight sm:order-none sm:w-auto sm:flex-1 sm:whitespace-nowrap sm:text-[clamp(0.7rem,2.6vw,1.25rem)]">
          {heading}
        </h1>
        <div className="mx-auto sm:mx-0 sm:ml-auto">
          <LanguageSwitcher />
        </div>
      </div>
      {(company || loading || error) && (
        <div className="mx-auto max-w-6xl px-3 pb-2 sm:px-4">
          {company && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700">
              <span aria-hidden>🏷</span>
              <span className="text-ink-soft">Listino:</span>
              <span className="font-semibold text-brand-700">{company.name}</span>
            </span>
          )}
          {!company && loading && (
            <span className="text-xs text-ink-soft">Caricamento listino…</span>
          )}
          {error && !company && (
            <span className="text-xs font-medium text-danger">⚠ {error}</span>
          )}
        </div>
      )}
    </header>
  );
}

export default Header;
