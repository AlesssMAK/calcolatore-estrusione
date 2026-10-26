import type { GapMode, Order } from '../types';
import { isGapEnabled } from './blocks';

type ProductOrder = Pick<Order, 'productName' | 'gapEnabled'>;

/** Product names compared the way an operator reads them (case / spaces). */
const productKey = (name: string | undefined): string => (name ?? '').trim().toLowerCase();

/**
 * Every product change stops the line: the indexes `i` where order `i` and the
 * next one make different products with no pause between them. Orders without
 * a product name don't count.
 */
export function productChangesWithoutPause(
  orders: ReadonlyArray<ProductOrder | undefined>,
  gapMode?: GapMode,
): number[] {
  const out: number[] = [];
  for (let i = 0; i < orders.length - 1; i++) {
    const a = productKey(orders[i]?.productName);
    const b = productKey(orders[i + 1]?.productName);
    if (a && b && a !== b && !isGapEnabled(orders[i], { gapMode })) out.push(i);
  }
  return out;
}

/** True when the two names are the same product. */
export function sameProduct(a: string | undefined, b: string | undefined): boolean {
  return productKey(a) === productKey(b);
}
