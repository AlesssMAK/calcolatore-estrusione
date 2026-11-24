import {
  isOriginal,
  updateCalculation,
  updateProduction,
  updateSyncMeta,
  type SavedCalculation,
  type SyncMeta,
} from './calcHistory';
import type { CompanySettings } from './catalog';
import { currentSchedule } from './companyEdit';
import {
  createSharedCalc,
  fetchCompanyCalcs,
  setCompanyPublish,
  updateCompanyCalc,
  updateSharedCalc,
  type SharedPayload,
} from './sharedCalc';
import { toggleTracking, type TrackingPatch } from '../utils/advance';
import { isFinished } from '../utils/companyReport';

// The Salvati list's own actions (🔄, 🏭) — the same wherever the list is open:
// the calculator, the Produzione / Completati pages.

/** A saved entry as the shared document (Produzione) carries it. */
export function payloadOf(entry: SavedCalculation): SharedPayload {
  return {
    v: 1,
    mode: entry.result.mode,
    values: entry.values!,
    result: entry.result,
    completedRows: entry.completedRows,
    label: entry.label,
    snapshot: entry.snapshot,
  };
}

/** A push to the shared document: 'detached' (a view-only follower's copy, its
 *  edits stay on this device), else the new sync once written (null when it
 *  wasn't). */
export type SharedPush = 'detached' | Promise<SyncMeta | null>;

/**
 * Push a saved calc's new content to the shared document it's bound to; its
 * copy (`entryId`) notes the new version. A view-only follower can't write it:
 * the copy is detached instead, so the next pull doesn't overwrite its edits.
 */
export function pushSavedToShared(
  meta: SyncMeta,
  payload: SharedPayload,
  entryId: string | undefined,
  retentionDays: number,
): SharedPush {
  const write = meta.token
    ? // Author / link collaborator — via the secret token.
      updateSharedCalc(meta.id, meta.token, payload)
    : meta.companyEditable
      ? // A member on an "editable by anyone" published calc — no token.
        updateCompanyCalc(meta.id, payload)
      : null;
  if (!write) {
    if (entryId) updateSyncMeta(entryId, undefined, retentionDays);
    return 'detached';
  }
  return write.then((version) => {
    if (version == null) return null;
    const next: SyncMeta = { ...meta, version };
    if (entryId) updateSyncMeta(entryId, next, retentionDays);
    return next;
  });
}

/**
 * 🔄 of Salvati: flip a saved calc between "Calcolo fisso" (static) and
 * tracking, in place (the list doesn't reorder). A synced copy pushes the
 * change; an original doesn't — that waits for "Invia a Produzione". The
 * updated entry and its push, or null when nothing changed.
 */
export function toggleSavedTracking(
  entry: SavedCalculation,
  company: Pick<CompanySettings, 'schedule' | 'warmupMinutes' | 'shutdownMinutes'> | null,
  retentionDays: number,
  /** ▶ «Avvia adesso» (see toggleTracking). */
  startNow = false,
): { updated: SavedCalculation; push?: SharedPush } | null {
  let patch: TrackingPatch | null = null;
  try {
    patch = toggleTracking(entry, new Date(), currentSchedule(entry, company), startNow);
  } catch (err) {
    console.error('Failed to toggle tracking', entry.id, err);
  }
  if (!patch) return null;
  const updated = updateCalculation(entry.id, patch, retentionDays);
  if (!updated) return null;
  const push =
    updated.sync && !isOriginal(updated.sync) && updated.values
      ? pushSavedToShared(updated.sync, payloadOf(updated), updated.id, retentionDays)
      : undefined;
  return { updated, push };
}

/**
 * 🏭 of Salvati: publish a saved calc to the company's Produzione list (view
 * only / editable by anyone) or take it off ('off'). A calc with no shared
 * document gets one first — Produzione's first version is this original as it
 * is now — and the company's cap holds (the finished calcs, kept for
 * Completati, don't count). A published original whose document is gone
 * (removed / expired) is published anew. 'ok' with the entry's new sync, else
 * 'limit' (the cap is reached) or 'failed'.
 */
export async function publishSaved(
  entry: SavedCalculation,
  mode: 'view' | 'edit' | 'off',
  companySlug: string,
  maxShared: number,
  retentionDays: number,
): Promise<{ outcome: 'ok'; sync: SyncMeta } | { outcome: 'limit' | 'failed' }> {
  if (!entry.values) return { outcome: 'failed' };
  let sync = entry.sync ?? null;
  let created: SharedPayload | null = null;
  const createDoc = async () => {
    const payload = payloadOf(entry);
    const { id, editToken } = await createSharedCalc(payload);
    return { sync: { id, token: editToken, version: 1 } as SyncMeta, payload };
  };
  if (!sync?.token) {
    try {
      const doc = await createDoc();
      sync = doc.sync;
      created = doc.payload;
    } catch {
      return { outcome: 'failed' };
    }
  }
  const token = sync.token;
  if (!token) return { outcome: 'failed' };
  const isPublic = mode !== 'off';
  if (isPublic && (!sync.published || sync.gone) && maxShared > 0) {
    const now = new Date();
    const existing = (await fetchCompanyCalcs(companySlug)).filter(
      (c) => !isFinished(c.payload, now),
    );
    if (existing.length >= maxShared) return { outcome: 'limit' };
  }
  let ok = await setCompanyPublish(sync.id, token, companySlug, isPublic, mode === 'edit');
  if (!ok && isPublic && !created) {
    try {
      const doc = await createDoc();
      sync = doc.sync;
      created = doc.payload;
      ok = await setCompanyPublish(doc.sync.id, doc.sync.token!, companySlug, true, mode === 'edit');
    } catch {
      ok = false;
    }
  }
  if (!ok) return { outcome: 'failed' };
  const next: SyncMeta = {
    ...sync,
    published: isPublic,
    publishedEditable: mode === 'edit',
    gone: undefined,
  };
  updateSyncMeta(entry.id, next, retentionDays);
  if (created) {
    updateProduction(entry.id, { version: 1, payload: created, seenAt: Date.now() }, retentionDays);
  }
  return { outcome: 'ok', sync: next };
}
