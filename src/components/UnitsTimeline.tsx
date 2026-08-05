import { useMemo, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { addWorkingMinutes } from '../utils/calculator';
import { formatDuration, formatShortDateTime } from '../utils/format';

interface Props {
  /** When the remaining production starts (already shifted past weekends). */
  start: Date;
  /** When the remaining production ends — the last (often partial) unit is
   *  pinned here so it lines up exactly with the order's Fine. */
  end: Date;
  /** Minutes needed to produce one full unit (pallet / package). */
  timePerUnitMin: number;
  /** Total number of units for this slot (full order, incl. already produced). */
  totalUnits: number;
  /** Minutes already produced (full order production − remaining). Shifts the
   *  first ready-times earlier and skips units finished before `start`. */
  producedMinutes: number;
  /** 'bancale' | 'pacco' — picks the i18n key prefix. */
  kind: 'pallet' | 'package';
}

const INITIAL_PAGE_SIZE = 20;
const PAGE_STEP = 20;

/**
 * Compact "time per unit" pill + a collapsible timeline:
 *   - small input "Bancale №" to jump to any unit instantly
 *   - first N units listed with start times (computed via addWorkingMinutes,
 *     so weekend gaps are accounted for)
 *   - "Mostra altri X" to extend in steps; "Mostra tutti" if 100+ left
 *
 * Used both at the row level (single-size order) and inside per-size
 * sub-rows of multi-size orders.
 */
function UnitsTimeline({
  start,
  end,
  timePerUnitMin,
  totalUnits,
  producedMinutes,
  kind,
}: Props) {
  'use no memo';
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? 'it';
  const [expanded, setExpanded] = useState(false);
  const [pageSize, setPageSize] = useState(INITIAL_PAGE_SIZE);
  const [query, setQuery] = useState('');

  const units = { day: t('units.day'), hour: t('units.hour'), minute: t('units.minute') };
  const labelOne = t(`results.${kind}.one`);
  const labelMany = t(`results.${kind}.many`);

  // Units already fully produced before `start` are skipped; the list runs
  // from the first not-yet-finished unit to the last.
  const producedUnits =
    timePerUnitMin > 0 ? Math.max(0, producedMinutes / timePerUnitMin) : 0;
  const firstUnit = Math.min(totalUnits, Math.floor(producedUnits) + 1);
  const remainingUnits = Math.max(0, totalUnits - firstUnit + 1);

  // The "Mostra altri" cursor never shrinks the list — increasing pageSize
  // only adds rows on screen.
  const visibleCount = Math.min(pageSize, remainingUnits);

  // Ready-time of unit N (when it's finished). Already-produced pieces shift
  // it earlier; the last unit is partial, so it's pinned to the order's end
  // (exact even across weekend gaps / buffers).
  const readyTimeFor = (unitNumber: number): Date =>
    unitNumber >= totalUnits
      ? end
      : addWorkingMinutes(
          start,
          Math.max(0, unitNumber - producedUnits) * timePerUnitMin,
        );

  const visible = useMemo(
    () =>
      Array.from({ length: visibleCount }, (_, i) => {
        const n = firstUnit + i;
        return { n, at: readyTimeFor(n) };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [start, end, timePerUnitMin, producedUnits, firstUnit, visibleCount],
  );

  // Numeric input handler: clamp to [1, totalUnits], live preview.
  const onQueryChange = (e: ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
  };
  const queryNum = Number(query);
  const queryValid =
    query !== '' &&
    Number.isFinite(queryNum) &&
    queryNum >= firstUnit &&
    queryNum <= totalUnits &&
    Number.isInteger(queryNum);
  const queryResultAt = queryValid ? readyTimeFor(queryNum) : null;

  const remainingInList = remainingUnits - visibleCount;

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="no-print inline-flex items-center gap-1 text-[11px] font-medium text-brand-700 transition hover:text-brand-800 sm:text-xs"
      >
        {expanded ? '▾' : '▸'} {t(`results.${kind}.timesPerUnit`)}
      </button>

      {expanded && (
        <div className="mt-2 rounded-md border border-neutral-200 bg-white p-3">
          {/* Quick lookup */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <label className="text-xs text-ink-soft">
              {labelOne} №
              <input
                type="number"
                inputMode="numeric"
                min={firstUnit}
                max={totalUnits}
                step="1"
                value={query}
                onChange={onQueryChange}
                placeholder="—"
                className="ml-1 w-20 rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs text-ink shadow-sm focus:border-brand-600 focus:ring-2 focus:ring-brand-200 focus:outline-none"
              />
            </label>
            {queryResultAt && (
              <span className="text-xs">
                <span className="text-ink-soft">→ </span>
                <span className="font-semibold text-brand-700">
                  {formatShortDateTime(queryResultAt, lang)}
                </span>
              </span>
            )}
            {query !== '' && !queryValid && (
              <span className="text-xs text-danger">
                {firstUnit} – {totalUnits}
              </span>
            )}
          </div>

          {/* List of first N units */}
          <ul className="max-h-64 space-y-0.5 overflow-y-auto text-xs">
            {visible.map(({ n, at }) => (
              <li
                key={n}
                className="flex items-baseline justify-between gap-2 border-b border-neutral-100 py-1 last:border-b-0"
              >
                <span className="font-medium text-ink">
                  {labelOne} #{n}
                </span>
                <span className="font-mono text-ink-soft">
                  {formatShortDateTime(at, lang)}
                </span>
              </li>
            ))}
          </ul>

          {/* Show-more controls */}
          {remainingInList > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <span className="text-ink-soft">
                {t('results.shownOf', {
                  shown: visibleCount,
                  total: remainingUnits,
                  many: labelMany,
                })}
              </span>
              <button
                type="button"
                onClick={() =>
                  setPageSize((p) => Math.min(p + PAGE_STEP, remainingUnits))
                }
                className="rounded-md border border-neutral-300 bg-white px-2 py-1 font-medium text-ink hover:border-brand-500 hover:text-brand-700"
              >
                {t('results.showMore', { n: Math.min(PAGE_STEP, remainingInList) })}
              </button>
              {remainingInList > PAGE_STEP && (
                <button
                  type="button"
                  onClick={() => setPageSize(remainingUnits)}
                  className="rounded-md border border-neutral-300 bg-white px-2 py-1 font-medium text-ink hover:border-brand-500 hover:text-brand-700"
                >
                  {t('results.showAll')}
                </button>
              )}
            </div>
          )}

          <p className="mt-2 text-[10px] text-ink-soft">
            {t('results.timePerUnit')}: {formatDuration(timePerUnitMin, units)}
          </p>
        </div>
      )}
    </div>
  );
}

export default UnitsTimeline;
