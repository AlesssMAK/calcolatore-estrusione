import { useTranslation } from 'react-i18next';
import type { CalculatorMode } from '../types';

interface Props {
  value: CalculatorMode;
  onChange: (mode: CalculatorMode) => void;
  settingsOpen: boolean;
  onToggleSettings: () => void;
}

const TABS: CalculatorMode[] = ['sheets', 'profiles'];

function Tabs({ value, onChange, settingsOpen, onToggleSettings }: Props) {
  const { t } = useTranslation();

  return (
    <div className="no-print mb-4 flex items-center justify-between gap-2 sm:mb-5">
      <div
        role="tablist"
        aria-label={t('tabs.label')}
        className="inline-flex rounded-lg border border-neutral-200 bg-white p-1 shadow-sm"
      >
        {TABS.map((m) => {
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
        <span aria-hidden>⚙</span>
        <span className="hidden whitespace-nowrap sm:inline">
          {t('settings.title')}
        </span>
      </button>
    </div>
  );
}

export default Tabs;
