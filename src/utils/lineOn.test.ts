import { describe, expect, it } from 'vitest';
import { buildAdvancedCalc, startsLaterAt, toggleTracking } from './advance';
import { calculateSchedule } from './calculator';
import { stageOf } from './companyReport';
import type { FormValues } from '../formSchema';
import type { SavedCalculation } from '../lib/calcHistory';
import type { SharedPayload } from '../lib/sharedCalc';
import type { ScheduleSnapshot, WeekendDay, WeekSchedule } from '../types';

// A line as Akra Plast's: Monday from 06:00, Tue–Fri round the clock, Saturday
// until 12:00, Sunday off; 4 h warm-up, 1 h shutdown → it produces from
// Monday 10:00 to Saturday 11:00.
const day = (
  start: number,
  end: number,
  full24 = false,
  enabled = true
): WeekendDay => ({
  enabled,
  full24,
  start,
  end,
});
const schedule: WeekSchedule = {
  mon: day(6, 24),
  tue: day(6, 22, true),
  wed: day(6, 22, true),
  thu: day(6, 22, true),
  fri: day(6, 22, true),
  sat: day(0, 12),
  sun: day(6, 22, false, false),
};
const snap: ScheduleSnapshot = {
  schedule,
  warmupMinutes: 240,
  shutdownMinutes: 60,
};

// November 2026: Sat 21, Sun 22, Mon 23.
const at = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m);

/** 600 sheets of 1 m at 1 m/min: 10 h of production. Paused. */
function paused(): SavedCalculation {
  const values = {
    settings: { startMode: 'now', startAt: '', gapMode: 'continuous' },
    orders: [
      {
        id: 'a',
        speedMPerMin: 1,
        sizes: [{ uid: 'a1', sheets: 600, length: 1000 }],
      },
    ],
  } as unknown as FormValues;
  const result = calculateSchedule(values.settings, values.orders, {
    schedule,
    warmupMinutes: 240,
    shutdownMinutes: 60,
    now: at(20, 9),
  });
  return {
    id: 'x',
    ts: 0,
    label: 'x',
    result,
    values: { ...values, settings: { ...values.settings, frozen: true } },
    snapshot: snap,
  };
}
const payloadOf = (e: SavedCalculation, patch: object): SharedPayload =>
  ({ v: 1, mode: 'sheets', ...e, ...patch }) as unknown as SharedPayload;

describe('▶ while the schedule has the line off or warming up', () => {
  it('asks only then — and says when it would start', () => {
    expect(startsLaterAt(at(22, 15), snap)).toEqual(at(23, 10)); // Sunday
    expect(startsLaterAt(at(23, 8), snap)).toEqual(at(23, 10)); // warming up
    expect(startsLaterAt(at(21, 11, 30), snap)).toEqual(at(23, 10)); // shutting down
    expect(startsLaterAt(at(24, 12), snap)).toBeNull(); // Tuesday noon
    expect(startsLaterAt(at(23, 10), snap)).toBeNull();
  });

  it('from the next shift: «Linea ferma», and when it goes on', () => {
    const e = paused();
    const patch = toggleTracking(e, at(22, 15), snap)!;
    expect(patch.result.rows[0].start).toEqual(at(23, 10));
    expect(patch.values!.settings.lineOnAt).toBeUndefined();
    const stage = stageOf(payloadOf(e, patch), at(22, 15));
    expect(stage.status).toBe('notStarted');
  });

  it('«Avvia adesso» on Sunday: produces from now, on into the week', () => {
    const e = paused();
    const patch = toggleTracking(e, at(22, 15), snap, true)!;
    expect(patch.values!.settings.lineOnAt).toBe(at(22, 15).toISOString());
    expect(patch.snapshot?.lineOnAt).toBe(at(22, 15).toISOString());
    // 10 h with no stop: Sunday 15:00 → Monday 01:00.
    expect(patch.result.rows[0].start).toEqual(at(22, 15));
    expect(patch.result.endAt).toEqual(at(23, 1));
    const p = payloadOf(e, patch);
    expect(stageOf(p, at(22, 15)).status).toBe('running');
    const later = stageOf(p, at(22, 18));
    expect(later.status).toBe('running');
    expect(later.produced).toBe(180);
    expect(later.resumesAt).toBeUndefined();
  });

  it('«Avvia adesso» while warming up: no warm-up left', () => {
    const e = paused();
    const patch = toggleTracking(e, at(23, 8), snap, true)!;
    expect(patch.result.rows[0].start).toEqual(at(23, 8));
    expect(patch.result.endAt).toEqual(at(23, 18));
    expect(stageOf(payloadOf(e, patch), at(23, 9)).produced).toBe(60);
  });

  it('kept through an advance (reopening it later)', () => {
    const e = paused();
    const patch = toggleTracking(e, at(22, 15), snap, true)!;
    const running: SavedCalculation = { ...e, ...patch };
    const adv = buildAdvancedCalc(running, at(22, 18), patch.snapshot)!;
    expect(adv.values.settings.lineOnAt).toBe(at(22, 15).toISOString());
    expect(adv.result.endAt).toEqual(at(23, 1));
  });

  it('paused again: the line on early is forgotten', () => {
    const e = paused();
    const patch = toggleTracking(e, at(22, 15), snap, true)!;
    const again = toggleTracking(
      { ...e, ...patch },
      at(22, 16),
      patch.snapshot!
    )!;
    expect(again.values!.settings.frozen).toBe(true);
    expect(again.values!.settings.lineOnAt).toBeUndefined();
    expect(again.snapshot?.lineOnAt).toBeUndefined();
  });

  it('a line stopped mid-size says when it goes on', () => {
    // Started Saturday 09:00: runs to 11:00, stops, goes on Monday 10:00.
    const e = paused();
    const patch = toggleTracking(e, at(21, 9), snap)!;
    const stage = stageOf(payloadOf(e, patch), at(22, 12));
    expect(stage.status).toBe('stopped');
    expect(stage.resumesAt).toEqual(at(23, 10));
  });
});
