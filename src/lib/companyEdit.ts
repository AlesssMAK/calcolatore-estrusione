import {
  isOriginal,
  loadHistory,
  updateCalculation,
  updateProduction,
  updateSyncMeta,
  type SavedCalculation,
  type SyncMeta,
} from './calcHistory';
import type { CompanySettings } from './catalog';
import {
  updateCompanyCalc,
  updateSharedCalc,
  type CompanyCalc,
  type SharedPayload,
} from './sharedCalc';
import type { TrackingPatch } from '../utils/advance';
import { loadWeekendPref } from '../utils/defaults';
import type { ScheduleSnapshot } from '../types';

// Changing a published calc without opening it in the form (⏸ / ▶ of the
// Produzione list, the produced count on the Produzione page).

/** The schedule a calc is worked on now: this device's weekend shift, plus the
 *  live company schedule + buffers when a company link is active (else the
 *  calc's own). This is what makes a calc saved with weekends off count weekend
 *  hours once they're turned on (the reported "process doesn't move" case). */
export function currentSchedule(
  calc: Pick<SavedCalculation, 'values' | 'snapshot'>,
  company: Pick<CompanySettings, 'schedule' | 'warmupMinutes' | 'shutdownMinutes'> | null,
): ScheduleSnapshot {
  return {
    weekend: loadWeekendPref(),
    schedule: company?.schedule ?? calc.snapshot?.schedule ?? null,
    warmupMinutes:
      (company ? company.warmupMinutes : calc.values?.settings.warmupMinutes) ??
      calc.snapshot?.warmupMinutes ??
      0,
    shutdownMinutes:
      (company ? company.shutdownMinutes : calc.values?.settings.shutdownMinutes) ??
      calc.snapshot?.shutdownMinutes ??
      0,
    // Computed 24/7 ("Senza limiti orari") → keep advancing it 24/7.
    noLimits: !!calc.values?.settings.noLimits,
  };
}

/** The published calcs this device may change: its own (it holds the edit
 *  token), and those editable by anyone in the company. */
export function editableCompanyIds(calcs: CompanyCalc[], retentionDays: number): Set<string> {
  const owned = new Set(
    loadHistory(retentionDays).flatMap((e) => (e.sync?.token ? [e.sync.id] : [])),
  );
  return new Set(calcs.filter((c) => c.isEditable || owned.has(c.id)).map((c) => c.id));
}

/**
 * Write new content to a published calc, so everyone sees it, and keep this
 * device's copy in step: a member's copy follows (`copy`), the author's original
 * only notes the new Produzione version. Null when it wasn't written.
 */
export async function saveCompanyPatch(
  c: CompanyCalc,
  patch: TrackingPatch,
  retentionDays: number,
): Promise<{ calc: CompanyCalc; copy?: SavedCalculation } | null> {
  if (!patch.values) return null;
  const local = loadHistory(retentionDays).find((e) => e.sync?.id === c.id);
  const payload: SharedPayload = {
    v: 1,
    mode: c.payload.mode,
    values: patch.values,
    result: patch.result,
    completedRows: patch.completedRows,
    label: c.payload.label,
    snapshot: patch.snapshot,
  };
  const token = local?.sync?.token;
  const version = token
    ? await updateSharedCalc(c.id, token, payload)
    : c.isEditable
      ? await updateCompanyCalc(c.id, payload)
      : null;
  if (version == null) return null;
  const calc: CompanyCalc = { ...c, payload, version };
  if (!local?.sync) return { calc };
  if (isOriginal(local.sync)) {
    updateProduction(local.id, { version, payload, seenAt: Date.now() }, retentionDays);
    return { calc };
  }
  const updated = updateCalculation(local.id, patch, retentionDays);
  const sync: SyncMeta = { ...local.sync, version };
  updateSyncMeta(local.id, sync, retentionDays);
  return { calc, copy: updated ? { ...updated, sync } : undefined };
}
