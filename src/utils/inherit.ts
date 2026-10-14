// Speed and cavity inherit down the queue: an order without a value of its own
// runs at the nearest previous order's.

export type InheritedKey = 'speedMPerMin' | 'cavity';

type OrderLike = Partial<Record<InheritedKey, number | null | undefined>>;

const ownValue = (o: OrderLike | undefined, key: InheritedKey) => {
  const v = Number(o?.[key]);
  return v > 0 ? v : undefined;
};

/** The value order `i` runs at: its own, else the nearest previous order's. */
export function effectiveValue(
  orders: ReadonlyArray<OrderLike | undefined>,
  i: number,
  key: InheritedKey,
): number | undefined {
  for (let j = i; j >= 0; j--) {
    const v = ownValue(orders[j], key);
    if (v !== undefined) return v;
  }
  return undefined;
}

/**
 * After order `idx` changed from `previous`, the orders after it that should
 * follow the change: those repeating `previous` as their own value (e.g.
 * stamped when a saved calc was reopened) — put back to inheriting. Orders
 * without a value already follow; the first one with a different value of its
 * own ends the run.
 */
export function followersToReset(
  orders: ReadonlyArray<OrderLike | undefined>,
  idx: number,
  key: InheritedKey,
  previous: number,
): number[] {
  const out: number[] = [];
  for (let j = idx + 1; j < orders.length; j++) {
    const v = ownValue(orders[j], key);
    if (v === undefined) continue;
    if (v !== previous) break;
    out.push(j);
  }
  return out;
}
