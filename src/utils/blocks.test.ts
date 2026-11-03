import { describe, expect, it } from 'vitest';
import {
  blockIndexes,
  blockMateIds,
  blockRanges,
  moveBlock,
  moveInBlock,
  moveToBlock,
  leaveBlock,
  pausesAfterRemoval,
  placedCount,
  type PauseFields,
} from './blocks';
import type { Order } from '../types';

const cambio: PauseFields = {
  gapEnabled: true,
  gapAfterMin: 120,
  gapReason: { id: 'r1', name: 'Cambio stampo', color: 'blue', defaultMin: 120 },
};
const pulizia: PauseFields = { gapEnabled: true, gapAfterMin: 30 };

// [A1 A2] ⏸cambio [B1] ⏸pulizia [C1 C2]
const list = (): Order[] => [
  { id: 'A1' },
  { id: 'A2', ...cambio },
  { id: 'B1', ...pulizia },
  { id: 'C1' },
  { id: 'C2' },
];
const ids = (orders: Order[], order: number[]) => order.map((i) => orders[i]!.id);

describe('blocks', () => {
  it('splits the orders at their pauses', () => {
    expect(blockIndexes(list())).toEqual([0, 0, 1, 2, 2]);
    expect(blockRanges(list())).toEqual([
      { start: 0, end: 1 },
      { start: 2, end: 2 },
      { start: 3, end: 4 },
    ]);
  });

  it('a pause on the last order opens an (empty) next block', () => {
    const o: Order[] = [{ id: 'A' }, { id: 'B', ...pulizia }];
    expect(blockRanges(o)).toEqual([{ start: 0, end: 1 }]);
  });

  it('legacy "with gaps" calcs: every order is its own block', () => {
    const legacy: Order[] = [{ id: 'a' }, { id: 'b' }];
    expect(blockIndexes(legacy, 'withGaps')).toEqual([0, 1]);
  });
});

describe('moveInBlock', () => {
  it('reorders inside the block; the pause stays at the block end', () => {
    const o = list();
    const r = moveInBlock(o, 1, 0)!; // A2 above A1
    expect(ids(o, r.order)).toEqual(['A2', 'A1', 'B1', 'C1', 'C2']);
    expect(r.pauses).toEqual([null, cambio, pulizia, null, null]);
  });

  it('refuses a move into another block', () => {
    expect(moveInBlock(list(), 0, 3)).toBeNull();
    expect(moveInBlock(list(), 1, 2)).toBeNull();
  });
});

describe('moveBlock', () => {
  it('moves a whole block; the pauses stay on the boundaries', () => {
    const o = list();
    const r = moveBlock(o, 2, 0)!; // C to the front
    expect(ids(o, r.order)).toEqual(['C1', 'C2', 'A1', 'A2', 'B1']);
    // [C1 C2] ⏸cambio [A1 A2] ⏸pulizia [B1]
    expect(r.pauses).toEqual([null, cambio, null, pulizia, null]);
  });

  it('keeps a trailing pause at the end', () => {
    const o: Order[] = [{ id: 'A', ...cambio }, { id: 'B', ...pulizia }];
    const r = moveBlock(o, 1, 0)!;
    expect(ids(o, r.order)).toEqual(['B', 'A']);
    expect(r.pauses).toEqual([cambio, pulizia]);
  });
});

describe('moveToBlock', () => {
  it('moves an order into another block, after / before the one it lands on', () => {
    const o = list();
    const r = moveToBlock(o, 3, 0, true)!; // C1 after A1
    expect(ids(o, r.order)).toEqual(['A1', 'C1', 'A2', 'B1', 'C2']);
    expect(r.pauses).toEqual([null, null, cambio, pulizia, null]);
    const up = moveToBlock(o, 0, 3, false)!; // A1 before C1
    expect(ids(o, up.order)).toEqual(['A2', 'B1', 'A1', 'C1', 'C2']);
    expect(up.pauses).toEqual([cambio, pulizia, null, null, null]);
  });

  it('as the last of a block it takes over the block pause', () => {
    const o = list();
    const r = moveToBlock(o, 0, 1, true)!; // A1 after A2 (works in its own block too)
    expect(ids(o, r.order)).toEqual(['A2', 'A1', 'B1', 'C1', 'C2']);
    expect(r.pauses).toEqual([null, cambio, pulizia, null, null]);
  });

  it('a block left empty disappears with its closing pause', () => {
    const o = list();
    const r = moveToBlock(o, 2, 4, true)!; // B1 (alone) into C
    expect(ids(o, r.order)).toEqual(['A1', 'A2', 'C1', 'C2', 'B1']);
    // [A1 A2] ⏸cambio [C1 C2 B1] — pulizia went with block B
    expect(r.pauses).toEqual([null, cambio, null, null, null]);
  });

  it('a new order not placed yet goes into a block; the others stay at the end', () => {
    const o: Order[] = [...list(), { id: 'N1', unplaced: true }, { id: 'N2', unplaced: true }];
    expect(placedCount(o)).toBe(5);
    const r = moveToBlock(o, 5, 2, false)!; // N1 before B1
    expect(ids(o, r.order)).toEqual(['A1', 'A2', 'N1', 'B1', 'C1', 'C2', 'N2']);
    expect(r.pauses).toEqual([null, cambio, null, pulizia, null, null, null]);
    // …but never among the new ones
    expect(moveToBlock(o, 0, 6, false)).toBeNull();
  });
});

describe('blockMateIds', () => {
  it('lists the orders of each one’s block', () => {
    expect(blockMateIds(list())).toEqual([
      ['A1', 'A2'],
      ['A1', 'A2'],
      ['B1'],
      ['C1', 'C2'],
      ['C1', 'C2'],
    ]);
  });
});

describe('pausesAfterRemoval', () => {
  it('a block whose last order is done keeps its pause on the one left', () => {
    const o = list();
    const done = new Set([1]); // A2 done (queue ran it first), A1 not
    const p = pausesAfterRemoval(o, (i) => !done.has(i));
    expect(p.get(0)).toEqual(cambio);
    expect(p.has(1)).toBe(false);
    expect(p.get(2)).toEqual(pulizia);
  });

  it('a finished block drops its pause', () => {
    const o = list();
    const p = pausesAfterRemoval(o, (i) => i >= 2);
    expect([...p.keys()]).toEqual([2, 3, 4]);
    expect(p.get(2)).toEqual(pulizia);
  });
});

describe('leaveBlock', () => {
  it('an order leaves for a block of its own right after its block', () => {
    const o = [...list(), { id: 'C3' }];
    const r = leaveBlock(o, 4)!; // C2 out of [C1 C2 C3]
    expect(ids(o, r.order)).toEqual(['A1', 'A2', 'B1', 'C1', 'C3', 'C2']);
    expect(r.pauses).toEqual([null, cambio, pulizia, null, null, null]);
  });

  it('the block pause stays on the boundary — now after the order that left', () => {
    const o = list();
    const r = leaveBlock(o, 0)!; // A1 out of [A1 A2] ⏸cambio
    expect(ids(o, r.order)).toEqual(['A2', 'A1', 'B1', 'C1', 'C2']);
    // [A2] (no pause yet) [A1] ⏸cambio [B1] ⏸pulizia [C1 C2]
    expect(r.pauses).toEqual([null, cambio, pulizia, null, null]);
  });

  it('nothing for an order alone in its block or not placed yet', () => {
    const o: Order[] = [...list(), { id: 'N1', unplaced: true }];
    expect(leaveBlock(o, 2)).toBeNull();
    expect(leaveBlock(o, 5)).toBeNull();
  });
});
