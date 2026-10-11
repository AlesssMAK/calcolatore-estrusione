// Auto-saved draft of the Piramide page inputs, so a reload or navigating away
// and back doesn't lose unfinished work. Single slot in localStorage (per
// device) — the explicit "Salvati" history (piramideHistory) is the separate,
// named-and-kept store. Like the calculator form draft, it holds only what isn't
// saved there yet (see piramideDraftKey) and is only restored within
// DRAFT_TTL_MS (15 min) of the last change.
import { DRAFT_TTL_MS, draftKey } from './formDraft';

export interface PiramideDraft {
  /** Sheet rows as raw strings (length + qty), rebuilt into rows on restore. */
  rows: { length: string; qty: string }[];
  base: string;
  lanes: string;
  maxRows: string;
  minLen: string;
  maxLen: string;
  allowScatter?: boolean;
  bancaliCount?: string;
  bancaliLens?: string[];
  /** When it was last saved (epoch ms) — for the DRAFT_TTL_MS expiry. */
  ts?: number;
}

const KEY = 'piramide.draft';

export function savePiramideDraft(draft: PiramideDraft): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...draft, ts: Date.now() }));
  } catch {
    /* quota / private mode — best-effort */
  }
}

export function clearPiramideDraft(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** The inputs' meaningful content, for "is this already saved?" — blank sheet
 *  rows don't count, values are compared trimmed. */
export function piramideDraftKey(d: PiramideDraft): string {
  return draftKey({
    ...d,
    ts: undefined,
    rows: d.rows.map((r) => ({ length: r.length.trim(), qty: r.qty.trim() })),
  });
}

/** True when the inputs hold at least one sheet row — otherwise there's
 *  nothing worth keeping in a draft. */
export function hasPiramideRows(d: PiramideDraft): boolean {
  return d.rows.some((r) => r.length.trim() !== '' || r.qty.trim() !== '');
}

/** Read the draft; returns null when missing / malformed / older than
 *  DRAFT_TTL_MS (then it's dropped too) so the page opens clean. */
export function loadPiramideDraft(): PiramideDraft | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PiramideDraft;
    if (!parsed || !Array.isArray(parsed.rows)) return null;
    // Stale (or from before the timestamp existed) → start clean.
    if (!parsed.ts || Date.now() - parsed.ts > DRAFT_TTL_MS) {
      clearPiramideDraft();
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
