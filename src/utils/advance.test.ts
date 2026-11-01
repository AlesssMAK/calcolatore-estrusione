import { describe, it, expect } from 'vitest';
import {
  buildAdvancedCalc,
  orderFromCompletedRow,
  restoreIntoBlocks,
  splitCompleted,
  toggleTracking,
} from './advance';
import { calculateSchedule } from './calculator';
import type { FormValues } from '../formSchema';
import type { SavedCalculation } from '../lib/calcHistory';
import type { Order, ScheduledOrder, ScheduleSnapshot } from '../types';

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

  it('never advances a "Calcolo fisso" (frozen) calc', () => {
    const entry = makeEntry();
    entry.values!.settings.frozen = true;
    // Hours later it still reopens exactly as computed.
    expect(buildAdvancedCalc(entry, localDate(2026, 4, 11, 11))).toBeNull();
  });

  it('splits finished orders into completedRows, keeps only active in the form', () => {
    const start = localDate(2026, 4, 11, 6); // Mon 06:00
    const values = {
      settings: {
        startMode: 'manual',
        startAt: start.toISOString(),
        gapMode: 'continuous',
      },
      orders: [
        { id: 'a', sheets: 120, sheetLengthMm: 1000, speedMPerMin: 1 }, // 06:00–08:00
        { id: 'b', sheets: 300, sheetLengthMm: 1000, speedMPerMin: 1 }, // 08:00–13:00
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
    const entry: SavedCalculation = {
      id: 'x',
      ts: start.getTime(),
      label: 't',
      result,
      values,
      snapshot,
    };
    // now = Mon 10:00 → 'a' finished, 'b' in progress.
    const adv = buildAdvancedCalc(entry, localDate(2026, 4, 11, 10));
    expect(adv).not.toBeNull();
    expect(adv!.completedRows).toHaveLength(1);
    expect(adv!.completedRows[0]!.order.id).toBe('a');
    expect(adv!.completedRows[0]!.completed).toBe(true);
    expect(adv!.values.orders).toHaveLength(1);
    expect(adv!.values.orders[0]!.id).toBe('b');
    expect(adv!.result.rows).toHaveLength(1);
  });

  it('counts weekend hours when a currentSchedule turns weekends on', () => {
    const start = localDate(2026, 4, 11, 6); // Mon 06:00
    const values = {
      settings: {
        startMode: 'manual',
        startAt: start.toISOString(),
        gapMode: 'continuous',
      },
      // Huge total-meters order so it's always still active — we compare how
      // much got produced, not whether it finished.
      orders: [
        { id: 'a', useTotalLength: true, totalLengthM: 1_000_000, speedMPerMin: 1 },
      ],
    } as unknown as FormValues;
    const result = calculateSchedule(values.settings, values.orders, {
      now: start,
    });
    // Saved with weekends OFF (no weekend shift in the snapshot).
    const snapshot: ScheduleSnapshot = {
      warmupMinutes: 0,
      shutdownMinutes: 0,
      schedule: null,
    };
    const entry: SavedCalculation = {
      id: 'x',
      ts: start.getTime(),
      label: 't',
      result,
      values,
      snapshot,
    };

    const now = localDate(2026, 4, 17, 12); // Sunday 12:00 (in the weekend)
    const full24 = { enabled: true, full24: true, start: 0, end: 24 };
    const weekendOn: ScheduleSnapshot = {
      weekend: { enabled: true, sat: full24, sun: full24 },
      warmupMinutes: 0,
      shutdownMinutes: 0,
      schedule: null,
    };

    // Frozen snapshot (weekends off): no production accrues across the weekend.
    const off = buildAdvancedCalc(entry, now);
    // Current schedule with weekends on: the weekend hours now count.
    const on = buildAdvancedCalc(entry, now, weekendOn);

    expect(off).not.toBeNull();
    expect(on).not.toBeNull();
    const producedOff = (off!.values.orders[0]!.producedSheets as { value: number }[])[0]!
      .value;
    const producedOn = (on!.values.orders[0]!.producedSheets as { value: number }[])[0]!
      .value;
    // Weekend-on must have produced strictly more — the extra Sat/Sun hours.
    expect(producedOn).toBeGreaterThan(producedOff);
    // And the re-opened form reflects the current (enabled) weekend shift.
    expect(on!.values.settings.weekend?.enabled).toBe(true);
  });

  it('materializes inherited speed when the first order is completed', () => {
    const start = localDate(2026, 4, 11, 6); // Mon 06:00
    const values = {
      settings: {
        startMode: 'manual',
        startAt: start.toISOString(),
        gapMode: 'continuous',
      },
      orders: [
        { id: 'a', sheets: 120, sheetLengthMm: 1000, speedMPerMin: 1 }, // first: speed set
        { id: 'b', sheets: 300, sheetLengthMm: 1000 }, // inherits 'a' speed
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
    const entry: SavedCalculation = {
      id: 'x',
      ts: start.getTime(),
      label: 't',
      result,
      values,
      snapshot,
    };
    // now = Mon 10:00 → 'a' finished, 'b' active and now the first order.
    // Without materializing the inherited speed, the re-calc would throw
    // "speedMPerMin required on the first order".
    let adv: ReturnType<typeof buildAdvancedCalc> = null;
    expect(() => {
      adv = buildAdvancedCalc(entry, localDate(2026, 4, 11, 10));
    }).not.toThrow();
    expect(adv).not.toBeNull();
    expect(adv!.values.orders).toHaveLength(1);
    expect(adv!.values.orders[0]!.id).toBe('b');
    expect(adv!.values.orders[0]!.speedMPerMin).toBe(1);
    expect(adv!.result.rows).toHaveLength(1);
  });
});

describe('splitCompleted (a "Calcola" with produced orders)', () => {
  const cambio = { gapEnabled: true, gapAfterMin: 60 };
  // [A1 A2] ⏸ [B1]; A2 fully produced (✓) before A1
  const orders = [
    { id: 'A1', sheets: 60, sheetLengthMm: 1000, speedMPerMin: 1 },
    { id: 'A2', sheets: 60, sheetLengthMm: 1000, ...cambio, producedSheets: [{ value: 60 }] },
    { id: 'B1', sheets: 60, sheetLengthMm: 1000 },
  ] as unknown as Order[];
  const settings = {
    startMode: 'manual',
    startAt: localDate(2026, 4, 11, 6).toISOString(),
    gapMode: 'continuous',
  } as unknown as FormValues['settings'];
  const schedule = (o: Order[]) =>
    calculateSchedule(settings, o, { now: localDate(2026, 4, 11, 6) });

  it('completed rows remember their block; the block pause stays with the order left', () => {
    const split = splitCompleted(orders, schedule(orders), 'continuous', schedule);
    expect(split.completed.map((r) => [r.order.id, r.blockOrderIds])).toEqual([
      ['A2', ['A1', 'A2']],
    ]);
    expect(split.orders.map((o) => [o.id, !!o.gapEnabled, o.gapAfterMin])).toEqual([
      ['A1', true, 60],
      ['B1', false, undefined],
    ]);
    // rescheduled: B1 waits for the pause after A1
    const [a1, b1] = split.result.rows;
    expect(b1!.start.getTime() - a1!.end.getTime()).toBe(60 * 60_000);
  });
});

describe('restoreIntoBlocks ("Ripristina")', () => {
  const pause = { gapEnabled: true, gapAfterMin: 30 };
  const row = (order: Partial<Order> & { id: string }, blockOrderIds?: string[]) =>
    ({ order, speedMPerMin: 1, completed: true, blockOrderIds }) as unknown as ScheduledOrder;
  const ids = (o: Order[]) => o.map((x) => `${x.id}${x.gapEnabled ? '⏸' : ''}`);

  it('back into its own block, in its place, even when another block runs first', () => {
    // active: [B1 ⏸] [C1 C3]; C2 was ✓'d out of turn, between C1 and C3
    const active = [{ id: 'B1', ...pause }, { id: 'C1' }, { id: 'C3' }] as Order[];
    const c2 = row({ id: 'C2' }, ['C1', 'C2', 'C3']);
    expect(ids(restoreIntoBlocks(active, [c2], [c2]))).toEqual(['B1⏸', 'C1', 'C2', 'C3']);
  });

  it('a finished block comes back first, with its pause', () => {
    const active = [{ id: 'B1' }] as Order[];
    const a1 = row({ id: 'A1' }, ['A1', 'A2']);
    const a2 = row({ id: 'A2', ...pause }, ['A1', 'A2']);
    const completed = [a1, a2];
    // one at a time (the last completed first), then the other joins it
    const once = restoreIntoBlocks(active, [a2], completed);
    expect(ids(once)).toEqual(['A2⏸', 'B1']);
    expect(ids(restoreIntoBlocks(once, [a1], [a1]))).toEqual(['A1', 'A2⏸', 'B1']);
    // or all at once
    expect(ids(restoreIntoBlocks(active, completed, completed))).toEqual(['A1', 'A2⏸', 'B1']);
  });

  it('the pause of a finished block is found on a block-mate', () => {
    // A1 held the pause when it was completed last; restoring A2 alone
    const a2 = row({ id: 'A2' }, ['A1', 'A2']);
    const a1 = row({ id: 'A1', ...pause }, ['A1', 'A2']);
    const out = restoreIntoBlocks([{ id: 'B1' }] as Order[], [a2], [a2, a1]);
    expect(ids(out)).toEqual(['A2⏸', 'B1']);
  });

  it('joining a block it never held the pause of; rows from before go to the front', () => {
    const active = [{ id: 'A1', ...pause }, { id: 'B1' }] as Order[];
    const a2 = row({ id: 'A2', ...pause }, ['A1', 'A2']); // was the block's last
    expect(ids(restoreIntoBlocks(active, [a2], [a2]))).toEqual(['A1', 'A2⏸', 'B1']);
    const legacy = row({ id: 'X' });
    expect(ids(restoreIntoBlocks(active, [legacy], [legacy]))).toEqual(['X', 'A1⏸', 'B1']);
  });

  it('new orders not placed in a block stay at the end', () => {
    const active = [{ id: 'A1' }, { id: 'N', unplaced: true }] as Order[];
    const a2 = row({ id: 'A2' }, ['A1', 'A2']);
    expect(restoreIntoBlocks(active, [a2], [a2]).map((o) => o.id)).toEqual(['A1', 'A2', 'N']);
  });
});

describe('orderFromCompletedRow ("Ripristina")', () => {
  const start = localDate(2026, 4, 11, 6); // Mon 06:00
  const values = {
    settings: { startMode: 'manual', startAt: start.toISOString(), gapMode: 'continuous' },
    orders: [
      { id: 'a', sheets: 60, sheetLengthMm: 1000, speedMPerMin: 1.2, cavity: 2 },
      { id: 'b', sheets: 60, sheetLengthMm: 1000 }, // inherits 1.2 m/min × 2
      { id: 'c', sheets: 60, sheetLengthMm: 1000, speedMPerMin: 1.5 }, // still ×2
      { id: 'd', useTotalLength: true, totalLengthM: 100_000 }, // still running
    ],
  } as unknown as FormValues;
  const entry: SavedCalculation = {
    id: 'x',
    ts: start.getTime(),
    label: 't',
    result: calculateSchedule(values.settings, values.orders, { now: start }),
    values,
    snapshot: { warmupMinutes: 0, shutdownMinutes: 0, schedule: null },
  };
  const { completedRows } = buildAdvancedCalc(entry, localDate(2026, 4, 11, 12))!;

  it('comes back with the speed and cavity it ran at, not empty', () => {
    expect(completedRows.map((r) => r.order.id)).toEqual(['a', 'b', 'c']);
    const b = orderFromCompletedRow(completedRows[1]!, completedRows);
    expect(b.speedMPerMin).toBe(1.2);
    expect(b.cavity).toBe(2);
    const c = orderFromCompletedRow(completedRows[2]!, completedRows);
    expect(c.speedMPerMin).toBe(1.5);
    expect(c.cavity).toBe(2);
  });

  it('keeps its own values and clears what was produced', () => {
    const a = orderFromCompletedRow(completedRows[0]!, completedRows);
    expect(a).toMatchObject({ speedMPerMin: 1.2, cavity: 2, producedProfiles: [] });
  });
});

describe('toggleTracking (🔄 in Salvati)', () => {
  const sched: ScheduleSnapshot = { warmupMinutes: 0, shutdownMinutes: 0, schedule: null };

  it('fixed → tracking restarts the production from the moment it is pressed', () => {
    const entry = makeEntry();
    entry.values!.settings.frozen = true;
    const now = localDate(2026, 4, 12, 9); // Tue 09:00, a day after the plan
    const patch = toggleTracking(entry, now, sched)!;
    expect(patch.values!.settings.frozen).toBe(false);
    expect(patch.values!.settings.startMode).toBe('now');
    expect(patch.result.startAt.getTime()).toBe(now.getTime());
    // Nothing subtracted yet: the full 600 min still remain.
    expect(patch.result.rows[0]!.remainingMinutes).toBeCloseTo(600, 0);
  });

  it('tracking → fixed freezes the state reached so far', () => {
    const entry = makeEntry();
    const patch = toggleTracking(entry, localDate(2026, 4, 11, 11), sched)!; // +300 min
    expect(patch.values!.settings.frozen).toBe(true);
    expect(patch.values!.orders[0]!.producedSheets).toEqual([{ value: 300 }]);
    expect(patch.result.rows[0]!.remainingMinutes).toBeCloseTo(300, 0);
    // Frozen now → reopening hours later no longer advances it.
    const frozenEntry = { ...entry, ...patch };
    expect(buildAdvancedCalc(frozenEntry, localDate(2026, 4, 11, 14))).toBeNull();
  });

  it('tracking → fixed before the start keeps the calc exactly as it is', () => {
    const entry = makeEntry();
    const patch = toggleTracking(entry, localDate(2026, 4, 11, 5), sched)!;
    expect(patch.values!.settings.frozen).toBe(true);
    expect(patch.result).toBe(entry.result);
  });
});

describe('a pause between blocks running "now"', () => {
  // Mon 06:00: A 120 m (06–08) ⏸ 2 h (08–10) | B 60 m (10–11).
  function pausedEntry(): SavedCalculation {
    const start = localDate(2026, 4, 11, 6);
    const values = {
      settings: { startMode: 'manual', startAt: start.toISOString(), gapMode: 'continuous' },
      orders: [
        {
          id: 'a',
          useTotalLength: true,
          totalLengthM: 120,
          speedMPerMin: 1,
          gapEnabled: true,
          gapAfterMin: 120,
          gapReason: { id: 'r', name: 'Cambio stampo', color: 'blue', defaultMin: 120 },
        },
        { id: 'b', useTotalLength: true, totalLengthM: 60 },
      ],
    } as unknown as FormValues;
    const result = calculateSchedule(values.settings, values.orders, { now: start });
    const snapshot: ScheduleSnapshot = { warmupMinutes: 0, shutdownMinutes: 0, schedule: null };
    return { id: 'p', ts: start.getTime(), label: 't', result, values, snapshot };
  }
  const hm = (d: Date) => `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;

  it('the result carries when the pause runs', () => {
    const { result } = pausedEntry();
    expect(hm(result.rows[0]!.gapStart!)).toBe('8:00');
    expect(hm(result.rows[0]!.gapEnd!)).toBe('10:00');
    expect(hm(result.rows[1]!.start)).toBe('10:00');
  });

  it('the next block still waits for the pause end (not "now")', () => {
    const adv = buildAdvancedCalc(pausedEntry(), localDate(2026, 4, 11, 9))!;
    expect(adv.completedRows.map((r) => r.order.id)).toEqual(['a']);
    expect(adv.values.settings.resumeAt).toBe(localDate(2026, 4, 11, 10).toISOString());
    expect(hm(adv.result.rows[0]!.start)).toBe('10:00');
    expect(hm(adv.result.endAt)).toBe('11:00');
  });

  it('results saved before pauses had times: waits for the next start', () => {
    const entry = pausedEntry();
    delete entry.result.rows[0]!.gapStart;
    delete entry.result.rows[0]!.gapEnd;
    const adv = buildAdvancedCalc(entry, localDate(2026, 4, 11, 9))!;
    expect(hm(adv.result.rows[0]!.start)).toBe('10:00');
  });

  it('once the pause is over nothing is held any more', () => {
    const adv = buildAdvancedCalc(pausedEntry(), localDate(2026, 4, 11, 10, 30))!;
    expect(adv.values.settings.resumeAt).toBeUndefined();
    expect(adv.result.rows[0]!.remainingMinutes).toBeCloseTo(30, 0);
  });
});
