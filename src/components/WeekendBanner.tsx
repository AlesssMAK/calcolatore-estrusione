import { useFormContext, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { FormValues } from '../formSchema';
import type { WeekendDay } from '../types';

const fmt = (h: number) => {
  const hh = Math.floor(h);
  return `${String(hh).padStart(2, '0')}:${h - hh >= 0.5 ? '30' : '00'}`;
};

const bannerCls =
  'no-print flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-brand-200 bg-brand-50/60 px-3 py-2 text-sm';

// Always-visible reminder of the time settings folded into the calculation
// (weekend shift, or "Senza limiti orari" which overrides it, plus "Calcolo
// fisso") — stays put even when the settings panel is collapsed.
function WeekendBanner() {
  'use no memo';
  const { control } = useFormContext<FormValues>();
  const { t } = useTranslation();
  const weekend = useWatch({ control, name: 'settings.weekend' });
  const noLimits = !!useWatch({ control, name: 'settings.noLimits' });
  const frozen = !!useWatch({ control, name: 'settings.frozen' });

  const parts: string[] = [];
  const addDay = (label: string, d: WeekendDay | undefined) => {
    if (!d?.enabled) return;
    parts.push(
      `${label} ${d.full24 ? t('settings.weekend.full24') : `${fmt(d.start)}–${fmt(d.end)}`}`,
    );
  };
  if (weekend?.enabled && !noLimits) {
    addDay(t('settings.weekend.sat'), weekend.sat);
    addDay(t('settings.weekend.sun'), weekend.sun);
  }

  if (!noLimits && !frozen && parts.length === 0) return null;

  return (
    <div className="space-y-2">
      {noLimits && (
        <div className={bannerCls}>
          <span className="font-medium text-brand-700">
            ⏱ {t('settings.noLimits.active')}
          </span>
        </div>
      )}
      {parts.length > 0 && (
        <div className={bannerCls}>
          <span className="font-medium text-brand-700">
            📅 {t('settings.weekend.active')}
          </span>
          <span className="text-ink-soft">{parts.join(' · ')}</span>
        </div>
      )}
      {frozen && (
        <div className={bannerCls}>
          <span className="font-medium text-brand-700">
            📌 {t('settings.frozen.active')}
          </span>
        </div>
      )}
    </div>
  );
}

export default WeekendBanner;
