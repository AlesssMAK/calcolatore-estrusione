import type { GapMode, Order } from '../types';
import { blockRanges, isGapEnabled, placedCount } from './blocks';

type ProductOrder = Pick<Order, 'productName' | 'gapEnabled'>;

/** Product names compared the way an operator reads them (case / spaces). */
const productKey = (name: string | undefined): string => (name ?? '').trim().toLowerCase();

/** Do order `i` and the next one make different products? Orders without a
 *  product name don't count. */
export function isProductChange(
  orders: ReadonlyArray<Pick<Order, 'productName'> | undefined>,
  i: number,
): boolean {
  const a = productKey(orders[i]?.productName);
  const b = productKey(orders[i + 1]?.productName);
  return !!a && !!b && a !== b;
}

/**
 * Every product change stops the line: the indexes `i` where order `i` and the
 * next one make different products with no pause between them.
 */
export function productChangesWithoutPause(
  orders: ReadonlyArray<ProductOrder | undefined>,
  gapMode?: GapMode,
): number[] {
  const out: number[] = [];
  for (let i = 0; i < orders.length - 1; i++) {
    if (isProductChange(orders, i) && !isGapEnabled(orders[i], { gapMode })) out.push(i);
  }
  return out;
}

/** True when the two names are the same product. */
export function sameProduct(a: string | undefined, b: string | undefined): boolean {
  return productKey(a) === productKey(b);
}

/** What renaming an order's product does to the blocks (see planRename). */
export type RenamePlan =
  /** Just the order changes. */
  | { kind: 'plain' }
  /** First of a block with others: ask whether the whole block changes
   *  (`members`); if not, it leaves — into the block ending at `join`, or,
   *  with none, a block of its own where it is. */
  | { kind: 'ask'; block: number; members: number[]; join: number | null }
  /** It leaves for the end of the block ending at `to` (same product). */
  | { kind: 'join'; to: number }
  /** It leaves for a block of its own, right after its block. */
  | { kind: 'leave' };

/**
 * A new product for order `idx` (agreed with the user): when it shares a block
 * with other orders, the block's first order asks whether the whole block
 * changes; any other one leaves the block — to the end of a block already
 * making that product (a block's product is its first order's), else for a
 * block of its own. A new order not placed yet, one alone in its block, one
 * without a product yet, or one getting its block's product back just changes.
 */
export function planRename(
  orders: ReadonlyArray<Pick<Order, 'productName' | 'gapEnabled' | 'unplaced'> | undefined>,
  idx: number,
  name: string,
  gapMode?: GapMode,
): RenamePlan {
  const list = orders.map((o) => o ?? {});
  const placed = placedCount(list);
  const old = list[idx]?.productName;
  if (idx >= placed || !productKey(name) || !productKey(old) || sameProduct(old, name)) {
    return { kind: 'plain' };
  }
  const ranges = blockRanges(list.slice(0, placed), gapMode);
  const b = ranges.findIndex((r) => r.start <= idx && idx <= r.end);
  if (b < 0) return { kind: 'plain' };
  const { start, end } = ranges[b];
  if (start === end) return { kind: 'plain' };
  if (idx !== start && sameProduct(list[start]?.productName, name)) return { kind: 'plain' };
  const other = ranges.findIndex(
    (r, k) => k !== b && sameProduct(list[r.start]?.productName, name),
  );
  const join = other >= 0 ? ranges[other].end : null;
  if (idx === start) {
    const members = Array.from({ length: end - start + 1 }, (_, i) => start + i);
    return { kind: 'ask', block: b, members, join };
  }
  return join !== null ? { kind: 'join', to: join } : { kind: 'leave' };
}
