import { useEffect, useRef, useState, type ReactNode } from 'react';
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
  showGap: boolean;
  mode: CalculatorMode;
  t: TFunction;
}

function OrderFields({ idx, rowErr, showGap, mode, t }: FieldsProps) {
  'use no memo';
  const { register, control } = useFormContext<FormValues>();
  const useTotalLength = useWatch({
    control,
    name: `orders.${idx}.useTotalLength`,
  });
  const sizesWatched = useWatch({ control, name: `orders.${idx}.sizes` });
  const sizesCount = sizesWatched?.length ?? 0;
  const isProfiles = mode === 'profiles';
  const showInlinePerPackage =
    isProfiles && !useTotalLength && sizesCount <= 1;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-2 pb-5 sm:gap-3">
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

        {showInlinePerPackage && (
          <div className="min-w-0 flex-1 basis-0 sm:min-w-[140px]">
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
              className={`${inputBase} mt-1`}
              {...register(`orders.${idx}.sizes.0.profilesPerPackage`, {
                setValueAs: numericSetValueAs,
              })}
            />
            <FieldError
              message={
                rowErr?.sizes?.[0]?.profilesPerPackage?.message
                  ? t(
                      `validation.${rowErr.sizes[0].profilesPerPackage.message}`,
                    )
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

      {useTotalLength ? (
        <div className="pb-5">
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

      <AdvancedSection idx={idx} mode={mode} t={t} />
    </div>
  );
}

type ProducedFieldName =
  | 'producedProfiles'
  | 'producedPackages'
  | 'producedSheets'
  | 'sheetsPerPallet'
  | 'producedPallets'
  | 'profilesPerPackage';

function AdvancedSection({
  idx,
  mode,
  t,
}: {
  idx: number;
  mode: CalculatorMode;
  t: TFunction;
}) {
  'use no memo';
  const [expanded, setExpanded] = useState(false);
  const { control } = useFormContext<FormValues>();

  const useTotalLength = useWatch({
    control,
    name: `orders.${idx}.useTotalLength`,
    defaultValue: false,
  });

  const isProfiles = mode === 'profiles';

  const sumOf = (arr: { value?: number }[] | undefined) =>
    (arr ?? []).reduce((sum, e) => sum + (e?.value ?? 0), 0);

  // Watch the produced arrays directly — useWatch reacts to every change
  // (RHF mode='onBlur' on the form doesn't suppress watch updates), so the
  // mutually-exclusive disabled flags flip back the moment a field is
  // cleared.
  const watchedProfiles = useWatch({
    control,
    name: `orders.${idx}.producedProfiles`,
  });
  const watchedPackages = useWatch({
    control,
    name: `orders.${idx}.producedPackages`,
  });
  const watchedSheets = useWatch({
    control,
    name: `orders.${idx}.producedSheets`,
  });
  const watchedPerPallet = useWatch({
    control,
    name: `orders.${idx}.sheetsPerPallet`,
  });
  const watchedPallets = useWatch({
    control,
    name: `orders.${idx}.producedPallets`,
  });
  const watchedSizes = useWatch({ control, name: `orders.${idx}.sizes` });
  const watchedProfilesPerPackage = useWatch({
    control,
    name: `orders.${idx}.profilesPerPackage`,
  });
  const perPackageEntered =
    (watchedSizes ?? []).some((s) => (s?.profilesPerPackage ?? 0) > 0) ||
    sumOf(watchedProfilesPerPackage) > 0;

  const profilesEntered = sumOf(watchedProfiles) > 0;
  const packagesEntered = sumOf(watchedPackages) > 0;
  const sheetsEntered = sumOf(watchedSheets) > 0;
  const perPalletEntered = sumOf(watchedPerPallet) > 0;
  const palletsEntered = sumOf(watchedPallets) > 0;
  // The 'rate × count' path (perPallet × pallets, perPackage × packages)
  // is *fully active* only when both rate AND count are filled. The
  // direct path (sheets / profiles) is blocked just in that combined
  // state — knowing the rate alone is fine: the user often types in
  // produced sheets/profiles and reads pallets/pacchi as a derived
  // value. Conversely, a stale count after the rate is cleared keeps
  // its own input disabled (gated by !rateEntered) and stops
  // contributing, so it must not keep the direct path locked either.
  const sheetsBlockedByPalletPath = perPalletEntered && palletsEntered;
  const palletPathBlockedBySheets = sheetsEntered;
  const profilesBlockedByPackagePath =
    perPackageEntered && packagesEntered;
  const packagePathBlockedByProfiles = profilesEntered;

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
          className={`mt-2 rounded-md border border-brand-100 bg-brand-50/40 p-2 sm:p-3 ${
            useTotalLength
              ? ''
              : `grid grid-cols-2 items-end gap-2 sm:gap-3 ${
                  isProfiles ? 'sm:grid-cols-2' : 'sm:grid-cols-3'
                }`
          }`}
        >
          {useTotalLength ? (
            isProfiles ? (
              <BatchRowsArray
                orderIdx={idx}
                countFieldName="producedProfiles"
                rateFieldName="profilesPerPackage"
                totalFieldName="producedPackages"
                countLabel={t('orders.advanced.profilesProduced')}
                lengthLabel={t('orders.profileLength')}
                rateLabel={t('orders.profilesPerPackage')}
                totalLabel={t('orders.advanced.packagesProduced')}
                countDisabled={profilesBlockedByPackagePath}
                rateDisabled={packagePathBlockedByProfiles}
                totalDisabled={
                  packagePathBlockedByProfiles || !perPackageEntered
                }
                t={t}
              />
            ) : (
              <BatchRowsArray
                orderIdx={idx}
                countFieldName="producedSheets"
                rateFieldName="sheetsPerPallet"
                totalFieldName="producedPallets"
                countLabel={t('orders.advanced.sheetsProduced')}
                lengthLabel={t('orders.sheetLength')}
                rateLabel={t('orders.advanced.sheetsPerPallet')}
                totalLabel={t('orders.advanced.palletsProduced')}
                countDisabled={sheetsBlockedByPalletPath}
                rateDisabled={palletPathBlockedBySheets}
                totalDisabled={
                  palletPathBlockedBySheets || !perPalletEntered
                }
                t={t}
              />
            )
          ) : isProfiles ? (
            <>
              <ProducedSizedArray
                fieldName="producedProfiles"
                orderIdx={idx}
                label={t('orders.advanced.profilesProduced')}
                disabled={profilesBlockedByPackagePath}
                showBadge
              />
              <ProducedSizedArray
                fieldName="producedPackages"
                orderIdx={idx}
                label={t('orders.advanced.packagesProduced')}
                disabled={
                  packagePathBlockedByProfiles || !perPackageEntered
                }
              />
            </>
          ) : (
            <>
              <ProducedSizedArray
                fieldName="producedSheets"
                orderIdx={idx}
                label={t('orders.advanced.sheetsProduced')}
                disabled={sheetsBlockedByPalletPath}
                showBadge
              />
              <ProducedSizedArray
                fieldName="sheetsPerPallet"
                orderIdx={idx}
                label={t('orders.advanced.sheetsPerPallet')}
              />
              <ProducedSizedArray
                fieldName="producedPallets"
                orderIdx={idx}
                label={t('orders.advanced.palletsProduced')}
                disabled={
                  palletPathBlockedBySheets || !perPalletEntered
                }
              />
            </>
          )}
        </div>
      )}
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

function ProducedSizedArray({
  fieldName,
  orderIdx,
  label,
  disabled = false,
  showBadge = false,
}: {
  fieldName: ProducedFieldName;
  orderIdx: number;
  label: string;
  disabled?: boolean;
  showBadge?: boolean;
}) {
  'use no memo';
  const { register, control } = useFormContext<FormValues>();
  const sizes = useWatch({ control, name: `orders.${orderIdx}.sizes` });
  const rowsCount = Math.max(sizes?.length ?? 0, 1);

  return (
    <div
      className={`min-w-0 ${disabled ? 'pointer-events-none opacity-40' : ''}`}
    >
      <label className={labelBase}>{label}</label>
      <div className="mt-1 space-y-1.5">
        {Array.from({ length: rowsCount }).map((_, sIdx) => (
          <div
            key={sIdx}
            className={`grid items-center gap-1.5 sm:gap-2 ${showBadge && rowsCount > 1 ? 'grid-cols-[auto_minmax(0,1fr)]' : 'grid-cols-1'}`}
          >
            {showBadge && rowsCount > 1 && (
              <span className="inline-flex h-7 min-w-7 shrink-0 items-center justify-center rounded-md bg-brand-100 px-1.5 text-xs font-bold text-brand-700 sm:h-9 sm:min-w-9 sm:text-sm">
                #{sIdx + 1}
              </span>
            )}
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
          </div>
        ))}
      </div>
    </div>
  );
}

type BatchFieldName =
  | 'producedSheets'
  | 'producedProfiles'
  | 'sheetsPerPallet'
  | 'profilesPerPackage'
  | 'producedPallets'
  | 'producedPackages'
  | 'producedItemLength';

function BatchField({
  label,
  disabled,
  children,
}: {
  label: string;
  disabled: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`min-w-0 ${disabled ? 'pointer-events-none opacity-40' : ''}`}
    >
      <label className={`${labelBase} text-[10px] sm:text-xs`}>{label}</label>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

function BatchInput({
  orderIdx,
  fieldName,
  sIdx,
  disabled,
  min,
}: {
  orderIdx: number;
  fieldName: BatchFieldName;
  sIdx: number;
  disabled: boolean;
  min: '0' | '1';
}) {
  const { register } = useFormContext<FormValues>();
  return (
    <input
      type="number"
      min={min}
      step="1"
      inputMode="numeric"
      disabled={disabled}
      className="w-full min-w-0 rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs text-ink shadow-sm transition focus:border-brand-600 focus:ring-2 focus:ring-brand-200 focus:outline-none sm:px-2.5 sm:py-1.5 sm:text-sm"
      {...register(
        `orders.${orderIdx}.${fieldName}.${sIdx}.value`,
        { setValueAs: numericSetValueAs },
      )}
    />
  );
}

function BatchRowsArray({
  orderIdx,
  countFieldName,
  rateFieldName,
  totalFieldName,
  countLabel,
  lengthLabel,
  rateLabel,
  totalLabel,
  countDisabled,
  rateDisabled,
  totalDisabled,
  t,
}: {
  orderIdx: number;
  countFieldName: 'producedSheets' | 'producedProfiles';
  rateFieldName: 'sheetsPerPallet' | 'profilesPerPackage';
  totalFieldName: 'producedPallets' | 'producedPackages';
  countLabel: string;
  lengthLabel: string;
  rateLabel: string;
  totalLabel: string;
  countDisabled: boolean;
  rateDisabled: boolean;
  totalDisabled: boolean;
  t: TFunction;
}) {
  'use no memo';
  const { control } = useFormContext<FormValues>();

  const counts = useFieldArray({
    control,
    name: `orders.${orderIdx}.${countFieldName}`,
  });
  const lengths = useFieldArray({
    control,
    name: `orders.${orderIdx}.producedItemLength`,
  });
  const rates = useFieldArray({
    control,
    name: `orders.${orderIdx}.${rateFieldName}`,
  });
  const totals = useFieldArray({
    control,
    name: `orders.${orderIdx}.${totalFieldName}`,
  });

  const rows = Math.max(
    counts.fields.length,
    lengths.fields.length,
    rates.fields.length,
    totals.fields.length,
    1,
  );

  const appendAll = () => {
    counts.append({ value: undefined });
    lengths.append({ value: undefined });
    rates.append({ value: undefined });
    totals.append({ value: undefined });
  };
  const removeAll = (i: number) => {
    if (i < counts.fields.length) counts.remove(i);
    if (i < lengths.fields.length) lengths.remove(i);
    if (i < rates.fields.length) rates.remove(i);
    if (i < totals.fields.length) totals.remove(i);
  };

  const btnBase =
    'flex h-7 w-7 shrink-0 items-center justify-center rounded-md border bg-white text-sm font-medium shadow-sm transition disabled:cursor-not-allowed disabled:opacity-40 sm:h-9 sm:w-9 sm:text-base';

  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, sIdx) => {
        return (
          <div key={`${counts.fields[sIdx]?.id ?? 'c'}-${sIdx}`}>
            <div className="mb-1 flex items-center justify-between gap-1">
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-brand-100 px-1.5 text-[10px] font-bold text-brand-700 sm:text-xs">
                #{sIdx + 1}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => removeAll(sIdx)}
                  disabled={rows <= 1}
                  className={`${btnBase} border-neutral-300 text-ink-soft hover:border-danger hover:text-danger disabled:hover:border-neutral-300 disabled:hover:text-ink-soft`}
                  aria-label={t('orders.removeSize')}
                  title={t('orders.removeSize')}
                >
                  −
                </button>
                <button
                  type="button"
                  onClick={appendAll}
                  className={`${btnBase} border-brand-300 font-bold text-brand-700 hover:border-brand-600 hover:bg-brand-50`}
                  aria-label={t('orders.addSize')}
                  title={t('orders.addSize')}
                >
                  +
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 items-end gap-1.5 sm:grid-cols-4 sm:gap-2">
              <BatchField label={countLabel} disabled={countDisabled}>
                <BatchInput
                  orderIdx={orderIdx}
                  fieldName={countFieldName}
                  sIdx={sIdx}
                  disabled={countDisabled}
                  min="0"
                />
              </BatchField>
              <BatchField label={lengthLabel} disabled={countDisabled}>
                <BatchInput
                  orderIdx={orderIdx}
                  fieldName={'producedItemLength' as BatchFieldName}
                  sIdx={sIdx}
                  disabled={countDisabled}
                  min="1"
                />
              </BatchField>
              <BatchField label={rateLabel} disabled={rateDisabled}>
                <BatchInput
                  orderIdx={orderIdx}
                  fieldName={rateFieldName}
                  sIdx={sIdx}
                  disabled={rateDisabled}
                  min="1"
                />
              </BatchField>
              <BatchField label={totalLabel} disabled={totalDisabled}>
                <BatchInput
                  orderIdx={orderIdx}
                  fieldName={totalFieldName}
                  sIdx={sIdx}
                  disabled={totalDisabled}
                  min="0"
                />
              </BatchField>
            </div>
          </div>
        );
      })}
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
          const showPerPackage = isProfiles && sizeFields.length > 1;
          // Mobile: always 4 cols (sheets, length, −, +); perPackage wraps to its own row.
          // sm+ : 5 cols when perPackage shows, otherwise 4.
          const gridCols = showPerPackage
            ? 'grid-cols-[1fr_1fr_auto_auto] sm:grid-cols-[1fr_1fr_1fr_auto_auto]'
            : 'grid-cols-[1fr_1fr_auto_auto]';
          return (
            <div
              key={sizeField.id}
              className={`grid ${gridCols} items-end gap-2 pb-5 sm:gap-3`}
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

              {showPerPackage && (
                <div className="col-span-4 min-w-0 sm:col-span-1">
                  <label className={labelBase}>
                    {t('orders.profilesPerPackage')}
                    {sIdx > 0 && (
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
                    className={`${inputBase} mt-1`}
                    {...register(
                      `orders.${orderIdx}.sizes.${sIdx}.profilesPerPackage`,
                      { setValueAs: numericSetValueAs },
                    )}
                  />
                  <FieldError
                    message={
                      sizeErr?.profilesPerPackage?.message
                        ? t(
                            `validation.${sizeErr.profilesPerPackage.message}`,
                          )
                        : undefined
                    }
                  />
                </div>
              )}

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
