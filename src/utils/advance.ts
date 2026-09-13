import { calculateSchedule, progressAsOf } from './calculator';
import type { FormValues } from '../formSchema';
import type { SavedCalculation } from '../lib/calcHistory';
import type { ProducedEntry, ScheduledOrder, ScheduleResult } from '../types';

export interface AdvancedCalc {
  /** Active (not-yet-finished) orders only, produced-so-far filled, start=now. */
  values: FormValues;
  /** Recomputed schedule of the active orders (aligned with `values.orders`). */
  result: ScheduleResult;
  /** Orders already fully produced as of `now` — historical rows, marked
   *  completed, kept aside from `result`/`values` (shown but not editable). */
  completedRows: ScheduledOrder[];
}

/** Turn a scheduled order into a clean "completed" row: keep its identity and
 *  time window (start / end / duration / meters) but drop produced/remaining,
 *  per-size, per-unit and segment data so it renders as a single done row
 *  without confusing "produced 0/total" sub-blocks. */
export function toCompletedRow(row: ScheduledOrder): ScheduledOrder {
  return {
    ...row,
    completed: true,
    producedProfiles: undefined,
    producedPackages: undefined,
    remainingProfiles: undefined,
    remainingPackages: undefined,
    producedSheets: undefined,
    producedPallets: undefined,
    remainingSheets: undefined,
    remainingPallets: undefined,
    producedLengthM: undefined,
    remainingLengthM: undefined,
    sizeDetails: undefined,
    segments: undefined,
    timePerUnitMin: undefined,
    totalUnits: undefined,
  };
}

/** An empty schedule (used when every order is already completed). */
function emptyResult(now: Date, base: ScheduleResult): ScheduleResult {
  return {
    rows: [],
    startAt: now,
    endAt: now,
    totalProductionMinutes: 0,
    totalGapMinutes: 0,
    totalDurationMinutes: 0,
    totalPackages: undefined,
    mode: base.mode,
    productName: base.productName,
  };
}

/**
 * Build the "as of now" view of a saved calculation: fill each active order's
 * produced-so-far from the time elapsed since the original start, set the start
 * to now, and recompute — using the calc's own saved schedule snapshot (so it
 * doesn't depend on possibly-changed company settings).
 *
 * Orders already fully produced by `now` are split off into `completedRows`
 * (with their historical times, marked completed) and removed from the form so
 * only the remaining work stays editable.
 *
 * Returns null when it can't / shouldn't advance: missing inputs or snapshot,
 * or nothing elapsed yet (calc at/in the future).
 */
export function buildAdvancedCalc(
  entry: SavedCalculation,
  now: Date,
): AdvancedCalc | null {
  const { values, snapshot, result } = entry;
  if (!values || !snapshot) return null;
  if (now.getTime() <= result.startAt.getTime()) return null;

  const mode = result.mode;
  const progress = progressAsOf(result, now, snapshot);

  const completedRows: ScheduledOrder[] = [...(entry.completedRows ?? [])];
  const activeOrders: FormValues['orders'] = [];

  // Replay speed + cavity inheritance across the original orders. Only the
  // first order carries a required speed; later ones inherit it (same for the
  // cavity multiplier). Once earlier orders are split off as completed, the new
  // first active order would lose those inherited values — the re-calc then
  // throws "speedMPerMin required on the first order" (and cavity would wrongly
  // reset to 1). So materialize the resolved values onto each order, keeping
  // every active order self-contained.
  let lastSpeed: number | undefined;
  let lastCavity: number | undefined;
  const resolvedSpeed: (number | undefined)[] = [];
  const resolvedCavity: (number | undefined)[] = [];
  values.orders.forEach((order) => {
    if (order.speedMPerMin && order.speedMPerMin > 0) {
      lastSpeed = order.speedMPerMin;
    }
    resolvedSpeed.push(lastSpeed);
    const ownCavity =
      order.cavity && order.cavity > 0 ? order.cavity : undefined;
    resolvedCavity.push(ownCavity ?? lastCavity);
    if (ownCavity) lastCavity = ownCavity;
  });

  values.orders.forEach((order, i) => {
    const p = progress.orders[i];

    // Finished before now → completed row (historical times), out of the form.
    if (p?.done) {
      const row = result.rows[i];
      if (row) completedRows.push(toCompletedRow(row));
      return;
    }

    // Still active → inject produced-so-far and keep it editable. Stamp the
    // inherited speed/cavity so the order stands alone if it's now the first.
    const base = {
      ...order,
      speedMPerMin: resolvedSpeed[i] ?? order.speedMPerMin,
      cavity: resolvedCavity[i] ?? order.cavity,
    };

    if (base.useTotalLength) {
      // Total-meters: elapsed meters as a single 1 m-unit produced batch
      // (count = meters, length = 1000 mm) → flows through count×length.
      const meters = Math.round(p?.producedLengthM ?? 0);
      const count: ProducedEntry[] = [{ value: meters }];
      const length: ProducedEntry[] = [{ value: 1000 }];
      const empty: ProducedEntry[] = [{}];
      activeOrders.push(
        mode === 'profiles'
          ? {
              ...base,
              producedProfiles: count,
              producedItemLength: length,
              profilesPerPackage: empty,
              producedPackages: empty,
              producedSheets: [],
              producedPallets: [],
            }
          : {
              ...base,
              producedSheets: count,
              producedItemLength: length,
              sheetsPerPallet: empty,
              producedPallets: empty,
              producedProfiles: [],
              producedPackages: [],
            },
      );
      return;
    }

    const counts = p?.producedCountPerSize ?? [];
    const produced: ProducedEntry[] = counts.map((value, sizeIndex) => ({
      sizeIndex,
      value,
    }));
    // Direct-count path wins; clear the rate-count produced so it can't
    // double-count. Rate arrays stay (they drive totals).
    activeOrders.push(
      mode === 'profiles'
        ? { ...base, producedProfiles: produced, producedPackages: [] }
        : { ...base, producedSheets: produced, producedPallets: [] },
    );
  });

  const settings: FormValues['settings'] = {
    ...values.settings,
    startMode: 'now',
    startAt: '',
  };

  const advResult =
    activeOrders.length > 0
      ? calculateSchedule(settings, activeOrders, {
          mode,
          schedule: snapshot.schedule ?? undefined,
          warmupMinutes: snapshot.warmupMinutes,
          shutdownMinutes: snapshot.shutdownMinutes,
          now,
        })
      : emptyResult(now, result);

  return { values: { settings, orders: activeOrders }, result: advResult, completedRows };
}
