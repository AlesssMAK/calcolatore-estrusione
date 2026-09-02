import type { ScheduleResult, ScheduleSnapshot } from '../types';
import type { FormValues } from '../formSchema';

// v2 stored only the computed ScheduleResult; v3 also stores the raw input
// `values` (settings + orders) so restore can refill the form for editing /
// recalculation. Older-key entries are ignored and overwritten on next save.
const STORAGE_KEY = 'calc.history.v3';
// Defaults used when no company link is active; per-company values (set in
// /admin) override these via the callers.
export const DEFAULT_MAX_ENTRIES = 10;
export const DEFAULT_RETENTION_DAYS = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface SavedCalculation {
  /** Stable id (timestamp + small random) so React keys / removes stay stable. */
  id: string;
  /** Saved-at epoch ms. Entries older than the retention window are dropped. */
  ts: number;
  /** Free-form label (product name, fallback to a localized timestamp). */
  label: string;
  /** Persisted computed schedule — restored verbatim into ResultsPanel.
   *  Date fields (startAt/endAt and per-row/per-size start/end) are revived
   *  from ISO strings on read; mode lives inside the result. */
  result: ScheduleResult;
  /** Raw form inputs (settings + orders) at submit time. Optional for forward
   *  compatibility; when present, restore refills the form so the user can
   *  tweak and recalculate. All values are plain JSON (dates are ISO strings). */
  values?: FormValues;
  /** Effective working schedule + buffers used for the computation. Lets the
   *  saved calc be advanced to "now" / recalculated without depending on
   *  (possibly changed) company settings. */
  snapshot?: ScheduleSnapshot;
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
    if (!Array.isArray(parsed)) return [];
    // dateReviver revives `startAt` inside the result (wanted) but would also
    // revive `values.settings.startAt`, where the form expects a plain ISO
    // string — turn that one back into a string.
    for (const e of parsed as SavedCalculation[]) {
      const s = e?.values?.settings as { startAt?: unknown } | undefined;
      if (s?.startAt instanceof Date) s.startAt = s.startAt.toISOString();
    }
    return parsed as SavedCalculation[];
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

/** Read the history; transparently drops entries older than the retention
 *  window and any malformed ones (missing result / dates). */
export function loadHistory(
  retentionDays: number = DEFAULT_RETENTION_DAYS,
): SavedCalculation[] {
  if (typeof window === 'undefined') return [];
  const items = safeParse(window.localStorage.getItem(STORAGE_KEY));
  const cutoff = Date.now() - Math.max(0, retentionDays) * DAY_MS;
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

/** Add a new entry; FIFO-evicts past `maxEntries`. Returns the saved entry. */
export function saveCalculation(
  result: ScheduleResult,
  values: FormValues,
  snapshot: ScheduleSnapshot,
  label: string,
  maxEntries: number = DEFAULT_MAX_ENTRIES,
  retentionDays: number = DEFAULT_RETENTION_DAYS,
): SavedCalculation {
  const entry: SavedCalculation = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ts: Date.now(),
    label,
    result,
    values,
    snapshot,
  };
  const cap = Math.max(1, Math.floor(maxEntries));
  const next = [entry, ...loadHistory(retentionDays)].slice(0, cap);
  safeWrite(next);
  return entry;
}

export function removeCalculation(
  id: string,
  retentionDays: number = DEFAULT_RETENTION_DAYS,
): void {
  safeWrite(loadHistory(retentionDays).filter((i) => i.id !== id));
}

/** Pick the most useful human label for a saved result, in this order:
 *  1. Global settings.productName (carried on result.productName by the
 *     calculator) — explicitly typed by the operator, always wins.
 *  2. Per-order productName values — many operators leave the global field
 *     empty and instead pick a product from the combobox on each row. We
 *     collapse duplicates (multi-row orders for the same product), and if
 *     several distinct products are queued show "First +N" so the dropdown
 *     stays one-line.
 *  3. Last-resort timestamp (DD.MM HH:MM) so empty labels never appear. */
export function deriveLabel(result: ScheduleResult): string {
  const globalName = result.productName?.trim();
  if (globalName) return globalName;

  const seen = new Set<string>();
  const orderNames: string[] = [];
  for (const row of result.rows ?? []) {
    const n = row.order?.productName?.trim();
    if (!n || seen.has(n)) continue;
    seen.add(n);
    orderNames.push(n);
  }
  if (orderNames.length === 1) return orderNames[0];
  if (orderNames.length > 1) {
    return `${orderNames[0]} +${orderNames.length - 1}`;
  }

  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
