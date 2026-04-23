import { describe, it, expect } from 'vitest';
import {
  calculateOrderLengthM,
  calculateProductionMinutes,
  calculateSchedule,
  splitDuration,
} from './calculator';
import type { GlobalSettings, Order } from '../types';

describe('calculateOrderLengthM', () => {
  it('converts sheets × mm to meters', () => {
    expect(
      calculateOrderLengthM({ id: '1', sheets: 100, sheetLengthMm: 6000 }),
    ).toBe(600);
    expect(
      calculateOrderLengthM({ id: '1', sheets: 50, sheetLengthMm: 3000 }),
    ).toBe(150);
  });
});

describe('calculateProductionMinutes', () => {
  it('divides length by speed', () => {
    expect(
      calculateProductionMinutes(
        { id: '1', sheets: 100, sheetLengthMm: 6000 },
        5,
      ),
    ).toBe(120);
  });

  it('throws on zero or negative speed', () => {
    expect(() =>
      calculateProductionMinutes(
        { id: '1', sheets: 1, sheetLengthMm: 1000 },
        0,
      ),
    ).toThrow();
  });
});

describe('calculateSchedule — spec example', () => {
  const start = new Date('2026-04-23T14:00:00Z');
  const settings: GlobalSettings = {
    startMode: 'manual',
    startAt: start.toISOString(),
    speedMode: 'global',
    globalSpeed: 5,
    gapMode: 'continuous',
  };
  const orders: Order[] = [
    { id: 'a', sheets: 100, sheetLengthMm: 6000 },
    { id: 'b', sheets: 50, sheetLengthMm: 3000 },
  ];

  const result = calculateSchedule(settings, orders, start);

  it('order #1 takes 120 min', () => {
    expect(result.rows[0]!.productionMinutes).toBe(120);
  });

  it('order #2 takes 30 min', () => {
    expect(result.rows[1]!.productionMinutes).toBe(30);
  });

  it('total production is 150 min', () => {
    expect(result.totalProductionMinutes).toBe(150);
  });

  it('end time is 16:30', () => {
    expect(result.endAt.toISOString()).toBe('2026-04-23T16:30:00.000Z');
  });

  it('no gaps in continuous mode', () => {
    expect(result.totalGapMinutes).toBe(0);
  });
});

describe('calculateSchedule — per-order speed', () => {
  it('uses individual speeds', () => {
    const result = calculateSchedule(
      {
        startMode: 'manual',
        startAt: '2026-04-23T10:00:00',
        speedMode: 'perOrder',
        gapMode: 'continuous',
      },
      [
        { id: 'a', sheets: 100, sheetLengthMm: 6000, speedMPerMin: 5 },
        { id: 'b', sheets: 100, sheetLengthMm: 6000, speedMPerMin: 10 },
      ],
      new Date('2026-04-23T10:00:00'),
    );

    expect(result.rows[0]!.productionMinutes).toBe(120);
    expect(result.rows[1]!.productionMinutes).toBe(60);
    expect(result.totalProductionMinutes).toBe(180);
  });
});

describe('calculateSchedule — with gaps', () => {
  it('adds gaps between orders but not after the last', () => {
    const start = new Date('2026-04-23T10:00:00Z');
    const result = calculateSchedule(
      {
        startMode: 'manual',
        startAt: start.toISOString(),
        speedMode: 'global',
        globalSpeed: 5,
        gapMode: 'withGaps',
      },
      [
        { id: 'a', sheets: 100, sheetLengthMm: 6000, gapAfterMin: 30 },
        { id: 'b', sheets: 50, sheetLengthMm: 3000, gapAfterMin: 99 },
      ],
      start,
    );

    expect(result.totalGapMinutes).toBe(30);
    expect(result.totalProductionMinutes).toBe(150);
    expect(result.totalDurationMinutes).toBe(180);
    expect(result.endAt.toISOString()).toBe('2026-04-23T13:00:00.000Z');
  });
});

describe('calculateSchedule — 24/7 rollover', () => {
  it('continues across midnight', () => {
    const start = new Date('2026-04-23T23:00:00Z');
    const result = calculateSchedule(
      {
        startMode: 'manual',
        startAt: start.toISOString(),
        speedMode: 'global',
        globalSpeed: 1,
        gapMode: 'continuous',
      },
      [{ id: 'a', sheets: 10, sheetLengthMm: 6000 }],
      start,
    );
    expect(result.rows[0]!.productionMinutes).toBe(60);
    expect(result.endAt.toISOString()).toBe('2026-04-24T00:00:00.000Z');
  });
});

describe('calculateSchedule — "now" mode', () => {
  it('uses the provided "now" when startMode is "now"', () => {
    const now = new Date('2026-04-23T08:00:00');
    const result = calculateSchedule(
      {
        startMode: 'now',
        speedMode: 'global',
        globalSpeed: 5,
        gapMode: 'continuous',
      },
      [{ id: 'a', sheets: 100, sheetLengthMm: 6000 }],
      now,
    );
    expect(result.startAt.toISOString()).toBe(now.toISOString());
  });
});

describe('calculateSchedule — error cases', () => {
  it('throws when no orders', () => {
    expect(() =>
      calculateSchedule(
        {
          startMode: 'now',
          speedMode: 'global',
          globalSpeed: 5,
          gapMode: 'continuous',
        },
        [],
      ),
    ).toThrow();
  });

  it('throws when globalSpeed missing in global mode', () => {
    expect(() =>
      calculateSchedule(
        {
          startMode: 'now',
          speedMode: 'global',
          gapMode: 'continuous',
        },
        [{ id: 'a', sheets: 10, sheetLengthMm: 1000 }],
      ),
    ).toThrow();
  });
});

describe('splitDuration', () => {
  it('splits minutes into d/h/m', () => {
    expect(splitDuration(150)).toEqual({ days: 0, hours: 2, minutes: 30 });
    expect(splitDuration(60 * 24 * 2 + 60 * 14 + 30)).toEqual({
      days: 2,
      hours: 14,
      minutes: 30,
    });
    expect(splitDuration(0)).toEqual({ days: 0, hours: 0, minutes: 0 });
  });
});
