// Settle differences between the original and the Produzione version (see
// calcDiff): make one side match the other for chosen differences. The side
// being changed is first brought to "now" (so its production so far isn't
// lost), the differences are applied, then it's recomputed from now — like a
// "Calcola" there.

import type { FormValues } from '../formSchema';
import type {
  CalculatorMode,
  Order,
  ProducedEntry,
  ScheduleSnapshot,
  ScheduledOrder,
} from '../types';
import {
  buildAdvancedCalc,
  emptyResult,
  orderFromCompletedRow,
  toCompletedRow,
} from './advance';
import { calculateSchedule } from './calculator';
import { producedAt, type CalcDiff, type CalcVersion } from './calcDiff';
import { queueStatus } from './queue';
import { insertMap, remapSizeGroup, removeMap, SIZE_ENTRY_GROUPS } from './sizeEntries';

/** Which side's value wins. */
export type DiffSide = 'original' | 'production';

interface State {
  values: FormValues;
  completedRows: ScheduledOrder[];
}

const clone = <T>(x: T): T => structuredClone(x);

/** Index of a size by its diff key (a uid, or "#<n>" by position). */
function sizeIndexOf(order: Order, key: string): number {
  if (key.startsWith('#')) return Number(key.slice(1));
  return (order.sizes ?? []).findIndex((s) => s?.uid === key);
}

/** Re-point the order's Calcolo Avanzato rows after its sizes moved. */
function remapProduced(order: Order, map: (i: number) => number | null) {
  for (const group of SIZE_ENTRY_GROUPS) {
    const arrays = group.map((f) => order[f]);
    if (arrays.every((a) => !a?.length)) continue;
    const out = remapSizeGroup(arrays, map);
    group.forEach((f, k) => {
      order[f] = out[k];
    });
  }
}

/** Set how much of one size is produced (a direct count; the rate × count
 *  path is cleared for it). Total-meters orders: meters, as a 1 m batch. */
function setProduced(order: Order, sizeIdx: number, n: number, mode: CalculatorMode) {
  const profiles = mode === 'profiles';
  if (order.useTotalLength) {
    const count: ProducedEntry[] = [{ value: n }];
    if (profiles) order.producedProfiles = count;
    else order.producedSheets = count;
    order.producedItemLength = [{ value: 1000 }];
    return;
  }
  const countKey = profiles ? 'producedProfiles' : 'producedSheets';
  const totalKey = profiles ? 'producedPackages' : 'producedPallets';
  const rows = (order[countKey] ?? []).map((e, p) => ({ ...e, sizeIndex: e?.sizeIndex ?? p }));
  let set = false;
  order[countKey] = rows.map((e) => {
    if (e.sizeIndex !== sizeIdx) return e;
    const value = set ? undefined : n;
    set = true;
    return { ...e, value };
  });
  if (!set) order[countKey] = [...rows, { sizeIndex: sizeIdx, value: n }];
  order[totalKey] = (order[totalKey] ?? []).map((e, p) =>
    (e?.sizeIndex ?? p) === sizeIdx ? { ...e, value: undefined } : e,
  );
}

/** Insert `order` into the target's queue where it stands in the source:
 *  right after the nearest order before it that the target also has. */
function insertLikeSource(state: State, order: Order, sourceIds: string[]) {
  const at = sourceIds.indexOf(order.id);
  const ids = state.values.orders.map((o) => o.id);
  let pos = 0;
  for (let i = at - 1; i >= 0; i--) {
    const j = ids.indexOf(sourceIds[i]!);
    if (j >= 0) {
      pos = j + 1;
      break;
    }
  }
  state.values.orders.splice(pos, 0, order);
}

function removeOrder(state: State, id: string) {
  state.values.orders = state.values.orders.filter((o) => o.id !== id);
  state.completedRows = state.completedRows.filter((r) => r.order.id !== id);
}

function setField(target: object, field: string, value: unknown) {
  const t = target as Record<string, unknown>;
  if (value === undefined) delete t[field];
  else t[field] = clone(value);
}

/** Apply one difference to `state`, taking the `from` side's value. */
function applyOne(
  state: State,
  d: CalcDiff,
  from: DiffSide,
  source: CalcVersion,
  sourceProgress: ReturnType<typeof producedAt>,
  mode: CalculatorMode,
) {
  const active = (id: string) => state.values.orders.find((o) => o.id === id);
  const sourceIds = source.values.orders.map((o) => o.id);
  switch (d.kind) {
    case 'setting':
      setField(state.values.settings, d.key, d[from]);
      return;
    case 'orderSequence': {
      const ids = state.values.orders.map((o) => o.id);
      const seq = d[from].filter((id) => ids.includes(id));
      const slots = ids.flatMap((id, i) => (seq.includes(id) ? [i] : []));
      const byId = new Map(state.values.orders.map((o) => [o.id, o]));
      const next = [...state.values.orders];
      slots.forEach((slot, k) => {
        next[slot] = byId.get(seq[k]!)!;
      });
      state.values.orders = next;
      return;
    }
    case 'orderAdded':
    case 'orderRemoved': {
      const presentIn: DiffSide = d.kind === 'orderAdded' ? 'production' : 'original';
      if (presentIn !== from) {
        removeOrder(state, d.orderId);
        return;
      }
      if (active(d.orderId) || state.completedRows.some((r) => r.order.id === d.orderId)) return;
      const done = (source.completedRows ?? []).find((r) => r.order.id === d.orderId);
      if (done) state.completedRows.push(clone(done));
      else insertLikeSource(state, clone(d.order), sourceIds);
      return;
    }
    case 'orderField': {
      const o = active(d.orderId);
      if (o) setField(o, d.field, d[from]);
      return;
    }
    case 'sizeSequence': {
      const o = active(d.orderId);
      if (!o?.sizes) return;
      const sizes = o.sizes;
      const keys = sizes.map((s) => s?.uid ?? '');
      const seq = d[from].filter((k) => keys.includes(k));
      const slots = keys.flatMap((k, i) => (seq.includes(k) ? [i] : []));
      const next = [...sizes];
      const newIndexOf = new Map<number, number>();
      slots.forEach((slot, k) => {
        const old = keys.indexOf(seq[k]!);
        next[slot] = sizes[old]!;
        newIndexOf.set(old, slot);
      });
      remapProduced(o, (i) => newIndexOf.get(i) ?? i);
      o.sizes = next;
      return;
    }
    case 'sizeAdded':
    case 'sizeRemoved': {
      const o = active(d.orderId);
      if (!o) return;
      const sizes = o.sizes ?? [];
      const presentIn: DiffSide = d.kind === 'sizeAdded' ? 'production' : 'original';
      if (presentIn !== from) {
        const idx = sizeIndexOf(o, d.sizeKey);
        if (idx < 0 || idx >= sizes.length) return;
        remapProduced(o, removeMap(idx));
        o.sizes = sizes.filter((_, i) => i !== idx);
        return;
      }
      if (sizeIndexOf(o, d.sizeKey) >= 0 && !d.sizeKey.startsWith('#')) return;
      // Right after the size before it in the source order (else first).
      const src = source.values.orders.find((x) => x.id === d.orderId);
      const srcSizes = src?.sizes ?? [];
      const at = srcSizes.findIndex((s) => s?.uid === d.sizeKey);
      let pos = d.sizeKey.startsWith('#') ? Number(d.sizeKey.slice(1)) : 0;
      for (let i = at - 1; i >= 0; i--) {
        const j = sizes.findIndex((s) => s?.uid && s.uid === srcSizes[i]?.uid);
        if (j >= 0) {
          pos = j + 1;
          break;
        }
      }
      pos = Math.min(pos, sizes.length);
      remapProduced(o, insertMap(pos));
      o.sizes = [...sizes.slice(0, pos), clone(d.size), ...sizes.slice(pos)];
      return;
    }
    case 'sizeField': {
      const o = active(d.orderId);
      const idx = o ? sizeIndexOf(o, d.sizeKey) : -1;
      if (o?.sizes?.[idx]) setField(o.sizes[idx]!, d.field, d[from]);
      return;
    }
    case 'produced': {
      const o = active(d.orderId);
      if (!o) return;
      const idx = d.sizeKey === 'm' ? 0 : sizeIndexOf(o, d.sizeKey);
      if (idx >= 0) setProduced(o, idx, d[from], mode);
      return;
    }
    case 'orderDone': {
      if (d[from]) {
        // Done there → everything produced here (the recompute completes it).
        const o = active(d.orderId);
        if (!o) return;
        if (o.useTotalLength) setProduced(o, 0, Math.round(o.totalLengthM ?? 0), mode);
        else (o.sizes ?? []).forEach((s, i) => setProduced(o, i, s?.sheets ?? 0, mode));
        return;
      }
      // Still running there → back into the queue here, with its progress.
      const row = state.completedRows.find((r) => r.order.id === d.orderId);
      if (!row) return;
      const o = clone(orderFromCompletedRow(row, state.completedRows));
      state.completedRows = state.completedRows.filter((r) => r !== row);
      const counts = sourceProgress.perSize.get(d.orderId);
      const keys = (o.sizes ?? []).map((s, i) => s?.uid ?? `#${i}`);
      if (o.useTotalLength) setProduced(o, 0, counts?.get('m') ?? 0, mode);
      else keys.forEach((k, i) => setProduced(o, i, counts?.get(k) ?? 0, mode));
      insertLikeSource(state, o, sourceIds);
      return;
    }
  }
}

/**
 * Make `target` match `source` for `diffs` (the `from` side's values win) and
 * recompute it from `now` on `schedule`. Returns the new target version.
 */
export function settleDiffs(
  target: CalcVersion,
  source: CalcVersion,
  diffs: CalcDiff[],
  from: DiffSide,
  schedule: ScheduleSnapshot,
  now: Date = new Date(),
): CalcVersion {
  const mode = target.result.mode;
  // 1. Bring the target to now (a "Calcolo fisso" stays as it is).
  const adv = buildAdvancedCalc(
    { id: 'merge', ts: 0, label: '', ...target },
    now,
    schedule,
  );
  const state: State = clone({
    values: adv?.values ?? target.values,
    completedRows: adv?.completedRows ?? target.completedRows ?? [],
  });
  // 2. Apply — removals, then the new orders of orders / sizes, then the
  //    additions (placed after their neighbour in that order), then fields and
  //    progress.
  const sourceProgress = producedAt(source, now, () => false);
  const adds = (d: CalcDiff) =>
    ((d.kind === 'orderAdded' || d.kind === 'sizeAdded') && from === 'production') ||
    ((d.kind === 'orderRemoved' || d.kind === 'sizeRemoved') && from === 'original');
  const rank = (d: CalcDiff) =>
    d.kind === 'orderSequence' || d.kind === 'sizeSequence'
      ? 1
      : d.kind === 'orderAdded' ||
          d.kind === 'orderRemoved' ||
          d.kind === 'sizeAdded' ||
          d.kind === 'sizeRemoved'
        ? adds(d)
          ? 2
          : 0
        : 3;
  for (const d of [...diffs].sort((a, b) => rank(a) - rank(b))) {
    applyOne(state, d, from, source, sourceProgress, mode);
  }
  // 3. Recompute from now, like a "Calcola": finished orders become completed
  //    rows, a custom queue that no longer changes anything switches off.
  const { values } = state;
  let result =
    values.orders.length > 0
      ? calculateSchedule(values.settings, values.orders, {
          mode,
          schedule: schedule.schedule ?? undefined,
          warmupMinutes: schedule.warmupMinutes,
          shutdownMinutes: schedule.shutdownMinutes,
          now,
        })
      : emptyResult(now, target.result);
  const done = result.rows.map(
    (r) => r.productionMinutes >= 0.5 && r.remainingMinutes < 0.5,
  );
  if (done.some(Boolean)) {
    state.completedRows.push(...result.rows.filter((_, i) => done[i]).map(toCompletedRow));
    values.orders = values.orders.filter((_, i) => !done[i]);
    result = { ...result, rows: result.rows.filter((_, i) => !done[i]) };
  }
  if (
    values.settings.queue &&
    (values.orders.length === 0 || !queueStatus(values.settings.queue, values.orders, result).active)
  ) {
    values.settings = { ...values.settings, queue: undefined };
  }
  return {
    values,
    result,
    completedRows: state.completedRows,
    snapshot: schedule,
  };
}
