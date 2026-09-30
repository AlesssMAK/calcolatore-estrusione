import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom';
import Header from './components/Header';
import Tabs from './components/Tabs';
import CalculatorForm from './components/CalculatorForm';
import ResultsPanel from './components/ResultsPanel';
import AdvanceBanner from './components/AdvanceBanner';
import RestoreCompletedButton from './components/RestoreCompletedButton';
import ErrorBoundary from './components/ErrorBoundary';
import ActiveOrderModal, {
  type ActiveModalInfo,
} from './components/ActiveOrderModal';
import { formatDateTime } from './utils/format';
import { CatalogProvider, useCatalog } from './contexts/CatalogContext';
import { AuthProvider } from './contexts/AuthContext';
import AdminLoginPage from './pages/AdminLoginPage';
import AdminPage from './pages/AdminPage';
import PiramidePage from './pages/PiramidePage';
import type {
  CalculatorMode,
  ScheduledOrder,
  ScheduleResult,
  ScheduleSnapshot,
} from './types';
import type { FormValues } from './formSchema';
import {
  deriveLabel,
  loadHistory,
  saveCalculation,
  updateSyncMeta,
  type SavedCalculation,
  type SyncMeta,
} from './lib/calcHistory';
import { buildAdvancedCalc, type AdvancedCalc } from './utils/advance';
import { buildEmptyDefaults, loadWeekendPref, makeEmptyOrder } from './utils/defaults';
import { popOrderImport } from './lib/orderImport';
import { loadDraft, clearDraft } from './lib/formDraft';
import { isSupabaseConfigured } from './lib/supabase';
import {
  createSharedCalc,
  fetchSharedCalc,
  updateSharedCalc,
  setCompanyPublish,
  updateCompanyCalc,
  fetchCompanyCalcs,
  type SharedPayload,
  type CompanyCalc,
} from './lib/sharedCalc';

// The order + size currently in production ("active"): the first not-yet-done
// size of the first not-yet-done order (advance-to-now order). Returns null when
// everything is finished. Drives the active-order modal (and, later, the form
// collapse).
function computeActive(
  result: ScheduleResult,
  lang: string,
): { info: ActiveModalInfo; orderIdx: number; sizeIdx: number } | null {
  const rows = result.rows ?? [];
  const isProfiles = result.mode === 'profiles';
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row.completed || row.remainingMinutes < 0.5) continue;
    const orderLabel = row.order?.productName?.trim() || `#${i + 1}`;
    const sizes = row.sizeDetails;
    let sizeIdx = 0;
    let length: number | undefined;
    let produced = 0;
    let total = 0;
    if (sizes && sizes.length > 0) {
      let sIdx = sizes.findIndex((sd) => sd.remainingMinutes >= 0.5);
      if (sIdx === -1) sIdx = 0;
      sizeIdx = sIdx;
      const sd = sizes[sIdx];
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
    return {
      info: {
        orderLabel,
        sizeLabel: length ? `${length} mm` : '—',
        producedLabel: `${produced} / ${total}`,
        etaLabel: formatDateTime(row.end, lang),
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
  // Transient notice for company-publish feedback (e.g. limit reached).
  const [companyNotice, setCompanyNotice] = useState<string | null>(null);
  // The form registers its "mark fully produced" handler here, so the results
  // panel (a sibling of the form) can trigger completion too.
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
    setSelectedMode(next);
    setResult(null);
    setRestoredValues(undefined);
    setEditingId(undefined);
    setCompletedRows([]);
    setFromSaved(false);
    setSyncMeta(null);
    setActiveModal(null);
    setActiveLoc(null);
    clearRestored();
    setFormKey((k) => k + 1);
  };

  const onReset = () => {
    clearDraft(); // "Nuovo calcolo" → drop the crash-safety draft too
    setResult(null);
    setRestoredValues(undefined);
    setEditingId(undefined);
    setCompletedRows([]);
    setFromSaved(false);
    setSyncMeta(null);
    setActiveModal(null);
    setActiveLoc(null);
    clearRestored();
    setFormKey((k) => k + 1);
  };

  // Build the shareable payload for a set of values/result/completed rows,
  // carrying the effective schedule snapshot (from the bound saved entry) so a
  // recipient can advance it to "now".
  const buildPayload = (
    r: ScheduleResult,
    values: FormValues,
    completed: ScheduledOrder[],
  ): SharedPayload => {
    const snapshot = editingId
      ? loadHistory(settings.savedRetentionDays).find((e) => e.id === editingId)
          ?.snapshot
      : undefined;
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
  ) => {
    clearRestored();
    setActiveModal(null);
    setActiveLoc(null);
    if (newlyCompleted.length > 0) {
      setCompletedRows((prev) => [
        ...(keepCompleted ? prev : []),
        ...newlyCompleted,
      ]);
      // Orders were split off → remount the form with only the active ones.
      setRestoredValues(values);
      setFormKey((k) => k + 1);
    } else if (!keepCompleted) {
      setCompletedRows([]);
    }
    setResult(r);
    // Push edits to the live shared document if this calc is synced. Best-effort
    // (fire-and-forget); bumps the local version.
    const meta = syncMeta;
    if (meta) {
      const newCompleted =
        newlyCompleted.length > 0
          ? [...(keepCompleted ? completedRows : []), ...newlyCompleted]
          : keepCompleted
            ? completedRows
            : [];
      const payload = buildPayload(r, values, newCompleted);
      const applyVersion = (v: number | null) => {
        if (v != null) {
          const next: SyncMeta = { ...meta, version: v };
          setSyncMeta(next);
          if (editingId) {
            updateSyncMeta(editingId, next, settings.savedRetentionDays);
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
        // changes aren't overwritten by the next pull.
        setSyncMeta(null);
        if (editingId) {
          updateSyncMeta(editingId, undefined, settings.savedRetentionDays);
          setSavedRefreshKey((k) => k + 1);
        }
      }
    }
  };

  // Restore a saved calculation. If it's stale (real time has moved past its
  // start), auto-advance to "now": produced-so-far is filled from elapsed time
  // and the schedule is recomputed — shown with a banner + link to the
  // original. Either way the form is refilled so the user can tweak &
  // recalculate. Switch tab if the saved mode differs from the current one.
  const doRestore = (entry: SavedCalculation, showModal = false) => {
    if (entry.result.mode !== mode) setSelectedMode(entry.result.mode);
    // Advancing a malformed saved entry must never leave its row un-openable:
    // on failure fall back to showing the saved result as-is (and note why),
    // so the click always does something instead of silently dying.
    let adv: AdvancedCalc | null = null;
    try {
      // Advance against the *current* effective schedule, not the one frozen at
      // save time: current weekend shift (machine pref), plus the live company
      // 7-day schedule + buffers when a company link is active. This is what
      // makes a calc saved with weekends off count weekend hours once they're
      // turned on (the reported "process doesn't move" case).
      const currentSchedule: ScheduleSnapshot = {
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
      };
      adv = buildAdvancedCalc(entry, new Date(), currentSchedule);
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
    if (adv) {
      setRestoredValues(adv.values);
      setResult(adv.result);
      setCompletedRows(adv.completedRows);
    } else {
      setRestoredValues(entry.values);
      setResult(entry.result);
      setCompletedRows([]);
    }
    const displayed = adv ? adv.result : entry.result;
    const active = computeActive(displayed, i18n.resolvedLanguage ?? 'it');
    setActiveLoc(
      active ? { orderIdx: active.orderIdx, sizeIdx: active.sizeIdx } : null,
    );
    if (showModal) setActiveModal(active);
    setFormKey((k) => k + 1);
    scrollToResults();
  };

  // Pull the latest server version of a synced entry; if newer than the local
  // copy, persist the fresh payload into the same slot and return the updated
  // entry. Returns null when nothing changed / not synced / offline.
  const syncPull = async (
    entry: SavedCalculation,
  ): Promise<SavedCalculation | null> => {
    const sync = entry.sync;
    if (!sync) return null;
    const res = await fetchSharedCalc(sync.id);
    if (!res || res.version <= sync.version) return null;
    const p = res.payload;
    const nextSync: SyncMeta = { ...sync, version: res.version };
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
    doRestore(entry, true);
    if (entry.sync) {
      void syncPull(entry).then((updated) => {
        if (updated) doRestore(updated);
      });
    }
  };

  // Jump from the modal to the active size in the form, then close the modal.
  const goToActiveSize = () => {
    if (!activeModal) return;
    const { orderIdx, sizeIdx } = activeModal;
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
    setShowOriginal(true);
    setRestoredValues(restoredEntry.values);
    setResult(restoredEntry.result);
    setCompletedRows([]);
    setFormKey((k) => k + 1);
    scrollToResults();
  };

  const viewAdvanced = () => {
    if (!advancedCalc) return;
    setShowOriginal(false);
    setRestoredValues(advancedCalc.values);
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
    if (!isSupabaseConfigured || !company || !entry.values) return;
    let sync = entry.sync ?? null;
    if (!sync?.token) {
      try {
        const { id, editToken } = await createSharedCalc({
          v: 1,
          mode: entry.result.mode,
          values: entry.values,
          result: entry.result,
          completedRows: entry.completedRows,
          label: entry.label,
          snapshot: entry.snapshot,
        });
        sync = { id, token: editToken, version: 1 };
      } catch {
        return;
      }
    }
    const token = sync.token;
    if (!token) return;
    const isPublic = mode !== 'off';
    if (isPublic && !sync.published && settings.maxCompanyShared > 0) {
      const existing = await fetchCompanyCalcs(company.slug);
      if (existing.length >= settings.maxCompanyShared) {
        setCompanyNotice(
          t('company.limitReached', { max: settings.maxCompanyShared }),
        );
        window.setTimeout(() => setCompanyNotice(null), 3000);
        return;
      }
    }
    const ok = await setCompanyPublish(
      sync.id,
      token,
      company.slug,
      isPublic,
      mode === 'edit',
    );
    if (!ok) return;
    const next: SyncMeta = {
      ...sync,
      published: isPublic,
      publishedEditable: mode === 'edit',
    };
    updateSyncMeta(entry.id, next, settings.savedRetentionDays);
    if (editingId === entry.id) setSyncMeta(next);
    setSavedRefreshKey((k) => k + 1);
  };

  // Open a company-published result: save it locally (shared-<id> slot) bound as
  // a synced doc (editable without a token when the company published it so),
  // then open it like any restore (advance-to-now + modal).
  const openCompanyCalc = (c: CompanyCalc) => {
    const p = c.payload;
    const label = p.label ?? deriveLabel(p.result);
    // If a local entry is already bound to this shared row (typically the
    // author's own published calc), update THAT slot instead of creating a
    // parallel `shared-<id>` copy — otherwise opening your own published result
    // from the company list duplicates it in "Salvati". Keep the existing
    // sync (incl. the edit token + published flags) so the owner can still edit
    // and unpublish it; just refresh the version + editable flag from the list.
    const existing = loadHistory(settings.savedRetentionDays).find(
      (e) => e.sync?.id === c.id,
    );
    const savedId = existing?.id ?? `shared-${c.id}`;
    const sync: SyncMeta = existing?.sync
      ? { ...existing.sync, version: c.version, companyEditable: c.isEditable }
      : { id: c.id, version: c.version, companyEditable: c.isEditable };
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

  // Remove a result from the company's shared list (unpublish). Only the author
  // can — the edit token lives on their local saved entry bound to this shared
  // row. Clears the published flags locally so the "Salvati" 🏢 state matches.
  const deleteCompanyCalc = async (c: CompanyCalc) => {
    if (!company) return;
    const local = loadHistory(settings.savedRetentionDays).find(
      (e) => e.sync?.id === c.id && e.sync?.token,
    );
    const token = local?.sync?.token;
    if (!token) return;
    const ok = await setCompanyPublish(c.id, token, company.slug, false, false);
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
      const entry = loadHistory(settings.savedRetentionDays).find(
        (e) => e.id === editingId,
      );
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
  // instead. A pending Piramide handoff takes precedence (handled below).
  useEffect(() => {
    const navType = (
      performance.getEntriesByType('navigation')[0] as
        | PerformanceNavigationTiming
        | undefined
    )?.type;
    if (navType === 'reload') {
      clearDraft();
      return;
    }
    try {
      if (sessionStorage.getItem('calc.orderImport')) return;
    } catch {
      /* ignore */
    }
    const draft = loadDraft();
    if (!draft) return;
    if (draft.mode !== mode) setSelectedMode(draft.mode);
    setEditingId(draft.editingId);
    setRestoredValues(draft.values);
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

    if (imported.targetCalcId) {
      const entry = loadHistory(settings.savedRetentionDays).find(
        (e) => e.id === imported.targetCalcId,
      );
      if (entry) {
        const orders = entry.values?.orders ?? [];
        // Round-trip: replace the origin order's sizes with the Piramide result
        // (already in production order), keeping its other fields (id/speed/name).
        if (imported.replaceOrderId) {
          const idx = orders.findIndex((o) => o.id === imported.replaceOrderId);
          if (idx !== -1) {
            const updated = orders.map((o, i) =>
              i === idx
                ? { ...o, sizes: order.sizes, useTotalLength: false }
                : o,
            );
            onRestore({
              ...entry,
              values: { ...entry.values, orders: updated } as FormValues,
            });
            return;
          }
          // Order gone → fall through to appending it instead.
        }
        // Append the order (inherits speed from the queue) and open the calc.
        onRestore({
          ...entry,
          values: {
            ...entry.values,
            orders: [...orders, order],
          } as FormValues,
        });
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
    setFormKey((k) => k + 1);
    scrollToResults();
    // Run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-full bg-surface-alt">
      <Header />

      <main className="mx-auto max-w-6xl px-3 py-4 sm:px-4 sm:py-8">
        <Tabs
          value={mode}
          onChange={onModeChange}
          modes={settings.modes}
          showPiramide={settings.showPiramide}
          piramideHref={piramideHref}
          settingsOpen={settingsOpen}
          onToggleSettings={() => setSettingsOpen((v) => !v)}
        />

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
          savedRefreshKey={savedRefreshKey}
          initialValues={restoredValues}
          editingId={editingId}
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
          registerComplete={(fn) => {
            completeRef.current = fn;
          }}
        />

        <div id="results" className="mt-5 sm:mt-6">
          {result && syncMeta?.published && (
            <div className="no-print mb-3 flex items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-4 py-2.5 text-sm font-medium text-brand-700">
              <span aria-hidden>🏢</span>
              <span>{t('company.broadcasting')}</span>
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
          {result && completedRows.length > 0 && (
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
                  fromSaved
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
          onClose={() => setActiveModal(null)}
          onGoToForm={goToActiveSize}
          t={t}
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
