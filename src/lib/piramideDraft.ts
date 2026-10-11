// Auto-saved draft of the Piramide page inputs, so a reload or navigating away
// and back doesn't lose the current sheet list + options. Single slot in
// localStorage (per device) — the explicit "Salvati" history (piramideHistory)
// is the separate, named-and-kept store. Like the calculator form draft, it's
// only restored within DRAFT_TTL_MS (15 min) of the last change.
import { DRAFT_TTL_MS } from './formDraft';

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
      localStorage.removeItem(KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
