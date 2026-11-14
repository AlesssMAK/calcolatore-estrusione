import type { ScheduleResult, ScheduledOrder } from '../types';

/**
 * What a calc whose every order is done took — for its summary (Tempo Netto,
 * Durata Totale, the end): from its first order's start to its last one's
 * end, the production in it and the pauses between. Null: no rows.
 */
export function completedTotals(
  rows: ScheduledOrder[],
): Pick<
  ScheduleResult,
  | 'startAt'
  | 'endAt'
  | 'totalProductionMinutes'
  | 'totalGapMinutes'
  | 'totalDurationMinutes'
  | 'totalPackages'
> | null {
  if (rows.length === 0) return null;
  const t = (d: Date | string) => new Date(d).getTime();
  const start = Math.min(...rows.map((r) => t(r.start)));
  const end = Math.max(...rows.map((r) => t(r.end)));
  const production = rows.reduce((s, r) => s + (r.productionMinutes ?? 0), 0);
  // The pauses that ran inside it (not one after its last order).
  const gaps = rows.reduce(
    (s, r) =>
      r.gapStart && r.gapEnd && t(r.gapEnd) <= end
        ? s + Math.max(0, (t(r.gapEnd) - t(r.gapStart)) / 60000)
        : s,
    0,
  );
  const packages = rows.some((r) => r.packages !== undefined)
    ? rows.reduce((s, r) => s + (r.packages ?? 0), 0)
    : undefined;
  return {
    startAt: new Date(start),
    endAt: new Date(end),
    totalProductionMinutes: Math.round(production),
    totalGapMinutes: Math.round(gaps),
    totalDurationMinutes: Math.round((end - start) / 60000),
    totalPackages: packages,
  };
}
