import { describe, it, expect } from 'vitest';
import { calculateSchedule, progressAsOf } from './calculator';
import {
  interruptWith,
  prioritizeStep,
  queueStatus,
  resolveSequence,
  toQueue,
} from './queue';
import type { GlobalSettings, Order, QueueItem } from '../types';

const at = (h: number, m = 0) => new Date(2026, 4, 11, h, m, 0, 0); // Mon
const t = (d: Date) => `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;

// 24/7 line (wall-clock timeline), speed 1 m/min, 1000 mm sheets → 1 sheet/min.
// A: A1 60 min, A2 120 min · B: B1 60 min, B2 60 min.
function makeOrders(produced: { A?: number[]; B?: number[] } = {}): Order[] {
  const entries = (vals?: number[]) =>
    (vals ?? []).map((value, sizeIndex) => ({ sizeIndex, value }));
  return [
    {
      id: 'A',
      speedMPerMin: 1,
      sizes: [
        { sheets: 60, length: 1000, uid: 'a1' },
        { sheets: 120, length: 1000, uid: 'a2' },
      ],
      producedSheets: entries(produced.A),
    },
    {
      id: 'B',
      sizes: [
        { sheets: 60, length: 1000, uid: 'b1' },
        { sheets: 60, length: 1000, uid: 'b2' },
      ],
      producedSheets: entries(produced.B),
    },
  ];
}
const settings = (queue?: QueueItem[]): GlobalSettings => ({
  startMode: 'now',
  gapMode: 'continuous',
  noLimits: true,
  queue,
});
const Q: QueueItem[] = [
  { orderId: 'B', sizeUid: 'b1' },
  { orderId: 'A', sizeUid: 'a1' },
  { orderId: 'A', sizeUid: 'a2' },
  { orderId: 'B', sizeUid: 'b2' },
];

describe('custom production queue — scheduling', () => {
  it('without a queue keeps the form order', () => {
    const r = calculateSchedule(settings(), makeOrders(), { now: at(8) });
    expect(r.rows[1]!.sizeDetails!.map((s) => t(s.start))).toEqual(['11:00', '12:00']);
  });

  it('runs sizes across orders in the queue order; rows stay grouped', () => {
    const r = calculateSchedule(settings(Q), makeOrders(), { now: at(8) });
    const [A, B] = r.rows;
    // B1 08–09, A1 09–10, A2 10–12, B2 12–13.
    expect(B!.sizeDetails!.map((s) => `${t(s.start)}-${t(s.end)}`)).toEqual([
      '8:00-9:00',
      '12:00-13:00',
    ]);
    expect(A!.sizeDetails!.map((s) => `${t(s.start)}-${t(s.end)}`)).toEqual([
      '9:00-10:00',
      '10:00-12:00',
    ]);
    // An order spans its first to last step; interleaved → split into parts.
    expect([t(B!.start), t(B!.end)]).toEqual(['8:00', '13:00']);
    expect(B!.segments?.length).toBe(2);
    expect([t(A!.start), t(A!.end)]).toEqual(['9:00', '12:00']);
    expect(A!.segments).toBeUndefined(); // A1+A2 back to back → one piece
    expect(t(r.startAt)).toBe('8:00');
    expect(t(r.endAt)).toBe('13:00');
  });

  it('applies "Pausa dopo" after the order\'s last step, never after the very last', () => {
    const orders = makeOrders();
    orders[0]!.gapEnabled = true;
    orders[0]!.gapAfterMin = 30;
    orders[1]!.gapEnabled = true;
    orders[1]!.gapAfterMin = 30;
    const r = calculateSchedule(settings(Q), orders, { now: at(8) });
    // A finishes with A2 at 12:00 → 30 min pause → B2 12:30–13:30; B ends last.
    expect(t(r.rows[1]!.sizeDetails![1]!.start)).toBe('12:30');
    expect(r.rows[0]!.gapAfterMin).toBe(30);
    expect(r.rows[1]!.gapAfterMin).toBe(0);
    expect(r.totalGapMinutes).toBe(30);
  });

  it('progressAsOf follows the queue (advance to now)', () => {
    const r = calculateSchedule(settings(Q), makeOrders(), { now: at(8) });
    const p = progressAsOf(r, at(9, 30), {
      warmupMinutes: 0,
      shutdownMinutes: 0,
      noLimits: true,
    });
    expect(p.orders[1]!.producedCountPerSize).toEqual([60, 0]); // B1 done
    expect(p.orders[0]!.producedCountPerSize).toEqual([30, 0]); // A1 half
  });
});

describe('custom production queue — status & auto-off', () => {
  const status = (produced: { A?: number[]; B?: number[] }) => {
    const orders = makeOrders(produced);
    const r = calculateSchedule(settings(Q), orders, { now: at(8) });
    return queueStatus(Q, orders, r);
  };

  it('is active and names the first step when nothing has started', () => {
    expect(status({})).toEqual({ active: true, next: { orderIdx: 1, sizeIdx: 0 } });
  });

  it('names the step after the one in production', () => {
    expect(status({ B: [30] }).next).toEqual({ orderIdx: 0, sizeIdx: 0 });
  });

  it('switches off once the re-arranged sizes are produced', () => {
    // B1 done → what's left (A1, A2, B2) is the form order again.
    expect(status({ B: [60] }).active).toBe(false);
  });
});

describe('resolveSequence / prioritizeStep', () => {
  it('drops unknown items and slots unmentioned ones after their order', () => {
    const orders = makeOrders();
    const seq = resolveSequence(
      [{ orderId: 'B', sizeUid: 'b2' }, { orderId: 'X' }],
      orders,
    );
    expect(toQueue(seq, orders)).toEqual([
      { orderId: 'B', sizeUid: 'b2' },
      { orderId: 'B', sizeUid: 'b1' },
      { orderId: 'A', sizeUid: 'a1' },
      { orderId: 'A', sizeUid: 'a2' },
    ]);
  });

  it('⏭ puts a size first when nothing has started', () => {
    const orders = makeOrders();
    const r = calculateSchedule(settings(), orders, { now: at(8) });
    const seq = prioritizeStep(undefined, orders, r, { orderIdx: 1, sizeIdx: 1 });
    expect(toQueue(seq, orders).map((q) => q.sizeUid)).toEqual(['b2', 'a1', 'a2', 'b1']);
  });

  it('⏭ puts a size right after the one in production', () => {
    const orders = makeOrders({ A: [30] }); // A1 in production
    const r = calculateSchedule(settings(), orders, { now: at(8) });
    const seq = prioritizeStep(undefined, orders, r, { orderIdx: 1, sizeIdx: 1 });
    expect(toQueue(seq, orders).map((q) => q.sizeUid)).toEqual(['a1', 'b2', 'a2', 'b1']);
  });
});

describe('interruptWith (⏹ + "what is in production now?")', () => {
  it('runs the picked size now; the stopped one resumes right after it', () => {
    const orders = makeOrders({ A: [30] }); // A1 wrongly "in production"
    const r = calculateSchedule(settings(), orders, { now: at(8) });
    const seq = interruptWith(undefined, orders, r, { orderIdx: 0, sizeIdx: 0 }, { orderIdx: 1, sizeIdx: 1 });
    expect(toQueue(seq, orders).map((q) => q.sizeUid)).toEqual(['b2', 'a1', 'a2', 'b1']);
    // Rescheduled with that queue: B2 is the one running first.
    const r2 = calculateSchedule(settings(toQueue(seq, orders)), orders, { now: at(8) });
    expect(t(r2.rows[1]!.sizeDetails![1]!.start)).toBe('8:00');
    expect(t(r2.rows[0]!.sizeDetails![0]!.start)).toBe('9:00'); // A1 resumes after B2
  });
});

describe('queueStatus with "now"', () => {
  it('a step whose start has come is in production → next is the one after', () => {
    const orders = makeOrders();
    const r = calculateSchedule(settings(Q), orders, { now: at(8) });
    // B1 runs 08–09 (nothing produced yet, but its time has come at 08:30).
    expect(queueStatus(Q, orders, r, at(8, 30)).next).toEqual({ orderIdx: 0, sizeIdx: 0 });
    // Before the start it's still the next one.
    expect(queueStatus(Q, orders, r, at(7)).next).toEqual({ orderIdx: 1, sizeIdx: 0 });
  });
});
