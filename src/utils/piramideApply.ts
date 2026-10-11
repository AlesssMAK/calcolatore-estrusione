import type { Order, OrderSize } from '../types';
import { genId } from './defaults';
import { remapSizeGroup, SIZE_ENTRY_GROUPS } from './sizeEntries';

/**
 * Re-point the order's Calcolo Avanzato rows from `from` sizes to `to` sizes,
 * matching sizes by sheet length — what's already produced of a length stays
 * with that length wherever it moved. A length that's gone drops its rows; two
 * old sizes of one length both land on it (their rows add up).
 */
function remapByLength(
  order: Order,
  from: OrderSize[],
  to: OrderSize[],
): Partial<Order> {
  const newIdx = new Map<number, number>();
  to.forEach((s, j) => {
    const len = Number(s?.length);
    if (len > 0 && !newIdx.has(len)) newIdx.set(len, j);
  });
  const map = (i: number) => newIdx.get(Number(from[i]?.length)) ?? null;
  const patch: Partial<Order> = {};
  for (const group of SIZE_ENTRY_GROUPS) {
    const arrays = group.map((f) => order[f]);
    if (arrays.every((a) => !a?.length)) continue;
    const out = remapSizeGroup(arrays, map);
    group.forEach((f, k) => {
      patch[f] = out[k];
    });
  }
  return patch;
}

/**
 * Replace an order's sizes with a Piramide layout result (the automatic
 * round-trip): sizes become the layout's rows in production order, the layout
 * schema rides along, and the sizes from before the first replacement are kept
 * in `piramideOriginal` for "Annulla Piramide". Produced counts follow their
 * length; a size keeps its stable uid (custom queue) when its length survives.
 */
export function applyPiramideToOrder(
  order: Order,
  /** Piramide's sheet list: length (mm) + quantity, in production order. */
  rows: { length: number; qty: number }[],
  schema: unknown,
): Order {
  const from = order.sizes ?? [];
  const used = new Set<number>();
  const sizes: OrderSize[] = rows.map((r) => {
    const i = from.findIndex(
      (s, k) => !used.has(k) && Number(s?.length) === r.length,
    );
    if (i >= 0) used.add(i);
    return {
      sheets: r.qty,
      length: r.length,
      uid: (i >= 0 ? from[i]?.uid : undefined) ?? genId(),
    };
  });
  return {
    ...order,
    ...remapByLength(order, from, sizes),
    useTotalLength: false,
    sizes,
    piramideSchema: schema,
    piramideOriginal: order.piramideOriginal ?? { sizes: from },
  };
}

/** "Annulla Piramide": back to the sizes the order had before Piramide (what
 *  was produced since stays, by length), without the layout schema. */
export function revertPiramide(order: Order): Order {
  const original = order.piramideOriginal?.sizes;
  if (!original) return order;
  return {
    ...order,
    ...remapByLength(order, order.sizes ?? [], original),
    sizes: original,
    piramideSchema: undefined,
    piramideOriginal: undefined,
  };
}
