// Explicit "Salvati" history for the Piramide page: a list of computed layouts
// the operator can restore later, kept per device in localStorage. Separate
// from the single-slot autosave draft (piramideDraft) — this one keeps many
// named-by-summary entries. Saved automatically on each "Calcola distribuzione"
// (like the calculator saves on "Calcola"), de-duplicated by identical inputs.

export interface SavedPiramide {
  /** Stable id (timestamp + small random) for React keys / removes. */
  id: string;
  /** Saved-at epoch ms; entries past the retention window are dropped. */
  ts: number;
  /** Short human summary (pieces · sizes), built by the caller. */
  label: string;
  rows: { length: string; qty: string }[];
  base: string;
  lanes: string;
  maxRows: string;
  minLen: string;
  maxLen: string;
}

/** What the caller passes to save (everything but id/ts). */
export type PiramideInput = Omit<SavedPiramide, 'id' | 'ts'>;

const KEY = 'piramide.history.v1';
const MAX_ENTRIES = 20;
const RETENTION_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

// Layout-relevant signature (ignores OCR-only min/max) so recomputing the same
// sheets+options updates the existing entry instead of piling up duplicates.
function signature(e: PiramideInput): string {
  const rows = e.rows
    .filter((r) => Number(r.length) > 0 && Number(r.qty) > 0)
    .map((r) => `${Number(r.length)}x${Number(r.qty)}`)
    .join('|');
  return `${rows}#${Number(e.base) || 0}/${Number(e.lanes) || 1}/${Number(e.maxRows) || 0}`;
}

function safeParse(raw: string | null): SavedPiramide[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SavedPiramide[]) : [];
  } catch {
    return [];
  }
}

function safeWrite(items: SavedPiramide[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* quota / private mode — best-effort */
  }
}

/** Read the history, dropping entries older than the retention window. */
export function loadPiramideHistory(): SavedPiramide[] {
  if (typeof window === 'undefined') return [];
  const items = safeParse(localStorage.getItem(KEY)).filter(
    (i) => i?.ts && Array.isArray(i.rows),
  );
  const cutoff = Date.now() - RETENTION_DAYS * DAY_MS;
  const fresh = items.filter((i) => i.ts >= cutoff);
  if (fresh.length !== items.length) safeWrite(fresh);
  return fresh;
}

/** Save a layout (front of the list, FIFO-capped). An entry with the same
 *  layout signature is replaced and bumped to the top instead of duplicated. */
export function savePiramideEntry(input: PiramideInput): SavedPiramide {
  const sig = signature(input);
  const rest = loadPiramideHistory().filter((i) => signature(i) !== sig);
  const entry: SavedPiramide = {
    ...input,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ts: Date.now(),
  };
  safeWrite([entry, ...rest].slice(0, MAX_ENTRIES));
  return entry;
}

export function removePiramideEntry(id: string): void {
  safeWrite(loadPiramideHistory().filter((i) => i.id !== id));
}
