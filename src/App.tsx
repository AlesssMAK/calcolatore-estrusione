import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Header from './components/Header';
import Tabs from './components/Tabs';
import CalculatorForm from './components/CalculatorForm';
import ResultsPanel from './components/ResultsPanel';
import type { CalculatorMode, ScheduleResult } from './types';

function App() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<CalculatorMode>('sheets');
  const [result, setResult] = useState<ScheduleResult | null>(null);
  const [formKey, setFormKey] = useState(0);

  const onModeChange = (next: CalculatorMode) => {
    if (next === mode) return;
    setMode(next);
    setResult(null);
    setFormKey((k) => k + 1);
  };

  const onReset = () => {
    setResult(null);
    setFormKey((k) => k + 1);
  };

  return (
    <div className="min-h-full bg-surface-alt">
      <Header />

      <main className="mx-auto max-w-6xl px-3 py-4 sm:px-4 sm:py-8">
        <Tabs value={mode} onChange={onModeChange} />

        <CalculatorForm
          key={formKey}
          mode={mode}
          onResult={setResult}
          onRequestReset={onReset}
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

export default App;
