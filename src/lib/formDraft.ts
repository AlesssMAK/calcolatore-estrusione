import type { FormValues } from '../formSchema';
import type { CalculatorMode } from '../types';

// Crash-safety draft of the calculator form. Autosaved as the user types, so an
// accidental close / crash doesn't lose their input. Restored on the next fresh
// open (a genuine relaunch) within DRAFT_TTL_MS of the last change, but NOT on a
// deliberate reload (F5 / logo / "Nuovo calcolo") — those clear it so the
// operator gets a clean form. An older draft is stale → dropped (clean form).
const KEY = 'calc.draft';

/** How long after the last change a draft is still restored. */
export const DRAFT_TTL_MS = 15 * 60_000;

export interface FormDraft {
  values: FormValues;
  mode: CalculatorMode;
  /** The saved entry being edited, if any — kept so a recompute after a crash
   *  still updates the same "Salvati" slot instead of piling up a duplicate. */
  editingId?: string;
  /** When it was last saved (epoch ms) — for the DRAFT_TTL_MS expiry. */
  ts?: number;
}

export function saveDraft(draft: FormDraft): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ ...draft, ts: Date.now() }));
  } catch {
    /* quota / private mode — best-effort */
  }
}

export function loadDraft(): FormDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FormDraft;
    if (!parsed?.values || !parsed?.mode) return null;
    // Stale (or from before the timestamp existed) → start clean.
    if (!parsed.ts || Date.now() - parsed.ts > DRAFT_TTL_MS) {
      clearDraft();
      return null;
    }
    // Form values are plain JSON (settings.startAt stays an ISO string) — no
    // date revival needed, unlike a saved/computed result.
    return parsed;
  } catch {
    return null;
  }
}

export function clearDraft(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
