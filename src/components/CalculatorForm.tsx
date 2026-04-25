import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import GlobalSettingsPanel from './GlobalSettingsPanel';
import OrdersList from './OrdersList';
import { calculateSchedule } from '../utils/calculator';
import { buildFormSchema } from '../formSchema';
import type { FormValues } from '../formSchema';
import type { CalculatorMode, ScheduleResult } from '../types';
import { buildEmptyDefaults } from '../utils/defaults';

interface Props {
  mode: CalculatorMode;
  onResult: (result: ScheduleResult) => void;
  onRequestReset: () => void;
}

function CalculatorForm({ mode, onResult, onRequestReset }: Props) {
  const { t } = useTranslation();

  const methods = useForm<FormValues>({
    resolver: zodResolver(buildFormSchema(mode)),
    defaultValues: buildEmptyDefaults(),
    mode: 'onBlur',
  });

  const onSubmit = (values: FormValues) => {
    const schedule = calculateSchedule(values.settings, values.orders, {
      mode,
    });
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
        className="space-y-4 sm:space-y-5"
        noValidate
      >
        <GlobalSettingsPanel />
        <OrdersList mode={mode} />

        <div className="no-print flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end sm:gap-3">
          <button
            type="submit"
            className="order-1 w-full rounded-md bg-brand-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 focus:ring-2 focus:ring-brand-200 focus:outline-none sm:order-2 sm:w-auto sm:py-2.5"
          >
            {t('actions.calculate')} →
          </button>
          <button
            type="button"
            onClick={onRequestReset}
            className="order-2 w-full rounded-md border border-neutral-300 bg-white px-4 py-2.5 text-sm font-medium text-ink-soft shadow-sm transition hover:border-brand-500 hover:text-brand-600 sm:order-1 sm:w-auto"
          >
            ↺ {t('actions.reset')}
          </button>
        </div>
      </form>
    </FormProvider>
  );
}

export default CalculatorForm;
