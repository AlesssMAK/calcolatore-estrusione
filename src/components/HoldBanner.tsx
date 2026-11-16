import { useState } from 'react';
import { useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import type { FormValues } from '../formSchema';
import { pauseColorHex } from '../lib/pauseReasons';
import { getDateFnsLocale } from '../utils/format';
import { HaltIcon } from './ActionIcons';

/**
 * A tracked calc whose line is stopped until a moment ("Ferma fino a…", or a
 * stop between sizes running): until when and why, tinted with its reason's
 * colour — 📅 change it, ▶ resume now. Nothing once it's over.
 */
function HoldBanner({
  onChange,
  onResume,
}: {
  /** Absent (a read-only calc): no buttons. */
  onChange?: () => void;
  onResume?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const hold = useWatch<FormValues, 'settings.hold'>({ name: 'settings.hold' });
  // (as of when it showed — a calc reopened later is brought up to then)
  const [now] = useState(() => Date.now());
  if (!hold) return null;
  const until = new Date(hold.until);
  if (Number.isNaN(until.getTime()) || until.getTime() <= now) return null;
  const from = new Date(hold.from);
  const locale = getDateFnsLocale(i18n.resolvedLanguage ?? 'it');
  const hex = pauseColorHex(hold.reason?.color ?? 'orange');

  return (
    <div
      role="status"
      className="no-print mb-3 rounded-lg border px-3 py-2"
      style={{ backgroundColor: `${hex}14`, borderColor: `${hex}66` }}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="flex min-w-0 flex-1 basis-full items-center gap-2 text-sm font-semibold text-ink sm:basis-0">
          <HaltIcon className="h-4 w-4 shrink-0 text-amber-600" />
          <span className="min-w-0">
            {t('halt.banner', { until: format(until, 'EEE dd.MM.yyyy · HH:mm', { locale }) })}
            {hold.reason && (
              <span className="font-medium text-ink-soft"> · {hold.reason.name}</span>
            )}
          </span>
        </span>
        {onChange && (
          <button
            type="button"
            onClick={onChange}
            className="rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-xs font-medium text-ink-soft shadow-sm transition hover:border-brand-500 hover:text-brand-600"
          >
            📅 {t('halt.change')}
          </button>
        )}
        {onResume && (
          <button
            type="button"
            onClick={onResume}
            className="rounded-md bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-700"
          >
            ▶ {t('halt.resume')}
          </button>
        )}
      </div>
      {!Number.isNaN(from.getTime()) && (
        <p className="mt-0.5 pl-6 text-[11px] text-ink-soft tabular-nums">
          {t('halt.since', { from: format(from, 'dd.MM.yyyy HH:mm') })}
        </p>
      )}
    </div>
  );
}

export default HoldBanner;
