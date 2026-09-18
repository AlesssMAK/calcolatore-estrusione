// One-shot hand-off of Piramide sheet rows back into the calculator as an
// order. Mirror of piramideImport (calculator → Piramide), the other way. The
// two live on different routes, so the rows are stashed in sessionStorage and
// popped once when the calculator mounts.

export interface OrderImport {
  /** Sheet rows to turn into an order's sizes: qty (pieces) + length (mm). */
  rows: { length: number; qty: number }[];
  /** When set, append the order to this saved calculation (opened like a
   *  restore); when absent, start a fresh calculation with just this order. */
  targetCalcId?: string;
}

const KEY = 'calc.orderImport';

/** Stash Piramide rows for the calculator to pick up on its next mount. */
export function stashOrderImport(data: OrderImport): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* quota / private mode — the handoff simply won't happen */
  }
}

/** Read and clear a pending order import (one-shot). Returns null when none /
 *  on any error, so a normal calculator visit is unaffected. */
export function popOrderImport(): OrderImport | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);
    const parsed = JSON.parse(raw) as OrderImport;
    if (!parsed || !Array.isArray(parsed.rows) || parsed.rows.length === 0) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
