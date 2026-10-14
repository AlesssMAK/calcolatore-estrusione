import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom';
import Header from './components/Header';
import Tabs from './components/Tabs';
import CalculatorForm from './components/CalculatorForm';
import ResultsPanel from './components/ResultsPanel';
import AdvanceBanner from './components/AdvanceBanner';
import RestoreCompletedButton from './components/RestoreCompletedButton';
import CompanyReportModal from './components/CompanyReportModal';
import CompareModal from './components/CompareModal';
import type { CalcDiff, CalcVersion } from './utils/calcDiff';
import { settleDiffs, type DiffSide } from './utils/calcMerge';
import { TrackedResultContext } from './contexts/trackedResult';
import ErrorBoundary from './components/ErrorBoundary';
import ActiveOrderModal, {
  type ActiveModalInfo,
} from './components/ActiveOrderModal';
import { formatDateParts, formatShortDateTime } from './utils/format';
import { CatalogProvider, useCatalog } from './contexts/CatalogContext';
import { AuthProvider } from './contexts/AuthContext';
import AdminLoginPage from './pages/AdminLoginPage';
import AdminPage from './pages/AdminPage';
import PiramidePage from './pages/PiramidePage';
import type {
  CalculatorMode,
  FormMountState,
  ScheduledOrder,
  ScheduleResult,
  ScheduleSnapshot,
} from './types';
import type { FormValues } from './formSchema';
import {
  deriveLabel,
  isOriginal,
  isViewOnly,
  loadHistory,
  removeCalculation,
  saveCalculation,
  updateCalculation,
  updateProduction,
  updateSyncMeta,
  type ProductionSnapshot,
  type SavedCalculation,
  type SyncMeta,
} from './lib/calcHistory';
import { checkProduction, productionStatus } from './lib/productionCheck';
import {
  buildAdvancedCalc,
  toggleTracking,
  type AdvancedCalc,
  type TrackingPatch,
} from './utils/advance';
import { buildEmptyDefaults, loadWeekendPref, makeEmptyOrder } from './utils/defaults';
import { popOrderImport } from './lib/orderImport';
import { popOpenSaved, takePiramidePending } from './lib/piramidePending';
import { applyPiramideToOrder } from './utils/piramideApply';
import { loadDraft, clearDraft } from './lib/formDraft';
import { isSupabaseConfigured } from './lib/supabase';
import {
  createSharedCalc,
  fetchSharedCalc,
  updateSharedCalc,
  setCompanyPublish,
  adminDeleteCompanyCalc,
  updateCompanyCalc,
  fetchCompanyCalcs,
  type SharedPayload,
  type CompanyCalc,
} from './lib/sharedCalc';

// The order + size currently in production ("active"): the not-yet-done step
// (a size, or a whole single-size order) that runs first in time — the form
// order normally, the custom queue's when one is set. Returns null when
// everything is finished. Drives the active-order modal and the form collapse.
function computeActive(
  result: ScheduleResult,
  lang: string,
): { info: ActiveModalInfo; orderIdx: number; sizeIdx: number } | null {
  const rows = result.rows ?? [];
  const isProfiles = result.mode === 'profiles';
  let best: { i: number; sIdx: number; start: number } | null = null;
  rows.forEach((row, i) => {
    if (row.completed || row.remainingMinutes < 0.5) return;
    const sizes = row.sizeDetails;
    if (sizes && sizes.length > 0) {
      sizes.forEach((sd, sIdx) => {
        if (sd.remainingMinutes < 0.5) return;
        const start = sd.start.getTime();
        if (!best || start < best.start) best = { i, sIdx, start };
      });
    } else {
      const start = row.start.getTime();
      if (!best || start < best.start) best = { i, sIdx: 0, start };
    }
  });
  // (TS can't see the forEach assignments.)
  const pick = best as { i: number; sIdx: number; start: number } | null;
  if (pick) {
    const i = pick.i;
    const row = rows[i];
    const sizes = row.sizeDetails;
    let sizeIdx = 0;
    let length: number | undefined;
    let produced = 0;
    let total = 0;
    if (sizes && sizes.length > 0) {
      sizeIdx = pick.sIdx;
      const sd = sizes[sizeIdx];
      length = sd.length;
      total = sd.sheets;
      produced = isProfiles
        ? (sd.producedProfiles ?? 0)
        : (sd.producedSheetsAtSize ?? 0);
    } else {
      // Single-size order: the count/length live on the order's sizes, and the
      // row only carries produced counts when some are done (else 0).
      const os = row.order?.sizes?.[0];
      length = os?.length;
      total =
        os?.sheets ??
        (isProfiles ? (row.totalProfiles ?? 0) : (row.totalSheets ?? 0));
      produced = isProfiles
        ? (row.producedProfiles ?? 0)
        : (row.producedSheets ?? 0);
    }
    // Multi-size: when this size ends, then the sizes still to come (in the
    // order they run) and when each ends.
    const multi = sizes && sizes.length > 1;
    const otherSizes = multi
      ? sizes
          .map((sd, j) => ({ sd, j }))
          .filter(({ sd, j }) => j !== sizeIdx && sd.remainingMinutes >= 0.5)
          .sort((a, b) => a.sd.start.getTime() - b.sd.start.getTime())
          .map(({ sd }) => ({
            label: `${sd.sheets} × ${sd.length} mm`,
            end: formatShortDateTime(sd.end, lang),
          }))
      : [];
    return {
      info: {
        orderNo: i + 1,
        productName: row.order?.productName?.trim() || undefined,
        sizeLabel: length ? `${length} mm` : '—',
        produced,
        total,
        sizeEnd: multi ? formatDateParts(sizes[sizeIdx].end, lang) : undefined,
        otherSizes,
        orderEnd: formatDateParts(row.end, lang),
      },
      orderIdx: i,
      sizeIdx,
    };
  }
  return null;
}

function CalculatorApp() {
  const { t, i18n } = useTranslation();
  const { settings, company } = useCatalog();
  // Keep the active company link on the Piramide navigation, so a reload of
  // /piramide doesn't lose ?company= and bounce back to the calculator.
  const piramideHref = company
    ? `/piramide?company=${encodeURIComponent(company.slug)}`
    : '/piramide';
  const [selectedMode, setSelectedMode] = useState<CalculatorMode>('sheets');
  // A company can restrict to a single mode; otherwise the user's tab wins.
  // Derived (not state) so it stays in sync with settings without an effect.
  const mode: CalculatorMode =
    settings.modes === 'both' ? selectedMode : settings.modes;
  const [result, setResult] = useState<ScheduleResult | null>(null);
  const [formKey, setFormKey] = useState(0);
  // When a saved calc is restored, the form remounts pre-filled with these
  // inputs; cleared on reset / tab change so the next mount is empty.
  const [restoredValues, setRestoredValues] = useState<FormValues | undefined>(
    undefined,
  );
  // What the next form mount carries: 'saved' — a saved / viewed calc or a
  // clean form; 'unsaved' — work not saved yet (a draft, a Piramide import,
  // completed orders brought back), kept as a draft until "Calcola";
  // 'recompute' — a change applied for the user (a Piramide result for the
  // order it came from, "Annulla Piramide") that's recomputed + saved at once.
  const [mountState, setMountState] = useState<FormMountState>('saved');
  // The saved entry currently on screen + its "as of now" view (null when the
  // calc can't be advanced). Drives the advance/original banner + toggle.
  const [restoredEntry, setRestoredEntry] = useState<SavedCalculation | null>(
    null,
  );
  const [advancedCalc, setAdvancedCalc] = useState<AdvancedCalc | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  // Orders already completed as of "now" — shown (done) in the result but kept
  // out of the form. Prepended to the displayed result; restorable to the form.
  const [completedRows, setCompletedRows] = useState<ScheduledOrder[]>([]);
  // Id of the saved entry the current form is bound to (restored or just
  // saved). Submitting updates this slot in place instead of duplicating.
  const [editingId, setEditingId] = useState<string | undefined>(undefined);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Bumped after each successful save so the dropdown re-reads history.
  const [savedRefreshKey, setSavedRefreshKey] = useState(0);
  // Set to the error message when advancing a restored calc to "now" throws —
  // the saved result is shown as-is instead, and the note surfaces the actual
  // message (so the cause is visible even on a phone with no console).
  const [restoreAdvanceError, setRestoreAdvanceError] = useState<string | null>(
    null,
  );
  // True while viewing a calc opened from Salvati / a shared link (production
  // tracking) — gates the per-order / per-size "✓ Completa" buttons. A fresh
  // calc keeps it false.
  const [fromSaved, setFromSaved] = useState(false);
  // Live-sync binding of the currently displayed calc (null = not synced). Set
  // when the calc is shared/synced or when a synced entry is restored; drives
  // pushing edits to the shared document.
  const [syncMeta, setSyncMeta] = useState<SyncMeta | null>(null);
  // Active-order modal shown once when a saved calc is opened (which size is in
  // production, how much is done, ETA). Null = hidden.
  const [activeModal, setActiveModal] = useState<{
    info: ActiveModalInfo;
    orderIdx: number;
    sizeIdx: number;
  } | null>(null);
  // Which order+size is in production while viewing a saved calc — drives the
  // form collapse (inactive orders shown as summaries, only the active size
  // expanded). Null = no collapse (fresh calc, or everything finished).
  const [activeLoc, setActiveLoc] = useState<{
    orderIdx: number;
    sizeIdx: number;
  } | null>(null);
  // The displayed result is a "Calcolo fisso": a static result, not tracked as
  // in production → no active modal / collapse, and the blinking is off.
  const [viewFrozen, setViewFrozen] = useState(false);
  // "Report" of the company's results (opened from the Produzione list).
  const [reportOpen, setReportOpen] = useState(false);
  // Bumped whenever an original's Produzione snapshot / listing changes, so the
  // banner's "Confronta · N" / "non più in Produzione" follow.
  const [productionRev, setProductionRev] = useState(0);
  // Set by the modal's Calcola: the recompute keeps the modal open.
  const keepModalRef = useRef(false);
  // Transient notice for company-publish feedback (e.g. limit reached).
  const [companyNotice, setCompanyNotice] = useState<string | null>(null);
  // The form registers its "mark fully produced" handler here, so the results
  // panel (a sibling of the form) can trigger completion too.
  // The form also registers "set a size's produced count" for the modal.
  const setProducedRef = useRef<
    ((orderIdx: number, sizeIdx: number, produced: number) => void) | null
  >(null);
  const completeRef = useRef<
    ((orderId: string, sizeIdx?: number) => void) | null
  >(null);

  // Prepend already-completed orders (shown as done) to a result for display.
  const withCompleted = (
    r: ScheduleResult,
    completed: ScheduledOrder[],
  ): ScheduleResult =>
    completed.length > 0 ? { ...r, rows: [...completed, ...r.rows] } : r;

  const scrollToResults = () => {
    window.requestAnimationFrame(() => {
      document
        .getElementById('results')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const clearRestored = () => {
    setRestoredEntry(null);
    setAdvancedCalc(null);
    setShowOriginal(false);
    setRestoreAdvanceError(null);
  };

  const onModeChange = (next: CalculatorMode) => {
    if (next === mode) return;
    clearDraft(); // the form starts clean in the other mode
    setSelectedMode(next);
    setResult(null);
    setRestoredValues(undefined);
    setMountState('saved');
    setEditingId(undefined);
    setCompletedRows([]);
    setFromSaved(false);
    setSyncMeta(null);
    setActiveModal(null);
    setActiveLoc(null);
    setViewFrozen(false);
    clearRestored();
    setFormKey((k) => k + 1);
  };

  const onReset = () => {
    clearDraft(); // "Nuovo calcolo" → drop the crash-safety draft too
    setResult(null);
    setRestoredValues(undefined);
    setMountState('saved');
    setEditingId(undefined);
    setCompletedRows([]);
    setFromSaved(false);
    setSyncMeta(null);
    setActiveModal(null);
    setActiveLoc(null);
    setViewFrozen(false);
    clearRestored();
    setFormKey((k) => k + 1);
  };

  // A saved entry as the shared document (Produzione) carries it.
  const payloadOf = (entry: SavedCalculation): SharedPayload => ({
    v: 1,
    mode: entry.result.mode,
    values: entry.values!,
    result: entry.result,
    completedRows: entry.completedRows,
    label: entry.label,
    snapshot: entry.snapshot,
  });

  // Build the shareable payload for a set of values/result/completed rows,
  // carrying the effective schedule snapshot (from the bound saved entry) so a
  // recipient can advance it to "now".
  const buildPayload = (
    r: ScheduleResult,
    values: FormValues,
    completed: ScheduledOrder[],
    /** The schedule the result was computed on (else the bound entry's). */
    computedOn?: ScheduleSnapshot,
  ): SharedPayload => {
    const snapshot =
      computedOn ??
      (editingId
        ? loadHistory(settings.savedRetentionDays).find((e) => e.id === editingId)
            ?.snapshot
        : undefined);
    return {
      v: 1,
      mode,
      values,
      result: r,
      completedRows: completed.length > 0 ? completed : undefined,
      label: deriveLabel(r),
      snapshot,
    };
  };

  // A submit from the form ("Calcola"). keepCompleted is true when the tracked
  // calc already has completed orders (recompute of a saved calc keeps them),
  // false for a fresh calc. Orders fully produced this submit arrive in
  // `newlyCompleted` — they leave the form (it remounts without them) and join
  // the completed rows shown in the results. Either way it clears the
  // advance/original banner (it's a new result now).
  const onFormResult = (
    r: ScheduleResult,
    values: FormValues,
    keepCompleted?: boolean,
    newlyCompleted: ScheduledOrder[] = [],
    computedOn?: ScheduleSnapshot,
  ) => {
    clearRestored();
    const frozen = !!values.settings.frozen;
    setViewFrozen(frozen);
    // While tracking a saved calc, move the collapse to the new active order /
    // size (e.g. after "✓ Completa" the done size folds and the next one opens).
    // `r` holds only the still-active orders → indices match the form. A fixed
    // calc isn't tracked → no collapse.
    const nextActive =
      fromSaved && !frozen
        ? computeActive(r, i18n.resolvedLanguage ?? 'it')
        : null;
    // Recomputed from the active-order modal → it stays open on the new state
    // (the next size / order once this one is done); otherwise it closes.
    setActiveModal(keepModalRef.current ? nextActive : null);
    keepModalRef.current = false;
    setActiveLoc(
      nextActive
        ? { orderIdx: nextActive.orderIdx, sizeIdx: nextActive.sizeIdx }
        : null,
    );
    if (newlyCompleted.length > 0) {
      setCompletedRows((prev) => [
        ...(keepCompleted ? prev : []),
        ...newlyCompleted,
      ]);
      // Orders were split off → remount the form with only the active ones
      // (just saved by the submit → no draft).
      setRestoredValues(values);
      setMountState('saved');
      setFormKey((k) => k + 1);
    } else if (!keepCompleted) {
      setCompletedRows([]);
    }
    setResult(r);
    // Push edits to the live shared document if this calc is synced — except
    // the author's original: it changes only here until "Invia a Produzione".
    if (syncMeta && !isOriginal(syncMeta)) {
      const newCompleted =
        newlyCompleted.length > 0
          ? [...(keepCompleted ? completedRows : []), ...newlyCompleted]
          : keepCompleted
            ? completedRows
            : [];
      pushToShared(
        syncMeta,
        buildPayload(r, values, newCompleted, computedOn),
        editingId,
        true,
      );
    }
  };

  // Record the Produzione version an original is compared against (and let
  // the banner recount).
  const noteProduction = (id: string, snapshot: ProductionSnapshot) => {
    updateProduction(id, snapshot, settings.savedRetentionDays);
    setProductionRev((r) => r + 1);
  };

  // Transient bottom notice (company publish / read-only feedback).
  const flashNotice = (msg: string, ms = 4000) => {
    setCompanyNotice(msg);
    window.setTimeout(() => setCompanyNotice(null), ms);
  };

  // Push a saved calc's new content to the live shared document it's bound to.
  // Best-effort (fire-and-forget); bumps the local version. `isCurrent` = the
  // calc is the one on screen (its live syncMeta state follows along).
  const pushToShared = (
    meta: SyncMeta,
    payload: SharedPayload,
    entryId: string | undefined,
    isCurrent: boolean,
  ) => {
    const applyVersion = (v: number | null) => {
      if (v != null) {
        const next: SyncMeta = { ...meta, version: v };
        if (isCurrent) setSyncMeta(next);
        if (entryId) {
          updateSyncMeta(entryId, next, settings.savedRetentionDays);
        }
      }
    };
    if (meta.token) {
      // Author / link collaborator — edits via the secret token.
      void updateSharedCalc(meta.id, meta.token, payload).then(applyVersion);
    } else if (meta.companyEditable) {
      // Company member on an "editable by anyone" published calc — no token.
      void updateCompanyCalc(meta.id, payload).then(applyVersion);
    } else {
      // A view-only follower edited → detach into a local copy so their
      // changes aren't overwritten by the next pull. Say so: the company's
      // shared version is NOT updated (reopening it from Azienda keeps these
      // edits as a separate "(copia locale)" entry — see openCompanyCalc).
      if (isCurrent) {
        setSyncMeta(null);
        flashNotice(t('company.readOnlySaved'));
      }
      if (entryId) {
        updateSyncMeta(entryId, undefined, settings.savedRetentionDays);
        setSavedRefreshKey((k) => k + 1);
      }
    }
  };

  // The *current* effective schedule to advance / recompute a saved calc on:
  // current weekend shift (machine pref), plus the live company 7-day schedule +
  // buffers when a company link is active (else the calc's own). This is what
  // makes a calc saved with weekends off count weekend hours once they're
  // turned on (the reported "process doesn't move" case).
  const currentScheduleFor = (entry: SavedCalculation): ScheduleSnapshot => ({
    weekend: loadWeekendPref(),
    schedule:
      (company ? settings.schedule : undefined) ??
      entry.snapshot?.schedule ??
      null,
    warmupMinutes:
      (company ? settings.warmupMinutes : entry.values?.settings.warmupMinutes) ??
      entry.snapshot?.warmupMinutes ??
      0,
    shutdownMinutes:
      (company
        ? settings.shutdownMinutes
        : entry.values?.settings.shutdownMinutes) ??
      entry.snapshot?.shutdownMinutes ??
      0,
    // Computed 24/7 ("Senza limiti orari") → keep advancing it 24/7.
    noLimits: !!entry.values?.settings.noLimits,
  });

  // A company calc published "view only", opened on a device that can't edit
  // it (no edit token, not editable by the company): read-only view.
  const readOnly = isViewOnly(syncMeta);

  // The original on screen against Produzione (plan differences / no longer
  // listed) — follows its saves and every Produzione refresh.
  const originalStatus = useMemo(() => {
    void productionRev; // recount on a Produzione refresh
    void savedRefreshKey; // …and after the original is saved again
    if (!syncMeta || !isOriginal(syncMeta) || !editingId) return null;
    const entry = loadHistory(settings.savedRetentionDays).find(
      (e) => e.id === editingId,
    );
    return entry ? productionStatus(entry) : null;
  }, [syncMeta, editingId, productionRev, savedRefreshKey, settings.savedRetentionDays]);

  // "Aggiungi ai Salvati" (read-only company calc): copy it into Salvati as an
  // unbound, editable "(copia locale)" entry and open that copy. The calc on
  // screen isn't itself in Salvati (view-only calcs never are).
  const addToSaved = () => {
    const src = restoredEntry ?? undefined;
    if (!src?.values) return;
    let copy: SavedCalculation;
    try {
      copy = saveCalculation(
        src.result,
        src.values,
        src.snapshot,
        `${src.label} ${t('company.localCopySuffix')}`,
        settings.maxSavedResults,
        settings.savedRetentionDays,
        undefined,
        src.completedRows,
      );
    } catch {
      return;
    }
    setSavedRefreshKey((k) => k + 1);
    flashNotice(t('company.addedToSaved', { label: copy.label }), 5000);
    doRestore(copy, false, false);
  };

  // 🔄 in the Salvati list: flip a saved calc between fixed and tracking, in
  // place (the list doesn't reorder). Synced calcs push the change (not an
  // original — that waits for "Invia a Produzione"); the calc on screen is
  // reopened so the form/result reflect it.
  const onToggleTracking = (entry: SavedCalculation) => {
    let patch: TrackingPatch | null = null;
    try {
      patch = toggleTracking(entry, new Date(), currentScheduleFor(entry));
    } catch (err) {
      console.error('Failed to toggle tracking', entry.id, err);
    }
    if (!patch) return;
    const updated = updateCalculation(entry.id, patch, settings.savedRetentionDays);
    if (!updated) return;
    setSavedRefreshKey((k) => k + 1);
    const isCurrent = editingId === entry.id;
    if (updated.sync && !isOriginal(updated.sync) && updated.values) {
      pushToShared(
        updated.sync,
        {
          v: 1,
          mode: updated.result.mode,
          values: updated.values,
          result: updated.result,
          completedRows: updated.completedRows,
          label: updated.label,
          snapshot: updated.snapshot,
        },
        updated.id,
        isCurrent,
      );
    }
    if (isCurrent) doRestore(updated, false, false);
  };

  // Restore a saved calculation. If it's stale (real time has moved past its
  // start), auto-advance to "now": produced-so-far is filled from elapsed time
  // and the schedule is recomputed — shown with a banner + link to the
  // original. Either way the form is refilled so the user can tweak &
  // recalculate. Switch tab if the saved mode differs from the current one.
  const doRestore = (
    entry: SavedCalculation,
    showModal = false,
    scroll = true,
    /** A change applied on top of the reopened form values (after the advance). */
    patch?: (values: FormValues) => FormValues,
  ) => {
    if (entry.result.mode !== mode) setSelectedMode(entry.result.mode);
    // Opening a saved / company calc is just viewing what's already stored →
    // no draft (and any unfinished one is left behind with the old form).
    clearDraft();
    setMountState('saved');
    // Advancing a malformed saved entry must never leave its row un-openable:
    // on failure fall back to showing the saved result as-is (and note why),
    // so the click always does something instead of silently dying.
    let adv: AdvancedCalc | null = null;
    try {
      // Advance against the *current* effective schedule, not the one frozen at
      // save time (see currentScheduleFor).
      adv = buildAdvancedCalc(entry, new Date(), currentScheduleFor(entry));
      setRestoreAdvanceError(null);
    } catch (err) {
      console.error('Failed to advance saved calc', entry.id, err);
      adv = null;
      setRestoreAdvanceError(
        err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      );
    }
    setRestoredEntry(entry);
    setAdvancedCalc(adv);
    setShowOriginal(false);
    setFromSaved(true); // tracking a saved calc → enable "✓ Completa" buttons
    setSyncMeta(entry.sync ?? null); // re-attach to the shared doc, if any
    setEditingId(entry.id); // re-Calcola updates this saved entry in place
    const reopened = adv ? adv.values : entry.values;
    setRestoredValues(patch && reopened ? patch(reopened) : reopened);
    if (adv) {
      setResult(adv.result);
      setCompletedRows(adv.completedRows);
    } else {
      setResult(entry.result);
      setCompletedRows([]);
    }
    const displayed = adv ? adv.result : entry.result;
    // A fixed calc ("Calcolo fisso") reopens as a plain static result: never
    // advanced (buildAdvancedCalc returns null), no active order → no modal,
    // no collapse, no blinking.
    const frozen = !!entry.values?.settings.frozen;
    setViewFrozen(frozen);
    const active = frozen
      ? null
      : computeActive(displayed, i18n.resolvedLanguage ?? 'it');
    setActiveLoc(
      active ? { orderIdx: active.orderIdx, sizeIdx: active.sizeIdx } : null,
    );
    if (showModal) setActiveModal(active);
    setFormKey((k) => k + 1);
    if (scroll) scrollToResults();
  };

  // Pull the latest server version of a synced entry; if newer than the local
  // copy, persist the fresh payload into the same slot and return the updated
  // entry. Returns null when nothing changed / not synced / offline.
  const syncPull = async (
    entry: SavedCalculation,
  ): Promise<SavedCalculation | null> => {
    const sync = entry.sync;
    if (!sync) return null;
    // The author's original is never overwritten by the shared version — it's
    // only compared with it: refresh its Produzione snapshot (and whether it's
    // still listed there).
    if (isOriginal(sync)) {
      if (company && (await checkProduction(company.slug, settings.savedRetentionDays))) {
        setProductionRev((r) => r + 1);
      }
      return null;
    }
    const res = await fetchSharedCalc(sync.id);
    if (!res || res.version <= sync.version) return null;
    const p = res.payload;
    const nextSync: SyncMeta = { ...sync, version: res.version };
    // A view-only company calc (or the live Produzione version opened from the
    // list) isn't kept in Salvati — just show the fresh one.
    if (!isViewOnly(sync) && !sync.live) {
      try {
        saveCalculation(
          p.result,
          p.values,
          p.snapshot,
          p.label ?? deriveLabel(p.result),
          settings.maxSavedResults,
          settings.savedRetentionDays,
          entry.id,
          p.completedRows,
        );
        updateSyncMeta(entry.id, nextSync, settings.savedRetentionDays);
        setSavedRefreshKey((k) => k + 1);
      } catch {
        /* storage unavailable — still return the fresh entry for display */
      }
    }
    return {
      ...entry,
      result: p.result,
      values: p.values,
      snapshot: p.snapshot,
      completedRows: p.completedRows,
      sync: nextSync,
    };
  };

  // Open a saved calc, then (if it's a synced document) pull the latest in the
  // background and re-open if a newer version exists.
  const onRestore = (entry: SavedCalculation) => {
    // Piramide results waiting for orders of this calc (opened from them, then
    // "Calcola Distribuzione") land in those orders now, and the calc is
    // recomputed + saved at once — which also pushes it to the shared doc, so
    // no pull first.
    const pending = takePiramidePending(entry.id);
    if (pending.length > 0) {
      doRestore(entry, false, true, (values) => ({
        ...values,
        orders: values.orders.map((o) => {
          const p = pending.find((x) => x.orderId === o.id);
          return p ? applyPiramideToOrder(o, p.rows, p.schema) : o;
        }),
      }));
      setMountState('recompute');
      return;
    }
    doRestore(entry, true);
    if (entry.sync) {
      void syncPull(entry).then((updated) => {
        if (updated) doRestore(updated);
      });
    }
  };

  // A change the form made for the user ("Annulla Piramide"): remount it with
  // these values and recompute + save them at once, on the same saved calc.
  const remountAndRecompute = (values: FormValues) => {
    setRestoredValues(values);
    setMountState('recompute');
    setFormKey((k) => k + 1);
  };

  // Jump from the modal to the active size in the form, then close the modal.
  const goToActiveSize = () => {
    if (!activeModal) return;
    const { orderIdx, sizeIdx } = activeModal;
    keepModalRef.current = false;
    setActiveModal(null);
    window.requestAnimationFrame(() => {
      const el =
        document.getElementById(`size-${orderIdx}-${sizeIdx}`) ??
        document.getElementById(`qty-${orderIdx}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  };

  const viewOriginal = () => {
    if (!restoredEntry) return;
    clearDraft();
    setShowOriginal(true);
    setRestoredValues(restoredEntry.values);
    setMountState('saved');
    setResult(restoredEntry.result);
    setCompletedRows([]);
    setFormKey((k) => k + 1);
    scrollToResults();
  };

  const viewAdvanced = () => {
    if (!advancedCalc) return;
    clearDraft();
    setShowOriginal(false);
    setRestoredValues(advancedCalc.values);
    setMountState('saved');
    setResult(advancedCalc.result);
    setCompletedRows(advancedCalc.completedRows);
    setFormKey((k) => k + 1);
    scrollToResults();
  };

  // Bring completed orders back into the form (they weren't actually done).
  // Their produced fields are cleared so the operator re-enters the real state.
  // Remounts the form, so unsaved edits to other fields are reset.
  const restoreCompleted = (rows: ScheduledOrder[]) => {
    if (rows.length === 0) return;
    const restoredOrders = rows.map((r) => ({
      ...r.order,
      producedProfiles: [],
      producedPackages: [],
      producedSheets: [],
      producedPallets: [],
      producedItemLength: [],
    }));
    setRestoredValues((prev) => ({
      settings:
        prev?.settings ??
        ({ startMode: 'now', gapMode: 'continuous' } as FormValues['settings']),
      // Restored orders were produced before the active ones, so they go back
      // to the front of the queue, not the end.
      orders: [...restoredOrders, ...(prev?.orders ?? [])],
    }));
    const restoredIds = new Set(rows.map((r) => r.order.id));
    setCompletedRows((prev) => prev.filter((r) => !restoredIds.has(r.order.id)));
    setMountState('unsaved'); // not saved until the next "Calcola"
    setFormKey((k) => k + 1);
  };

  const restoreOneCompleted = () => {
    const last = completedRows[completedRows.length - 1];
    if (last) restoreCompleted([last]);
  };
  const restoreAllCompleted = () => restoreCompleted(completedRows);

  // Publish / unpublish a saved entry to the company shared list. Ensures the
  // entry is synced (creates the shared doc + token if needed), enforces the
  // per-company cap, then flips the flags. mode: 'view' | 'edit' | 'off'.
  const publishToCompany = async (
    entry: SavedCalculation,
    mode: 'view' | 'edit' | 'off',
  ) => {
    await publishEntry(entry, mode);
  };

  // Publish / unpublish; true on success. A published original whose shared
  // document is gone (removed / expired) is published anew from the original.
  const publishEntry = async (
    entry: SavedCalculation,
    mode: 'view' | 'edit' | 'off',
  ): Promise<boolean> => {
    if (!isSupabaseConfigured || !company || !entry.values) return false;
    let sync = entry.sync ?? null;
    // Produzione's first version = this original as it is now.
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
        return false;
      }
    }
    const token = sync.token;
    if (!token) return false;
    const isPublic = mode !== 'off';
    if (isPublic && (!sync.published || sync.gone) && settings.maxCompanyShared > 0) {
      const existing = await fetchCompanyCalcs(company.slug);
      if (existing.length >= settings.maxCompanyShared) {
        setCompanyNotice(
          t('company.limitReached', { max: settings.maxCompanyShared }),
        );
        window.setTimeout(() => setCompanyNotice(null), 3000);
        return false;
      }
    }
    let ok = await setCompanyPublish(
      sync.id,
      token,
      company.slug,
      isPublic,
      mode === 'edit',
    );
    if (!ok && isPublic && !created) {
      try {
        const doc = await createDoc();
        sync = doc.sync;
        created = doc.payload;
        ok = await setCompanyPublish(doc.sync.id, doc.sync.token!, company.slug, true, mode === 'edit');
      } catch {
        ok = false;
      }
    }
    if (!ok) return false;
    const next: SyncMeta = {
      ...sync,
      published: isPublic,
      publishedEditable: mode === 'edit',
      gone: undefined,
    };
    updateSyncMeta(entry.id, next, settings.savedRetentionDays);
    if (created) {
      noteProduction(entry.id, { version: 1, payload: created, seenAt: Date.now() });
    } else {
      setProductionRev((r) => r + 1); // listed again → no longer "gone"
    }
    if (editingId === entry.id) setSyncMeta(next);
    setSavedRefreshKey((k) => k + 1);
    return true;
  };

  // "Ripubblica": the original on screen is no longer in Produzione — put it
  // back, published as it was (view-only / editable).
  const republish = async () => {
    const sync = syncMeta;
    if (!sync || !isOriginal(sync) || !editingId) return;
    const entry = loadHistory(settings.savedRetentionDays).find(
      (e) => e.id === editingId,
    );
    if (!entry) return;
    const ok = await publishEntry(entry, sync.publishedEditable ? 'edit' : 'view');
    flashNotice(t(ok ? 'company.republished' : 'company.sendFailed'));
  };

  // Open a company-published result: save it locally (shared-<id> slot) bound as
  // a synced doc (editable without a token when the company published it so),
  // then open it like any restore (advance-to-now + modal).
  const openCompanyCalc = (c: CompanyCalc) => {
    const p = c.payload;
    const label = p.label ?? deriveLabel(p.result);
    // If a local entry is already bound to this shared row (a member's copy of
    // an editable result), update THAT slot instead of creating a parallel
    // `shared-<id>` copy; just refresh the version + editable flag from the
    // list. The author's own entry is the original and is never overwritten.
    const history = loadHistory(settings.savedRetentionDays);
    const existing = history.find((e) => e.sync?.id === c.id);
    // The author's own: Salvati holds the original — this opens the live
    // Produzione version beside it (not stored), whose edits go straight to
    // the shared document. Seeing it updates what the original is compared to.
    if (existing?.sync && isOriginal(existing.sync)) {
      noteProduction(
        existing.id,
        { version: c.version, payload: p, seenAt: Date.now() },
      );
      onRestore({
        id: `live-${c.id}`,
        ts: Date.now(),
        label,
        result: p.result,
        values: p.values,
        snapshot: p.snapshot,
        completedRows: p.completedRows,
        sync: {
          ...existing.sync,
          version: c.version,
          companyEditable: c.isEditable,
          live: true,
        },
      });
      return;
    }
    const savedId = existing?.id ?? `shared-${c.id}`;
    // A view-only calc edited on this device was detached (its `shared-<id>`
    // slot lost the sync binding) — those edits live only here. Keep them as
    // their own "(copia locale)" entry instead of overwriting them with the
    // company version below.
    const detached = existing
      ? undefined
      : history.find((e) => e.id === savedId && !e.sync && e.values);
    if (detached?.values) {
      try {
        const copy = saveCalculation(
          detached.result,
          detached.values,
          detached.snapshot,
          `${detached.label} ${t('company.localCopySuffix')}`,
          settings.maxSavedResults,
          settings.savedRetentionDays,
          undefined,
          detached.completedRows,
        );
        flashNotice(t('company.localCopyKept', { label: copy.label }), 5000);
      } catch {
        /* storage unavailable — nothing to preserve into */
      }
    }
    const sync: SyncMeta = existing?.sync
      ? { ...existing.sync, version: c.version, companyEditable: c.isEditable }
      : { id: c.id, version: c.version, companyEditable: c.isEditable };
    // View-only for this device: open it without putting it into Salvati —
    // Salvati holds only the user's own / editable calcs ("Aggiungi ai
    // Salvati" makes an editable copy). A copy cached there by older versions
    // (or a detached slot already preserved above) is dropped.
    if (isViewOnly(sync)) {
      if (history.some((e) => e.id === savedId)) {
        removeCalculation(savedId, settings.savedRetentionDays);
        setSavedRefreshKey((k) => k + 1);
      }
      onRestore({
        id: savedId,
        ts: Date.now(),
        label,
        result: p.result,
        values: p.values,
        snapshot: p.snapshot,
        completedRows: p.completedRows,
        sync,
      });
      return;
    }
    let entry: SavedCalculation;
    try {
      entry = saveCalculation(
        p.result,
        p.values,
        p.snapshot,
        label,
        settings.maxSavedResults,
        settings.savedRetentionDays,
        savedId,
        p.completedRows,
      );
      updateSyncMeta(savedId, sync, settings.savedRetentionDays);
      entry = { ...entry, sync };
      setSavedRefreshKey((k) => k + 1);
    } catch {
      entry = {
        id: savedId,
        ts: Date.now(),
        label,
        result: p.result,
        values: p.values,
        snapshot: p.snapshot,
        completedRows: p.completedRows,
        sync,
      };
    }
    onRestore(entry);
  };

  // ⏸ / ▶ in the Produzione list: pause a running process (frozen at its state
  // right now — nothing more is subtracted) or start it again (recomputed from
  // now) — the 🔄 toggle of Salvati, written to the shared document so everyone
  // sees it. Only where this device may edit it: its author (edit token) or an
  // "editable by anyone" result. Returns the updated row, or null on failure.
  const toggleCompanyRunning = async (
    c: CompanyCalc,
  ): Promise<CompanyCalc | null> => {
    const p = c.payload;
    const local = loadHistory(settings.savedRetentionDays).find(
      (e) => e.sync?.id === c.id,
    );
    const entry: SavedCalculation = local ?? {
      id: `shared-${c.id}`,
      ts: Date.now(),
      label: p.label ?? deriveLabel(p.result),
      result: p.result,
      values: p.values,
      snapshot: p.snapshot,
      completedRows: p.completedRows,
    };
    // The shared version is the latest — work from it, not a stale local copy.
    const current: SavedCalculation = {
      ...entry,
      result: p.result,
      values: p.values,
      snapshot: p.snapshot,
      completedRows: p.completedRows,
    };
    let patch: TrackingPatch | null = null;
    try {
      patch = toggleTracking(current, new Date(), currentScheduleFor(current));
    } catch (err) {
      console.error('Failed to pause / start company calc', c.id, err);
    }
    if (!patch?.values) return null;
    const payload: SharedPayload = {
      v: 1,
      mode: p.mode,
      values: patch.values,
      result: patch.result,
      completedRows: patch.completedRows,
      label: p.label,
      snapshot: patch.snapshot,
    };
    const token = local?.sync?.token;
    const version = token
      ? await updateSharedCalc(c.id, token, payload)
      : c.isEditable
        ? await updateCompanyCalc(c.id, payload)
        : null;
    if (version == null) return null;
    // Keep this device's copy in step — a member's copy follows; the author's
    // original only notes the new Produzione version — and refresh the live
    // version on screen.
    if (local?.sync && isOriginal(local.sync)) {
      noteProduction(local.id, { version, payload, seenAt: Date.now() });
    } else if (local?.sync) {
      const updated = updateCalculation(local.id, patch, settings.savedRetentionDays);
      const sync: SyncMeta = { ...local.sync, version };
      updateSyncMeta(local.id, sync, settings.savedRetentionDays);
      setSavedRefreshKey((k) => k + 1);
      if (updated && editingId === local.id) doRestore({ ...updated, sync }, false, false);
    }
    if (syncMeta?.live && syncMeta.id === c.id) {
      doRestore(
        {
          id: `live-${c.id}`,
          ts: Date.now(),
          label: p.label ?? deriveLabel(p.result),
          ...patch,
          sync: { ...syncMeta, version },
        },
        false,
        false,
      );
    }
    return { ...c, payload, version };
  };

  // "Confronta": the original on screen against the version in Produzione.
  // Opening it fetches Produzione and counts it as seen (sync.version), so a
  // following "Invia" doesn't stop again for the same changes.
  const [compare, setCompare] = useState<{
    entryId: string;
    original: CalcVersion;
    production: { version: number; payload: SharedPayload };
    fromSend: boolean;
  } | null>(null);
  const versionOf = (x: {
    values?: FormValues;
    result: ScheduleResult;
    completedRows?: ScheduledOrder[];
    snapshot?: ScheduleSnapshot;
  }): CalcVersion => ({
    values: x.values!,
    result: x.result,
    completedRows: x.completedRows,
    snapshot: x.snapshot,
  });
  const openCompare = async (
    fromSend = false,
    fetched?: { version: number; payload: SharedPayload },
  ) => {
    const sync = syncMeta;
    if (!sync || !isOriginal(sync) || !editingId) return;
    const entry = loadHistory(settings.savedRetentionDays).find(
      (e) => e.id === editingId,
    );
    if (!entry?.values) return;
    const server = fetched ?? (await fetchSharedCalc(sync.id));
    if (!server) {
      flashNotice(t('compare.unavailable'));
      return;
    }
    noteProduction(
      entry.id,
      { version: server.version, payload: server.payload, seenAt: Date.now() },
    );
    const seen: SyncMeta = { ...sync, version: Math.max(sync.version, server.version) };
    updateSyncMeta(entry.id, seen, settings.savedRetentionDays);
    setSyncMeta(seen);
    setCompare({
      entryId: entry.id,
      original: versionOf(entry),
      production: { version: server.version, payload: server.payload },
      fromSend,
    });
  };

  // Settle differences from "Confronta": 'production' wins → the original is
  // updated (recomputed from now, saved, reopened); 'original' wins →
  // Produzione is updated (recomputed from now and sent).
  const settleCompare = async (diffs: CalcDiff[], from: DiffSide) => {
    if (!compare) return;
    const entry = loadHistory(settings.savedRetentionDays).find(
      (e) => e.id === compare.entryId,
    );
    const sync = entry?.sync;
    if (!entry?.values || !sync?.token) return;
    const prodPayload = compare.production.payload;
    const production = versionOf(prodPayload);
    const now = new Date();
    if (from === 'production') {
      const merged = settleDiffs(
        versionOf(entry),
        production,
        diffs,
        'production',
        currentScheduleFor(entry),
        now,
      );
      const saved = saveCalculation(
        merged.result,
        merged.values,
        merged.snapshot,
        deriveLabel(merged.result),
        settings.maxSavedResults,
        settings.savedRetentionDays,
        entry.id,
        merged.completedRows,
      );
      setSavedRefreshKey((k) => k + 1);
      setCompare({ ...compare, original: versionOf(saved) });
      if (editingId === entry.id) doRestore(saved, false, false);
      return;
    }
    const merged = settleDiffs(
      production,
      versionOf(entry),
      diffs,
      'original',
      currentScheduleFor({ ...entry, values: prodPayload.values, snapshot: prodPayload.snapshot }),
      now,
    );
    const payload: SharedPayload = {
      v: 1,
      mode: prodPayload.mode,
      values: merged.values,
      result: merged.result,
      completedRows: merged.completedRows?.length ? merged.completedRows : undefined,
      label: deriveLabel(merged.result),
      snapshot: merged.snapshot,
    };
    const version = await updateSharedCalc(sync.id, sync.token, payload);
    if (version == null) {
      flashNotice(t('company.sendFailed'));
      return;
    }
    noteProduction(entry.id, { version, payload, seenAt: Date.now() });
    const next: SyncMeta = { ...sync, version };
    updateSyncMeta(entry.id, next, settings.savedRetentionDays);
    if (editingId === entry.id) setSyncMeta(next);
    setCompare({ ...compare, production: { version, payload } });
  };

  // "Invia a Produzione": send the original, as last saved, to the shared
  // version. `sync.version` is the Produzione version the author last sent or
  // saw; when Produzione moved on since — the factory changed it — "Confronta"
  // opens first instead of overwriting that unseen.
  const [sending, setSending] = useState(false);
  const sendToProduction = async () => {
    const sync = syncMeta;
    if (!sync?.token || !isOriginal(sync) || !editingId) return;
    const entry = loadHistory(settings.savedRetentionDays).find(
      (e) => e.id === editingId,
    );
    if (!entry?.values) return;
    setSending(true);
    try {
      const server = await fetchSharedCalc(sync.id);
      if (server && server.version > sync.version) {
        await openCompare(true, server);
        return;
      }
      const payload = payloadOf(entry);
      const version = await updateSharedCalc(sync.id, sync.token, payload);
      if (version == null) {
        flashNotice(t('company.sendFailed'));
        return;
      }
      const next: SyncMeta = { ...sync, version };
      updateSyncMeta(entry.id, next, settings.savedRetentionDays);
      noteProduction(entry.id, { version, payload, seenAt: Date.now() });
      setSyncMeta(next);
      flashNotice(t('company.sent'));
    } finally {
      setSending(false);
    }
  };

  // Remove a result from the company's shared list (unpublish). Only the author
  // can — the edit token lives on their local saved entry bound to this shared
  // row. Clears the published flags locally so the "Salvati" 🏭 state matches.
  const deleteCompanyCalc = async (c: CompanyCalc) => {
    if (!company) return;
    const local = loadHistory(settings.savedRetentionDays).find(
      (e) => e.sync?.id === c.id && e.sync?.token,
    );
    const token = local?.sync?.token;
    // Author path (has the edit token) unpublishes via set_company_publish;
    // otherwise try the admin RPC (server gates on the caller being an admin of
    // this company / a super-admin). Either way it leaves the company list.
    const ok = token
      ? await setCompanyPublish(c.id, token, company.slug, false, false)
      : await adminDeleteCompanyCalc(c.id);
    if (!ok) return;
    if (local?.sync) {
      const next: SyncMeta = {
        ...local.sync,
        published: false,
        publishedEditable: false,
      };
      updateSyncMeta(local.id, next, settings.savedRetentionDays);
      if (editingId === local.id) setSyncMeta(next);
    }
    setSavedRefreshKey((k) => k + 1);
  };

  // While viewing a synced calc, pull the latest when the tab regains focus /
  // becomes visible, so a follower sees the author's updates without reopening.
  useEffect(() => {
    if (!syncMeta) return;
    const pull = () => {
      if (document.visibilityState === 'hidden') return;
      // A view-only company calc isn't in Salvati → use the one on screen.
      const entry =
        loadHistory(settings.savedRetentionDays).find(
          (e) => e.id === editingId,
        ) ?? (restoredEntry?.id === editingId ? restoredEntry : undefined);
      if (entry?.sync) {
        void syncPull(entry).then((updated) => {
          if (updated) doRestore(updated);
        });
      }
    };
    window.addEventListener('focus', pull);
    document.addEventListener('visibilitychange', pull);
    return () => {
      window.removeEventListener('focus', pull);
      document.removeEventListener('visibilitychange', pull);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncMeta, editingId]);

  // On first load, restore the crash-safety draft — but only on a genuine
  // relaunch. A deliberate reload (F5 / pull-to-refresh, reported as a "reload"
  // navigation) means the operator wants a clean form, so drop the draft
  // instead. A pending Piramide handoff takes precedence (handled below), and
  // so does coming back from Piramide after it updated an order: that calc
  // opens (with the update applied, see onRestore).
  useEffect(() => {
    const openId = popOpenSaved();
    try {
      // An explicit "Usa nel calcolatore" wins over reopening the origin calc
      // (its update still lands whenever that calc is opened).
      if (sessionStorage.getItem('calc.orderImport')) return;
    } catch {
      /* ignore */
    }
    const toOpen = openId
      ? loadHistory(settings.savedRetentionDays).find((e) => e.id === openId)
      : undefined;
    if (toOpen) {
      onRestore(toOpen);
      return;
    }
    const navType = (
      performance.getEntriesByType('navigation')[0] as
        | PerformanceNavigationTiming
        | undefined
    )?.type;
    if (navType === 'reload') {
      clearDraft();
      return;
    }
    const draft = loadDraft();
    if (!draft) return;
    if (draft.mode !== mode) setSelectedMode(draft.mode);
    setEditingId(draft.editingId);
    setRestoredValues(draft.values);
    setMountState('unsaved'); // still unfinished until "Calcola"
    setFormKey((k) => k + 1);
    // Run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // On first load, pick up a Piramide → calculator handoff (the "Usa nel
  // calcolatore" button): build a sheets order from the sheet rows and either
  // start a fresh calculation or append it to a chosen saved one (opened like a
  // restore). One-shot via sessionStorage, so StrictMode's double effect is safe.
  useEffect(() => {
    const imported = popOrderImport();
    if (!imported) return;
    const order = makeEmptyOrder('sheets');
    order.sizes = imported.rows.map((r) => ({
      sheets: r.qty,
      length: r.length,
      profilesPerPackage: undefined,
    })) as (typeof order)['sizes'];
    // Carry the Piramide layout schema (diagram + production order) onto the
    // order, so it shows its pallet arrangement in the form + results.
    (order as { piramideSchema?: unknown }).piramideSchema = imported.schema;

    if (imported.targetCalcId) {
      const entry = loadHistory(settings.savedRetentionDays).find(
        (e) => e.id === imported.targetCalcId,
      );
      if (entry) {
        const orders = entry.values?.orders ?? [];
        // Append the order (inherits speed from the queue) and open the calc.
        onRestore({
          ...entry,
          values: {
            ...entry.values,
            orders: [...orders, order],
          } as FormValues,
        });
        setMountState('unsaved'); // the import isn't saved until "Calcola"
        return;
      }
      // Target vanished (deleted/expired) → fall through to a new calculation.
    }

    // New calculation with just this order.
    const values = buildEmptyDefaults('sheets');
    values.orders = [order];
    setSelectedMode('sheets');
    setResult(null);
    setEditingId(undefined);
    setCompletedRows([]);
    setFromSaved(false);
    clearRestored();
    setRestoredValues(values);
    setMountState('unsaved');
    setFormKey((k) => k + 1);
    scrollToResults();
    // Run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-full bg-surface-alt">
      <Header />

      <main
        className={`mx-auto max-w-6xl px-3 py-4 sm:px-4 sm:py-8 ${
          viewFrozen ? 'calc-frozen' : ''
        }`}
      >
        <Tabs
          value={mode}
          onChange={onModeChange}
          modes={settings.modes}
          showPiramide={settings.showPiramide}
          piramideHref={piramideHref}
          settingsOpen={settingsOpen}
          onToggleSettings={() => setSettingsOpen((v) => !v)}
        />

        {/* A tracked calc (Salvati / Produzione): the form shows when each
            size and order ends, from the result on screen. */}
        <TrackedResultContext.Provider value={fromSaved ? result : null}>
          <CalculatorForm
            key={`${formKey}:${mode}`}
            mode={mode}
            settingsOpen={settingsOpen}
            onSettingsErrors={() => setSettingsOpen(true)}
            onResult={onFormResult}
            onRequestReset={onReset}
            onSaved={(id) => {
              setEditingId(id);
              setSavedRefreshKey((k) => k + 1);
            }}
            onRestore={onRestore}
            onToggleTracking={onToggleTracking}
            savedRefreshKey={savedRefreshKey}
            initialValues={restoredValues}
            // The live Produzione version isn't a saved entry of this device.
            editingId={syncMeta?.live ? undefined : editingId}
            completedRows={completedRows}
            hasCompleted={completedRows.length > 0}
            canComplete={fromSaved}
            activeLoc={activeLoc}
            onPublish={
              isSupabaseConfigured && company ? publishToCompany : undefined
            }
            onOpenCompany={
              isSupabaseConfigured && company ? openCompanyCalc : undefined
            }
            onDeleteCompany={
              isSupabaseConfigured && company ? deleteCompanyCalc : undefined
            }
            onOpenReport={
              isSupabaseConfigured && company ? () => setReportOpen(true) : undefined
            }
            onToggleCompanyRunning={
              isSupabaseConfigured && company ? toggleCompanyRunning : undefined
            }
            onProductionChecked={() => setProductionRev((r) => r + 1)}
            readOnly={readOnly}
            onAddToSaved={addToSaved}
            // The live Produzione version (opened from the list) isn't kept in
            // Salvati — its "Calcola" only goes to the shared document.
            persist={!syncMeta?.live}
            mountState={mountState}
            onRecompute={remountAndRecompute}
            registerComplete={(fn) => {
              completeRef.current = fn;
            }}
            registerSetProduced={(fn) => {
              setProducedRef.current = fn;
            }}
          />
        </TrackedResultContext.Provider>

        <div id="results" className="mt-5 sm:mt-6">
          {result && syncMeta?.published && (
            <div className="no-print mb-3 rounded-lg border border-brand-200 bg-brand-50 px-4 py-2.5 text-sm text-brand-700">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="flex min-w-0 flex-1 items-start gap-2 font-medium">
                  <span aria-hidden>🏭</span>
                  <span>
                    {syncMeta.live
                      ? t('company.liveBanner')
                      : isOriginal(syncMeta)
                        ? originalStatus?.gone
                          ? t('company.gone')
                          : t('company.originalBanner')
                        : t('company.broadcasting')}
                  </span>
                </span>
                {isOriginal(syncMeta) && originalStatus?.gone && (
                  <button
                    type="button"
                    onClick={() => void republish()}
                    className="shrink-0 rounded-md border border-brand-300 bg-white px-3 py-1.5 text-xs font-semibold text-brand-700 shadow-sm transition hover:border-brand-600 hover:bg-brand-50 sm:text-sm"
                  >
                    {t('company.republish')}
                  </button>
                )}
                {isOriginal(syncMeta) && !originalStatus?.gone && (
                  <span className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => void openCompare()}
                      className="inline-flex items-center gap-1.5 rounded-md border border-brand-300 bg-white px-3 py-1.5 text-xs font-semibold text-brand-700 shadow-sm transition hover:border-brand-600 hover:bg-brand-50 sm:text-sm"
                    >
                      {t('company.compare')}
                      {originalStatus && originalStatus.diffs > 0 && (
                        <span
                          className="rounded bg-amber-100 px-1 text-[11px] font-semibold text-amber-800"
                          title={t('company.diffBadge', { count: originalStatus.diffs })}
                        >
                          ⚠ {originalStatus.diffs}
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => void sendToProduction()}
                      disabled={sending}
                      className="rounded-md border border-brand-300 bg-white px-3 py-1.5 text-xs font-semibold text-brand-700 shadow-sm transition hover:border-brand-600 hover:bg-brand-50 disabled:cursor-wait disabled:opacity-60 sm:text-sm"
                    >
                      {t('company.send')}
                    </button>
                  </span>
                )}
              </div>
            </div>
          )}
          {/* Opened from Azienda, published view-only, and this device can't
              edit it → read-only; editing happens on a copy in Salvati. */}
          {result && readOnly && (
            <div className="no-print mb-3 flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-medium text-amber-800">
              <span aria-hidden>👁</span>
              <span>{t('company.readOnlyBanner')}</span>
            </div>
          )}
          {result && restoredEntry && advancedCalc && (
            <AdvanceBanner
              showOriginal={showOriginal}
              ts={restoredEntry.ts}
              onViewOriginal={viewOriginal}
              onViewAdvanced={viewAdvanced}
            />
          )}
          {result && completedRows.length > 0 && !readOnly && (
            <RestoreCompletedButton
              count={completedRows.length}
              onRestoreOne={restoreOneCompleted}
              onRestoreAll={restoreAllCompleted}
            />
          )}
          {result && restoreAdvanceError && (
            <div className="no-print mb-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
              {t('results.advanceFailed')}
            </div>
          )}
          {result ? (
            <ErrorBoundary
              key={formKey}
              fallback={(error) => (
                <div className="rounded-xl border border-danger/40 bg-red-50 p-4 text-sm text-danger sm:p-5">
                  <p className="font-semibold">{t('results.renderError')}</p>
                  <p className="mt-1 break-words font-mono text-xs opacity-80">
                    {error.message}
                  </p>
                  <button
                    type="button"
                    onClick={onReset}
                    className="mt-3 rounded-md bg-ink-soft px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-ink"
                  >
                    ↺ {t('actions.reset')}
                  </button>
                </div>
              )}
            >
              <ResultsPanel
                result={withCompleted(result, completedRows)}
                mode={mode}
                onComplete={
                  fromSaved && !readOnly
                    ? (orderId, sizeIdx) =>
                        completeRef.current?.(orderId, sizeIdx)
                    : undefined
                }
              />
            </ErrorBoundary>
          ) : (
            <div className="no-print rounded-xl border border-dashed border-neutral-300 bg-white/50 p-5 text-center text-sm text-ink-soft sm:p-6">
              {t('results.empty')}
            </div>
          )}
        </div>
      </main>

      {activeModal && (
        <ActiveOrderModal
          info={activeModal.info}
          onClose={() => {
            keepModalRef.current = false; // e.g. a recompute that didn't validate
            setActiveModal(null);
          }}
          onGoToForm={goToActiveSize}
          // Editable produced count — not on a read-only company calc, nor on
          // a total-meters order (no per-size count there).
          onSaveProduced={
            !readOnly &&
            !result?.rows?.[activeModal.orderIdx]?.order?.useTotalLength
              ? (produced) => {
                  const { orderIdx, sizeIdx } = activeModal;
                  // Recompute in place; the modal stays open and shows the
                  // new state (see onFormResult).
                  keepModalRef.current = true;
                  setProducedRef.current?.(orderIdx, sizeIdx, produced);
                }
              : undefined
          }
          t={t}
        />
      )}

      {compare && (
        <CompareModal
          label={
            loadHistory(settings.savedRetentionDays).find((e) => e.id === compare.entryId)
              ?.label ?? ''
          }
          mode={compare.original.result.mode}
          original={compare.original}
          production={versionOf(compare.production.payload)}
          fromSend={compare.fromSend}
          onSettle={settleCompare}
          onClose={() => setCompare(null)}
        />
      )}

      {reportOpen && (
        <CompanyReportModal
          onClose={() => setReportOpen(false)}
          onOpen={openCompanyCalc}
        />
      )}

      {companyNotice && (
        <div
          role="alert"
          className="no-print fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-md bg-ink px-4 py-2.5 text-sm font-medium text-white shadow-lg"
        >
          {companyNotice}
        </div>
      )}

      <footer className="no-print mx-auto max-w-6xl px-4 py-6 text-center text-xs text-ink-soft">
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
          {settings.showPiramide && (
            <Link
              to={piramideHref}
              className="font-medium text-brand-700 transition hover:text-brand-800"
            >
              {t('piramide.openLink')}
            </Link>
          )}
          <a
            href="/installa.html"
            target="_blank"
            rel="noopener"
            className="font-medium text-brand-700 transition hover:text-brand-800"
          >
            {t('footer.installApp')}
          </a>
        </div>
        <div className="mt-2">
          © {new Date().getFullYear()} {t('footer.madeBy')}
        </div>
      </footer>
    </div>
  );
}

// Guard: a company can hide Piramide. Redirect to the calculator once settings
// have loaded and the page is disabled (default-visible while loading / no
// company link).
function PiramideRoute() {
  const { settings, loading } = useCatalog();
  if (!loading && !settings.showPiramide) return <Navigate to="/" replace />;
  return <PiramidePage />;
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <CatalogProvider>
          <Routes>
            <Route path="/admin/login" element={<AdminLoginPage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/piramide" element={<PiramideRoute />} />
            <Route path="*" element={<CalculatorApp />} />
          </Routes>
        </CatalogProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
