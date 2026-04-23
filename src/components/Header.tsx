import { useTranslation } from 'react-i18next';
import LanguageSwitcher from './LanguageSwitcher';

function LogoMark() {
  return (
    <div
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-lg font-bold text-white shadow-sm"
      aria-hidden
    >
      AK
    </div>
  );
}

function Header() {
  const { t } = useTranslation();

  return (
    <header className="no-print border-b border-neutral-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:py-5">
        <div className="flex items-center gap-3">
          <LogoMark />
          <div>
            <div className="text-xs font-semibold tracking-[0.18em] text-brand-600 uppercase">
              AKRAPLAST
            </div>
            <h1 className="text-lg font-semibold text-ink sm:text-xl">
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
