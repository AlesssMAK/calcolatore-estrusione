// One-shot hand-off of an order's sizes from the calculator to the /piramide
// page. The two live on different routes, so the rows are stashed in
// sessionStorage (survives the navigation and a reload of that tab) and popped
// once on the Piramide side. sessionStorage — not localStorage — so it is a
// transient handoff scoped to the tab, never a persisted draft.

export interface PiramideImport {
  /** Human label for the toast / context (product name or order number). */
  label?: string;
  /** Sheet rows to load into Piramide: length (mm) + quantity (pieces). */
  rows: { length: number; qty: number }[];
}

const KEY = 'piramide.import';

/** Stash an order's sizes for the Piramide page to pick up on its next mount. */
export function stashPiramideImport(data: PiramideImport): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* quota / private mode — the handoff simply won't happen */
  }
}

/** Read and clear a pending import (one-shot). Returns null when none / on any
 *  error, so a fresh Piramide visit is unaffected. */
export function popPiramideImport(): PiramideImport | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);
    const parsed = JSON.parse(raw) as PiramideImport;
    if (!parsed || !Array.isArray(parsed.rows) || parsed.rows.length === 0) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
