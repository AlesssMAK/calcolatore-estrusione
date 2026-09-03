import { useEffect, useRef, useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import GlobalSettingsPanel from './GlobalSettingsPanel';
import WeekendBanner from './WeekendBanner';
import OrdersList from './OrdersList';
import SavedCalculationsButton from './SavedCalculationsButton';
import { calculateSchedule } from '../utils/calculator';
import { useCatalog } from '../contexts/CatalogContext';
import { buildFormSchema } from '../formSchema';
import type { FormValues } from '../formSchema';
import type {
  CalculatorMode,
  ScheduledOrder,
  ScheduleResult,
  ScheduleSnapshot,
} from '../types';
import { buildEmptyDefaults } from '../utils/defaults';
import {
  deriveLabel,
  saveCalculation,
  type SavedCalculation,
} from '../lib/calcHistory';
import type { FieldErrors } from 'react-hook-form';

interface Props {
  mode: CalculatorMode;
  settingsOpen: boolean;
  onSettingsErrors: () => void;
  /** `keepCompleted` = the "Ricalcola" button was used (keep completed orders
   *  in the result); false/omitted = plain "Calcola" (fresh, drop completed). */
  onResult: (result: ScheduleResult, keepCompleted?: boolean) => void;
  onRequestReset: () => void;
  /** Called after a successful submit with the saved entry's id, so the parent
   *  can refresh the dropdown and keep editing the same slot. */
  onSaved?: (savedId: string) => void;
  /** Called when the user picks an entry from the "Salvati" dropdown — the
   *  parent refills the form with the saved inputs and shows the result below.
   *  Switches tab if the saved mode differs from the current one. */
  onRestore?: (entry: SavedCalculation) => void;
  /** Bump from parent to force the saved-list to re-read history when reopened. */
  savedRefreshKey?: number;
  /** When restoring a saved calculation, the form mounts pre-filled with these
   *  inputs so the user can tweak and recalculate. Undefined → empty defaults. */
  initialValues?: FormValues;
  /** Id of the saved entry the form is currently bound to (from a restore or a
   *  previous save). When set, submitting updates that entry in place instead
   *  of creating a duplicate. */
  editingId?: string;
  /** Completed (done) orders carried alongside the advanced view; persisted
   *  with the entry only when the user presses "Ricalcola". */
  completedRows?: ScheduledOrder[];
  /** Show the "Ricalcola" button (advanced view with completed orders). */
  showRicalcola?: boolean;
}

function CalculatorForm({
  mode,
  settingsOpen,
  onSettingsErrors,
  onResult,
  onRequestReset,
  onSaved,
  onRestore,
  savedRefreshKey,
  initialValues,
  editingId,
  completedRows,
  showRicalcola,
}: Props) {
  'use no memo';
  const { t } = useTranslation();
  const { company, settings: catalogSettings } = useCatalog();

  const methods = useForm<FormValues>({
    resolver: zodResolver(buildFormSchema(mode)),
    defaultValues: initialValues ?? buildEmptyDefaults(mode),
    mode: 'onBlur',
    reValidateMode: 'onChange',
  });

  const [submitError, setSubmitError] = useState<string | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  // Which submit button was pressed: "Ricalcola" keeps completed orders in the
  // saved result, plain "Calcola" drops them. Read in onSubmit, reset after.
  const keepCompletedRef = useRef(false);

  useEffect(() => {
    return () => {
      if (hideTimerRef.current !== null) {
        window.clearTimeout(hideTimerRef.current);
      }
    };
  }, []);

  const showError = (msg: string) => {
    setSubmitError(msg);
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
    }
    hideTimerRef.current = window.setTimeout(() => {
      setSubmitError(null);
      hideTimerRef.current = null;
    }, 4000);
  };

  const onSubmit = (values: FormValues) => {
    setSubmitError(null);
    const keepCompleted = keepCompletedRef.current;
    keepCompletedRef.current = false;
    // A company's settings (schedule + buffers) are the source of truth when a
    // company link is active; otherwise fall back to the local settings.
    const schedule = calculateSchedule(values.settings, values.orders, {
      mode,
      schedule: company ? catalogSettings.schedule : undefined,
      warmupMinutes: company ? catalogSettings.warmupMinutes : undefined,
      shutdownMinutes: company ? catalogSettings.shutdownMinutes : undefined,
    });
    onResult(schedule, keepCompleted);
    // Snapshot the *effective* schedule + buffers so the saved calc can be
    // advanced to "now" / recalculated later without depending on (possibly
    // changed) company settings. Mirrors what calculateSchedule just used.
    const snapshot: ScheduleSnapshot = {
      weekend: values.settings.weekend,
      schedule: (company ? catalogSettings.schedule : undefined) ?? null,
      warmupMinutes:
        (company ? catalogSettings.warmupMinutes : values.settings.warmupMinutes) ??
        0,
      shutdownMinutes:
        (company
          ? catalogSettings.shutdownMinutes
          : values.settings.shutdownMinutes) ?? 0,
    };
    // Persist the computed result so the user can re-open it from the
    // "Salvati" dropdown without recalculating. Best-effort: storage errors
    // are swallowed inside `saveCalculation`.
    try {
      const saved = saveCalculation(
        schedule,
        values,
        snapshot,
        deriveLabel(schedule),
        catalogSettings.maxSavedResults,
        catalogSettings.savedRetentionDays,
        editingId,
        keepCompleted ? completedRows : undefined,
      );
      onSaved?.(saved.id);
    } catch {
      /* never block submit on storage failure */
    }
    window.requestAnimationFrame(() => {
      document
        .getElementById('results')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const onInvalid = (errors: FieldErrors<FormValues>) => {
    if (errors.settings) {
      onSettingsErrors();
    }
    showError(t('validation.fillRequired'));
    window.requestAnimationFrame(() => {
      const firstError = document.querySelector(
        '[aria-invalid="true"], .text-danger',
      );
      if (firstError instanceof HTMLElement) {
        firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  };

  return (
    <FormProvider {...methods}>
      <form
        onSubmit={(e) => {
          void methods.handleSubmit(onSubmit, onInvalid)(e);
        }}
        className="space-y-4 sm:space-y-5"
        noValidate
      >
        <WeekendBanner />
        {settingsOpen && <GlobalSettingsPanel mode={mode} />}
        <OrdersList mode={mode} />

        <div className="no-print flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end sm:gap-3">
          {onRestore && (
            <SavedCalculationsButton
              onRestore={onRestore}
              refreshKey={savedRefreshKey}
            />
          )}
          {showRicalcola && (
            <button
              type="submit"
              onClick={() => {
                keepCompletedRef.current = true;
              }}
              title={t('actions.recalcHint')}
              className="order-1 w-full rounded-md border border-amber-400 bg-amber-50 px-5 py-3 text-sm font-semibold text-amber-800 shadow-sm transition hover:bg-amber-100 focus:ring-2 focus:ring-amber-200 focus:outline-none sm:order-2 sm:w-auto sm:py-2.5"
            >
              ↻ {t('actions.recalc')}
            </button>
          )}
          <button
            type="submit"
            onClick={() => {
              keepCompletedRef.current = false;
            }}
            className="order-1 w-full rounded-md bg-brand-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 focus:ring-2 focus:ring-brand-200 focus:outline-none sm:order-3 sm:w-auto sm:py-2.5"
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

      {submitError && (
        <div
          role="alert"
          className="no-print fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-md bg-danger px-4 py-2.5 text-sm font-medium text-white shadow-lg"
        >
          ⚠ {submitError}
        </div>
      )}
    </FormProvider>
  );
}

export default CalculatorForm;
