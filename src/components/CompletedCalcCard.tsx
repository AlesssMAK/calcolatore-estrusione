import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { CompanyCalc } from '../lib/sharedCalc';
import { calcSummary } from '../utils/completedTotals';
import { formatDuration, formatShortDateTime } from '../utils/format';
import MarqueeText from './MarqueeText';

/**
 * A finished company calc (the Produzione page's block of this week's, the
 * Completati page): when it started and ended, the meters made and the time it
 * took. A tap opens its result.
 */
export default function CompletedCalcCard({
  calc,
  onOpen,
  actions,
}: {
  calc: CompanyCalc;
  onOpen: () => void;
  /** Its buttons (bare icons), top right. */
  actions?: ReactNode;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'it';
  const { totals, meters, products } = calcSummary(calc.payload);
  const units = {
    day: t('units.day'),
    hour: t('units.hour'),
    minute: t('units.minute'),
  };
  const m = meters >= 100 ? meters.toFixed(0) : meters.toFixed(2).replace(/\.?0+$/, '');
  return (
    <li
      onClick={onOpen}
      title={t('completed.open')}
      className="cursor-pointer rounded-xl border border-success/30 bg-white shadow-sm transition hover:border-success/60"
    >
      <div className="flex items-start justify-between gap-2 px-3 pt-3 sm:px-4">
        <button
          type="button"
          className="flex min-w-0 cursor-pointer items-center gap-1 text-left font-semibold text-ink"
        >
          <MarqueeText text={calc.payload.label || '—'} />
          <span aria-hidden className="shrink-0 text-ink-soft">
            ›
          </span>
        </button>
        <span className="flex shrink-0 items-center gap-1">
          <span className="inline-flex items-center rounded bg-success/10 px-1.5 py-0.5 text-[11px] font-semibold text-success">
            ✓ {t('report.status.done')}
          </span>
          {actions && (
            // (its buttons don't open the result)
            <span className="flex items-center" onClick={(e) => e.stopPropagation()}>
              {actions}
            </span>
          )}
        </span>
      </div>
      <div className="px-3 pt-1 pb-3 text-xs sm:px-4">
        {products.length > 0 && (
          <div className="flex min-w-0">
            <MarqueeText text={products.join(' · ')} className="text-sm text-ink-soft" />
          </div>
        )}
        {totals && (
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
            <dt className="text-ink-soft">{t('results.col.start')}</dt>
            <dd className="font-medium text-ink">{formatShortDateTime(totals.startAt, lang)}</dd>
            <dt className="text-ink-soft">{t('results.col.end')}</dt>
            <dd className="font-semibold text-success">{formatShortDateTime(totals.endAt, lang)}</dd>
            <dt className="text-ink-soft">{t('results.col.meters')}</dt>
            <dd className="font-medium text-ink">{m} m</dd>
            <dt className="text-ink-soft">{t('results.totalProduction')}</dt>
            <dd className="font-medium text-ink">
              {formatDuration(totals.totalProductionMinutes, units)}
            </dd>
            <dt className="text-ink-soft">{t('results.totalDuration')}</dt>
            <dd className="font-medium text-ink">
              {formatDuration(totals.totalDurationMinutes, units)}
            </dd>
          </dl>
        )}
      </div>
    </li>
  );
}
