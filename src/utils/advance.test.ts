import { describe, it, expect } from 'vitest';
import { buildAdvancedCalc } from './advance';
import { calculateSchedule } from './calculator';
import type { FormValues } from '../formSchema';
import type { SavedCalculation } from '../lib/calcHistory';
import type { ScheduleSnapshot } from '../types';

const localDate = (y: number, m: number, d: number, h = 0, min = 0) =>
  new Date(y, m, d, h, min, 0, 0);

function makeEntry(): SavedCalculation {
  const start = localDate(2026, 4, 11, 6); // Mon 06:00
  const values = {
    settings: {
      startMode: 'manual',
      startAt: start.toISOString(),
      gapMode: 'continuous',
    },
    orders: [
      { id: 'a', useTotalLength: true, totalLengthM: 600, speedMPerMin: 1 },
    ],
  } as unknown as FormValues;
  const result = calculateSchedule(values.settings, values.orders, {
    now: start,
  });
  const snapshot: ScheduleSnapshot = {
    warmupMinutes: 0,
    shutdownMinutes: 0,
    schedule: null,
  };
  return { id: 'x', ts: start.getTime(), label: 't', result, values, snapshot };
}

describe('buildAdvancedCalc', () => {
  it('advances a total-meters order via a 1 m produced batch', () => {
    const entry = makeEntry();
    const adv = buildAdvancedCalc(entry, localDate(2026, 4, 11, 11)); // +300 min
    expect(adv).not.toBeNull();
    const o = adv!.values.orders[0]!;
    // 300 m elapsed → one batch of 300 units × 1000 mm.
    expect(o.producedSheets).toEqual([{ value: 300 }]);
    expect(o.producedItemLength).toEqual([{ value: 1000 }]);
    // Start moved to now; ~300 min of production remain (600 − 300).
    expect(adv!.values.settings.startMode).toBe('now');
    expect(adv!.result.rows[0]!.remainingMinutes).toBeCloseTo(300, 0);
  });

  it('returns null when nothing has elapsed yet', () => {
    const entry = makeEntry();
    expect(buildAdvancedCalc(entry, localDate(2026, 4, 11, 6))).toBeNull();
  });
});
