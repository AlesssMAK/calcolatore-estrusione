import { useEffect, useState } from 'react';
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
  type SavedCalculation,
} from './lib/calcHistory';
import { buildAdvancedCalc, type AdvancedCalc } from './utils/advance';
import { isSupabaseConfigured } from './lib/supabase';
import {
  createSharedCalc,
  fetchSharedCalc,
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
    clearRestored();
    setFormKey((k) => k + 1);
  };

  const onReset = () => {
    setResult(null);
    setRestoredValues(undefined);
    setResultValues(undefined);
    setEditingId(undefined);
    setCompletedRows([]);
    clearRestored();
    setFormKey((k) => k + 1);
  };

  // A submit from the form. "Calcola" (keepCompleted=false) is a fresh result —
  // drop the completed orders; "Ricalcola" (keepCompleted=true) keeps them.
  // Either way it clears the advance/original banner (it's a new result now).
  // `values` are captured so the share button can persist the exact inputs.
  const onFormResult = (
    r: ScheduleResult,
    values: FormValues,
    keepCompleted?: boolean,
  ) => {
    clearRestored();
    if (!keepCompleted) setCompletedRows([]);
    setResult(r);
    setResultValues(values);
  };

  // Restore a saved calculation. If it's stale (real time has moved past its
  // start), auto-advance to "now": produced-so-far is filled from elapsed time
  // and the schedule is recomputed — shown with a banner + link to the
  // original. Either way the form is refilled so the user can tweak &
  // recalculate. Switch tab if the saved mode differs from the current one.
  const onRestore = (entry: SavedCalculation) => {
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
      orders: [...(prev?.orders ?? []), ...restoredOrders],
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
  const createShareUrl = async (): Promise<string | null> => {
    if (!result || !resultValues) return null;
    // Carry the snapshot from the saved entry this result is bound to, so the
    // recipient's saved copy can be advanced to "now" like any local calc.
    const snapshot = editingId
      ? loadHistory(settings.savedRetentionDays).find((e) => e.id === editingId)
          ?.snapshot
      : undefined;
    const payload: SharedPayload = {
      v: 1,
      mode,
      values: resultValues,
      result,
      completedRows: completedRows.length > 0 ? completedRows : undefined,
      label: deriveLabel(result),
      snapshot,
    };
    const id = await createSharedCalc(payload);
    const params = new URLSearchParams();
    params.set('shared', id);
    if (company) params.set('company', company.slug);
    return `${APP_ORIGIN}/?${params.toString()}`;
  };

  // On first load, hydrate a shared calculation from a ?shared=<id> link:
  // save it into the recipient's local "Salvati" history (deduped by a stable
  // shared-<id> slot so re-opening the same link doesn't pile up copies), then
  // open it exactly like picking it from Salvati — advanced to "now", with the
  // "Vedi originale" toggle (and Ricalcola when there are completed orders).
  // Finally strip ?shared= (keeping ?company=) so a reload doesn't re-fetch.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('shared');
    if (!id) return;
    let cancelled = false;
    void fetchSharedCalc(id).then((payload) => {
      if (cancelled || !payload) return;
      const savedId = `shared-${id}`;
      const label = payload.label ?? deriveLabel(payload.result);
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
        };
      }
      onRestore(entry);
      params.delete('shared');
      const qs = params.toString();
      window.history.replaceState(null, '', qs ? `/?${qs}` : '/');
    });
    return () => {
      cancelled = true;
    };
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
          showRicalcola={completedRows.length > 0}
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
