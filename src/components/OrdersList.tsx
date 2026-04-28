import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { FormValues } from '../formSchema';
import type { CalculatorMode } from '../types';
import { makeEmptyOrder } from '../utils/defaults';
import FieldError from './FieldError';

const inputBase =
  'w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-ink shadow-sm transition focus:border-brand-600 focus:ring-2 focus:ring-brand-200 focus:outline-none';
const labelBase =
  'block text-xs font-medium tracking-wide text-ink-soft uppercase';

interface Props {
  mode: CalculatorMode;
}

function OrdersList({ mode }: Props) {
  const { t } = useTranslation();
  const {
    register,
    formState: { errors },
    control,
  } = useFormContext<FormValues>();

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'orders',
  });

  const speedMode = useWatch({ control, name: 'settings.speedMode' });
  const gapMode = useWatch({ control, name: 'settings.gapMode' });

  const rootError =
    typeof errors.orders?.message === 'string' ? errors.orders.message : null;

  const isProfiles = mode === 'profiles';
  const countLabel = isProfiles ? t('orders.profiles') : t('orders.sheets');
  const lengthLabel = isProfiles
    ? t('orders.profileLength')
    : t('orders.sheetLength');

  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-3 shadow-sm sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2 sm:mb-4">
        <h2 className="text-base font-semibold text-ink sm:text-lg">
          {t('orders.title')}
        </h2>
        <button
          type="button"
          onClick={() => append(makeEmptyOrder())}
          className="rounded-md bg-brand-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-700 sm:text-sm"
        >
          {t('orders.add')}
        </button>
      </div>

      {rootError && (
        <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-danger">
          {t(`orders.${rootError}`, { defaultValue: rootError })}
        </p>
      )}

      <div className="space-y-3">
        {fields.map((field, idx) => {
          const rowErr = errors.orders?.[idx];
          const isLast = idx === fields.length - 1;
          const showSpeed = speedMode === 'perOrder';
          const showGap = gapMode === 'withGaps' && !isLast;

          return (
            <div
              key={field.id}
              className="rounded-lg border border-neutral-200 bg-surface-alt p-3 sm:p-4"
            >
              <div className="mb-2 flex items-center justify-between sm:hidden">
                <span className="flex h-7 items-center justify-center rounded-md bg-brand-600 px-2.5 text-xs font-bold text-white">
                  #{idx + 1}
                </span>
                <button
                  type="button"
                  onClick={() => remove(idx)}
                  disabled={fields.length <= 1}
                  className="rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-xs font-medium text-ink-soft transition hover:border-danger hover:text-danger disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label={t('orders.remove')}
                >
                  🗑
                </button>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-end sm:gap-3">
                <span className="hidden h-9 items-center justify-center rounded-md bg-brand-600 px-2.5 text-sm font-bold text-white sm:flex">
                  #{idx + 1}
                </span>

                <div className="sm:min-w-[110px] sm:flex-1">
                  <label className={labelBase}>{countLabel}</label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    inputMode="numeric"
                    className={`${inputBase} mt-1`}
                    {...register(`orders.${idx}.sheets`, {
                      setValueAs: v =>
                        v === '' || v === null || v === undefined
                          ? undefined
                          : Number(v),
                    })}
                  />
                  <FieldError
                    message={
                      rowErr?.sheets?.message
                        ? t(`validation.${rowErr.sheets.message}`)
                        : undefined
                    }
                  />
                </div>

                <div className="sm:min-w-[120px] sm:flex-1">
                  <label className={labelBase}>{lengthLabel}</label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    inputMode="numeric"
                    className={`${inputBase} mt-1`}
                    {...register(`orders.${idx}.sheetLengthMm`, {
                      setValueAs: v =>
                        v === '' || v === null || v === undefined
                          ? undefined
                          : Number(v),
                    })}
                  />
                  <FieldError
                    message={
                      rowErr?.sheetLengthMm?.message
                        ? t(`validation.${rowErr.sheetLengthMm.message}`)
                        : undefined
                    }
                  />
                </div>

                {showSpeed && (
                  <div className="sm:min-w-[110px] sm:flex-1">
                    <label className={labelBase}>{t('orders.speed')}</label>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      inputMode="decimal"
                      className={`${inputBase} mt-1`}
                      {...register(`orders.${idx}.speedMPerMin`, {
                        setValueAs: v =>
                          v === '' || v === null || v === undefined
                            ? undefined
                            : Number(v),
                      })}
                    />
                    <FieldError
                      message={
                        rowErr?.speedMPerMin?.message
                          ? t(`validation.${rowErr.speedMPerMin.message}`)
                          : undefined
                      }
                    />
                  </div>
                )}

                {showGap && (
                  <div className="sm:min-w-[110px] sm:flex-1">
                    <label className={labelBase}>{t('orders.gapAfter')}</label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      inputMode="numeric"
                      className={`${inputBase} mt-1`}
                      {...register(`orders.${idx}.gapAfterMin`, {
                        setValueAs: v =>
                          v === '' || v === null || v === undefined
                            ? undefined
                            : Number(v),
                      })}
                    />
                    <FieldError
                      message={
                        rowErr?.gapAfterMin?.message
                          ? t(`validation.${rowErr.gapAfterMin.message}`)
                          : undefined
                      }
                    />
                  </div>
                )}

                {isProfiles && (
                  <div className="sm:col-span-1 sm:min-w-[140px] sm:flex-1">
                    <label className={labelBase}>
                      {t('orders.profilesPerPackage')}
                    </label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      inputMode="numeric"
                      className={`${inputBase} mt-1`}
                      {...register(`orders.${idx}.profilesPerPackage`, {
                        setValueAs: v =>
                          v === '' || v === null || v === undefined
                            ? undefined
                            : Number(v),
                      })}
                    />
                    <FieldError
                      message={
                        rowErr?.profilesPerPackage?.message
                          ? t(`validation.${rowErr.profilesPerPackage.message}`)
                          : undefined
                      }
                    />
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => remove(idx)}
                  disabled={fields.length <= 1}
                  className="hidden h-9 items-center justify-center gap-1 rounded-md border border-neutral-300 bg-white px-3 text-sm font-medium text-ink-soft shadow-sm transition hover:border-danger hover:text-danger disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-neutral-300 disabled:hover:text-ink-soft sm:flex"
                  aria-label={t('orders.remove')}
                  title={t('orders.remove')}
                >
                  🗑
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex justify-center sm:mt-4">
        <button
          type="button"
          onClick={() => append(makeEmptyOrder())}
          className="w-full rounded-md border border-dashed border-brand-300 bg-white px-3 py-2.5 text-sm font-semibold text-brand-700 shadow-sm transition hover:border-brand-600 hover:bg-brand-50 sm:w-auto sm:px-6"
        >
          + {t('orders.add')}
        </button>
      </div>
    </section>
  );
}

export default OrdersList;
