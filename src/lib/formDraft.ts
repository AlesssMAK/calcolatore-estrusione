import type { FormValues } from '../formSchema';
import type { CalculatorMode } from '../types';

// Crash-safety draft of the calculator form — unfinished work only: kept while
// the form differs from what was opened / last saved (Calcola), dropped once it's
// saved or when a saved calc is merely viewed (see draftKey). Restored on the
// next fresh open (a genuine relaunch) within DRAFT_TTL_MS of the last change,
// but NOT on a deliberate reload (F5 / logo / "Nuovo calcolo") — those clear it
// so the operator gets a clean form. An older draft is stale → dropped.
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

/**
 * What a draft compares: the form's meaningful content, as a string. Empty
 * Calcolo Avanzato rows (seeded with just their size tag), empty lists,
 * undefined / null / '' fields and size uids are not changes — so merely opening a calc doesn't
 * look like unfinished work. Equal keys = nothing new to keep in a draft.
 */
export function draftKey(values: unknown): string {
  const norm = (x: unknown): unknown => {
    if (Array.isArray(x)) {
      // Empty object rows drop out; an empty primitive keeps its slot (null) so
      // positional lists (e.g. per-pallet lengths) don't shift — bar trailing.
      const out = x
        .map((e) => {
          const n = norm(e);
          return n === undefined && (e === null || typeof e !== 'object')
            ? null
            : n;
        })
        .filter((e) => e !== undefined);
      while (out.length > 0 && out[out.length - 1] === null) out.pop();
      return out.length > 0 ? out : undefined; // [] = absent
    }
    if (x && typeof x === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(x)) {
        if (k === 'uid') continue;
        const n = norm(v);
        if (n !== undefined) out[k] = n;
      }
      const keys = Object.keys(out);
      // An empty object, or a produced row carrying only its size tag. (A Date
      // would land here too — the form keeps dates as ISO strings.)
      if (keys.length === 0 || (keys.length === 1 && keys[0] === 'sizeIndex')) {
        return undefined;
      }
      return out;
    }
    if (x === undefined || x === null || x === '') return undefined;
    if (typeof x === 'number' && Number.isNaN(x)) return undefined;
    return x;
  };
  return JSON.stringify(norm(values) ?? null);
}

export function clearDraft(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
