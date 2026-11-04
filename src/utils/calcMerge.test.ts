import { describe, expect, it } from 'vitest';
import { diffCalcs, type CalcDiff, type CalcVersion } from './calcDiff';
import { setProducedNow, settleDiffs } from './calcMerge';
import { calculateSchedule } from './calculator';
import type { FormValues } from '../formSchema';
import type { Order, ScheduleSnapshot } from '../types';

const at = (h: number, m = 0) => new Date(2026, 4, 11, h, m); // Mon
const schedule: ScheduleSnapshot = { warmupMinutes: 0, shutdownMinutes: 0, schedule: null };

type OrderIn = Partial<Order> & { id: string };

function version(orders: OrderIn[]): CalcVersion {
  const values = {
    settings: { startMode: 'manual', startAt: at(6).toISOString(), gapMode: 'continuous' },
    orders: structuredClone(orders),
  } as unknown as FormValues;
  const result = calculateSchedule(values.settings, values.orders, { now: at(6) });
  return { values, result, snapshot: schedule };
}

// "a" 60 × 1000 + 30 × 2000 mm (06–08), "b" 60 × 1000 mm (08–09), 1 m/min.
const base = (): OrderIn[] => [
  {
    id: 'a',
    speedMPerMin: 1,
    sizes: [
      { uid: 'a1', sheets: 60, length: 1000 },
      { uid: 'a2', sheets: 30, length: 2000 },
    ],
  },
  { id: 'b', speedMPerMin: 1, sizes: [{ uid: 'b1', sheets: 60, length: 1000 }] },
];

const plan = (d: CalcDiff[]) => d.filter((x) => x.group === 'plan');

/** Settle every difference one way, then check what's left. */
function settleAll(original: CalcVersion, production: CalcVersion, from: 'original' | 'production', now: Date) {
  const diffs = diffCalcs(original, production, now);
  return from === 'production'
    ? { merged: settleDiffs(original, production, diffs, 'production', schedule, now), other: production }
    : { merged: settleDiffs(production, original, diffs, 'original', schedule, now), other: original };
}

describe('settling differences', () => {
  it('"Usa Produzione": the original takes the factory’s new order of the queue', () => {
    const [a, b] = base();
    const { merged, other } = settleAll(version(base()), version([b!, a!]), 'production', at(5));
    expect(merged.values.orders.map((o) => o.id)).toEqual(['b', 'a']);
    expect(plan(diffCalcs(merged, other, at(5)))).toEqual([]);
  });

  it('"Usa Originale": Produzione gets the original’s speed back', () => {
    const prod = base();
    prod[0]!.speedMPerMin = 2;
    const { merged, other } = settleAll(version(base()), version(prod), 'original', at(5));
    expect(merged.values.orders[0]!.speedMPerMin).toBe(1);
    expect(plan(diffCalcs(other, merged, at(5)))).toEqual([]);
  });

  it('an order removed in Produzione: gone from the original, or put back', () => {
    const orig = version(base());
    const prod = version([base()[0]!]);
    const take = settleAll(orig, prod, 'production', at(5));
    expect(take.merged.values.orders.map((o) => o.id)).toEqual(['a']);
    const restore = settleAll(orig, prod, 'original', at(5));
    expect(restore.merged.values.orders.map((o) => o.id)).toEqual(['a', 'b']);
  });

  it('an order added in Produzione lands where it stands there', () => {
    const extra: OrderIn = { id: 'c', sizes: [{ uid: 'c1', sheets: 10, length: 1000 }] };
    const [a, b] = base();
    const { merged } = settleAll(version(base()), version([a!, extra, b!]), 'production', at(5));
    expect(merged.values.orders.map((o) => o.id)).toEqual(['a', 'c', 'b']);
  });

  it('sizes: changed, added, removed and reordered, Calcolo Avanzato rows following', () => {
    const orig = base();
    orig[0]!.producedSheets = [
      { sizeIndex: 0, value: 10 },
      { sizeIndex: 1, value: 5 },
    ];
    const prod = structuredClone(orig);
    prod[0]!.sizes = [
      { uid: 'a2', sheets: 30, length: 2000 },
      { uid: 'a3', sheets: 8, length: 1500 },
      { uid: 'a1', sheets: 50, length: 1000 },
    ];
    prod[0]!.producedSheets = [
      { sizeIndex: 0, value: 5 },
      { sizeIndex: 2, value: 10 },
    ];
    const { merged, other } = settleAll(version(orig), version(prod), 'production', at(5));
    expect(merged.values.orders[0]!.sizes!.map((s) => [s.uid, s.sheets])).toEqual([
      ['a2', 30],
      ['a3', 8],
      ['a1', 50],
    ]);
    // What was produced of each size stayed with it.
    const produced = merged.values.orders[0]!.producedSheets!.filter((e) => e.value);
    expect(produced).toContainEqual({ sizeIndex: 2, value: 10 });
    expect(produced).toContainEqual({ sizeIndex: 0, value: 5 });
    expect(diffCalcs(merged, other, at(5))).toEqual([]);
  });

  it('progress taken from Produzione', () => {
    const prod = base();
    prod[0]!.producedSheets = [{ sizeIndex: 0, value: 30 }];
    const { merged, other } = settleAll(version(base()), version(prod), 'production', at(5));
    expect(diffCalcs(merged, other, at(5))).toEqual([]);
  });

  it('keeps what the target produced so far while applying a change', () => {
    // At 07:00 the original is halfway through "a"; Produzione only changed
    // "b"'s quantity. Taking that must not reset "a"'s progress.
    const orig = version(base());
    const prodOrders = base();
    prodOrders[1]!.sizes = [{ uid: 'b1', sheets: 40, length: 1000 }];
    const now = at(7);
    const diffs = diffCalcs(orig, version(prodOrders), now);
    const merged = settleDiffs(orig, version(prodOrders), diffs, 'production', schedule, now);
    expect(diffCalcs(merged, orig, now).filter((d) => d.group === 'progress')).toEqual([]);
    expect(merged.values.orders[1]!.sizes![0]!.sheets).toBe(40);
  });
});

describe('the produced count set outside the form', () => {
  const recomputed = (order: string, size: number, n: number, now: Date) =>
    setProducedNow(version(base()), order, size, n, schedule, now)!;

  it('keeps what was produced so far, sets the count, recomputes from now', () => {
    // 06:30 → "a" has 30 of its 60 × 1000 mm by the schedule; really 50.
    const next = recomputed('a', 0, 50, at(6, 30));
    expect(next.values.orders[0]!.producedSheets).toContainEqual({ sizeIndex: 0, value: 50 });
    expect(next.result.startAt).toEqual(at(6, 30));
    // 10 left of the first size (10 min) + the second (60 min) from 06:30.
    expect(next.result.rows[0]!.end).toEqual(at(7, 40));
    expect(next.snapshot).toBe(schedule);
  });

  it('a lower count than the schedule pushes the end later', () => {
    const next = recomputed('a', 0, 10, at(6, 30));
    expect(next.result.rows[0]!.end).toEqual(at(8, 20));
  });

  it('counts a later size too, the others keep theirs', () => {
    // 07:30 → first size done, the second halfway: 15 of 30.
    const next = recomputed('a', 1, 20, at(7, 30));
    const made = next.values.orders[0]!.producedSheets!;
    expect(made).toContainEqual({ sizeIndex: 0, value: 60 });
    expect(made).toContainEqual({ sizeIndex: 1, value: 20 });
  });

  it('the last piece of an order: it leaves the queue, the next one starts', () => {
    const start = version(base());
    const firstDone = setProducedNow(start, 'a', 0, 60, schedule, at(6, 30))!;
    const next = setProducedNow(firstDone, 'a', 1, 30, schedule, at(6, 40))!;
    expect(next.values.orders.map((o) => o.id)).toEqual(['b']);
    expect(next.completedRows?.map((r) => r.order.id)).toEqual(['a']);
    expect(next.result.rows[0]!.start).toEqual(at(6, 40));
  });

  it('every order finished: nothing left in the queue', () => {
    const one = version([base()[1]!]);
    const next = setProducedNow(one, 'b', 0, 60, schedule, at(6, 30))!;
    expect(next.values.orders).toEqual([]);
    expect(next.result.rows).toEqual([]);
    expect(next.completedRows?.map((r) => r.order.id)).toEqual(['b']);
  });

  it('an order finished by the time it is saved: nothing to set', () => {
    expect(setProducedNow(version(base()), 'a', 0, 50, schedule, at(8, 10))).toBeNull();
  });

  it('does not touch the version it starts from', () => {
    const start = version(base());
    const before = structuredClone(start.values);
    setProducedNow(start, 'a', 0, 50, schedule, at(6, 30));
    expect(start.values).toEqual(before);
  });
});
