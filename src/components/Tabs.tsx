import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { CalculatorMode } from '../types';
import type { CalcModes } from '../lib/catalog';

interface Props {
  value: CalculatorMode;
  onChange: (mode: CalculatorMode) => void;
  /** Which tabs the company shows (both / sheets-only / profiles-only). */
  modes: CalcModes;
  /** Whether to show the Piramide link. */
  showPiramide: boolean;
  /** Piramide link target (carries ?company= when a company is active). */
  piramideHref: string;
  settingsOpen: boolean;
  onToggleSettings: () => void;
}

const ALL_TABS: CalculatorMode[] = ['sheets', 'profiles'];

function Tabs({
  value,
  onChange,
  modes,
  showPiramide,
  piramideHref,
  settingsOpen,
  onToggleSettings,
}: Props) {
  const { t } = useTranslation();
  const tabs = modes === 'both' ? ALL_TABS : [modes];

  return (
    <div className="no-print mb-4 flex items-center justify-between gap-2 sm:mb-5">
      {tabs.length > 1 ? (
        <div
          role="tablist"
          aria-label={t('tabs.label')}
          className="inline-flex rounded-lg border border-neutral-200 bg-white p-1 shadow-sm"
        >
          {tabs.map((m) => {
            const active = m === value;
            return (
              <button
                key={m}
                role="tab"
                type="button"
                aria-selected={active}
                onClick={() => onChange(m)}
                className={
                  active
                    ? 'rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition'
                    : 'rounded-md px-4 py-2 text-sm font-medium text-ink-soft transition hover:bg-neutral-100'
                }
              >
                {t(`tabs.${m}`)}
              </button>
            );
          })}
        </div>
      ) : (
        <div />
      )}

      <div className="flex items-center gap-2">
        {showPiramide && (
          <Link
            to={piramideHref}
            aria-label={t('piramide.title')}
            title={t('piramide.title')}
            className="inline-flex items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-ink-soft shadow-sm transition hover:border-brand-400 hover:text-ink"
          >
            <span aria-hidden className="flex h-5 w-5 items-center justify-center leading-none">
              📐
            </span>
            <span className="hidden whitespace-nowrap sm:inline">
              {t('piramide.title')}
            </span>
          </Link>
        )}

        <button
          type="button"
          onClick={onToggleSettings}
          aria-pressed={settingsOpen}
          aria-label={t('settings.title')}
          title={t('settings.title')}
          className={
            settingsOpen
              ? 'inline-flex items-center gap-1.5 rounded-md border border-brand-600 bg-brand-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition'
              : 'inline-flex items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-ink-soft shadow-sm transition hover:border-brand-400 hover:text-ink'
          }
        >
          <span aria-hidden className="flex h-5 w-5 items-center justify-center leading-none">
            ⚙
          </span>
          <span className="hidden whitespace-nowrap sm:inline">
            {t('settings.title')}
          </span>
        </button>
      </div>
    </div>
  );
}

export default Tabs;
