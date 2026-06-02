import type { FormValues } from '../formSchema';
import type { CalculatorMode } from '../types';

const STORAGE_KEY = 'calc.history.v1';
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
  /** Calculator tab the entry was made in (sheets vs profiles). The schema
   *  differs between modes so we need this to restore the right tab. */
  mode: CalculatorMode;
  /** Persisted RHF form values — restored verbatim. */
  values: FormValues;
}

function safeParse(raw: string | null): SavedCalculation[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
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

/** Read the history; transparently drops entries older than TTL. Entries
 *  saved before mode was tracked default to 'sheets' so the dropdown still
 *  works after the migration. */
export function loadHistory(): SavedCalculation[] {
  if (typeof window === 'undefined') return [];
  const items = safeParse(window.localStorage.getItem(STORAGE_KEY));
  const cutoff = Date.now() - TTL_MS;
  const fresh = items
    .filter((i) => i?.ts && i.ts >= cutoff)
    .map((i) => ({ ...i, mode: (i.mode ?? 'sheets') as CalculatorMode }));
  if (fresh.length !== items.length) safeWrite(fresh);
  return fresh;
}

/** Add a new entry; FIFO-evicts past MAX_ENTRIES. Returns the saved entry. */
export function saveCalculation(
  values: FormValues,
  label: string,
  mode: CalculatorMode,
): SavedCalculation {
  const entry: SavedCalculation = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ts: Date.now(),
    label,
    mode,
    values,
  };
  const next = [entry, ...loadHistory()].slice(0, MAX_ENTRIES);
  safeWrite(next);
  return entry;
}

export function removeCalculation(id: string): void {
  safeWrite(loadHistory().filter((i) => i.id !== id));
}

/** Default label = settings.productName, falls back to a short timestamp. */
export function deriveLabel(values: FormValues): string {
  const settings = (values as { settings?: { productName?: string } }).settings;
  const name = settings?.productName?.trim();
  if (name) return name;
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
