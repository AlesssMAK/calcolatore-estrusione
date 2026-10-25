// Blocks of orders. A pause after an order ("Pausa Dopo") closes a block: the
// orders up to it are one product type, the ones after it the next. Rules
// (agreed with the user):
//  - orders move freely inside their block, never alone into another one;
//  - a whole block can move among the blocks;
//  - pauses belong to the boundaries, not to the blocks: after any move the
//    pause between block k and k+1 is still the same one;
//  - a custom size queue only re-arranges sizes within a block.
// A block's closing pause is stored on its last order (gapEnabled /
// gapAfterMin / gapReason), so every move re-seats the pauses on the new last
// orders.

import type { GapMode, Order } from '../types';

/** Is a pause scheduled after this order? Per-order toggle; orders saved before
 *  the toggle existed fall back to the old global "with gaps" setting. */
export function isGapEnabled(
  order: Pick<Order, 'gapEnabled'> | undefined,
  settings: { gapMode?: GapMode } | undefined,
): boolean {
  return order?.gapEnabled ?? settings?.gapMode === 'withGaps';
}

export type PauseFields = Pick<Order, 'gapEnabled' | 'gapAfterMin' | 'gapReason'>;

type BlockOrder = Pick<Order, 'gapEnabled' | 'gapAfterMin' | 'gapReason'>;

/** The pause after an order, or null when there's none. */
export function pauseOf(order: BlockOrder | undefined, gapMode?: GapMode): PauseFields | null {
  if (!order || !isGapEnabled(order, { gapMode })) return null;
  return { gapEnabled: true, gapAfterMin: order.gapAfterMin, gapReason: order.gapReason };
}

/** Block number of each order. */
export function blockIndexes(orders: BlockOrder[], gapMode?: GapMode): number[] {
  let b = 0;
  return orders.map((o) => {
    const mine = b;
    if (isGapEnabled(o, { gapMode })) b += 1;
    return mine;
  });
}

/** Index ranges (inclusive) of the non-empty blocks, in order. */
export function blockRanges(
  orders: BlockOrder[],
  gapMode?: GapMode,
): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  blockIndexes(orders, gapMode).forEach((b, i) => {
    if (out[b]) out[b].end = i;
    else out[b] = { start: i, end: i };
  });
  return out;
}

/** A new arrangement of the orders: who goes where, and the pause after each. */
export interface Rearrangement {
  /** New position → old index. */
  order: number[];
  /** Pause after each new position (null → none). */
  pauses: (PauseFields | null)[];
}

/** Lay blocks (lists of old indexes) out one after another; block k's last
 *  order gets the k-th boundary pause, every other order none. */
function arrange(blocks: number[][], boundary: (PauseFields | null)[]): Rearrangement {
  const order: number[] = [];
  const pauses: (PauseFields | null)[] = [];
  blocks.forEach((list, k) => {
    list.forEach((oldIdx, j) => {
      order.push(oldIdx);
      pauses.push(j === list.length - 1 ? (boundary[k] ?? null) : null);
    });
  });
  return { order, pauses };
}

function split(orders: BlockOrder[], gapMode?: GapMode) {
  const ranges = blockRanges(orders, gapMode);
  const blocks = ranges.map(({ start, end }) =>
    Array.from({ length: end - start + 1 }, (_, i) => start + i),
  );
  const boundary = ranges.map(({ end }) => pauseOf(orders[end], gapMode));
  return { blocks, boundary };
}

function arrayMove<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  next.splice(to, 0, ...next.splice(from, 1));
  return next;
}

/** Move an order within its block. Null when `to` is in another block (not
 *  allowed) or nothing changes. */
export function moveInBlock(
  orders: BlockOrder[],
  from: number,
  to: number,
  gapMode?: GapMode,
): Rearrangement | null {
  if (from === to) return null;
  const idx = blockIndexes(orders, gapMode);
  if (idx[from] === undefined || idx[from] !== idx[to]) return null;
  const { blocks, boundary } = split(orders, gapMode);
  const b = idx[from];
  const list = blocks[b];
  blocks[b] = arrayMove(list, list.indexOf(from), list.indexOf(to));
  return arrange(blocks, boundary);
}

/** Move a whole block among the blocks; the pauses stay on the boundaries. */
export function moveBlock(
  orders: BlockOrder[],
  fromBlock: number,
  toBlock: number,
  gapMode?: GapMode,
): Rearrangement | null {
  const { blocks, boundary } = split(orders, gapMode);
  if (fromBlock === toBlock || !blocks[fromBlock] || !blocks[toBlock]) return null;
  return arrange(arrayMove(blocks, fromBlock, toBlock), boundary);
}

/**
 * Some orders leave the list (completed ones, after an advance): the pause
 * closing a block stays with the block's last remaining order, so a block that
 * isn't finished keeps its pause. A block with nothing left drops its pause.
 * Returns the pause for each kept order (by old index).
 */
export function pausesAfterRemoval(
  orders: BlockOrder[],
  keep: (i: number) => boolean,
  gapMode?: GapMode,
): Map<number, PauseFields | null> {
  const { blocks, boundary } = split(orders, gapMode);
  const out = new Map<number, PauseFields | null>();
  blocks.forEach((list, k) => {
    const kept = list.filter(keep);
    kept.forEach((i, j) => out.set(i, j === kept.length - 1 ? boundary[k] : null));
  });
  return out;
}

/** The pause fields to write on an order that has no pause. */
export const NO_PAUSE: PauseFields = {
  gapEnabled: false,
  gapAfterMin: undefined,
  gapReason: undefined,
};

/** Same pause (or none) on both? */
export function samePause(
  a: BlockOrder | undefined,
  b: PauseFields | null,
  gapMode?: GapMode,
): boolean {
  const pa = pauseOf(a, gapMode);
  if (!pa || !b) return !pa && !b;
  return (
    pa.gapAfterMin === b.gapAfterMin &&
    JSON.stringify(pa.gapReason ?? null) === JSON.stringify(b.gapReason ?? null)
  );
}
