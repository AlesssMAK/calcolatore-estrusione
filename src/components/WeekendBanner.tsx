import { useFormContext, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { FormValues } from '../formSchema';
import type { WeekendDay } from '../types';

const fmt = (h: number) => {
  const hh = Math.floor(h);
  return `${String(hh).padStart(2, '0')}:${h - hh >= 0.5 ? '30' : '00'}`;
};

// Always-visible reminder that the weekend shift is on and folded into the
// calculation — stays put even when the settings panel is collapsed.
function WeekendBanner() {
  'use no memo';
  const { control } = useFormContext<FormValues>();
  const { t } = useTranslation();
  const weekend = useWatch({ control, name: 'settings.weekend' });

  if (!weekend?.enabled) return null;

  const parts: string[] = [];
  const addDay = (label: string, d: WeekendDay | undefined) => {
    if (!d?.enabled) return;
    parts.push(
      `${label} ${d.full24 ? t('settings.weekend.full24') : `${fmt(d.start)}–${fmt(d.end)}`}`,
    );
  };
  addDay(t('settings.weekend.sat'), weekend.sat);
  addDay(t('settings.weekend.sun'), weekend.sun);
  if (parts.length === 0) return null;

  return (
    <div className="no-print flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-brand-200 bg-brand-50/60 px-3 py-2 text-sm">
      <span className="font-medium text-brand-700">
        📅 {t('settings.weekend.active')}
      </span>
      <span className="text-ink-soft">{parts.join(' · ')}</span>
    </div>
  );
}

export default WeekendBanner;
