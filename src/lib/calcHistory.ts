import type { ScheduleResult } from '../types';

// Bumped key — v1 stored FormValues, v2 stores the computed ScheduleResult
// instead (so restore can show the result panel directly without recalc).
// Old v1 entries are simply ignored; the localStorage slot will be
// overwritten the next time the user presses Calcola.
const STORAGE_KEY = 'calc.history.v2';
const MAX_ENTRIES = 10;
const TTL_DAYS = 7;
const TTL_MS = TTL_DAYS * 24 * 60 * 60 * 1000;

export interface SavedCalculation {
  /** Stable id (timestamp + small random) so React keys / removes stay stable. */
  id: string;
  /** Saved-at epoch ms. Older than TTL_DAYS entries are dropped on read. */
  ts: number;
  /** Free-form label (product name, fallback to a localized timestamp). */
  label: string;
  /** Persisted computed schedule — restored verbatim into ResultsPanel.
   *  Date fields (startAt/endAt and per-row/per-size start/end) are revived
   *  from ISO strings on read; mode lives inside the result. */
  result: ScheduleResult;
}

/** JSON.parse reviver that turns ISO strings back into Date objects for the
 *  small set of date fields used inside ScheduleResult. Other strings are
 *  left untouched. */
function dateReviver(key: string, value: unknown): unknown {
  if (
    typeof value === 'string' &&
    (key === 'start' || key === 'end' || key === 'startAt' || key === 'endAt')
  ) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? value : d;
  }
  return value;
}

function safeParse(raw: string | null): SavedCalculation[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw, dateReviver);
    return Array.isArray(parsed) ? (parsed as SavedCalculation[]) : [];
  } catch {
    return [];
  }
}

function safeWrite(items: SavedCalculation[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* quota / private mode — best-effort */
  }
}

/** Read the history; transparently drops entries older than TTL and any
 *  malformed ones (missing result / dates). */
export function loadHistory(): SavedCalculation[] {
  if (typeof window === 'undefined') return [];
  const items = safeParse(window.localStorage.getItem(STORAGE_KEY));
  const cutoff = Date.now() - TTL_MS;
  const fresh = items.filter(
    (i) =>
      i?.ts &&
      i.ts >= cutoff &&
      i.result &&
      i.result.startAt instanceof Date &&
      i.result.endAt instanceof Date,
  );
  if (fresh.length !== items.length) safeWrite(fresh);
  return fresh;
}

/** Add a new entry; FIFO-evicts past MAX_ENTRIES. Returns the saved entry. */
export function saveCalculation(
  result: ScheduleResult,
  label: string,
): SavedCalculation {
  const entry: SavedCalculation = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ts: Date.now(),
    label,
    result,
  };
  const next = [entry, ...loadHistory()].slice(0, MAX_ENTRIES);
  safeWrite(next);
  return entry;
}

export function removeCalculation(id: string): void {
  safeWrite(loadHistory().filter((i) => i.id !== id));
}

/** Default label = result.productName, falls back to a short timestamp. */
export function deriveLabel(result: ScheduleResult): string {
  const name = result.productName?.trim();
  if (name) return name;
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
