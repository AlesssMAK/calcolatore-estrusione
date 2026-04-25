import { useTranslation } from 'react-i18next';
import type { CalculatorMode } from '../types';

interface Props {
  value: CalculatorMode;
  onChange: (mode: CalculatorMode) => void;
}

const TABS: CalculatorMode[] = ['sheets', 'profiles'];

function Tabs({ value, onChange }: Props) {
  const { t } = useTranslation();

  return (
    <div
      role="tablist"
      aria-label={t('tabs.label')}
      className="no-print mb-4 inline-flex rounded-lg border border-neutral-200 bg-white p-1 shadow-sm sm:mb-5"
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
  );
}

export default Tabs;
