import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import Header from './components/Header';
import Tabs from './components/Tabs';
import CalculatorForm from './components/CalculatorForm';
import ResultsPanel from './components/ResultsPanel';
import { CatalogProvider } from './contexts/CatalogContext';
import { AuthProvider } from './contexts/AuthContext';
import AdminLoginPage from './pages/AdminLoginPage';
import AdminPage from './pages/AdminPage';
import type { CalculatorMode, ScheduleResult } from './types';
import type { FormValues } from './formSchema';

function CalculatorApp() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<CalculatorMode>('sheets');
  const [result, setResult] = useState<ScheduleResult | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Restored from the "Salvati" dropdown; cleared back to undefined on reset.
  // Bumping formKey alongside ensures RHF picks up the new defaultValues.
  const [initialValues, setInitialValues] = useState<FormValues | undefined>(
    undefined,
  );
  // Bumped after each successful save so the dropdown re-reads history.
  const [savedRefreshKey, setSavedRefreshKey] = useState(0);

  const onModeChange = (next: CalculatorMode) => {
    if (next === mode) return;
    setMode(next);
    setResult(null);
    setInitialValues(undefined);
    setFormKey((k) => k + 1);
  };

  const onReset = () => {
    setResult(null);
    setInitialValues(undefined);
    setFormKey((k) => k + 1);
  };

  const onRestore = (values: FormValues, restoredMode: CalculatorMode) => {
    // Switch tab if the restored calculation was made in the other mode, so
    // the schema + UI match what's being loaded.
    if (restoredMode !== mode) setMode(restoredMode);
    setResult(null);
    setInitialValues(values);
    setFormKey((k) => k + 1);
  };

  return (
    <div className="min-h-full bg-surface-alt">
      <Header />

      <main className="mx-auto max-w-6xl px-3 py-4 sm:px-4 sm:py-8">
        <Tabs
          value={mode}
          onChange={onModeChange}
          settingsOpen={settingsOpen}
          onToggleSettings={() => setSettingsOpen((v) => !v)}
        />

        <CalculatorForm
          key={formKey}
          mode={mode}
          settingsOpen={settingsOpen}
          onSettingsErrors={() => setSettingsOpen(true)}
          onResult={setResult}
          onRequestReset={onReset}
          initialValues={initialValues}
          onSaved={() => setSavedRefreshKey((k) => k + 1)}
          onRestore={onRestore}
          savedRefreshKey={savedRefreshKey}
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
        © {new Date().getFullYear()} {t('footer.madeBy')}
      </footer>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <CatalogProvider>
          <Routes>
            <Route path="/admin/login" element={<AdminLoginPage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="*" element={<CalculatorApp />} />
          </Routes>
        </CatalogProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
