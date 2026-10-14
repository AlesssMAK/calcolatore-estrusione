// Keeping the author's originals (Salvati) in touch with Produzione: one read
// of the company's list refreshes what each published original is compared to
// and notes the ones no longer there.

import {
  isOriginal,
  loadHistory,
  updateProduction,
  updateSyncMeta,
  type SavedCalculation,
} from './calcHistory';
import { loadCompanyCalcs } from './sharedCalc';
import { diffCalcs, planDiffCount } from '../utils/calcDiff';

/** A published original (expected in the company's Produzione list). */
const isPublishedOriginal = (e: SavedCalculation) =>
  isOriginal(e.sync) && !!(e.sync?.published || e.sync?.gone);

/**
 * Read the company's Produzione list once and, for every published original:
 * store a newer Produzione version as its snapshot, and flag it `gone` when
 * it's no longer listed (cleared again when it's back). Nothing is concluded
 * when the list can't be read. Returns true when something changed.
 */
export async function checkProduction(
  company: string,
  retentionDays: number,
): Promise<boolean> {
  const originals = loadHistory(retentionDays).filter(isPublishedOriginal);
  if (originals.length === 0) return false;
  const list = await loadCompanyCalcs(company);
  if (!list) return false;
  let changed = false;
  for (const e of originals) {
    const sync = e.sync!;
    const c = list.find((x) => x.id === sync.id);
    if (!c) {
      if (!sync.gone) {
        updateSyncMeta(e.id, { ...sync, gone: true }, retentionDays);
        changed = true;
      }
      continue;
    }
    if (sync.gone) {
      updateSyncMeta(e.id, { ...sync, gone: undefined }, retentionDays);
      changed = true;
    }
    if (!e.production || c.version > e.production.version) {
      updateProduction(
        e.id,
        { version: c.version, payload: c.payload, seenAt: Date.now() },
        retentionDays,
      );
      changed = true;
    }
  }
  return changed;
}

/** How a published original stands against Produzione: no longer there, or
 *  how many plan differences (null when there's nothing to compare with). */
export function productionStatus(
  e: SavedCalculation,
): { gone: true } | { gone: false; diffs: number } | null {
  if (!isPublishedOriginal(e) || !e.values) return null;
  if (e.sync?.gone) return { gone: true };
  const p = e.production?.payload;
  if (!p) return null;
  const diffs = planDiffCount(
    diffCalcs(
      { values: e.values, result: e.result, completedRows: e.completedRows, snapshot: e.snapshot },
      { values: p.values, result: p.result, completedRows: p.completedRows, snapshot: p.snapshot },
    ),
  );
  return { gone: false, diffs };
}
