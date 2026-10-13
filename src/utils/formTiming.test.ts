import { describe, expect, it } from 'vitest';
import { calculateSchedule } from './calculator';
import { rowForOrder, sizeTiming } from './formTiming';
import type { GlobalSettings, Order } from '../types';

const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m); // Oct 2026
// 24/7 from Tuesday 10:00 at 1 m/min: 60 × 1000 mm (60 min), 30 × 2000 mm (60 min).
const settings = {
  startMode: 'manual',
  startAt: at(13, 10).toISOString(),
  gapMode: 'continuous',
  noLimits: true,
} as GlobalSettings;
const order = {
  id: 'o1',
  speedMPerMin: 1,
  sizes: [
    { sheets: 60, length: 1000, uid: 'a' },
    { sheets: 30, length: 2000, uid: 'b' },
  ],
} as Order;
const result = calculateSchedule(settings, [order], { mode: 'sheets', now: at(13, 10) });
const row = rowForOrder(result, 'o1');

describe('when a form size ends', () => {
  it('finds the order by id and the size by uid, with the time per sheet', () => {
    expect(rowForOrder(result, 'missing')).toBeUndefined();
    const t = sizeTiming(row, { uid: 'b', length: 2000 }, 1);
    expect(t?.end).toEqual(at(13, 12));
    expect(t?.perItemMin).toBe(2); // 2 m at 1 m/min
  });

  it('follows the size when it moved in the form', () => {
    expect(sizeTiming(row, { uid: 'b', length: 2000 }, 0)?.end).toEqual(at(13, 12));
  });

  it('has nothing for a size changed since the last Calcola', () => {
    expect(sizeTiming(row, { uid: 'b', length: 2500 }, 1)).toBeUndefined();
    expect(sizeTiming(row, { length: 1500 }, 0)).toBeUndefined();
  });
});
