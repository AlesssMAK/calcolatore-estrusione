import { calculateSchedule, progressAsOf } from './calculator';
import type { FormValues } from '../formSchema';
import type { SavedCalculation } from '../lib/calcHistory';
import type { ProducedEntry, ScheduleResult } from '../types';

export interface AdvancedCalc {
  /** Form inputs with produced-so-far filled and start set to "now". */
  values: FormValues;
  /** Recomputed schedule from now. */
  result: ScheduleResult;
}

/**
 * Build the "as of now" view of a saved calculation: fill each order's
 * produced-so-far from the time elapsed since the original start, set the start
 * to now, and recompute — using the calc's own saved schedule snapshot (so it
 * doesn't depend on possibly-changed company settings).
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

  const orders = values.orders.map((order, i) => {
    const p = progress.orders[i];

    // Total-meters mode: express elapsed meters as a single produced batch of
    // 1 m units (count = meters, length = 1000 mm) so it flows through the
    // existing count×length subtraction. The operator can overwrite it with the
    // real count×length breakdown when calibrating.
    if (order.useTotalLength) {
      const meters = Math.round(p?.producedLengthM ?? 0);
      const count: ProducedEntry[] = [{ value: meters }];
      const length: ProducedEntry[] = [{ value: 1000 }];
      const empty: ProducedEntry[] = [{}];
      return mode === 'profiles'
        ? {
            ...order,
            producedProfiles: count,
            producedItemLength: length,
            profilesPerPackage: empty,
            producedPackages: empty,
            producedSheets: [],
            producedPallets: [],
          }
        : {
            ...order,
            producedSheets: count,
            producedItemLength: length,
            sheetsPerPallet: empty,
            producedPallets: empty,
            producedProfiles: [],
            producedPackages: [],
          };
    }

    const counts = p?.producedCountPerSize ?? [];
    const produced: ProducedEntry[] = counts.map((value, sizeIndex) => ({
      sizeIndex,
      value,
    }));
    // The direct-count path wins in the calculator; clear the rate-count
    // produced so it can't double-count. Rate arrays stay (they drive totals).
    return mode === 'profiles'
      ? { ...order, producedProfiles: produced, producedPackages: [] }
      : { ...order, producedSheets: produced, producedPallets: [] };
  });

  const settings: FormValues['settings'] = {
    ...values.settings,
    startMode: 'now',
    startAt: '',
  };

  const advResult = calculateSchedule(settings, orders, {
    mode,
    schedule: snapshot.schedule ?? undefined,
    warmupMinutes: snapshot.warmupMinutes,
    shutdownMinutes: snapshot.shutdownMinutes,
    now,
  });

  return { values: { settings, orders }, result: advResult };
}
