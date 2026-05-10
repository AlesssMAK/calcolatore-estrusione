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
        gapMode: 'continuous',
      },
      [
        {
          id: 'a',
          sizes: [{ sheets: 100, length: 6000, profilesPerPackage: 20 }],
          producedProfiles: [{ value: 50 }],
          speedMPerMin: 5,
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
        gapMode: 'continuous',
      },
      [
        {
          id: 'a',
          sizes: [{ sheets: 100, length: 6000, profilesPerPackage: 20 }],
          producedPackages: [{ value: 2 }],
          speedMPerMin: 5,
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

describe('calculateSchedule — produced under useTotalLength', () => {
  it('sheets: producedSheets × itemLength shortens time pro-rata', () => {
    const start = new Date('2026-04-23T10:00:00Z');
    const result = calculateSchedule(
      {
        startMode: 'manual',
        startAt: start.toISOString(),
        gapMode: 'continuous',
      },
      [
        {
          id: 'a',
          useTotalLength: true,
          totalLengthM: 1200,
          producedSheets: [{ value: 100 }],
          producedItemLength: [{ value: 6000 }],
          speedMPerMin: 5,
        },
      ],
      { now: start, mode: 'sheets' },
    );

    const row = result.rows[0]!;
    // totalSheets is unknown under useTotalLength (batches may have different lengths)
    expect(row.totalSheets).toBeUndefined();
    expect(row.producedSheets).toBe(100);
    expect(row.productionMinutes).toBe(240);
    expect(row.remainingMinutes).toBe(120);
  });

  it('profiles: producedProfiles × itemLength shortens time pro-rata', () => {
    const start = new Date('2026-04-23T10:00:00Z');
    const result = calculateSchedule(
      {
        startMode: 'manual',
        startAt: start.toISOString(),
        gapMode: 'continuous',
      },
      [
        {
          id: 'a',
          useTotalLength: true,
          totalLengthM: 600,
          producedProfiles: [{ value: 50 }],
          producedItemLength: [{ value: 6000 }],
          speedMPerMin: 5,
        },
      ],
      { now: start, mode: 'profiles' },
    );

    const row = result.rows[0]!;
    // totalProfiles is unknown under useTotalLength
    expect(row.totalProfiles).toBeUndefined();
    expect(row.producedProfiles).toBe(50);
    expect(row.productionMinutes).toBe(120);
    expect(row.remainingMinutes).toBe(60);
  });

  it('sheets: per-batch sheetsPerPallet inherits within order, blank batches use previous', () => {
    const start = new Date('2026-04-23T10:00:00Z');
    // 2 batches: [pallets=4, perPallet=10, length=6000mm]; [pallets=2, perPallet=blank=>10, length=3000mm]
    // produced sheets = 4*10 + 2*10 = 60 sheets total
    // producedLengthM = (40 * 6000 + 20 * 3000) / 1000 = 240 + 60 = 300m
    // total = 600m → fraction = 0.5; productionMinutes 600/5 = 120; remaining 60.
    const result = calculateSchedule(
      {
        startMode: 'manual',
        startAt: start.toISOString(),
        gapMode: 'continuous',
      },
      [
        {
          id: 'a',
          useTotalLength: true,
          totalLengthM: 600,
          producedPallets: [{ value: 4 }, { value: 2 }],
          sheetsPerPallet: [{ value: 10 }, { value: undefined }],
          producedItemLength: [{ value: 6000 }, { value: 3000 }],
          speedMPerMin: 5,
        },
      ],
      { now: start, mode: 'sheets' },
    );
    const row = result.rows[0]!;
    expect(row.producedSheets).toBe(60);
    expect(row.producedPallets).toBe(6);
    expect(row.sheetsPerPallet).toBeUndefined(); // mixed/per-batch
    expect(row.productionMinutes).toBe(120);
    expect(row.remainingMinutes).toBe(60);
  });

  it('profiles: per-batch profilesPerPackage inherits within order; packages-only path uses rate', () => {
    const start = new Date('2026-04-23T10:00:00Z');
    // 2 batches: packages=10, perPackage=20 → 200 profiles × 6000mm = 1200m
    //            packages=5,  perPackage=blank=>20 → 100 × 3000mm = 300m
    // producedLengthM = 1500m; totalLengthM = 3000m → fraction 0.5
    // productionMinutes 3000/5 = 600; remaining 300.
    const result = calculateSchedule(
      {
        startMode: 'manual',
        startAt: start.toISOString(),
        gapMode: 'continuous',
      },
      [
        {
          id: 'a',
          useTotalLength: true,
          totalLengthM: 3000,
          producedPackages: [{ value: 10 }, { value: 5 }],
          profilesPerPackage: [{ value: 20 }, { value: undefined }],
          producedItemLength: [{ value: 6000 }, { value: 3000 }],
          speedMPerMin: 5,
        },
      ],
      { now: start, mode: 'profiles' },
    );
    const row = result.rows[0]!;
    expect(row.producedProfiles).toBe(300);
    expect(row.producedPackages).toBe(15);
    expect(row.productionMinutes).toBe(600);
    expect(row.remainingMinutes).toBe(300);
  });

  it('exposes producedLengthM / remainingLengthM for useTotalLength', () => {
    const start = new Date('2026-04-23T10:00:00Z');
    const result = calculateSchedule(
      {
        startMode: 'manual',
        startAt: start.toISOString(),
        gapMode: 'continuous',
      },
      [
        {
          id: 'a',
          useTotalLength: true,
          totalLengthM: 300,
          producedProfiles: [{ value: 10 }],
          producedItemLength: [{ value: 6000 }],
          // 10 × 6000mm = 60m of 300m → fraction 0.2
          speedMPerMin: 5,
        },
      ],
      { now: start, mode: 'profiles' },
    );
    const row = result.rows[0]!;
    expect(row.producedLengthM).toBeCloseTo(60, 5);
    expect(row.remainingLengthM).toBeCloseTo(240, 5);
    // Total counts unknown in useTotalLength → remaining counts must be undefined
    expect(row.remainingProfiles).toBeUndefined();
    expect(row.remainingPackages).toBeUndefined();
  });

  it('mutex: stale producedPackages is ignored when direct producedProfiles entered', () => {
    // Direct path: 10 profili produced. A stale producedPackages=99 (left over
    // after switching paths in the UI; the field is now disabled but the form
    // value remains) must NOT be summed into producedPackages output.
    const start = new Date('2026-04-23T10:00:00Z');
    const result = calculateSchedule(
      {
        startMode: 'manual',
        startAt: start.toISOString(),
        gapMode: 'continuous',
      },
      [
        {
          id: 'a',
          useTotalLength: true,
          totalLengthM: 300,
          producedProfiles: [{ value: 10 }],
          producedPackages: [{ value: 99 }], // stale, must be ignored
          profilesPerPackage: [{ value: 5 }],
          producedItemLength: [{ value: 6000 }],
          speedMPerMin: 5,
        },
      ],
      { now: start, mode: 'profiles' },
    );
    const row = result.rows[0]!;
    // Derived from effective profiles / perPackage = ceil(10/5) = 2; NOT 99.
    expect(row.producedPackages).toBe(2);
  });

  it('mutex: stale producedPallets is ignored when direct producedSheets entered (sheets mode)', () => {
    const start = new Date('2026-04-23T10:00:00Z');
    const result = calculateSchedule(
      {
        startMode: 'manual',
        startAt: start.toISOString(),
        gapMode: 'continuous',
      },
      [
        {
          id: 'a',
          useTotalLength: true,
          totalLengthM: 300,
          producedSheets: [{ value: 10 }],
          producedPallets: [{ value: 99 }], // stale, must be ignored
          sheetsPerPallet: [{ value: 5 }],
          producedItemLength: [{ value: 6000 }],
          speedMPerMin: 5,
        },
      ],
      { now: start, mode: 'sheets' },
    );
    const row = result.rows[0]!;
    expect(row.producedSheets).toBe(10);
    // Derived from effective sheets / perPallet = ceil(10/5) = 2; NOT 99.
    expect(row.producedPallets).toBe(2);
  });

  it('profiles: per-batch perPackage inherits across orders (lastPerPackage carry-over)', () => {
    const start = new Date('2026-04-23T10:00:00Z');
    // Order 1 sets perPackage=20 in batch[0].
    // Order 2 leaves profilesPerPackage blank — must inherit 20 from order 1.
    // Order 2: packages=5 → effectiveProfiles = 5*20 = 100 × 6000mm = 600m
    // totalLengthM=1200 → fraction 0.5; productionMinutes 1200/5=240; remaining 120.
    const result = calculateSchedule(
      {
        startMode: 'manual',
        startAt: start.toISOString(),
        gapMode: 'continuous',
      },
      [
        {
          id: 'a',
          useTotalLength: true,
          totalLengthM: 6000,
          producedProfiles: [{ value: 100 }],
          profilesPerPackage: [{ value: 20 }],
          producedItemLength: [{ value: 6000 }],
          speedMPerMin: 5,
        },
        {
          id: 'b',
          useTotalLength: true,
          totalLengthM: 1200,
          producedPackages: [{ value: 5 }],
          // profilesPerPackage omitted — inherits 20 from order 'a'
          producedItemLength: [{ value: 6000 }],
        },
      ],
      { now: start, mode: 'profiles' },
    );
    const row2 = result.rows[1]!;
    expect(row2.producedProfiles).toBe(100);
    expect(row2.producedPackages).toBe(5);
    expect(row2.productionMinutes).toBe(240);
    expect(row2.remainingMinutes).toBe(120);
  });
});

describe('calculateSchedule — produced (sheets)', () => {
  it('producedSheets shortens time and computes producedPallets when perPallet given', () => {
    const start = new Date('2026-04-23T10:00:00Z');
    const result = calculateSchedule(
      {
        startMode: 'manual',
        startAt: start.toISOString(),
        gapMode: 'continuous',
      },
      [
        {
          id: 'a',
          sizes: [{ sheets: 200, length: 6000 }],
          producedSheets: [{ value: 50 }],
          sheetsPerPallet: [{ value: 25 }],
          speedMPerMin: 5,
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
        gapMode: 'continuous',
      },
      [
        {
          id: 'a',
          sizes: [{ sheets: 200, length: 6000 }],
          sheetsPerPallet: [{ value: 25 }],
          producedPallets: [{ value: 2 }],
          speedMPerMin: 5,
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
        gapMode: 'continuous',
      },
      [
        {
          id: 'a',
          sizes: [
            { sheets: 100, length: 6000, profilesPerPackage: 20 },
            { sheets: 50, length: 3000, profilesPerPackage: 20 },
          ],
          speedMPerMin: 5,
        },
      ],
      { now: new Date('2026-04-23T10:00:00Z'), mode: 'profiles' },
    );

    // ceil(100/20) + ceil(50/20) = 5 + 3 = 8
    expect(result.rows[0]!.packages).toBe(8);
    expect(result.totalPackages).toBeUndefined();
  });

  it('profilesPerPackage falls back to last filled when omitted', () => {
    const result = calculateSchedule(
      {
        startMode: 'manual',
        startAt: '2026-04-23T10:00:00Z',
        gapMode: 'continuous',
      },
      [
        {
          id: 'a',
          sizes: [{ sheets: 100, length: 6000, profilesPerPackage: 25 }],
          speedMPerMin: 5,
        },
        { id: 'b', sizes: [{ sheets: 60, length: 6000 }] },
        {
          id: 'c',
          sizes: [{ sheets: 40, length: 6000, profilesPerPackage: 10 }],
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
        gapMode: 'continuous',
      },
      [
        {
          id: 'a',
          useTotalLength: true,
          totalLengthM: 600,
          speedMPerMin: 5,
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
    gapMode: 'continuous',
  };
  const orders: Order[] = [
    { id: 'a', sheets: 100, sheetLengthMm: 6000, speedMPerMin: 5 },
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
        gapMode: 'withGaps',
      },
      [
        { id: 'a', sheets: 100, sheetLengthMm: 6000, gapAfterMin: 30, speedMPerMin: 5 },
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
        gapMode: 'continuous',
      },
      [{ id: 'a', sheets: 10, sheetLengthMm: 6000, speedMPerMin: 1 }],
      { now: start },
    );
    expect(result.rows[0]!.productionMinutes).toBe(60);
    expect(result.endAt.toISOString()).toBe('2026-04-24T00:00:00.000Z');
  });
});

describe('calculateSchedule — work-week (Mon 06:00 → Sat 06:00 local)', () => {
  // Helpers build local-time dates so the test is timezone-stable.
  const localDate = (
    y: number,
    m: number, // 0-based
    d: number,
    h = 0,
    min = 0,
  ) => new Date(y, m, d, h, min, 0, 0);

  it('start on Saturday afternoon shifts to Monday 06:00', () => {
    // 2026-05-09 is a Saturday
    const start = localDate(2026, 4, 9, 14); // Sat 14:00 local
    const result = calculateSchedule(
      {
        startMode: 'manual',
        startAt: start.toISOString(),
        gapMode: 'continuous',
      },
      [
        { id: 'a', sheets: 60, sheetLengthMm: 1000, speedMPerMin: 1 }, // 60 min
      ],
      { now: start },
    );
    const expectedStart = localDate(2026, 4, 11, 6); // Mon 06:00 local
    const expectedEnd = localDate(2026, 4, 11, 7); // Mon 07:00 local
    expect(result.startAt.getTime()).toBe(expectedStart.getTime());
    expect(result.rows[0]!.start.getTime()).toBe(expectedStart.getTime());
    expect(result.rows[0]!.end.getTime()).toBe(expectedEnd.getTime());
  });

  it('production crossing Sat 06:00 jumps to Mon 06:00', () => {
    // 2026-05-08 is a Friday — start at 22:00, run 600 min (10 h)
    const start = localDate(2026, 4, 8, 22); // Fri 22:00
    const result = calculateSchedule(
      {
        startMode: 'manual',
        startAt: start.toISOString(),
        gapMode: 'continuous',
      },
      [
        { id: 'a', sheets: 600, sheetLengthMm: 1000, speedMPerMin: 1 }, // 600 min
      ],
      { now: start },
    );
    // Available before Sat 06:00 = 8 hours = 480 min
    // Remaining 120 min start at Mon 06:00 → end at Mon 08:00
    const expectedEnd = localDate(2026, 4, 11, 8);
    expect(result.rows[0]!.end.getTime()).toBe(expectedEnd.getTime());
  });

  it('gap-after spans the weekend', () => {
    // Fri 04:00, 60 min order, 60 min gap, 60 min order
    const start = localDate(2026, 5, 5, 4); // 2026-06-05 Fri 04:00
    // Gap of 180 min is bigger than remaining work-time before Sat 06:00
    // Order #1: Fri 04:00 → Fri 05:00
    // Gap: Fri 05:00 → Fri 05:00 + 180 min would be Fri 08:00 (still weekday)
    // Order #2: Fri 08:00 → Fri 09:00
    const result = calculateSchedule(
      {
        startMode: 'manual',
        startAt: start.toISOString(),
        gapMode: 'withGaps',
      },
      [
        {
          id: 'a',
          sheets: 60,
          sheetLengthMm: 1000,
          speedMPerMin: 1,
          gapAfterMin: 180,
        },
        { id: 'b', sheets: 60, sheetLengthMm: 1000 },
      ],
      { now: start },
    );
    expect(result.rows[1]!.start.getTime()).toBe(
      localDate(2026, 5, 5, 8).getTime(),
    );
  });
});

describe('calculateSchedule — "now" mode', () => {
  it('uses the provided "now" when startMode is "now"', () => {
    const now = new Date('2026-04-23T08:00:00Z');
    const result = calculateSchedule(
      {
        startMode: 'now',
        gapMode: 'continuous',
      },
      [{ id: 'a', sheets: 100, sheetLengthMm: 6000, speedMPerMin: 5 }],
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
        gapMode: 'continuous',
      },
      [
        {
          id: 'a',
          sizes: [{ sheets: 100, length: 6000, profilesPerPackage: 25 }],
          speedMPerMin: 5,
        },
        {
          id: 'b',
          sizes: [{ sheets: 51, length: 3000, profilesPerPackage: 10 }],
        },
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
        gapMode: 'continuous',
      },
      [{ id: 'a', sheets: 10, sheetLengthMm: 1000, speedMPerMin: 5 }],
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
          gapMode: 'continuous',
        },
        [],
      ),
    ).toThrow();
  });

  it('throws when first order has no speed', () => {
    expect(() =>
      calculateSchedule(
        {
          startMode: 'now',
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
