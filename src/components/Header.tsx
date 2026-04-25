import { useTranslation } from 'react-i18next';
import LanguageSwitcher from './LanguageSwitcher';

function Header() {
  const { t } = useTranslation();

  return (
    <header className="no-print border-b border-neutral-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-2 px-3 py-3 sm:flex-nowrap sm:gap-4 sm:px-4 sm:py-4">
        <a
          href="https://akraplast.com"
          target="_blank"
          rel="noreferrer"
          className="block shrink-0"
          aria-label="AKRAPLAST Sistemi S.r.l."
        >
          <img
            src="/logo.png"
            alt="AKRAPLAST Sistemi S.r.l."
            className="h-10 w-auto md:h-12"
          />
        </a>
        <h1 className="order-last w-full text-center text-base font-semibold text-ink leading-tight sm:order-none sm:w-auto sm:flex-1 sm:whitespace-nowrap sm:text-[clamp(0.7rem,2.6vw,1.25rem)]">
          {t('app.title')}
        </h1>
        <div className="mx-auto sm:mx-0 sm:ml-auto">
          <LanguageSwitcher />
        </div>
      </div>
    </header>
  );
}

export default Header;
