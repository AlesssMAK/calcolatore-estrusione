import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { FormValues } from '../formSchema';
import FieldError from './FieldError';

const inputBase =
  'w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-ink shadow-sm transition focus:border-brand-600 focus:ring-2 focus:ring-brand-200 focus:outline-none';
const labelBase = 'text-xs font-medium tracking-wide text-ink-soft uppercase';

const genId = () => Math.random().toString(36).slice(2, 10);

function OrdersList() {
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

  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-ink">
          {t('orders.title')}
        </h2>
        <button
          type="button"
          onClick={() =>
            append({
              id: genId(),
              sheets: 1,
              sheetLengthMm: 6000,
              speedMPerMin: speedMode === 'perOrder' ? 5 : undefined,
              gapAfterMin: gapMode === 'withGaps' ? 0 : undefined,
            })
          }
          className="rounded-md bg-brand-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
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

          return (
            <div
              key={field.id}
              className="grid gap-3 rounded-lg border border-neutral-200 bg-surface-alt p-4 sm:grid-cols-[auto_1fr_1fr_1fr_1fr_auto] sm:items-end"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-brand-600 text-sm font-bold text-white">
                #{idx + 1}
              </div>

              <div>
                <label className={labelBase}>{t('orders.sheets')}</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  className={`${inputBase} mt-1`}
                  {...register(`orders.${idx}.sheets`, {
                    setValueAs: (v) =>
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

              <div>
                <label className={labelBase}>
                  {t('orders.sheetLength')}
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  className={`${inputBase} mt-1`}
                  {...register(`orders.${idx}.sheetLengthMm`, {
                    setValueAs: (v) =>
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

              {speedMode === 'perOrder' ? (
                <div>
                  <label className={labelBase}>{t('orders.speed')}</label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    inputMode="decimal"
                    className={`${inputBase} mt-1`}
                    {...register(`orders.${idx}.speedMPerMin`, {
                      setValueAs: (v) =>
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
              ) : (
                <div className="hidden sm:block" aria-hidden />
              )}

              {gapMode === 'withGaps' && !isLast ? (
                <div>
                  <label className={labelBase}>
                    {t('orders.gapAfter')}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    className={`${inputBase} mt-1`}
                    {...register(`orders.${idx}.gapAfterMin`, {
                      setValueAs: (v) =>
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
              ) : (
                <div className="hidden sm:block" aria-hidden />
              )}

              <button
                type="button"
                onClick={() => remove(idx)}
                disabled={fields.length <= 1}
                className="flex items-center justify-center gap-1 rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-ink-soft shadow-sm transition hover:border-danger hover:text-danger disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-neutral-300 disabled:hover:text-ink-soft"
                aria-label={t('orders.remove')}
                title={t('orders.remove')}
              >
                🗑
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default OrdersList;
