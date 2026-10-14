import { describe, expect, it } from 'vitest';
import { buildAdvancedCalc } from './advance';
import { calculateSchedule } from './calculator';
import { effectiveValue, followersToReset } from './inherit';
import type { FormValues } from '../formSchema';
import type { SavedCalculation } from '../lib/calcHistory';

describe('speed carried down the queue', () => {
  // #1 1.5 · #2 inherits · #3 1.5 (stamped) · #4 1.5 · #5 own 2 · #6 1.5
  const orders = [
    { speedMPerMin: 1.5 },
    {},
    { speedMPerMin: 1.5 },
    { speedMPerMin: 1.5 },
    { speedMPerMin: 2 },
    { speedMPerMin: 1.5 },
  ];

  it('an order without its own runs at the previous one', () => {
    expect(effectiveValue(orders, 1, 'speedMPerMin')).toBe(1.5);
    expect(effectiveValue(orders, 4, 'speedMPerMin')).toBe(2);
    expect(effectiveValue([{}], 0, 'speedMPerMin')).toBeUndefined();
  });

  it('a change reaches the orders repeating the old value, up to a different one', () => {
    expect(followersToReset(orders, 0, 'speedMPerMin', 1.5)).toEqual([2, 3]);
    expect(followersToReset(orders, 4, 'speedMPerMin', 2)).toEqual([]);
  });
});

describe('reopening a saved calc keeps the inheritance', () => {
  const at = (h: number) => new Date(2026, 4, 11, h); // Mon
  const values = {
    settings: {
      startMode: 'manual',
      startAt: at(6).toISOString(),
      gapMode: 'continuous',
    },
    orders: [
      { id: 'a', sheets: 120, sheetLengthMm: 1000, speedMPerMin: 1 }, // 06–08
      { id: 'b', sheets: 120, sheetLengthMm: 1000 }, // 08–10, inherits 1
      { id: 'c', sheets: 120, sheetLengthMm: 1000 }, // 10–12, inherits 1
    ],
  } as unknown as FormValues;
  const entry: SavedCalculation = {
    id: 'x',
    ts: at(6).getTime(),
    label: 't',
    result: calculateSchedule(values.settings, values.orders, { now: at(6) }),
    values,
    snapshot: { warmupMinutes: 0, shutdownMinutes: 0, schedule: null },
  };

  it('stamps the speed only where its source left the form', () => {
    // 09:00: "a" done → "b" is first and needs the speed; "c" keeps inheriting.
    const adv = buildAdvancedCalc(entry, at(9))!;
    expect(adv.values.orders.map((o) => o.id)).toEqual(['b', 'c']);
    expect(adv.values.orders[0]!.speedMPerMin).toBe(1);
    expect(adv.values.orders[1]!.speedMPerMin).toBeUndefined();
  });

  it('leaves inheriting orders alone while their source is still running', () => {
    const adv = buildAdvancedCalc(entry, at(7))!;
    expect(adv.values.orders.map((o) => o.speedMPerMin)).toEqual([1, undefined, undefined]);
  });
});
