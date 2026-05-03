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
import { numericSetValueAs } from '../utils/numeric';

const inputBase =
  'w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-ink shadow-sm transition focus:border-brand-600 focus:ring-2 focus:ring-brand-200 focus:outline-none';
const labelBase =
  'block text-xs font-medium tracking-wide text-ink-soft uppercase';

type OrderError = NonNullable<FieldErrors<FormValues>['orders']>[number];

interface Props {
  mode: CalculatorMode;
}

function OrdersList({ mode }: Props) {
  'use no memo';
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

  const appendOrder = () => {
    const last = watchedOrders?.[watchedOrders.length - 1];
    append(
      makeEmptyOrder(
        mode,
        Boolean(last?.useTotalLength),
        last?.productName ?? '',
      ),
    );
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
      { threshold: 0 },
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
                <OrderNameField idx={idx} t={t} />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setValue(
                        `orders.${idx}.useTotalLength`,
                        !watchedOrders?.[idx]?.useTotalLength,
                        { shouldValidate: true },
                      )
                    }
                    aria-pressed={Boolean(
                      watchedOrders?.[idx]?.useTotalLength,
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

              <OrderFields
                idx={idx}
                rowErr={rowErr}
                showSpeed={showSpeed}
                showGap={showGap}
                mode={mode}
                t={t}
              />
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
  mode: CalculatorMode;
  t: TFunction;
}

function OrderFields({ idx, rowErr, showSpeed, showGap, mode, t }: FieldsProps) {
  'use no memo';
  const { register, control } = useFormContext<FormValues>();
  const useTotalLength = useWatch({
    control,
    name: `orders.${idx}.useTotalLength`,
  });
  const isProfiles = mode === 'profiles';

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
        <SizesFieldArray orderIdx={idx} mode={mode} t={t} />
      )}

      {isProfiles && (
        <div className="pt-1">
          <label className={labelBase}>
            {t('orders.profilesPerPackage')}
            {idx > 0 && (
              <span className="ml-1 normal-case text-ink-soft">
                ({t('orders.optionalInherit')})
              </span>
            )}
          </label>
          <input
            type="number"
            min="1"
            step="1"
            inputMode="numeric"
            className={`${inputBase} mt-1 sm:max-w-xs`}
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
      )}

      {(showSpeed || showGap) && (
        <div className="flex flex-wrap items-end gap-2 pt-1 sm:gap-3">
          {showSpeed && (
            <div className="min-w-0 flex-1 basis-0 sm:min-w-[140px]">
              <label className={labelBase}>
                {t('orders.speed')}
                {idx > 0 && (
                  <span className="ml-1 normal-case text-ink-soft">
                    ({t('orders.optionalInherit')})
                  </span>
                )}
              </label>
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

      <AdvancedSection idx={idx} mode={mode} t={t} />
    </div>
  );
}

type ProducedFieldName =
  | 'producedProfiles'
  | 'producedPackages'
  | 'producedSheets'
  | 'sheetsPerPallet'
  | 'producedPallets';

function AdvancedSection({
  idx,
  mode,
  t,
}: {
  idx: number;
  mode: CalculatorMode;
  t: TFunction;
}) {
  const [expanded, setExpanded] = useState(false);
  const { watch, getValues, control } = useFormContext<FormValues>();

  const useTotalLength = useWatch({
    control,
    name: `orders.${idx}.useTotalLength`,
    defaultValue: false,
  });

  const isProfiles = mode === 'profiles';

  const sumOf = (arr: { value?: number }[] | undefined) =>
    (arr ?? []).reduce((sum, e) => sum + (e?.value ?? 0), 0);

  const orderPath = `orders.${idx}`;

  const computeSums = () => {
    const order = getValues(`orders.${idx}`);
    return {
      profiles: sumOf(order?.producedProfiles),
      packages: sumOf(order?.producedPackages),
      sheets: sumOf(order?.producedSheets),
      perPallet: sumOf(order?.sheetsPerPallet),
      pallets: sumOf(order?.producedPallets),
    };
  };

  const [sums, setSums] = useState(computeSums);

  useEffect(() => {
    const sub = watch((_values, info) => {
      if (info.name && info.name.startsWith(orderPath)) {
        setSums(computeSums());
      }
    });
    return () => sub.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watch, idx]);

  const profilesEntered = sums.profiles > 0;
  const packagesEntered = sums.packages > 0;
  const perPalletEntered = sums.perPallet > 0;
  const palletsEntered = sums.pallets > 0;

  return (
    <div className="pt-2">
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        aria-expanded={expanded}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 transition hover:text-brand-800 sm:text-sm"
      >
        {expanded ? '▾' : '▸'} {t('orders.advancedToggle')}
      </button>

      {expanded && (
        <div
          className={`mt-2 grid grid-cols-2 items-start gap-2 rounded-md border border-brand-100 bg-brand-50/40 p-2 sm:gap-3 sm:p-3 ${
            isProfiles
              ? useTotalLength
                ? 'sm:grid-cols-3'
                : 'sm:grid-cols-2'
              : useTotalLength
                ? 'sm:grid-cols-4'
                : 'sm:grid-cols-3'
          }`}
        >
          {isProfiles ? (
            <>
              <ProducedEntriesArray
                fieldName="producedProfiles"
                orderIdx={idx}
                label={t('orders.advanced.profilesProduced')}
                disabled={packagesEntered}
                t={t}
              />
              <ProducedEntriesArray
                fieldName="producedPackages"
                orderIdx={idx}
                label={t('orders.advanced.packagesProduced')}
                disabled={profilesEntered}
                t={t}
              />
            </>
          ) : (
            <>
              <ProducedEntriesArray
                fieldName="producedSheets"
                orderIdx={idx}
                label={t('orders.advanced.sheetsProduced')}
                disabled={palletsEntered}
                t={t}
              />
              <ProducedEntriesArray
                fieldName="sheetsPerPallet"
                orderIdx={idx}
                label={t('orders.advanced.sheetsPerPallet')}
                t={t}
              />
              <div
                className={
                  useTotalLength ? '' : 'col-span-2 sm:col-span-1'
                }
              >
                <ProducedEntriesArray
                  fieldName="producedPallets"
                  orderIdx={idx}
                  label={t('orders.advanced.palletsProduced')}
                  disabled={!perPalletEntered}
                  t={t}
                />
              </div>
            </>
          )}

          {useTotalLength && (
            <div className="col-span-2 sm:col-span-1">
              <ItemLengthInput
                idx={idx}
                label={
                  isProfiles
                    ? t('orders.profileLength')
                    : t('orders.sheetLength')
                }
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ProducedEntriesArray({
  fieldName,
  orderIdx,
  label,
  disabled = false,
  t,
}: {
  fieldName: ProducedFieldName;
  orderIdx: number;
  label: string;
  disabled?: boolean;
  t: TFunction;
}) {
  const { register, control } = useFormContext<FormValues>();

  const { fields, append, remove } = useFieldArray({
    control,
    name: `orders.${orderIdx}.${fieldName}`,
  });

  return (
    <div
      className={`min-w-0 ${disabled ? 'pointer-events-none opacity-40' : ''}`}
    >
      <label className={labelBase}>{label}</label>
      <div className="mt-1 space-y-1.5">
        {fields.map((field, sIdx) => (
          <div
            key={field.id}
            className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-1 sm:gap-2"
          >
            <input
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              disabled={disabled}
              className="w-full min-w-0 rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs text-ink shadow-sm transition focus:border-brand-600 focus:ring-2 focus:ring-brand-200 focus:outline-none sm:px-3 sm:py-2 sm:text-sm"
              {...register(
                `orders.${orderIdx}.${fieldName}.${sIdx}.value`,
                { setValueAs: numericSetValueAs },
              )}
            />
            <button
              type="button"
              onClick={() => remove(sIdx)}
              disabled={disabled || fields.length <= 1}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-neutral-300 bg-white text-sm font-medium text-ink-soft shadow-sm transition hover:border-danger hover:text-danger disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-neutral-300 disabled:hover:text-ink-soft sm:h-9 sm:w-9 sm:text-base"
              aria-label={t('orders.removeSize')}
              title={t('orders.removeSize')}
            >
              −
            </button>
            <button
              type="button"
              onClick={() => append({ value: undefined })}
              disabled={disabled}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-brand-300 bg-white text-sm font-bold text-brand-700 shadow-sm transition hover:border-brand-600 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-40 sm:h-9 sm:w-9 sm:text-base"
              aria-label={t('orders.addSize')}
              title={t('orders.addSize')}
            >
              +
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function OrderNameField({ idx, t }: { idx: number; t: TFunction }) {
  const { register, control } = useFormContext<FormValues>();
  const value = useWatch({
    control,
    name: `orders.${idx}.productName`,
    defaultValue: '',
  });
  const hasValue = typeof value === 'string' && value.length > 0;
  const [open, setOpen] = useState(false);
  const showInput = open || hasValue;

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        title={t('orders.productName')}
        className="flex h-7 shrink-0 items-center justify-center rounded-md bg-brand-600 px-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-brand-700 sm:h-8 sm:text-sm"
      >
        #{idx + 1}
      </button>
      {showInput && (
        <input
          type="text"
          autoFocus={open && !hasValue}
          placeholder={t('orders.productName')}
          className="min-w-0 flex-1 rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs text-ink shadow-sm transition focus:border-brand-600 focus:ring-2 focus:ring-brand-200 focus:outline-none sm:px-3 sm:py-1.5 sm:text-sm"
          {...register(`orders.${idx}.productName`)}
        />
      )}
    </div>
  );
}

function ItemLengthInput({
  idx,
  label,
}: {
  idx: number;
  label: string;
}) {
  const { register } = useFormContext<FormValues>();
  return (
    <div className="min-w-0">
      <label className={labelBase}>{label}</label>
      <input
        type="number"
        min="1"
        step="1"
        inputMode="numeric"
        className="mt-1 w-full min-w-0 rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs text-ink shadow-sm transition focus:border-brand-600 focus:ring-2 focus:ring-brand-200 focus:outline-none sm:px-3 sm:py-2 sm:text-sm"
        {...register(`orders.${idx}.producedItemLength`, {
          setValueAs: numericSetValueAs,
        })}
      />
    </div>
  );
}

function SizesFieldArray({
  orderIdx,
  mode,
  t,
}: {
  orderIdx: number;
  mode: CalculatorMode;
  t: TFunction;
}) {
  'use no memo';
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

  const isProfiles = mode === 'profiles';
  const sheetsLabel = isProfiles ? t('orders.profiles') : t('orders.sheets');
  const lengthLabel = isProfiles
    ? t('orders.profileLength')
    : t('orders.sheetLength');

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
                <label className={labelBase}>{sheetsLabel}</label>
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
                <label className={labelBase}>{lengthLabel}</label>
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
