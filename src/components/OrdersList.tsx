import { useEffect, useRef, useState } from 'react';
import {
  useFieldArray,
  useFormContext,
  useWatch,
  type FieldErrors,
} from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { FormValues } from '../formSchema';
import type { CalculatorMode } from '../types';
import { makeEmptyOrder, makeEmptySize } from '../utils/defaults';
import FieldError from './FieldError';

const inputBase =
  'w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-ink shadow-sm transition focus:border-brand-600 focus:ring-2 focus:ring-brand-200 focus:outline-none';
const labelBase =
  'block text-xs font-medium tracking-wide text-ink-soft uppercase';

const numericSetValueAs = (v: unknown) =>
  v === '' || v === null || v === undefined ? undefined : Number(v);

type OrderError = NonNullable<FieldErrors<FormValues>['orders']>[number];

interface Props {
  mode: CalculatorMode;
}

function OrdersList({ mode }: Props) {
  const { t } = useTranslation();
  const {
    formState: { errors },
    control,
    setValue,
  } = useFormContext<FormValues>();

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'orders',
  });

  const speedMode = useWatch({ control, name: 'settings.speedMode' });
  const gapMode = useWatch({ control, name: 'settings.gapMode' });
  const watchedOrders = useWatch({ control, name: 'orders' });

  const rootError =
    typeof errors.orders?.message === 'string' ? errors.orders.message : null;

  const isProfiles = mode === 'profiles';

  const appendOrder = () => {
    const last = watchedOrders?.[watchedOrders.length - 1];
    const inherit = mode === 'sheets' ? Boolean(last?.useTotalLength) : false;
    append(makeEmptyOrder(mode, inherit));
  };

  const topButtonRef = useRef<HTMLButtonElement>(null);
  const [showBottomButton, setShowBottomButton] = useState(false);

  useEffect(() => {
    const node = topButtonRef.current;
    if (!node) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        setShowBottomButton(!entry.isIntersecting);
      },
      { threshold: 0 }
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, []);

  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-3 shadow-sm sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2 sm:mb-4">
        <h2 className="text-base font-semibold text-ink sm:text-lg">
          {t('orders.title')}
        </h2>
        <button
          ref={topButtonRef}
          type="button"
          onClick={appendOrder}
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
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="flex h-7 items-center justify-center rounded-md bg-brand-600 px-2.5 text-xs font-bold text-white sm:h-8 sm:text-sm">
                  #{idx + 1}
                </span>
                <div className="flex items-center gap-2">
                  {!isProfiles && (
                    <button
                      type="button"
                      onClick={() =>
                        setValue(
                          `orders.${idx}.useTotalLength`,
                          !watchedOrders?.[idx]?.useTotalLength,
                          { shouldValidate: true }
                        )
                      }
                      aria-pressed={Boolean(
                        watchedOrders?.[idx]?.useTotalLength
                      )}
                      title={t('orders.toggleTotalLength')}
                      className={
                        watchedOrders?.[idx]?.useTotalLength
                          ? 'rounded-md border border-brand-600 bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white shadow-sm transition sm:px-3 sm:py-1.5 sm:text-sm'
                          : 'rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-xs font-medium text-ink-soft transition hover:border-brand-400 hover:text-ink sm:px-3 sm:py-1.5 sm:text-sm'
                      }
                    >
                      Σ{' '}
                      <span className="hidden sm:inline">
                        {t('orders.toggleTotalLength')}
                      </span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => remove(idx)}
                    disabled={fields.length <= 1}
                    className="rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-xs font-medium text-ink-soft transition hover:border-danger hover:text-danger disabled:cursor-not-allowed disabled:opacity-40 sm:px-3 sm:py-1.5 sm:text-sm"
                    aria-label={t('orders.remove')}
                  >
                    🗑{' '}
                    <span className="hidden sm:inline">
                      {t('orders.remove')}
                    </span>
                  </button>
                </div>
              </div>

              {isProfiles ? (
                <ProfilesOrderFields
                  idx={idx}
                  rowErr={rowErr}
                  showSpeed={showSpeed}
                  showGap={showGap}
                  t={t}
                />
              ) : (
                <SheetsOrderFields
                  idx={idx}
                  rowErr={rowErr}
                  showSpeed={showSpeed}
                  showGap={showGap}
                  t={t}
                />
              )}
            </div>
          );
        })}
      </div>

      {showBottomButton && (
        <div className="mt-3 flex justify-end sm:mt-4">
          <button
            type="button"
            onClick={appendOrder}
            className="rounded-md bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
          >
            {t('orders.add')}
          </button>
        </div>
      )}
    </section>
  );
}

interface FieldsProps {
  idx: number;
  rowErr: OrderError | undefined;
  showSpeed: boolean;
  showGap: boolean;
  t: TFunction;
}

function ProfilesOrderFields({
  idx,
  rowErr,
  showSpeed,
  showGap,
  t,
}: FieldsProps) {
  const { register } = useFormContext<FormValues>();

  return (
    <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-end sm:gap-3">
      <div className="sm:min-w-[110px] sm:flex-1">
        <label className={labelBase}>{t('orders.profiles')}</label>
        <input
          type="number"
          min="1"
          step="1"
          inputMode="numeric"
          className={`${inputBase} mt-1`}
          {...register(`orders.${idx}.sheets`, {
            setValueAs: numericSetValueAs,
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
        <label className={labelBase}>{t('orders.profileLength')}</label>
        <input
          type="number"
          min="1"
          step="1"
          inputMode="numeric"
          className={`${inputBase} mt-1`}
          {...register(`orders.${idx}.sheetLengthMm`, {
            setValueAs: numericSetValueAs,
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
              setValueAs: numericSetValueAs,
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
              setValueAs: numericSetValueAs,
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

      <div className="sm:min-w-[140px] sm:flex-1">
        <label className={labelBase}>{t('orders.profilesPerPackage')}</label>
        <input
          type="number"
          min="1"
          step="1"
          inputMode="numeric"
          className={`${inputBase} mt-1`}
          {...register(`orders.${idx}.profilesPerPackage`, {
            setValueAs: numericSetValueAs,
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
    </div>
  );
}

function SheetsOrderFields({
  idx,
  rowErr,
  showSpeed,
  showGap,
  t,
}: FieldsProps) {
  const { register, control } = useFormContext<FormValues>();
  const useTotalLength = useWatch({
    control,
    name: `orders.${idx}.useTotalLength`,
  });

  return (
    <div className="space-y-2">
      {useTotalLength ? (
        <div>
          <label className={labelBase}>{t('orders.totalLength')}</label>
          <input
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            className={`${inputBase} mt-1 sm:max-w-xs`}
            {...register(`orders.${idx}.totalLengthM`, {
              setValueAs: numericSetValueAs,
            })}
          />
          <FieldError
            message={
              rowErr?.totalLengthM?.message
                ? t(`validation.${rowErr.totalLengthM.message}`)
                : undefined
            }
          />
        </div>
      ) : (
        <SizesFieldArray orderIdx={idx} t={t} />
      )}

      {(showSpeed || showGap) && (
        <div className="flex flex-wrap items-end gap-2 pt-1 sm:gap-3">
          {showSpeed && (
            <div className="min-w-0 flex-1 basis-0 sm:min-w-[140px]">
              <label className={labelBase}>{t('orders.speed')}</label>
              <input
                type="number"
                min="0"
                step="0.1"
                inputMode="decimal"
                className={`${inputBase} mt-1`}
                {...register(`orders.${idx}.speedMPerMin`, {
                  setValueAs: numericSetValueAs,
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
            <div className="min-w-0 flex-1 basis-0 sm:min-w-[140px]">
              <label className={labelBase}>{t('orders.gapAfter')}</label>
              <input
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                className={`${inputBase} mt-1`}
                {...register(`orders.${idx}.gapAfterMin`, {
                  setValueAs: numericSetValueAs,
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
        </div>
      )}
    </div>
  );
}

function SizesFieldArray({ orderIdx, t }: { orderIdx: number; t: TFunction }) {
  const {
    register,
    formState: { errors },
    control,
  } = useFormContext<FormValues>();

  const {
    fields: sizeFields,
    append: appendSize,
    remove: removeSize,
  } = useFieldArray({
    control,
    name: `orders.${orderIdx}.sizes`,
  });

  const orderErr = errors.orders?.[orderIdx];
  const sizesRootError =
    typeof orderErr?.sizes?.message === 'string'
      ? orderErr.sizes.message
      : null;

  return (
    <div>
      {sizesRootError && (
        <p className="mb-2 rounded-md bg-red-50 px-3 py-2 text-sm text-danger">
          {t(`orders.${sizesRootError}`, { defaultValue: sizesRootError })}
        </p>
      )}

      <div className="space-y-2">
        {sizeFields.map((sizeField, sIdx) => {
          const sizeErr = orderErr?.sizes?.[sIdx];
          return (
            <div
              key={sizeField.id}
              className="grid grid-cols-[1fr_1fr_auto_auto] items-end gap-2 sm:gap-3"
            >
              <div className="min-w-0">
                <label className={labelBase}>{t('orders.sheets')}</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  className={`${inputBase} mt-1`}
                  {...register(`orders.${orderIdx}.sizes.${sIdx}.sheets`, {
                    setValueAs: numericSetValueAs,
                  })}
                />
                <FieldError
                  message={
                    sizeErr?.sheets?.message
                      ? t(`validation.${sizeErr.sheets.message}`)
                      : undefined
                  }
                />
              </div>

              <div className="min-w-0">
                <label className={labelBase}>{t('orders.sheetLength')}</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  className={`${inputBase} mt-1`}
                  {...register(`orders.${orderIdx}.sizes.${sIdx}.length`, {
                    setValueAs: numericSetValueAs,
                  })}
                />
                <FieldError
                  message={
                    sizeErr?.length?.message
                      ? t(`validation.${sizeErr.length.message}`)
                      : undefined
                  }
                />
              </div>

              <button
                type="button"
                onClick={() => removeSize(sIdx)}
                disabled={sizeFields.length <= 1}
                className="mb-[2px] flex h-9 w-9 items-center justify-center rounded-md border border-neutral-300 bg-white text-base font-medium text-ink-soft shadow-sm transition hover:border-danger hover:text-danger disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-neutral-300 disabled:hover:text-ink-soft"
                aria-label={t('orders.removeSize')}
                title={t('orders.removeSize')}
              >
                −
              </button>

              <button
                type="button"
                onClick={() => appendSize(makeEmptySize())}
                className="mb-[2px] flex h-9 w-9 items-center justify-center rounded-md border border-brand-300 bg-white text-base font-bold text-brand-700 shadow-sm transition hover:border-brand-600 hover:bg-brand-50"
                aria-label={t('orders.addSize')}
                title={t('orders.addSize')}
              >
                +
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default OrdersList;
