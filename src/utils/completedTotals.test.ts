import { describe, expect, it } from 'vitest';
import type { ScheduledOrder } from '../types';
import { completedTotals } from './completedTotals';

const row = (p: Partial<ScheduledOrder>): ScheduledOrder =>
  ({
    order: { id: 'x' },
    productionMinutes: 0,
    remainingMinutes: 0,
    start: new Date('2026-11-10T08:00:00'),
    end: new Date('2026-11-10T09:00:00'),
    ...p,
  }) as ScheduledOrder;

describe('completedTotals', () => {
  it('is nothing without rows', () => {
    expect(completedTotals([])).toBeNull();
  });

  it('spans the first start to the last end, summing the work and the pauses in it', () => {
    const r = completedTotals([
      row({
        productionMinutes: 60,
        start: new Date('2026-11-10T08:00:00'),
        end: new Date('2026-11-10T09:00:00'),
        gapStart: new Date('2026-11-10T09:00:00'),
        gapEnd: new Date('2026-11-10T09:30:00'),
      }),
      row({
        productionMinutes: 90,
        start: new Date('2026-11-10T09:30:00'),
        end: new Date('2026-11-10T11:00:00'),
        // a pause after the last order: not part of it
        gapStart: new Date('2026-11-10T11:00:00'),
        gapEnd: new Date('2026-11-10T12:00:00'),
      }),
    ])!;
    expect(r.startAt).toEqual(new Date('2026-11-10T08:00:00'));
    expect(r.endAt).toEqual(new Date('2026-11-10T11:00:00'));
    expect(r.totalProductionMinutes).toBe(150);
    expect(r.totalGapMinutes).toBe(30);
    expect(r.totalDurationMinutes).toBe(180);
    expect(r.totalPackages).toBeUndefined();
  });

  it('adds the packages up when there are some', () => {
    const r = completedTotals([row({ packages: 4 }), row({ packages: 6 })])!;
    expect(r.totalPackages).toBe(10);
  });
});
