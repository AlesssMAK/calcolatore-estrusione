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
import { toCompletedRow } from '../utils/advance';
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
   *  in the result); false/omitted = plain "Calcola" (fresh, drop completed).
   *  `values` are the submitted inputs, carried up so the parent can persist a
   *  consistent {values, result} pair for the share-link feature. */
  onResult: (
    result: ScheduleResult,
    values: FormValues,
    keepCompleted?: boolean,
    /** Orders that were fully produced this submit — split out of the form and
     *  shown as completed rows in the results. */
    newlyCompleted?: ScheduledOrder[],
  ) => void;
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
  /** Toggle live-sync on a saved entry (from the "Salvati" dropdown). */
  onToggleSync?: (entry: SavedCalculation) => void | Promise<void>;
  /** When restoring a saved calculation, the form mounts pre-filled with these
   *  inputs so the user can tweak and recalculate. Undefined → empty defaults. */
  initialValues?: FormValues;
  /** Id of the saved entry the form is currently bound to (from a restore or a
   *  previous save). When set, submitting updates that entry in place instead
   *  of creating a duplicate. */
  editingId?: string;
  /** Completed (done) orders carried alongside the advanced view; kept on the
   *  entry when recomputing a tracked calc (there are completed rows). */
  completedRows?: ScheduledOrder[];
  /** True when the tracked calc has completed orders → "Calcola" keeps them. */
  hasCompleted?: boolean;
  /** Show per-order / per-size "✓ Completa" buttons (only meaningful when
   *  tracking a saved/shared calc). */
  canComplete?: boolean;
  /** Register the "mark fully produced" action so the results panel (a sibling
   *  of the form) can trigger it too. Called with the current handler on mount
   *  and null on unmount. */
  registerComplete?: (
    fn: ((orderId: string, sizeIdx?: number) => void) | null,
  ) => void;
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
  onToggleSync,
  initialValues,
  editingId,
  completedRows,
  hasCompleted,
  canComplete,
  registerComplete,
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
    // Split fully-produced orders out of the editable queue: they become
    // completed rows (shown done in the results, at their last-working-moment
    // time) and leave the form. Rows map 1:1 to orders, so filter by index.
    const isDone = schedule.rows.map(
      (r) => r.productionMinutes >= 0.5 && r.remainingMinutes < 0.5,
    );
    const newlyCompleted = schedule.rows
      .filter((_, i) => isDone[i])
      .map(toCompletedRow);
    const outValues: FormValues =
      newlyCompleted.length > 0
        ? { ...values, orders: values.orders.filter((_, i) => !isDone[i]) }
        : values;
    const outSchedule: ScheduleResult =
      newlyCompleted.length > 0
        ? { ...schedule, rows: schedule.rows.filter((_, i) => !isDone[i]) }
        : schedule;
    onResult(outSchedule, outValues, keepCompleted, newlyCompleted);
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
      // Persist the active queue + the accumulated completed rows (prior ones
      // kept only on "Ricalcola", plus any split off this submit).
      const combinedCompleted = [
        ...(keepCompleted ? (completedRows ?? []) : []),
        ...newlyCompleted,
      ];
      const saved = saveCalculation(
        outSchedule,
        outValues,
        snapshot,
        deriveLabel(schedule),
        catalogSettings.maxSavedResults,
        catalogSettings.savedRetentionDays,
        editingId,
        combinedCompleted.length ? combinedCompleted : undefined,
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

  // Mark an order (or a single size of it) as fully produced, then recompute
  // keeping already-completed rows (like "Ricalcola"). Used by the per-order /
  // per-size "✓ Completa" buttons in both the form and the results panel.
  const completeItem = (orderId: string, sizeIdx?: number) => {
    const orders = methods.getValues('orders');
    const idx = orders.findIndex((o) => o?.id === orderId);
    if (idx < 0) return;
    const o = orders[idx];
    if (o.useTotalLength) {
      // No per-size split — mark all meters produced (1 m-unit batch).
      const meters = Math.round(o.totalLengthM ?? 0);
      if (mode === 'profiles') {
        methods.setValue(`orders.${idx}.producedProfiles`, [{ value: meters }], {
          shouldDirty: true,
        });
      } else {
        methods.setValue(`orders.${idx}.producedSheets`, [{ value: meters }], {
          shouldDirty: true,
        });
      }
      methods.setValue(`orders.${idx}.producedItemLength`, [{ value: 1000 }], {
        shouldDirty: true,
      });
    } else {
      const sizes = o.sizes ?? [];
      const field =
        mode === 'profiles'
          ? (`orders.${idx}.producedProfiles` as const)
          : (`orders.${idx}.producedSheets` as const);
      const cur =
        (methods.getValues(field) as
          | { sizeIndex?: number; value?: number }[]
          | undefined) ?? [];
      // Fill the targeted size (or all, when sizeIdx is undefined) to its total;
      // keep whatever was already entered for the other sizes.
      const next = sizes.map((s, i) =>
        sizeIdx === undefined || sizeIdx === i
          ? { sizeIndex: i, value: s?.sheets ?? 0 }
          : (cur[i] ?? { sizeIndex: i, value: undefined }),
      );
      methods.setValue(field, next, { shouldDirty: true });
    }
    keepCompletedRef.current = true;
    void methods.handleSubmit(onSubmit, onInvalid)();
  };

  // Keep the registered handler pointing at the latest closure (so it uses the
  // current editingId / settings) while exposing a stable function reference.
  const completeRef = useRef(completeItem);
  completeRef.current = completeItem;
  useEffect(() => {
    if (!registerComplete) return;
    const fn = (orderId: string, sizeIdx?: number) =>
      completeRef.current(orderId, sizeIdx);
    registerComplete(fn);
    return () => registerComplete(null);
  }, [registerComplete]);

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
        {settingsOpen && <GlobalSettingsPanel />}
        <OrdersList
          mode={mode}
          onComplete={canComplete ? completeItem : undefined}
        />

        <div className="no-print flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end sm:gap-3">
          {onRestore && (
            <SavedCalculationsButton
              onRestore={onRestore}
              refreshKey={savedRefreshKey}
              onToggleSync={onToggleSync}
            />
          )}
          <button
            type="submit"
            onClick={() => {
              // A single "Calcola": keeps already-completed orders whenever the
              // tracked calc has them (recompute of a saved calc), starts clean
              // for a fresh calc (none to keep). Replaces the old Ricalcola.
              keepCompletedRef.current = !!hasCompleted;
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
