import { useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import Header from './components/Header';
import GlobalSettingsPanel from './components/GlobalSettingsPanel';
import OrdersList from './components/OrdersList';
import ResultsPanel from './components/ResultsPanel';
import { calculateSchedule } from './utils/calculator';
import { formSchema } from './formSchema';
import type { FormValues } from './formSchema';
import type { ScheduleResult } from './types';

const genId = () => Math.random().toString(36).slice(2, 10);

const buildEmptyDefaults = (): FormValues =>
  ({
    settings: {
      startMode: 'now',
      startAt: '',
      speedMode: 'global',
      globalSpeed: undefined,
      gapMode: 'continuous',
    },
    orders: [
      {
        id: genId(),
        sheets: undefined,
        sheetLengthMm: undefined,
        speedMPerMin: undefined,
        gapAfterMin: undefined,
      },
    ],
  }) as unknown as FormValues;

function App() {
  const { t } = useTranslation();
  const [result, setResult] = useState<ScheduleResult | null>(null);

  const defaultValues = buildEmptyDefaults();

  const methods = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues,
    mode: 'onBlur',
  });

  const onSubmit = (values: FormValues) => {
    const schedule = calculateSchedule(values.settings, values.orders);
    setResult(schedule);
    window.requestAnimationFrame(() => {
      document
        .getElementById('results')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const onReset = () => {
    methods.reset(defaultValues);
    setResult(null);
  };

  return (
    <div className="min-h-full bg-surface-alt">
      <Header />

      <main className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
        <FormProvider {...methods}>
          <form
            onSubmit={e => {
              void methods.handleSubmit(onSubmit)(e);
            }}
            className="space-y-5"
            noValidate
          >
            <GlobalSettingsPanel />
            <OrdersList />

            <div className="no-print flex flex-wrap items-center justify-end gap-3">
              <button
                type="button"
                onClick={onReset}
                className="rounded-md border border-neutral-300 bg-white px-4 py-2.5 text-sm font-medium text-ink-soft shadow-sm transition hover:border-brand-500 hover:text-brand-600"
              >
                ↺ {t('actions.reset')}
              </button>
              <button
                type="submit"
                className="rounded-md bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 focus:ring-2 focus:ring-brand-200 focus:outline-none"
              >
                {t('actions.calculate')} →
              </button>
            </div>
          </form>
        </FormProvider>

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
