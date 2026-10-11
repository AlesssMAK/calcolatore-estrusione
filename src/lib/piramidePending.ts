// Piramide results waiting to land in the order they were opened from (the
// automatic round-trip). Piramide can't reach the calculator's form, so each
// "Calcola Distribuzione" leaves its latest layout here, one per calc + order;
// the calculator applies it the next time it opens that calc — then recomputes
// and saves it like a "Calcola". Plus a one-shot "open this calc" so returning
// to the calculator lands straight in it.
import type { NestingResult } from './nesting';

export interface PiramidePending {
  calcId: string;
  orderId: string;
  /** Sheet list in production order: length (mm) + quantity. */
  rows: { length: number; qty: number }[];
  schema?: NestingResult;
  ts: number;
}

const KEY = 'piramide.pending';
const OPEN_KEY = 'calc.openSaved';
/** Saved calcs expire long before this — older leftovers are just dropped. */
const MAX_AGE_MS = 30 * 24 * 60 * 60_000;

function read(): PiramidePending[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown;
    return Array.isArray(parsed) ? (parsed as PiramidePending[]) : [];
  } catch {
    return [];
  }
}

function write(list: PiramidePending[]): void {
  try {
    if (list.length > 0) localStorage.setItem(KEY, JSON.stringify(list));
    else localStorage.removeItem(KEY);
  } catch {
    /* quota / private mode — best-effort */
  }
}

/** Keep the latest layout for this calc's order (replacing an earlier one). */
export function savePiramidePending(p: Omit<PiramidePending, 'ts'>): void {
  const now = Date.now();
  const rest = read().filter(
    (e) =>
      !(e.calcId === p.calcId && e.orderId === p.orderId) &&
      now - e.ts < MAX_AGE_MS,
  );
  write([...rest, { ...p, ts: now }]);
}

/** Take (and remove) the layouts waiting for this calc. */
export function takePiramidePending(calcId: string): PiramidePending[] {
  const list = read();
  const mine = list.filter((e) => e.calcId === calcId);
  if (mine.length > 0) write(list.filter((e) => e.calcId !== calcId));
  return mine;
}

/** Ask the calculator to open this saved calc on its next mount. */
export function stashOpenSaved(calcId: string): void {
  try {
    sessionStorage.setItem(OPEN_KEY, calcId);
  } catch {
    /* ignore */
  }
}

/** Read and clear the pending "open this calc" (one-shot). */
export function popOpenSaved(): string | null {
  try {
    const id = sessionStorage.getItem(OPEN_KEY);
    if (id) sessionStorage.removeItem(OPEN_KEY);
    return id;
  } catch {
    return null;
  }
}
