import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { useLongPress } from '../hooks/useLongPress';
import CompanyConnect from './CompanyConnect';
import LanguageSwitcher from './LanguageSwitcher';
import { useCatalog } from '../contexts/CatalogContext';
import { clearDraft } from '../lib/formDraft';
import { isInstalledApp } from '../lib/installedCompany';
import { loadProductionStart, saveProductionStart } from '../lib/productionView';
import { CalcIcon, FactoryIcon } from './ActionIcons';

interface Props {
  /** Heading text. Defaults to the app title (calculator). */
  title?: string;
  /** Where the logo links. Defaults to the calculator home. Subpages pass their
   *  own back-target. Always opens in the SAME tab — clicking the logo on the
   *  calculator reloads it instead of spawning a new tab. */
  homeHref?: string;
  /** The "Produzione" switch next to "Listino": on the calculator, or on the
   *  Produzione page itself. Omit → none. */
  production?: 'calculator' | 'page';
}

function Header({ title, homeHref, production }: Props) {
  const { t } = useTranslation();
  const { company, loading, error } = useCatalog();
  const heading = title ?? t('app.title');
  // Keep the active company link (?company=<slug>) when going home, so the
  // logo returns to the company calculator, not the base one.
  const base = homeHref ?? '/';
  const homeUrl = company
    ? `${base}?company=${encodeURIComponent(company.slug)}`
    : base;
  // Hidden way into the admin (the installed app has no address bar): hold the
  // logo for ~2 s. A normal tap still goes home.
  const navigate = useNavigate();
  const adminPress = useLongPress(() => navigate('/admin'));
  // The installed app can't be given a company link: it gets one here.
  const canConnect = !company && !loading && isInstalledApp();

  return (
    <header className="no-print border-b border-neutral-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-2 px-3 py-3 sm:flex-nowrap sm:gap-4 sm:px-4 sm:py-4">
        <a
          href={homeUrl}
          {...adminPress.handlers}
          onClick={(e) => {
            if (adminPress.wasLongPress()) {
              e.preventDefault();
              return;
            }
            clearDraft();
          }}
          draggable={false}
          className="block shrink-0 select-none [-webkit-touch-callout:none]"
          aria-label={heading}
        >
          <img
            src="/logo.png"
            alt={heading}
            draggable={false}
            className="h-10 w-50 md:h-12"
          />
        </a>
        <h1 className="order-last w-full text-center text-base font-semibold text-ink leading-tight sm:order-none sm:w-auto sm:flex-1 sm:whitespace-nowrap sm:text-[clamp(0.7rem,2.6vw,1.25rem)]">
          {heading}
        </h1>
        <div className="mx-auto sm:mx-0 sm:ml-auto">
          <LanguageSwitcher />
        </div>
      </div>
      {(company || loading || error || canConnect) && (
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-3 pb-2 sm:px-4">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
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
            {canConnect && (
              <CompanyConnect
                className={`${pillCls} border-brand-300 bg-brand-50 text-brand-700 hover:border-brand-500`}
              />
            )}
          </div>
          {company && production && <ProductionSwitch where={production} />}
        </div>
      )}
    </header>
  );
}

const pillCls =
  'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium shadow-sm transition';

/** "Produzione" next to "Listino": a switch that makes the Produzione page the
 *  app's start page — on, the page opens (now and at every launch); off, back
 *  to the calculator (on the page it reads "Calcolatore"). On the calculator
 *  while it's on: the way back to it. */
function ProductionSwitch({ where }: { where: 'calculator' | 'page' }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { search } = useLocation();
  const [startsThere] = useState(loadProductionStart);
  const on = where === 'page';
  if (!on && startsThere) {
    return (
      <button
        type="button"
        onClick={() => navigate(`/produzione${search}`)}
        className={`${pillCls} border-brand-300 bg-brand-50 text-brand-700 hover:border-brand-500`}
      >
        <span aria-hidden>←</span>
        <FactoryIcon className="h-3.5 w-3.5" />
        {t('production.title')}
      </button>
    );
  }
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      title={t(on ? 'production.switchOffTitle' : 'production.switchTitle')}
      onClick={() => {
        saveProductionStart(!on);
        navigate(on ? `/${search}` : `/produzione${search}`);
      }}
      className={`${pillCls} ${
        on
          ? 'border-brand-300 bg-brand-50 text-brand-700 hover:border-brand-500'
          : 'border-neutral-300 bg-white text-ink-soft hover:border-brand-400 hover:text-ink'
      }`}
    >
      {/* On the page it names where a tap takes you: the calculator. */}
      {on ? <CalcIcon className="h-3.5 w-3.5" /> : <FactoryIcon className="h-3.5 w-3.5" />}
      {t(on ? 'production.toCalculator' : 'production.title')}
      <span
        aria-hidden
        className={`relative inline-block h-4 w-7 shrink-0 rounded-full transition ${
          on ? 'bg-brand-600' : 'bg-neutral-300'
        }`}
      >
        <span
          className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-all ${
            on ? 'left-3.5' : 'left-0.5'
          }`}
        />
      </span>
    </button>
  );
}

export default Header;
