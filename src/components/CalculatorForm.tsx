import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import GlobalSettingsPanel from './GlobalSettingsPanel';
import OrdersList from './OrdersList';
import { calculateSchedule } from '../utils/calculator';
import { formSchema } from '../formSchema';
import type { FormValues } from '../formSchema';
import type { ScheduleResult } from '../types';

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

interface Props {
  onResult: (result: ScheduleResult) => void;
  onRequestReset: () => void;
}

function CalculatorForm({ onResult, onRequestReset }: Props) {
  const { t } = useTranslation();

  const methods = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: buildEmptyDefaults(),
    mode: 'onBlur',
  });

  const onSubmit = (values: FormValues) => {
    const schedule = calculateSchedule(values.settings, values.orders);
    onResult(schedule);
    window.requestAnimationFrame(() => {
      document
        .getElementById('results')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  return (
    <FormProvider {...methods}>
      <form
        onSubmit={(e) => {
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
            onClick={onRequestReset}
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
  );
}

export default CalculatorForm;
