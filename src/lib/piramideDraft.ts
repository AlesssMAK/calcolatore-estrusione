// Auto-saved draft of the Piramide page inputs, so a reload or navigating away
// and back doesn't lose the current sheet list + options. Single slot in
// localStorage (per device) — the explicit "Salvati" history (piramideHistory)
// is the separate, named-and-kept store.

export interface PiramideDraft {
  /** Sheet rows as raw strings (length + qty), rebuilt into rows on restore. */
  rows: { length: string; qty: string }[];
  base: string;
  lanes: string;
  maxRows: string;
  minLen: string;
  maxLen: string;
}

const KEY = 'piramide.draft';

export function savePiramideDraft(draft: PiramideDraft): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    /* quota / private mode — best-effort */
  }
}

/** Read the draft; returns null when missing / malformed so a fresh page is
 *  unaffected. */
export function loadPiramideDraft(): PiramideDraft | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PiramideDraft;
    if (!parsed || !Array.isArray(parsed.rows)) return null;
    return parsed;
  } catch {
    return null;
  }
}
