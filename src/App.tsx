import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Header from './components/Header';
import CalculatorForm from './components/CalculatorForm';
import ResultsPanel from './components/ResultsPanel';
import type { ScheduleResult } from './types';

function App() {
  const { t } = useTranslation();
  const [result, setResult] = useState<ScheduleResult | null>(null);
  const [formKey, setFormKey] = useState(0);

  const onReset = () => {
    setResult(null);
    setFormKey((k) => k + 1);
  };

  return (
    <div className="min-h-full bg-surface-alt">
      <Header />

      <main className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
        <CalculatorForm
          key={formKey}
          onResult={setResult}
          onRequestReset={onReset}
        />

        <div id="results" className="mt-6">
          {result ? (
            <ResultsPanel result={result} onReset={onReset} />
          ) : (
            <div className="no-print rounded-xl border border-dashed border-neutral-300 bg-white/50 p-6 text-center text-sm text-ink-soft">
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
