import { describe, expect, it } from 'vitest';
import { calculateSchedule, isWorkingAt, nextClosing } from './calculator';
import { stageAt } from './companyReport';
import type { SharedPayload } from '../lib/sharedCalc';
import type { FormValues } from '../formSchema';
import type { GlobalSettings, Order, WeekdayKey, WeekSchedule } from '../types';

const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m); // Oct 2026
const day = (start: number, end: number) => ({ enabled: true, full24: false, start, end });
const off = { enabled: false, full24: false, start: 6, end: 14 };
// Mon–Fri 06:00–22:00, weekend off. 12 Oct 2026 is a Monday.
const schedule = Object.fromEntries(
  (['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as WeekdayKey[]).map((k) => [
    k,
    k === 'sat' || k === 'sun' ? off : day(6, 22),
  ]),
) as WeekSchedule;
const snapshot = { schedule, warmupMinutes: 0, shutdownMinutes: 0 };

// One order, two sizes at 1 m/min: 60 × 1000 mm (60 min) then 30 × 2000 mm
// (60 min), from Monday 20:30 → 1000 mm 20:30–21:30, 2000 mm 21:30–22:00 +
// Tuesday 06:00–06:30.
const settings = {
  startMode: 'manual',
  startAt: at(12, 20, 30).toISOString(),
  gapMode: 'continuous',
} as GlobalSettings;
const orders = [
  {
    id: 'o1',
    productName: 'PC 10',
    speedMPerMin: 1,
    sizes: [
      { sheets: 60, length: 1000 },
      { sheets: 30, length: 2000 },
    ],
  },
] as Order[];
const payload: SharedPayload = {
  v: 1,
  mode: 'sheets',
  values: { settings, orders } as unknown as FormValues,
  result: calculateSchedule(settings, orders, {
    mode: 'sheets',
    schedule,
    warmupMinutes: 0,
    shutdownMinutes: 0,
    now: at(12, 20, 30),
  }),
  snapshot,
};

describe('line closing', () => {
  it('is the end of the working window going on, or of the next one', () => {
    expect(nextClosing(at(12, 10), snapshot)).toEqual(at(12, 22));
    expect(nextClosing(at(12, 23), snapshot)).toEqual(at(13, 22)); // stopped → next
    expect(nextClosing(at(17, 9), snapshot)).toEqual(at(19, 22)); // Saturday → Monday
  });

  it('is none on a 24/7 line', () => {
    expect(nextClosing(at(12, 10), { ...snapshot, noLimits: true })).toBeNull();
  });

  it('tells working time apart', () => {
    expect(isWorkingAt(at(12, 21), snapshot)).toBe(true);
    expect(isWorkingAt(at(12, 23), snapshot)).toBe(false);
  });
});

describe('stage of a published calc at a moment', () => {
  it('before the start: not started, the first size next', () => {
    const s = stageAt(payload, at(12, 19));
    expect(s.status).toBe('notStarted');
    expect(s.sizeLength).toBe(1000);
    expect(s.stepStart).toEqual(at(12, 20, 30));
  });

  it('mid-size: running, with how much of it is done', () => {
    const s = stageAt(payload, at(12, 21));
    expect(s).toMatchObject({
      status: 'running',
      orderNo: 1,
      productName: 'PC 10',
      sizeLength: 1000,
      produced: 30,
      total: 60,
    });
    expect(s.orderEnd).toEqual(at(13, 6, 30));
  });

  it('at closing: the size in progress, with the line stopped after', () => {
    const closing = stageAt(payload, at(12, 22));
    expect(closing).toMatchObject({ status: 'stopped', sizeLength: 2000, produced: 15 });
    expect(stageAt(payload, at(13, 3)).status).toBe('stopped');
  });

  it('after the end: done', () => {
    expect(stageAt(payload, at(13, 7)).status).toBe('done');
  });
});

describe('stageAt — a pause between blocks', () => {
  // Mon 08:00: A 60 m (08–09) ⏸ Cambio stampo 2 h (09–11) | B 30 m (11–11:30).
  const s = {
    startMode: 'manual',
    startAt: at(12, 8).toISOString(),
    gapMode: 'continuous',
  } as GlobalSettings;
  const o = [
    {
      id: 'a',
      productName: 'PC 10',
      speedMPerMin: 1,
      sizes: [{ sheets: 60, length: 1000 }],
      gapEnabled: true,
      gapAfterMin: 120,
      gapReason: { id: 'r', name: 'Cambio stampo', color: 'blue', defaultMin: 120 },
    },
    { id: 'b', productName: 'PC 16', sizes: [{ sheets: 30, length: 1000 }] },
  ] as Order[];
  const opts = { mode: 'sheets' as const, schedule, warmupMinutes: 0, shutdownMinutes: 0 };
  const result = calculateSchedule(s, o, { ...opts, now: at(12, 8) });
  const p: SharedPayload = {
    v: 1,
    mode: 'sheets',
    values: { settings: s, orders: o } as unknown as FormValues,
    result,
    snapshot,
  };

  it('in the pause: "waiting", which pause until when, then the next order', () => {
    const st = stageAt(p, at(12, 10));
    expect(st.status).toBe('waiting');
    expect(st.pause?.name).toBe('Cambio stampo');
    expect(st.pause?.until.getHours()).toBe(11);
    expect(st.orderNo).toBe(2);
  });

  it('also once the block before it was split off as completed', () => {
    // After an advance in the pause: A is a completed row, B starts at 11:00.
    const rest = calculateSchedule(
      { ...s, startMode: 'now', resumeAt: at(12, 11).toISOString() },
      [{ ...o[1]!, speedMPerMin: 1 }],
      { ...opts, now: at(12, 10) },
    );
    const advanced: SharedPayload = {
      ...p,
      result: rest,
      completedRows: [{ ...result.rows[0]!, completed: true }],
    };
    const st = stageAt(advanced, at(12, 10));
    expect(st.status).toBe('waiting'); // not "not started"
    expect(st.pause?.name).toBe('Cambio stampo');
    expect(st.stepStart?.getHours()).toBe(11);
  });

  it('no pause before / after it', () => {
    expect(stageAt(p, at(12, 8, 30)).pause).toBeUndefined();
    expect(stageAt(p, at(12, 11, 10)).status).toBe('running');
  });
});
