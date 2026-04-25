import { useTranslation } from 'react-i18next';
import LanguageSwitcher from './LanguageSwitcher';

function Header() {
  const { t } = useTranslation();

  return (
    <header className="no-print border-b border-neutral-200 bg-white">
      <div className="mx-auto grid max-w-6xl grid-cols-[auto_1fr_auto] items-center gap-2 px-3 py-3 sm:gap-4 sm:px-4 sm:py-4">
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
            className="h-8 w-auto sm:h-10 md:h-12"
          />
        </a>
        <h1 className="text-center font-semibold whitespace-nowrap text-ink leading-tight text-[clamp(0.7rem,2.6vw,1.25rem)]">
          {t('app.title')}
        </h1>
        <LanguageSwitcher />
      </div>
    </header>
  );
}

export default Header;
