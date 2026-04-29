import { describe, it, expect } from 'vitest';
import {
  calculateOrderLengthM,
  calculatePackages,
  calculateProductionMinutes,
  calculateSchedule,
  calculateTotalProfiles,
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

  it('sums sizes[] when present', () => {
    expect(
      calculateOrderLengthM({
        id: '1',
        sizes: [
          { sheets: 100, length: 6000 },
          { sheets: 50, length: 3000 },
        ],
      }),
    ).toBe(750);
  });

  it('prefers sizes[] over sheets/sheetLengthMm if both present', () => {
    expect(
      calculateOrderLengthM({
        id: '1',
        sheets: 999,
        sheetLengthMm: 9999,
        sizes: [{ sheets: 10, length: 1000 }],
      }),
    ).toBe(10);
  });

  it('uses totalLengthM directly when useTotalLength is true', () => {
    expect(
      calculateOrderLengthM({
        id: '1',
        useTotalLength: true,
        totalLengthM: 425.5,
        sizes: [{ sheets: 999, length: 9999 }],
      }),
    ).toBe(425.5);
  });
});

describe('calculateTotalProfiles', () => {
  it('returns sum of sizes[].sheets when present', () => {
    expect(
      calculateTotalProfiles({
        id: '1',
        sizes: [
          { sheets: 100, length: 6000 },
          { sheets: 50, length: 3000 },
        ],
      }),
    ).toBe(150);
  });

  it('returns undefined when useTotalLength is true', () => {
    expect(
      calculateTotalProfiles({
        id: '1',
        useTotalLength: true,
        totalLengthM: 100,
      }),
    ).toBeUndefined();
  });

  it('falls back to legacy sheets field', () => {
    expect(
      calculateTotalProfiles({ id: '1', sheets: 42, sheetLengthMm: 1000 }),
    ).toBe(42);
  });
});

describe('calculateSchedule — produced (profiles)', () => {
  it('producedProfiles shortens remaining time proportionally', () => {
    const start = new Date('2026-04-23T10:00:00Z');
    const result = calculateSchedule(
      {
        startMode: 'manual',
        startAt: start.toISOString(),
        speedMode: 'global',
        globalSpeed: 5,
        gapMode: 'continuous',
      },
      [
        {
          id: 'a',
          sizes: [{ sheets: 100, length: 6000 }],
          profilesPerPackage: 20,
          producedProfiles: [{ value: 50 }],
        },
      ],
      { now: start, mode: 'profiles' },
    );

    const row = result.rows[0]!;
    expect(row.totalProfiles).toBe(100);
    expect(row.producedProfiles).toBe(50);
    expect(row.remainingProfiles).toBe(50);
    expect(row.producedPackages).toBe(3);
    expect(row.productionMinutes).toBe(120);
    expect(row.remainingMinutes).toBe(60);
  });

  it('producedPackages cross-converts to producedProfiles via perPackage', () => {
    const start = new Date('2026-04-23T10:00:00Z');
    const result = calculateSchedule(
      {
        startMode: 'manual',
        startAt: start.toISOString(),
        speedMode: 'global',
        globalSpeed: 5,
        gapMode: 'continuous',
      },
      [
        {
          id: 'a',
          sizes: [{ sheets: 100, length: 6000 }],
          profilesPerPackage: 20,
          producedPackages: [{ value: 2 }],
        },
      ],
      { now: start, mode: 'profiles' },
    );

    const row = result.rows[0]!;
    expect(row.producedProfiles).toBe(40);
    expect(row.producedPackages).toBe(2);
    expect(row.remainingProfiles).toBe(60);
  });
});

describe('calculateSchedule — produced (sheets)', () => {
  it('producedSheets shortens time and computes producedPallets when perPallet given', () => {
    const start = new Date('2026-04-23T10:00:00Z');
    const result = calculateSchedule(
      {
        startMode: 'manual',
        startAt: start.toISOString(),
        speedMode: 'global',
        globalSpeed: 5,
        gapMode: 'continuous',
      },
      [
        {
          id: 'a',
          sizes: [{ sheets: 200, length: 6000 }],
          producedSheets: [{ value: 50 }],
          sheetsPerPallet: [{ value: 25 }],
        },
      ],
      { now: start, mode: 'sheets' },
    );

    const row = result.rows[0]!;
    expect(row.totalSheets).toBe(200);
    expect(row.producedSheets).toBe(50);
    expect(row.producedPallets).toBe(2);
    expect(row.remainingSheets).toBe(150);
    expect(row.productionMinutes).toBe(240);
    expect(row.remainingMinutes).toBe(180);
  });

  it('producedPallets + perPallet cross-converts to producedSheets', () => {
    const start = new Date('2026-04-23T10:00:00Z');
    const result = calculateSchedule(
      {
        startMode: 'manual',
        startAt: start.toISOString(),
        speedMode: 'global',
        globalSpeed: 5,
        gapMode: 'continuous',
      },
      [
        {
          id: 'a',
          sizes: [{ sheets: 200, length: 6000 }],
          sheetsPerPallet: [{ value: 25 }],
          producedPallets: [{ value: 2 }],
        },
      ],
      { now: start, mode: 'sheets' },
    );

    const row = result.rows[0]!;
    expect(row.producedSheets).toBe(50);
    expect(row.producedPallets).toBe(2);
    expect(row.remainingSheets).toBe(150);
  });
});

describe('calculateSchedule — profiles mode', () => {
  it('packages from sizes[] sum / profilesPerPackage', () => {
    const result = calculateSchedule(
      {
        startMode: 'manual',
        startAt: '2026-04-23T10:00:00Z',
        speedMode: 'global',
        globalSpeed: 5,
        gapMode: 'continuous',
      },
      [
        {
          id: 'a',
          sizes: [
            { sheets: 100, length: 6000 },
            { sheets: 50, length: 3000 },
          ],
          profilesPerPackage: 20,
        },
      ],
      { now: new Date('2026-04-23T10:00:00Z'), mode: 'profiles' },
    );

    expect(result.rows[0]!.packages).toBe(8);
    expect(result.totalPackages).toBeUndefined();
  });

  it('profilesPerPackage falls back to last filled when omitted', () => {
    const result = calculateSchedule(
      {
        startMode: 'manual',
        startAt: '2026-04-23T10:00:00Z',
        speedMode: 'global',
        globalSpeed: 5,
        gapMode: 'continuous',
      },
      [
        {
          id: 'a',
          sizes: [{ sheets: 100, length: 6000 }],
          profilesPerPackage: 25,
        },
        { id: 'b', sizes: [{ sheets: 60, length: 6000 }] },
        {
          id: 'c',
          sizes: [{ sheets: 40, length: 6000 }],
          profilesPerPackage: 10,
        },
        { id: 'd', sizes: [{ sheets: 30, length: 6000 }] },
      ],
      { now: new Date('2026-04-23T10:00:00Z'), mode: 'profiles' },
    );

    expect(result.rows[0]!.packages).toBe(4);
    expect(result.rows[1]!.packages).toBe(3);
    expect(result.rows[2]!.packages).toBe(4);
    expect(result.rows[3]!.packages).toBe(3);
  });

  it('packages undefined when useTotalLength is on (count unknown)', () => {
    const result = calculateSchedule(
      {
        startMode: 'manual',
        startAt: '2026-04-23T10:00:00Z',
        speedMode: 'global',
        globalSpeed: 5,
        gapMode: 'continuous',
      },
      [
        {
          id: 'a',
          useTotalLength: true,
          totalLengthM: 600,
          profilesPerPackage: 20,
        },
      ],
      { now: new Date('2026-04-23T10:00:00Z'), mode: 'profiles' },
    );

    expect(result.rows[0]!.packages).toBeUndefined();
    expect(result.totalPackages).toBeUndefined();
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

describe('calculatePackages', () => {
  it('returns ceil(count / perPackage)', () => {
    expect(calculatePackages(100, 50)).toBe(2);
    expect(calculatePackages(101, 50)).toBe(3);
    expect(calculatePackages(50, 50)).toBe(1);
  });

  it('returns undefined when perPackage missing or invalid', () => {
    expect(calculatePackages(100, undefined)).toBeUndefined();
    expect(calculatePackages(100, 0)).toBeUndefined();
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

  const result = calculateSchedule(settings, orders, { now: start });

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

  it('mode defaults to "sheets" with no totalPackages', () => {
    expect(result.mode).toBe('sheets');
    expect(result.totalPackages).toBeUndefined();
  });
});

describe('calculateSchedule — per-order speed', () => {
  it('uses individual speeds', () => {
    const result = calculateSchedule(
      {
        startMode: 'manual',
        startAt: '2026-04-23T10:00:00Z',
        speedMode: 'perOrder',
        gapMode: 'continuous',
      },
      [
        { id: 'a', sheets: 100, sheetLengthMm: 6000, speedMPerMin: 5 },
        { id: 'b', sheets: 100, sheetLengthMm: 6000, speedMPerMin: 10 },
      ],
      { now: new Date('2026-04-23T10:00:00Z') },
    );

    expect(result.rows[0]!.productionMinutes).toBe(120);
    expect(result.rows[1]!.productionMinutes).toBe(60);
    expect(result.totalProductionMinutes).toBe(180);
  });

  it('falls back to last filled speed when later order omits it', () => {
    const result = calculateSchedule(
      {
        startMode: 'manual',
        startAt: '2026-04-23T10:00:00Z',
        speedMode: 'perOrder',
        gapMode: 'continuous',
      },
      [
        { id: 'a', sheets: 100, sheetLengthMm: 6000, speedMPerMin: 5 },
        { id: 'b', sheets: 100, sheetLengthMm: 6000 },
        { id: 'c', sheets: 100, sheetLengthMm: 6000, speedMPerMin: 10 },
        { id: 'd', sheets: 100, sheetLengthMm: 6000 },
      ],
      { now: new Date('2026-04-23T10:00:00Z') },
    );

    expect(result.rows[0]!.speedMPerMin).toBe(5);
    expect(result.rows[1]!.speedMPerMin).toBe(5);
    expect(result.rows[2]!.speedMPerMin).toBe(10);
    expect(result.rows[3]!.speedMPerMin).toBe(10);
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
      { now: start },
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
      { now: start },
    );
    expect(result.rows[0]!.productionMinutes).toBe(60);
    expect(result.endAt.toISOString()).toBe('2026-04-24T00:00:00.000Z');
  });
});

describe('calculateSchedule — "now" mode', () => {
  it('uses the provided "now" when startMode is "now"', () => {
    const now = new Date('2026-04-23T08:00:00Z');
    const result = calculateSchedule(
      {
        startMode: 'now',
        speedMode: 'global',
        globalSpeed: 5,
        gapMode: 'continuous',
      },
      [{ id: 'a', sheets: 100, sheetLengthMm: 6000 }],
      { now },
    );
    expect(result.startAt.toISOString()).toBe(now.toISOString());
  });
});

describe('calculateSchedule — profiles mode', () => {
  it('returns packages per row and total packages', () => {
    const start = new Date('2026-04-23T08:00:00Z');
    const result = calculateSchedule(
      {
        startMode: 'manual',
        startAt: start.toISOString(),
        speedMode: 'global',
        globalSpeed: 5,
        gapMode: 'continuous',
      },
      [
        { id: 'a', sheets: 100, sheetLengthMm: 6000, profilesPerPackage: 25 },
        { id: 'b', sheets: 51, sheetLengthMm: 3000, profilesPerPackage: 10 },
      ],
      { now: start, mode: 'profiles' },
    );

    expect(result.mode).toBe('profiles');
    expect(result.rows[0]!.packages).toBe(4);
    expect(result.rows[1]!.packages).toBe(6);
    expect(result.totalPackages).toBeUndefined();
  });

  it('packages undefined when profilesPerPackage missing (now optional)', () => {
    const result = calculateSchedule(
      {
        startMode: 'now',
        speedMode: 'global',
        globalSpeed: 5,
        gapMode: 'continuous',
      },
      [{ id: 'a', sheets: 10, sheetLengthMm: 1000 }],
      { mode: 'profiles' },
    );
    expect(result.rows[0]!.packages).toBeUndefined();
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
