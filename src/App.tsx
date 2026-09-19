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
import { CatalogProvider, useCatalog } from './contexts/CatalogContext';
import { AuthProvider } from './contexts/AuthContext';
import AdminLoginPage from './pages/AdminLoginPage';
import AdminPage from './pages/AdminPage';
import PiramidePage from './pages/PiramidePage';
import type { CalculatorMode, ScheduledOrder, ScheduleResult } from './types';
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
import { buildEmptyDefaults, makeEmptyOrder } from './utils/defaults';
import { popOrderImport } from './lib/orderImport';
import { isSupabaseConfigured } from './lib/supabase';
import {
  createSharedCalc,
  fetchSharedCalc,
  updateSharedCalc,
  type SharedPayload,
} from './lib/sharedCalc';
import { APP_ORIGIN } from './lib/appUrl';

function CalculatorApp() {
  const { t } = useTranslation();
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
  // The form inputs that produced the currently-displayed `result`. Kept so the
  // "share link" button can persist a consistent {values, result} pair even for
  // a fresh Calcola (where nothing was restored). Threaded up from the form.
  const [resultValues, setResultValues] = useState<FormValues | undefined>(
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
    setResultValues(undefined);
    setEditingId(undefined);
    setCompletedRows([]);
    setFromSaved(false);
    setSyncMeta(null);
    clearRestored();
    setFormKey((k) => k + 1);
  };

  const onReset = () => {
    setResult(null);
    setRestoredValues(undefined);
    setResultValues(undefined);
    setEditingId(undefined);
    setCompletedRows([]);
    setFromSaved(false);
    setSyncMeta(null);
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

  // A submit from the form. "Calcola" (keepCompleted=false) drops the prior
  // completed orders; "Ricalcola" (keepCompleted=true) keeps them. Orders fully
  // produced this submit arrive in `newlyCompleted` — they leave the form (it
  // remounts without them) and join the completed rows shown in the results.
  // Either way it clears the advance/original banner (it's a new result now).
  const onFormResult = (
    r: ScheduleResult,
    values: FormValues,
    keepCompleted?: boolean,
    newlyCompleted: ScheduledOrder[] = [],
  ) => {
    clearRestored();
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
    setResultValues(values);
    // Push edits to the live shared document if this calc is synced and we hold
    // the edit token. Best-effort (fire-and-forget); bumps the local version.
    const meta = syncMeta;
    if (meta?.token) {
      const token = meta.token;
      const newCompleted =
        newlyCompleted.length > 0
          ? [...(keepCompleted ? completedRows : []), ...newlyCompleted]
          : keepCompleted
            ? completedRows
            : [];
      void updateSharedCalc(
        meta.id,
        token,
        buildPayload(r, values, newCompleted),
      ).then((v) => {
        if (v != null) {
          const next: SyncMeta = { ...meta, version: v };
          setSyncMeta(next);
          if (editingId) {
            updateSyncMeta(editingId, next, settings.savedRetentionDays);
          }
        }
      });
    } else if (meta) {
      // A follower (view-only, no edit token) edited → detach into a local copy
      // so their changes aren't overwritten by the next pull.
      setSyncMeta(null);
      if (editingId) {
        updateSyncMeta(editingId, undefined, settings.savedRetentionDays);
        setSavedRefreshKey((k) => k + 1);
      }
    }
  };

  // Restore a saved calculation. If it's stale (real time has moved past its
  // start), auto-advance to "now": produced-so-far is filled from elapsed time
  // and the schedule is recomputed — shown with a banner + link to the
  // original. Either way the form is refilled so the user can tweak &
  // recalculate. Switch tab if the saved mode differs from the current one.
  const doRestore = (entry: SavedCalculation) => {
    if (entry.result.mode !== mode) setSelectedMode(entry.result.mode);
    // Advancing a malformed saved entry must never leave its row un-openable:
    // on failure fall back to showing the saved result as-is (and note why),
    // so the click always does something instead of silently dying.
    let adv: AdvancedCalc | null = null;
    try {
      adv = buildAdvancedCalc(entry, new Date());
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
      setResultValues(adv.values);
      setResult(adv.result);
      setCompletedRows(adv.completedRows);
    } else {
      setRestoredValues(entry.values);
      setResultValues(entry.values);
      setResult(entry.result);
      setCompletedRows([]);
    }
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
    doRestore(entry);
    if (entry.sync) {
      void syncPull(entry).then((updated) => {
        if (updated) doRestore(updated);
      });
    }
  };

  const viewOriginal = () => {
    if (!restoredEntry) return;
    setShowOriginal(true);
    setRestoredValues(restoredEntry.values);
    setResultValues(restoredEntry.values);
    setResult(restoredEntry.result);
    setCompletedRows([]);
    setFormKey((k) => k + 1);
    scrollToResults();
  };

  const viewAdvanced = () => {
    if (!advancedCalc) return;
    setShowOriginal(false);
    setRestoredValues(advancedCalc.values);
    setResultValues(advancedCalc.values);
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

  // Persist the whole displayed calculation to Supabase and return a short
  // shareable link. Preserves the active company so the recipient opens the
  // same catalog/branding. Returns null when there's nothing to share.
  // Turn the displayed calc into a live shared document (if not already) and
  // return its link. `mode` picks a view-only link (`?shared=id`) or an
  // editable one (`?shared=id&edit=token`) — the sharer's choice. Enabling sync
  // binds the token to the bound saved entry so later edits push updates.
  const createShareUrl = async (
    shareMode: 'view' | 'edit',
  ): Promise<string | null> => {
    if (!result || !resultValues) return null;
    let meta = syncMeta;
    if (!meta) {
      const { id, editToken } = await createSharedCalc(
        buildPayload(result, resultValues, completedRows),
      );
      meta = { id, token: editToken, version: 1 };
      setSyncMeta(meta);
      if (editingId) {
        updateSyncMeta(editingId, meta, settings.savedRetentionDays);
        setSavedRefreshKey((k) => k + 1);
      }
    }
    const params = new URLSearchParams();
    params.set('shared', meta.id);
    if (shareMode === 'edit' && meta.token) params.set('edit', meta.token);
    if (company) params.set('company', company.slug);
    return `${APP_ORIGIN}/?${params.toString()}`;
  };

  // Enable/disable live-sync on a saved entry from the "Salvati" list. Enable
  // uploads a fresh shared document and binds its edit token; disable unbinds
  // locally (the shared row is left to expire). Skips entries without inputs.
  const toggleEntrySync = async (entry: SavedCalculation) => {
    if (!isSupabaseConfigured || !entry.values) return;
    if (entry.sync) {
      updateSyncMeta(entry.id, undefined, settings.savedRetentionDays);
      if (editingId === entry.id) setSyncMeta(null);
      setSavedRefreshKey((k) => k + 1);
      return;
    }
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
      const sync: SyncMeta = { id, token: editToken, version: 1 };
      updateSyncMeta(entry.id, sync, settings.savedRetentionDays);
      if (editingId === entry.id) setSyncMeta(sync);
      setSavedRefreshKey((k) => k + 1);
    } catch {
      /* upload failed (offline / quota) — leave the entry unsynced */
    }
  };

  // On first load, hydrate a shared calculation from a ?shared=<id> link:
  // save it into the recipient's local "Salvati" history (deduped by a stable
  // shared-<id> slot so re-opening the same link doesn't pile up copies) and
  // bind it as a live synced document (following the author; also editable when
  // the link carries &edit=<token>), then open it like picking it from Salvati.
  // Finally strip ?shared=/&edit= (keeping ?company=) so a reload doesn't refetch.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('shared');
    if (!id) return;
    const editToken = params.get('edit') ?? undefined;
    let cancelled = false;
    void fetchSharedCalc(id).then((res) => {
      if (cancelled || !res) return;
      const payload = res.payload;
      const savedId = `shared-${id}`;
      const label = payload.label ?? deriveLabel(payload.result);
      const sync: SyncMeta = { id, token: editToken, version: res.version };
      let entry: SavedCalculation;
      try {
        entry = saveCalculation(
          payload.result,
          payload.values,
          payload.snapshot,
          label,
          settings.maxSavedResults,
          settings.savedRetentionDays,
          savedId,
          payload.completedRows,
        );
        updateSyncMeta(savedId, sync, settings.savedRetentionDays);
        entry = { ...entry, sync };
        setSavedRefreshKey((k) => k + 1);
      } catch {
        // Storage failed (quota/private mode) — restore from an in-memory entry
        // so the link still opens, just without a persisted copy.
        entry = {
          id: savedId,
          ts: Date.now(),
          label,
          result: payload.result,
          values: payload.values,
          snapshot: payload.snapshot,
          completedRows: payload.completedRows,
          sync,
        };
      }
      onRestore(entry);
      params.delete('shared');
      params.delete('edit');
      const qs = params.toString();
      window.history.replaceState(null, '', qs ? `/?${qs}` : '/');
    });
    return () => {
      cancelled = true;
    };
    // Run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        // Append the order (inherits speed from the queue) and open the calc.
        onRestore({
          ...entry,
          values: {
            ...entry.values,
            orders: [...(entry.values?.orders ?? []), order],
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
    setResultValues(undefined);
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
          onToggleSync={isSupabaseConfigured ? toggleEntrySync : undefined}
          initialValues={restoredValues}
          editingId={editingId}
          completedRows={completedRows}
          showRicalcola={completedRows.length > 0}
          canComplete={fromSaved}
          registerComplete={(fn) => {
            completeRef.current = fn;
          }}
        />

        <div id="results" className="mt-5 sm:mt-6">
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
                onShare={isSupabaseConfigured ? createShareUrl : undefined}
                isSynced={syncMeta !== null}
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
