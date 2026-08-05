import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom';
import Header from './components/Header';
import Tabs from './components/Tabs';
import CalculatorForm from './components/CalculatorForm';
import ResultsPanel from './components/ResultsPanel';
import { CatalogProvider, useCatalog } from './contexts/CatalogContext';
import { AuthProvider } from './contexts/AuthContext';
import AdminLoginPage from './pages/AdminLoginPage';
import AdminPage from './pages/AdminPage';
import PiramidePage from './pages/PiramidePage';
import type { CalculatorMode, ScheduleResult } from './types';
import type { FormValues } from './formSchema';
import type { SavedCalculation } from './lib/calcHistory';

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
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Bumped after each successful save so the dropdown re-reads history.
  const [savedRefreshKey, setSavedRefreshKey] = useState(0);

  const onModeChange = (next: CalculatorMode) => {
    if (next === mode) return;
    setSelectedMode(next);
    setResult(null);
    setRestoredValues(undefined);
    setFormKey((k) => k + 1);
  };

  const onReset = () => {
    setResult(null);
    setRestoredValues(undefined);
    setFormKey((k) => k + 1);
  };

  // Restore a saved calculation: refill the form with its saved inputs (so the
  // user can tweak & recalculate) and show the result below — like a fresh
  // calculation. Switch tab if the saved mode differs from the current one.
  const onRestore = (entry: SavedCalculation) => {
    if (entry.result.mode !== mode) setSelectedMode(entry.result.mode);
    setRestoredValues(entry.values);
    setFormKey((k) => k + 1); // remount the form with the restored inputs
    setResult(entry.result);
    window.requestAnimationFrame(() => {
      document
        .getElementById('results')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

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
          onResult={setResult}
          onRequestReset={onReset}
          onSaved={() => setSavedRefreshKey((k) => k + 1)}
          onRestore={onRestore}
          savedRefreshKey={savedRefreshKey}
          initialValues={restoredValues}
        />

        <div id="results" className="mt-5 sm:mt-6">
          {result ? (
            <ResultsPanel result={result} mode={mode} onReset={onReset} />
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
