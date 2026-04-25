import { useTranslation } from 'react-i18next';
import LanguageSwitcher from './LanguageSwitcher';

function Header() {
  const { t } = useTranslation();

  return (
    <header className="no-print border-b border-neutral-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:py-5">
        <div className="flex items-center gap-4">
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
              className="h-10 w-auto sm:h-10"
            />
          </a>
          <div className="hidden pl-4 sm:block">
            <h1 className="text-base font-semibold text-ink sm:text-lg">
              {t('app.title')}
            </h1>
          </div>
        </div>
        <LanguageSwitcher />
      </div>
    </header>
  );
}

export default Header;
