import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom';
import Header from './components/Header';
import Tabs from './components/Tabs';
import CalculatorForm from './components/CalculatorForm';
import ResultsPanel from './components/ResultsPanel';
import AdvanceBanner from './components/AdvanceBanner';
import RestoreCompletedButton from './components/RestoreCompletedButton';
import { CatalogProvider, useCatalog } from './contexts/CatalogContext';
import { AuthProvider } from './contexts/AuthContext';
import AdminLoginPage from './pages/AdminLoginPage';
import AdminPage from './pages/AdminPage';
import PiramidePage from './pages/PiramidePage';
import type { CalculatorMode, ScheduledOrder, ScheduleResult } from './types';
import type { FormValues } from './formSchema';
import type { SavedCalculation } from './lib/calcHistory';
import { buildAdvancedCalc, type AdvancedCalc } from './utils/advance';

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
  };

  const onModeChange = (next: CalculatorMode) => {
    if (next === mode) return;
    setSelectedMode(next);
    setResult(null);
    setRestoredValues(undefined);
    setEditingId(undefined);
    setCompletedRows([]);
    clearRestored();
    setFormKey((k) => k + 1);
  };

  const onReset = () => {
    setResult(null);
    setRestoredValues(undefined);
    setEditingId(undefined);
    setCompletedRows([]);
    clearRestored();
    setFormKey((k) => k + 1);
  };

  // A submit from the form. "Calcola" (keepCompleted=false) is a fresh result —
  // drop the completed orders; "Ricalcola" (keepCompleted=true) keeps them.
  // Either way it clears the advance/original banner (it's a new result now).
  const onFormResult = (r: ScheduleResult, keepCompleted?: boolean) => {
    clearRestored();
    if (!keepCompleted) setCompletedRows([]);
    setResult(r);
  };

  // Restore a saved calculation. If it's stale (real time has moved past its
  // start), auto-advance to "now": produced-so-far is filled from elapsed time
  // and the schedule is recomputed — shown with a banner + link to the
  // original. Either way the form is refilled so the user can tweak &
  // recalculate. Switch tab if the saved mode differs from the current one.
  const onRestore = (entry: SavedCalculation) => {
    if (entry.result.mode !== mode) setSelectedMode(entry.result.mode);
    const adv = buildAdvancedCalc(entry, new Date());
    setRestoredEntry(entry);
    setAdvancedCalc(adv);
    setShowOriginal(false);
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
    setFormKey((k) => k + 1);
    scrollToResults();
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
          {result ? (
            <ResultsPanel
              result={withCompleted(result, completedRows)}
              mode={mode}
              onReset={onReset}
            />
          ) : (
            <div className="no-print rounded-xl border border-dashed border-neutral-300 bg-white/50 p-5 text-center text-sm text-ink-soft sm:p-6">
              {t('results.empty')}
            </div>
          )}
        </div>
      </main>

      <footer className="no-print mx-auto max-w-6xl px-4 py-6 text-center text-xs text-ink-soft">
        {settings.showPiramide && (
          <Link
            to={piramideHref}
            className="font-medium text-brand-700 transition hover:text-brand-800"
          >
            {t('piramide.openLink')}
          </Link>
        )}
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
