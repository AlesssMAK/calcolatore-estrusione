import { describe, expect, it } from 'vitest';
import type { ScheduledOrder, ScheduledSizeDetail } from '../types';
import { blockEnds, sizeGroupEnds, spanTotal } from './spanTotals';

const at = (h: number) => new Date(2026, 10, 10, h, 0, 0);
const size = (min: number, endH: number) =>
  ({ remainingMinutes: min, end: at(endH) }) as ScheduledSizeDetail;
const row = (p: Partial<ScheduledOrder> & { id?: string }): ScheduledOrder =>
  ({
    order: { id: p.id ?? 'x', sizes: [] },
    productionMinutes: 0,
    remainingMinutes: 0,
    gapAfterMin: 0,
    start: at(8),
    end: at(9),
    ...p,
  }) as ScheduledOrder;

describe('spanTotals', () => {
  it('sums what is left and takes the last end', () => {
    expect(spanTotal([])).toBeNull();
    const t = spanTotal([size(30, 10), size(45, 9)])!;
    expect(t.minutes).toBe(75);
    expect(t.end).toEqual(at(10));
  });

  it("closes an order's size groups at their last size", () => {
    const r = row({
      order: {
        id: 'o',
        sizes: [{ group: 0 }, { group: 0 }, { group: 1 }],
        sizeGroupTitles: { g1: 'Pallet B' },
      } as ScheduledOrder['order'],
      sizeDetails: [size(10, 9), size(20, 10), size(30, 11)],
    });
    const ends = sizeGroupEnds(r);
    expect([...ends.keys()]).toEqual([1, 2]);
    expect(ends.get(1)).toMatchObject({ n: 1, title: undefined, total: { minutes: 30 } });
    expect(ends.get(2)).toMatchObject({ n: 2, title: 'Pallet B', total: { minutes: 30 } });
  });

  it('has no group ends with one group, or details not matching', () => {
    const one = row({
      order: { id: 'o', sizes: [{}, {}] } as ScheduledOrder['order'],
      sizeDetails: [size(1, 9), size(1, 9)],
    });
    expect(sizeGroupEnds(one).size).toBe(0);
    const off = row({
      order: { id: 'o', sizes: [{ group: 0 }, { group: 1 }] } as ScheduledOrder['order'],
      sizeDetails: [size(1, 9)],
    });
    expect(sizeGroupEnds(off).size).toBe(0);
  });

  it('splits the queue into blocks at the pauses, skipping the completed rows', () => {
    const rows = [
      row({ id: 'done', completed: true, gapAfterMin: 30, remainingMinutes: 0 }),
      row({ id: 'a', remainingMinutes: 60, end: at(9) }),
      row({ id: 'b', remainingMinutes: 30, end: at(10), gapAfterMin: 15 }),
      row({ id: 'c', remainingMinutes: 45, end: at(12), gapAfterMin: 15 }),
    ];
    const ends = blockEnds(rows);
    // block 1 = a, b (closed by b's pause); block 2 = c alone: its order
    // says it already
    expect([...ends.keys()]).toEqual([2]);
    expect(ends.get(2)).toMatchObject({ n: 1, total: { minutes: 90, end: at(10) } });
  });

  it('has no block ends without a pause between orders', () => {
    expect(blockEnds([row({}), row({})]).size).toBe(0);
  });
});
