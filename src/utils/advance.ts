import { calculateSchedule, progressAsOf } from './calculator';
import { queueStatus } from './queue';
import { NO_PAUSE, pausesAfterRemoval, samePause } from './blocks';
import { effectiveValue } from './inherit';
import type { FormValues } from '../formSchema';
import type { SavedCalculation } from '../lib/calcHistory';
import type {
  Order,
  ProducedEntry,
  ScheduledOrder,
  ScheduleResult,
  ScheduleSnapshot,
} from '../types';

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

/** A completed row's order, back in the queue (it wasn't actually done):
 *  produced fields cleared, and the speed / cavity it ran at written in where
 *  it inherited them — it usually goes back to the front, where there's
 *  nothing before it to inherit from. `completed` is the list it came from,
 *  in production order (an inherited cavity is followed back through it). */
export function orderFromCompletedRow(
  row: ScheduledOrder,
  completed: readonly ScheduledOrder[],
): Order {
  const { order } = row;
  const i = completed.indexOf(row);
  return {
    ...order,
    speedMPerMin:
      order.speedMPerMin && order.speedMPerMin > 0 ? order.speedMPerMin : row.speedMPerMin,
    cavity:
      i >= 0 ? effectiveValue(completed.map((r) => r.order), i, 'cavity') : order.cavity,
    producedProfiles: [],
    producedPackages: [],
    producedSheets: [],
    producedPallets: [],
    producedItemLength: [],
  };
}

/** An empty schedule (used when every order is already completed). */
export function emptyResult(now: Date, base: ScheduleResult): ScheduleResult {
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
 * to now, and recompute.
 *
 * By default this uses the calc's own saved schedule snapshot, but when a
 * `currentSchedule` is passed it takes precedence — so re-opening a saved calc
 * counts the hours the line *actually* works now, not those frozen at save
 * time. This is what makes the process move again after weekends are turned on
 * (or the company schedule / buffers change) since the calc was saved.
 *
 * Orders already fully produced by `now` are split off into `completedRows`
 * (with their historical times, marked completed) and removed from the form so
 * only the remaining work stays editable.
 *
 * Returns null when it can't / shouldn't advance: missing inputs or snapshot,
 * nothing elapsed yet (calc at/in the future), or a "Calcolo fisso" (frozen)
 * calc, which always reopens exactly as it was computed.
 */
export function buildAdvancedCalc(
  entry: SavedCalculation,
  now: Date,
  currentSchedule?: ScheduleSnapshot,
): AdvancedCalc | null {
  const { values, result } = entry;
  if (values?.settings.frozen) return null;
  // The current effective schedule (current weekend / company schedule /
  // buffers) wins over the frozen snapshot; fall back to it when not supplied.
  const snapshot = currentSchedule ?? entry.snapshot;
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
  // reset to 1). So an active order gets the resolved value written in only
  // where it would otherwise inherit a different one (or none) from the active
  // orders before it — the others keep inheriting, so changing a speed later
  // still carries down the queue.
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

  // What the active orders kept so far hand down (resolved values).
  let activeSpeed: number | undefined;
  let activeCavity: number | undefined;

  // A block whose last order is done but not the others (a custom queue ran it
  // first) keeps its closing pause on the last order still in the form.
  const gapMode = values.settings.gapMode;
  const pauses = pausesAfterRemoval(values.orders, (i) => !progress.orders[i]?.done, gapMode);

  values.orders.forEach((order, i) => {
    const p = progress.orders[i];

    // Finished before now → completed row (historical times), out of the form.
    if (p?.done) {
      const row = result.rows[i];
      if (row) completedRows.push(toCompletedRow(row));
      return;
    }

    // Still active → inject produced-so-far and keep it editable. Stamp an
    // inherited speed/cavity only when the order it came from left the form.
    const pause = pauses.get(i) ?? null;
    const base = {
      ...order,
      ...(samePause(order, pause, gapMode) ? {} : (pause ?? NO_PAUSE)),
      speedMPerMin:
        resolvedSpeed[i] !== activeSpeed ? resolvedSpeed[i] : order.speedMPerMin,
      cavity:
        resolvedCavity[i] !== activeCavity ? resolvedCavity[i] : order.cavity,
    };
    activeSpeed = resolvedSpeed[i];
    activeCavity = resolvedCavity[i];

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
    // Reflect the effective schedule in the re-opened form so a subsequent
    // manual "Calcola" stays consistent with the advance just computed.
    weekend: snapshot.weekend ?? values.settings.weekend,
    warmupMinutes: snapshot.warmupMinutes,
    shutdownMinutes: snapshot.shutdownMinutes,
    startMode: 'now',
    startAt: '',
    // A pause between blocks running now: the next block waits for its end
    // instead of starting "now". Cleared once it's over.
    resumeAt:
      runningPauseEnd(result, (i) => !!progress.orders[i]?.done, now)?.toISOString() ??
      undefined,
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

  // A custom queue whose re-arranged sizes are produced by now no longer
  // changes anything (the rest runs in form order) → it switches itself off.
  // Same timing either way, so the result stays valid.
  if (
    settings.queue &&
    (activeOrders.length === 0 ||
      !queueStatus(settings.queue, activeOrders, advResult).active)
  ) {
    settings.queue = undefined;
  }

  return { values: { settings, orders: activeOrders }, result: advResult, completedRows };
}

/**
 * The end of a pause running at `now`: one after a block that's done (its
 * closing order is). Results from before pauses carried their times fall back
 * to the pause running from that order's end to the next work's start.
 */
export function runningPauseEnd(
  result: ScheduleResult,
  done: (rowIdx: number) => boolean,
  now: Date,
): Date | null {
  const t = now.getTime();
  const starts = result.rows
    .filter((r, i) => !done(i) && r.remainingMinutes >= 0.5)
    .map((r) => r.start.getTime());
  const nextStart = starts.length ? Math.min(...starts) : Number.NaN;
  for (const [i, row] of result.rows.entries()) {
    if (!done(i) || !(row.gapAfterMin > 0)) continue;
    const from = (row.gapStart ?? row.end).getTime();
    const to = row.gapEnd?.getTime() ?? nextStart;
    if (Number.isFinite(to) && from <= t && t < to) return new Date(to);
  }
  return null;
}

/** The new content of a saved calc after its 🔄 tracking toggle. */
export type TrackingPatch = Pick<
  SavedCalculation,
  'result' | 'values' | 'snapshot' | 'completedRows'
>;

/**
 * The 🔄 toggle in the Salvati list: flip a saved calc between "Calcolo fisso"
 * (static) and tracking (it subtracts the elapsed production when reopened).
 *  - fixed → tracking: production starts *now* — the queue is recomputed from
 *    this moment on the current schedule, then counts down from here.
 *  - tracking → fixed: advance to now and freeze that state (what was produced
 *    so far is kept; nothing more is subtracted afterwards).
 * Returns null when the entry carries no inputs to work with.
 */
export function toggleTracking(
  entry: SavedCalculation,
  now: Date,
  currentSchedule: ScheduleSnapshot,
): TrackingPatch | null {
  const { values } = entry;
  if (!values) return null;

  if (values.settings.frozen) {
    const settings: FormValues['settings'] = {
      ...values.settings,
      frozen: false,
      weekend: currentSchedule.weekend ?? values.settings.weekend,
      startMode: 'now',
      startAt: '',
    };
    const nextValues: FormValues = { ...values, settings };
    // Nothing left to run (every order already completed) → just flip the flag.
    const result =
      nextValues.orders.length > 0
        ? calculateSchedule(settings, nextValues.orders, {
            mode: entry.result.mode,
            schedule: currentSchedule.schedule ?? undefined,
            warmupMinutes: currentSchedule.warmupMinutes,
            shutdownMinutes: currentSchedule.shutdownMinutes,
            now,
          })
        : entry.result;
    return {
      result,
      values: nextValues,
      snapshot: currentSchedule,
      completedRows: entry.completedRows,
    };
  }

  // Not started yet / can't advance → freeze it exactly as it is.
  const adv = buildAdvancedCalc(entry, now, currentSchedule);
  const base = adv ?? {
    values,
    result: entry.result,
    completedRows: entry.completedRows ?? [],
  };
  return {
    result: base.result,
    values: {
      ...base.values,
      settings: { ...base.values.settings, frozen: true },
    },
    snapshot: adv ? currentSchedule : entry.snapshot,
    completedRows: base.completedRows,
  };
}
