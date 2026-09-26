import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import {
  useFieldArray,
  useFormContext,
  useWatch,
  type FieldErrors,
} from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import SortableItem from './SortableItem';
import type { TFunction } from 'i18next';
import type { FormValues } from '../formSchema';
import type { CalculatorMode } from '../types';
import { makeEmptyOrder, makeEmptySize } from '../utils/defaults';
import FieldError from './FieldError';
import MarqueeText from './MarqueeText';
import SheetScanner from './SheetScanner';
import { numericSetValueAs } from '../utils/numeric';
import { useCatalog } from '../contexts/CatalogContext';
import { stashPiramideImport } from '../lib/piramideImport';
import type { OcrRow } from '../lib/ocr';

// All form inputs share a fixed height: 32px on mobile, 36px on sm+ (matching
// the +/− action buttons). Height controls the size, so no vertical padding.
const inputBase =
  'h-8 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm text-ink shadow-sm transition focus:border-brand-600 focus:ring-2 focus:ring-brand-200 focus:outline-none sm:h-9';
// Size-row inputs sit next to the +/−/✓ action buttons. Fixed height so they
// line up with the buttons — 36px on sm+ (= button height), a smaller 32px on
// mobile (with the buttons also shrunk) so the buttons take less room and the
// number fields get more width. Height controls the size, so no vertical pad.
const sizeInputBase =
  'h-8 w-full min-w-0 rounded-md border border-neutral-300 bg-white px-2 text-xs text-ink shadow-sm transition focus:border-brand-600 focus:ring-2 focus:ring-brand-200 focus:outline-none sm:h-9 sm:px-3 sm:text-sm';
const labelBase =
  'block text-xs font-medium tracking-wide text-ink-soft uppercase';

type OrderError = NonNullable<FieldErrors<FormValues>['orders']>[number];

interface Props {
  mode: CalculatorMode;
  /** When set (tracking a saved/shared calc), renders per-order and per-size
   *  "✓ Completa" buttons that mark that order / size fully produced. */
  onComplete?: (orderId: string, sizeIdx?: number) => void;
  /** The order+size in production (saved calc). When set, orders other than the
   *  active one collapse to a summary card (click to expand). Null → no collapse. */
  activeLoc?: { orderIdx: number; sizeIdx: number } | null;
}

function OrdersList({ mode, onComplete, activeLoc }: Props) {
  'use no memo';
  // Orders the user manually expanded from their collapsed summary.
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(
    () => new Set(),
  );
  const { t } = useTranslation();
  const {
    formState: { errors },
    control,
    setValue,
    register,
  } = useFormContext<FormValues>();

  const { fields, append, remove, move } = useFieldArray({
    control,
    name: 'orders',
  });

  // Global product-name field, toggled from the "Ordini in Coda" header (moved
  // here from the settings panel). Open when explicitly shown or already filled.
  const productName = useWatch({ control, name: 'settings.productName' });
  const [showProductName, setShowProductName] = useState(false);
  const productNameHasValue =
    typeof productName === 'string' && productName.length > 0;
  const productNameOpen = showProductName || productNameHasValue;
  const toggleProductName = () => {
    if (productNameOpen) {
      setShowProductName(false);
      setValue('settings.productName', '', { shouldValidate: true });
    } else {
      setShowProductName(true);
    }
  };

  // Reorder the queue: drag (a press-hold handle, mobile) or ↑/↓ buttons
  // (desktop). Both call useFieldArray.move so RHF state stays consistent.
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = fields.findIndex((f) => f.id === active.id);
    const to = fields.findIndex((f) => f.id === over.id);
    if (from !== -1 && to !== -1) move(from, to);
  };

  const gapMode = useWatch({ control, name: 'settings.gapMode' });
  const watchedOrders = useWatch({ control, name: 'orders' });

  const rootError =
    typeof errors.orders?.message === 'string' ? errors.orders.message : null;

  // After a new order mounts, move focus to its quantity input (Lastre/Profili
  // pz, or the total-length field) instead of the product-name combobox — the
  // name is inherited and stays filled, but the operator's next action is
  // almost always entering the quantity.
  const pendingFocusIdx = useRef<number | null>(null);

  const appendOrder = () => {
    const last = watchedOrders?.[watchedOrders.length - 1];
    pendingFocusIdx.current = fields.length; // index the new order will take
    append(
      makeEmptyOrder(
        mode,
        Boolean(last?.useTotalLength),
        last?.productName ?? '',
      ),
    );
  };

  useEffect(() => {
    const idx = pendingFocusIdx.current;
    if (idx === null) return;
    pendingFocusIdx.current = null;
    document.getElementById(`qty-${idx}`)?.focus();
  }, [fields.length]);

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
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleProductName}
            aria-pressed={productNameOpen}
            title={t('settings.toggle.productName')}
            className={
              productNameOpen
                ? 'rounded-md border border-brand-600 bg-brand-600 px-2.5 py-2 text-xs font-medium text-white shadow-sm transition sm:text-sm'
                : 'rounded-md border border-neutral-300 bg-white px-2.5 py-2 text-xs font-medium text-ink-soft shadow-sm transition hover:border-brand-400 hover:text-ink sm:text-sm'
            }
          >
            <span aria-hidden>✏</span>
            <span className="hidden sm:ml-1 sm:inline">
              {t('settings.toggle.productName')}
            </span>
          </button>
          <button
            ref={topButtonRef}
            type="button"
            onClick={appendOrder}
            title={t('orders.add')}
            className="rounded-md bg-brand-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-700 sm:text-sm"
          >
            <span className="sm:hidden">+</span>
            <span className="hidden sm:inline">{t('orders.add')}</span>
          </button>
        </div>
      </div>

      {productNameOpen && (
        <div className="mb-3 sm:mb-4">
          <label className={labelBase} htmlFor="global-product-name">
            {t('settings.productName')}
          </label>
          <input
            id="global-product-name"
            type="text"
            autoFocus={showProductName && !productNameHasValue}
            placeholder={t(`settings.productNamePlaceholder.${mode}`)}
            className={`${inputBase} mt-1 sm:max-w-md`}
            {...register('settings.productName')}
          />
        </div>
      )}

      {rootError && (
        <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-danger">
          {t(`orders.${rootError}`, { defaultValue: rootError })}
        </p>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={fields.map((f) => f.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-3">
            {fields.map((field, idx) => {
              const rowErr = errors.orders?.[idx];
              const isLast = idx === fields.length - 1;
              const showGap = gapMode === 'withGaps' && !isLast;
              const wo = watchedOrders?.[idx];
              const oName = wo?.productName?.trim();
              const oSizes = wo?.sizes ?? [];
              const oPcs = oSizes.reduce(
                (s, z) => s + (Number(z?.sheets) || 0),
                0,
              );
              // Collapse inactive orders (not the one in production, not manually
              // expanded) to a summary while viewing a saved calc.
              const collapsed =
                !!activeLoc &&
                idx !== activeLoc.orderIdx &&
                !expandedOrders.has(field.id);

              return (
                <SortableItem key={field.id} id={field.id}>
                  {({ setNodeRef, style, handleProps, isDragging }) =>
                    collapsed ? (
                      <div
                        ref={setNodeRef}
                        style={style}
                        className="rounded-lg border border-neutral-200 bg-surface-alt p-3 sm:p-4"
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedOrders((s) => new Set(s).add(field.id))
                          }
                          title={t('orders.expandOrder')}
                          className="flex w-full items-center gap-2 text-left"
                        >
                          <span className="shrink-0 rounded-md bg-brand-600 px-2 py-0.5 text-xs font-semibold text-white">
                            #{idx + 1}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                            {oName || t('orders.order', { n: idx + 1 })}
                          </span>
                          <span className="shrink-0 text-xs text-ink-soft">
                            {wo?.useTotalLength
                              ? `${Number(wo?.totalLengthM) || 0} m`
                              : t('orders.summaryCounts', {
                                  pcs: oPcs,
                                  sizes: oSizes.length,
                                })}
                          </span>
                          <span aria-hidden className="shrink-0 text-ink-soft">
                            ▸
                          </span>
                        </button>
                      </div>
                    ) : (
                      <div
                        ref={setNodeRef}
                        style={style}
                        className={`rounded-lg border border-neutral-200 bg-surface-alt p-3 sm:p-4 ${
                          isDragging ? 'shadow-lg' : ''
                        }`}
                      >
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <div className="flex min-w-0 flex-1 items-center gap-1.5">
                          {fields.length > 1 && (
                            <button
                              type="button"
                              {...handleProps}
                              aria-label={t('orders.reorder')}
                              title={t('orders.reorder')}
                              className="flex h-7 w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded text-base text-neutral-400 transition hover:text-ink-soft active:cursor-grabbing sm:hidden"
                            >
                              ⠿
                            </button>
                          )}
                          <OrderNameField idx={idx} mode={mode} t={t} />
                        </div>
                        <div className="flex items-center gap-2">
                          {fields.length > 1 && (
                            <div className="hidden items-center gap-1 sm:flex">
                              <button
                                type="button"
                                onClick={() => move(idx, idx - 1)}
                                disabled={idx === 0}
                                aria-label={t('orders.moveUp')}
                                title={t('orders.moveUp')}
                                className="flex h-8 w-8 items-center justify-center rounded-md border border-neutral-300 bg-white text-ink-soft shadow-sm transition hover:border-brand-400 hover:text-brand-600 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                ↑
                              </button>
                              <button
                                type="button"
                                onClick={() => move(idx, idx + 1)}
                                disabled={isLast}
                                aria-label={t('orders.moveDown')}
                                title={t('orders.moveDown')}
                                className="flex h-8 w-8 items-center justify-center rounded-md border border-neutral-300 bg-white text-ink-soft shadow-sm transition hover:border-brand-400 hover:text-brand-600 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                ↓
                              </button>
                            </div>
                          )}
                          {onComplete && (
                    <button
                      type="button"
                      onClick={() => {
                        const id = watchedOrders?.[idx]?.id;
                        if (id) onComplete(id);
                      }}
                      title={t('orders.completeOrder')}
                      className="rounded-md border border-success/40 bg-success/10 px-2.5 py-1 text-xs font-semibold text-success shadow-sm transition hover:bg-success/20 sm:px-3 sm:py-1.5 sm:text-sm"
                    >
                      ✓{' '}
                      <span className="hidden sm:inline">
                        {t('orders.completeOrder')}
                      </span>
                    </button>
                  )}
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
                        onCompleteSize={
                          onComplete
                            ? (sizeIdx) => {
                                const id = watchedOrders?.[idx]?.id;
                                if (id) onComplete(id, sizeIdx);
                              }
                            : undefined
                        }
                        activeSizeIdx={
                          activeLoc && idx === activeLoc.orderIdx
                            ? activeLoc.sizeIdx
                            : null
                        }
                      />
                    </div>
                  )}
                </SortableItem>
              );
            })}
          </div>
        </SortableContext>
      </DndContext>

      {showBottomButton && (
        <div className="mt-3 flex justify-end sm:mt-4">
          <button
            type="button"
            onClick={appendOrder}
            title={t('orders.add')}
            className="rounded-md bg-brand-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-700 sm:text-sm"
          >
            <span className="sm:hidden">+</span>
            <span className="hidden sm:inline">{t('orders.add')}</span>
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
  /** Mark a single size fully produced (bound to this order's id). */
  onCompleteSize?: (sizeIdx: number) => void;
  /** For the active order (saved view): the size in production — the others
   *  collapse to a summary and only this one's advanced block is shown. */
  activeSizeIdx?: number | null;
}

function OrderFields({
  idx,
  rowErr,
  showGap,
  mode,
  t,
  onCompleteSize,
  activeSizeIdx,
}: FieldsProps) {
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
  const isFirst = idx === 0;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-2 pb-5 sm:gap-3">
        {isFirst ? (
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
        ) : (
          <CollapsibleInheritField
            fieldPath={`orders.${idx}.speedMPerMin`}
            icon="⚡"
            label={t('orders.speed')}
            inheritLabel={t('orders.optionalInherit')}
            inputProps={{
              min: '0',
              step: '0.1',
              inputMode: 'decimal',
            }}
            errorMessage={
              rowErr?.speedMPerMin?.message
                ? t(`validation.${rowErr.speedMPerMin.message}`)
                : undefined
            }
          />
        )}

        {showInlinePerPackage &&
          (isFirst ? (
            <div className="min-w-0 flex-1 basis-0 sm:min-w-[140px]">
              <label className={labelBase}>
                {t('orders.profilesPerPackage')}
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
          ) : (
            <CollapsibleInheritField
              fieldPath={`orders.${idx}.sizes.0.profilesPerPackage`}
              icon="📦"
              label={t('orders.profilesPerPackage')}
              inheritLabel={t('orders.optionalInherit')}
              inputProps={{ min: '1', step: '1', inputMode: 'numeric' }}
              errorMessage={
                rowErr?.sizes?.[0]?.profilesPerPackage?.message
                  ? t(
                      `validation.${rowErr.sizes[0].profilesPerPackage.message}`,
                    )
                  : undefined
              }
            />
          ))}

        {isProfiles && (
          <CollapsibleInheritField
            fieldPath={`orders.${idx}.cavity`}
            icon="🔢"
            label={t('orders.cavity')}
            inputProps={{ min: '1', step: '1', inputMode: 'numeric' }}
            errorMessage={
              rowErr?.cavity?.message
                ? t(`validation.${rowErr.cavity.message}`)
                : undefined
            }
          />
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
        <>
          <div className="pb-5">
            <label className={labelBase}>{t('orders.totalLength')}</label>
            <input
              id={`qty-${idx}`}
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
          {/* Advanced section sits above the (nonexistent) scanner here too,
              matching the sizes layout order. */}
          <AdvancedSection idx={idx} mode={mode} t={t} />
        </>
      ) : (
        // Order matters: sizes → advanced → scanner. AdvancedSection is passed
        // in so it renders between the size rows and the photo-scanner block
        // (more convenient reach on mobile), while the scanner stays coupled to
        // the sizes field-array state where its replace() lives.
        <SizesFieldArray
          orderIdx={idx}
          mode={mode}
          t={t}
          onCompleteSize={onCompleteSize}
          activeSizeIdx={activeSizeIdx}
          afterSizes={
            <AdvancedSection
              idx={idx}
              mode={mode}
              t={t}
              activeSizeIdx={activeSizeIdx}
            />
          }
        />
      )}
    </div>
  );
}

// Collapsible field for optional, inheritance-backed numbers (speed,
// profilesPerPackage). Shows a square icon button when value is empty;
// clicking it expands an input. On blur, if still empty, collapses back.
// Used only for idx > 0 so that creating a new order doesn't auto-focus
// these fields — mobile users were getting trapped editing speed on each
// new order (a known friction point on touch screens).
function CollapsibleInheritField({
  fieldPath,
  icon,
  label,
  inheritLabel,
  inputProps,
  errorMessage,
}: {
  fieldPath:
    | `orders.${number}.speedMPerMin`
    | `orders.${number}.sizes.0.profilesPerPackage`
    | `orders.${number}.cavity`;
  icon: string;
  label: string;
  /** Optional hint shown in parentheses after the label and as the
   *  collapsed-button tooltip. Omit to render just the bare label (e.g.
   *  Cavità, where the field name is already self-explanatory). */
  inheritLabel?: string;
  inputProps: {
    min: string;
    step: string;
    inputMode: 'decimal' | 'numeric';
  };
  errorMessage?: string;
}) {
  'use no memo';
  const { register, control } = useFormContext<FormValues>();
  const value = useWatch({ control, name: fieldPath });
  const hasValue = value !== undefined && value !== null;
  const [open, setOpen] = useState(false);
  const showInput = open || hasValue;

  const titleText = inheritLabel ? `${label} (${inheritLabel})` : label;

  if (!showInput) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={titleText}
        aria-label={titleText}
        className="flex h-9 w-9 shrink-0 items-center justify-center self-end rounded-md border border-neutral-300 bg-white text-ink-soft shadow-sm transition hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700"
      >
        {/* leading-none + block strip the emoji line-height so it sits dead
            centre instead of riding the text baseline. */}
        <span aria-hidden className="block text-base leading-none">
          {icon}
        </span>
      </button>
    );
  }

  const reg = register(fieldPath, { setValueAs: numericSetValueAs });
  return (
    <div className="min-w-0 flex-1 basis-0 sm:min-w-[140px]">
      <label className={labelBase}>
        {label}
        {inheritLabel && (
          <span className="ml-1 normal-case text-ink-soft">
            ({inheritLabel})
          </span>
        )}
      </label>
      <input
        type="number"
        min={inputProps.min}
        step={inputProps.step}
        inputMode={inputProps.inputMode}
        autoFocus={open && !hasValue}
        className={`${inputBase} mt-1`}
        {...reg}
        onBlur={(e) => {
          // RHF blur first (validation, dirty/touched flags), then collapse
          // only if the input was actually left empty. Reading the DOM value
          // directly avoids stale useWatch state and intermediate values
          // (typing "1." briefly parses to 1 — we shouldn't collapse on that).
          reg.onBlur(e);
          if (e.target.value === '') setOpen(false);
        }}
      />
      <FieldError message={errorMessage} />
    </div>
  );
}

function AdvancedSection({
  idx,
  mode,
  t,
  activeSizeIdx,
}: {
  idx: number;
  mode: CalculatorMode;
  t: TFunction;
  /** When set (active order in a saved view), only this size's block is shown. */
  activeSizeIdx?: number | null;
}) {
  'use no memo';
  const { control, getValues } = useFormContext<FormValues>();

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

  // Produced values already present at mount → a restored / advanced calc.
  // Read synchronously via getValues (reliable at mount, unlike useWatch's
  // first render) so the advanced section auto-opens and the produced block is
  // highlighted, making the time-based auto-fill obvious.
  const [hadProducedAtMount] = useState(() => {
    const o = getValues(`orders.${idx}`);
    const sum = (a?: { value?: number }[]) =>
      (a ?? []).reduce((s, e) => s + (e?.value ?? 0), 0);
    return (
      sum(o?.producedProfiles) > 0 ||
      sum(o?.producedPackages) > 0 ||
      sum(o?.producedSheets) > 0 ||
      sum(o?.producedPallets) > 0
    );
  });
  const [expanded, setExpanded] = useState(hadProducedAtMount);
  // The 'rate × count' path (perPallet × pallets, perPackage × packages)
  // is *fully active* only when both rate AND count are filled. The
  // direct path (sheets / profiles) is blocked just in that combined
  // state — knowing the rate alone is fine: the user often types in
  // produced sheets/profiles and reads pallets/pacchi as a derived
  // value. Conversely, a stale count after the rate is cleared keeps
  // its own input disabled (gated by !rateEntered) and stops
  // contributing, so it must not keep the direct path locked either.
  // NB: the *rate* input (sheetsPerPallet / profilesPerPackage) is never
  // disabled — it also drives the total pallet/package count, so the user
  // must be able to type it alongside a direct produced-sheets/profiles value.
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
          className={`mt-2 rounded-md border bg-brand-50/40 p-2 sm:p-3 ${
            useTotalLength ? '' : 'space-y-3'
          } ${
            hadProducedAtMount
              ? 'border-amber-300 ring-2 ring-amber-300'
              : 'border-brand-100'
          }`}
        >
          {hadProducedAtMount && (
            <p className="mb-2 text-[11px] font-medium text-amber-700">
              ↳ {t('orders.advanced.autoFilledNote')}
            </p>
          )}
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
                rateDisabled={false}
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
                rateDisabled={false}
                totalDisabled={
                  palletPathBlockedBySheets || !perPalletEntered
                }
                t={t}
              />
            )
          ) : (
            (watchedSizes ?? [{}]).map((_, sIdx) =>
              activeSizeIdx != null && sIdx !== activeSizeIdx ? null : isProfiles ? (
                <SizeAdvancedBlockProfili
                  key={sIdx}
                  orderIdx={idx}
                  sizeIdx={sIdx}
                  totalSizes={watchedSizes?.length ?? 1}
                  countDisabled={profilesBlockedByPackagePath}
                  totalDisabled={
                    packagePathBlockedByProfiles || !perPackageEntered
                  }
                  countLabel={t('orders.advanced.profilesProduced')}
                  totalLabel={t('orders.advanced.packagesProduced')}
                  t={t}
                />
              ) : (
                <SizeAdvancedBlockListi
                  key={sIdx}
                  orderIdx={idx}
                  sizeIdx={sIdx}
                  totalSizes={watchedSizes?.length ?? 1}
                  countDisabled={sheetsBlockedByPalletPath}
                  rateDisabled={false}
                  totalDisabled={
                    palletPathBlockedBySheets || !perPalletEntered
                  }
                  countLabel={t('orders.advanced.sheetsProduced')}
                  rateLabel={t('orders.advanced.sheetsPerPallet')}
                  totalLabel={t('orders.advanced.palletsProduced')}
                  t={t}
                />
              ),
            )
          )}
        </div>
      )}
    </div>
  );
}

function OrderNameField({
  idx,
  mode,
  t,
}: {
  idx: number;
  mode: CalculatorMode;
  t: TFunction;
}) {
  'use no memo';
  const { register, control, setValue } = useFormContext<FormValues>();
  const value = useWatch({
    control,
    name: `orders.${idx}.productName`,
    defaultValue: '',
  });
  const hasValue = typeof value === 'string' && value.length > 0;
  const [open, setOpen] = useState(false);
  const showInput = open || hasValue;
  const { products } = useCatalog();
  // Filter catalog suggestions by active tab (sheets vs profiles).
  const filtered = useMemo(
    () => products.filter(p => p.category === mode),
    [products, mode],
  );

  // Custom combobox (replaces native <datalist>, which on iOS Safari /
  // Android Chrome shows suggestions in the keyboard smart-bar instead of a
  // dropdown — confusing UX). Same behaviour on every device now.
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  // Phone-only: expand the suggestion list into a full-screen picker so long
  // product names are fully readable. Toggled by a button under the list.
  const [fullScreen, setFullScreen] = useState(false);

  // Close on click outside (also handles taps on mobile via mousedown).
  useEffect(() => {
    if (!dropdownOpen) return;
    function onDocMouseDown(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [dropdownOpen]);

  // Filter visible suggestions by what's currently in the input.
  const query = (typeof value === 'string' ? value : '').toLowerCase().trim();
  const suggestions = useMemo(
    () =>
      query === ''
        ? filtered
        : filtered.filter((p) => p.name.toLowerCase().includes(query)),
    [filtered, query],
  );

  const pickProduct = (p: (typeof filtered)[number]) => {
    setValue(`orders.${idx}.productName`, p.name, {
      shouldValidate: true,
      shouldDirty: true,
    });
    setValue(`orders.${idx}.speedMPerMin`, p.speed_m_per_min, {
      shouldValidate: true,
      shouldDirty: true,
    });
    // Auto-fill cavity for profiles when the product has one configured.
    // Setting undefined when the catalog entry has no cavity keeps the
    // user's previous value (inheritance) instead of forcing it back to 1.
    if (mode === 'profiles' && p.cavity != null && p.cavity > 0) {
      setValue(`orders.${idx}.cavity`, p.cavity, {
        shouldValidate: true,
        shouldDirty: true,
      });
    }
    setDropdownOpen(false);
  };

  const reg = register(`orders.${idx}.productName`);

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
        <div ref={wrapperRef} className="relative min-w-0 flex-1">
          <input
            type="text"
            autoComplete="off"
            autoFocus={open && !hasValue}
            placeholder={t('orders.productName')}
            className="w-full min-w-0 rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs text-ink shadow-sm transition focus:border-brand-600 focus:ring-2 focus:ring-brand-200 focus:outline-none sm:px-3 sm:py-1.5 sm:text-sm"
            {...reg}
            onFocus={() => {
              if (filtered.length > 0) setDropdownOpen(true);
            }}
            onChange={(e) => {
              reg.onChange(e);
              if (filtered.length > 0) setDropdownOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setDropdownOpen(false);
            }}
          />
          {dropdownOpen && suggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 z-30 mt-1 overflow-hidden rounded-md border border-neutral-200 bg-white shadow-lg">
              <ul
                role="listbox"
                className="max-h-60 overflow-y-auto py-1"
              >
                {suggestions.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => pickProduct(p)}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs text-ink transition hover:bg-brand-50 hover:text-brand-700 sm:text-sm"
                    >
                      <MarqueeText text={p.name} />
                      <span className="shrink-0 text-[10px] font-medium text-ink-soft sm:text-xs">
                        {p.speed_m_per_min} m/min
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {/* Phone-only: always-visible button to open the full-screen picker. */}
              <button
                type="button"
                onClick={() => setFullScreen(true)}
                className="flex w-full items-center justify-center gap-1 border-t border-neutral-100 px-3 py-2 text-xs font-medium text-brand-700 transition hover:bg-brand-50 sm:hidden"
              >
                ⤢ {t('orders.expandList')}
              </button>
            </div>
          )}
        </div>
      )}

      {fullScreen &&
        createPortal(
          <div className="fixed inset-0 z-50 flex flex-col bg-white">
            <div className="flex items-center justify-between gap-2 border-b border-neutral-200 px-4 py-3">
              <span className="text-sm font-semibold text-ink">
                {t('orders.productName')}
              </span>
              <button
                type="button"
                onClick={() => setFullScreen(false)}
                aria-label={t('actions.close')}
                className="rounded-md px-3 py-1.5 text-lg leading-none text-ink-soft transition hover:bg-neutral-100"
              >
                ✕
              </button>
            </div>
            <div className="border-b border-neutral-100 p-3">
              <input
                type="text"
                autoFocus
                autoComplete="off"
                value={typeof value === 'string' ? value : ''}
                placeholder={t('orders.productName')}
                onChange={(e) =>
                  setValue(`orders.${idx}.productName`, e.target.value, {
                    shouldValidate: true,
                    shouldDirty: true,
                  })
                }
                className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-ink shadow-sm focus:border-brand-600 focus:ring-2 focus:ring-brand-200 focus:outline-none"
              />
            </div>
            <ul className="flex-1 overflow-y-auto">
              {suggestions.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => {
                      pickProduct(p);
                      setFullScreen(false);
                      setDropdownOpen(false);
                    }}
                    className="flex w-full items-center justify-between gap-3 border-b border-neutral-100 px-4 py-3 text-left text-sm text-ink transition hover:bg-brand-50 hover:text-brand-700"
                  >
                    <span className="min-w-0 flex-1 break-words">{p.name}</span>
                    <span className="shrink-0 text-xs font-medium text-ink-soft">
                      {p.speed_m_per_min} m/min
                    </span>
                  </button>
                </li>
              ))}
              {suggestions.length === 0 && (
                <li className="px-4 py-3 text-sm text-ink-soft">—</li>
              )}
            </ul>
          </div>,
          document.body,
        )}
    </div>
  );
}

// ProducedSizedArray was removed — sizes-mode advanced rows are now grouped
// per size in SizeAdvancedBlock(Listi|Profili) with their own ± controls
// (multiple entries per size, tagged via entry.sizeIndex). The old type is
// kept on the BatchFieldName union for the useTotalLength BatchRowsArray.

// Pick rows that belong to a given size, honoring entry.sizeIndex (with
// fallback to array index for legacy entries without the tag). Returns the
// list of underlying array positions for those rows.
function arrayPositionsForSize(
  entries: { sizeIndex?: number }[] | undefined,
  sizeIdx: number,
): number[] {
  if (!entries || entries.length === 0) return [];
  const positions: number[] = [];
  for (let i = 0; i < entries.length; i++) {
    const tag = entries[i]?.sizeIndex ?? i;
    if (tag === sizeIdx) positions.push(i);
  }
  return positions;
}

const sizeBlockInputCls =
  'h-8 w-full min-w-0 rounded-md border border-neutral-300 bg-white px-2 text-xs text-ink shadow-sm transition focus:border-brand-600 focus:ring-2 focus:ring-brand-200 focus:outline-none sm:h-9 sm:px-3 sm:text-sm';
const sizeBlockBtnBase =
  'flex h-8 w-8 shrink-0 items-center justify-center rounded-md border bg-white text-sm font-medium shadow-sm transition disabled:cursor-not-allowed disabled:opacity-40 sm:h-9 sm:w-9 sm:text-base';

function SizeBlockHeader({
  sizeIdx,
  totalSizes,
  cols,
  labels,
}: {
  sizeIdx: number;
  totalSizes: number;
  cols: string;
  labels: { label: string; disabled?: boolean }[];
}) {
  return (
    <>
      {totalSizes > 1 && (
        <div className="mb-1 flex items-center">
          <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-brand-100 px-1.5 text-xs font-bold text-brand-700">
            #{sizeIdx + 1}
          </span>
        </div>
      )}
      <div className={`grid ${cols} items-end gap-1.5 sm:gap-2`}>
        {labels.map((l, i) => (
          <label
            key={i}
            className={`${labelBase} ${l.disabled ? 'opacity-40' : ''}`}
          >
            {l.label}
          </label>
        ))}
        <span />
        <span />
      </div>
    </>
  );
}

function SizeAdvancedBlockListi({
  orderIdx,
  sizeIdx,
  totalSizes,
  countDisabled,
  rateDisabled,
  totalDisabled,
  countLabel,
  rateLabel,
  totalLabel,
  t,
}: {
  orderIdx: number;
  sizeIdx: number;
  totalSizes: number;
  countDisabled: boolean;
  rateDisabled: boolean;
  totalDisabled: boolean;
  countLabel: string;
  rateLabel: string;
  totalLabel: string;
  t: TFunction;
}) {
  'use no memo';
  const { register, control } = useFormContext<FormValues>();
  const sheets = useFieldArray({
    control,
    name: `orders.${orderIdx}.producedSheets`,
  });
  const rates = useFieldArray({
    control,
    name: `orders.${orderIdx}.sheetsPerPallet`,
  });
  const totals = useFieldArray({
    control,
    name: `orders.${orderIdx}.producedPallets`,
  });

  const watchedSheets = useWatch({
    control,
    name: `orders.${orderIdx}.producedSheets`,
  });
  const positions = arrayPositionsForSize(watchedSheets, sizeIdx);
  // Always render at least one row, even if no entries exist yet for this
  // size (e.g. brand-new order, brand-new size).
  const rows: (number | null)[] = positions.length > 0 ? positions : [null];

  const appendAll = () => {
    sheets.append({ value: undefined, sizeIndex: sizeIdx });
    rates.append({ value: undefined, sizeIndex: sizeIdx });
    totals.append({ value: undefined, sizeIndex: sizeIdx });
  };

  // Seed an empty entry for this size so its inputs are directly typeable —
  // every size behaves like the first, without needing a manual "+" first.
  const seededRef = useRef(false);
  useEffect(() => {
    if (!seededRef.current && positions.length === 0) {
      seededRef.current = true;
      appendAll();
    }
    // once, on mount of this size block
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const removeAll = (rowIdx: number) => {
    const arrayPos = rows[rowIdx];
    if (arrayPos === null || arrayPos === undefined) return;
    sheets.remove(arrayPos);
    rates.remove(arrayPos);
    totals.remove(arrayPos);
  };

  const cols = 'grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto_auto]';
  return (
    <div>
      <SizeBlockHeader
        sizeIdx={sizeIdx}
        totalSizes={totalSizes}
        cols={cols}
        labels={[
          { label: countLabel, disabled: countDisabled },
          { label: rateLabel, disabled: rateDisabled },
          { label: totalLabel, disabled: totalDisabled },
          { label: '' },
          { label: '' },
        ]}
      />
      <div className="mt-0.5 space-y-1.5">
        {rows.map((arrayPos, rowIdx) => (
          <div
            key={`${sizeIdx}-${rowIdx}-${arrayPos ?? 'new'}`}
            className={`grid ${cols} items-center gap-1.5 sm:gap-2`}
          >
            {arrayPos === null ? (
              <>
                <input
                  type="number"
                  disabled
                  className={`${sizeBlockInputCls} opacity-40`}
                  placeholder="—"
                />
                <input
                  type="number"
                  disabled
                  className={`${sizeBlockInputCls} opacity-40`}
                  placeholder="—"
                />
                <input
                  type="number"
                  disabled
                  className={`${sizeBlockInputCls} opacity-40`}
                  placeholder="—"
                />
              </>
            ) : (
              <>
                <input
                  type="number"
                  min="0"
                  step="1"
                  inputMode="numeric"
                  disabled={countDisabled}
                  className={`${sizeBlockInputCls} ${countDisabled ? 'opacity-40 pointer-events-none' : ''}`}
                  {...register(
                    `orders.${orderIdx}.producedSheets.${arrayPos}.value`,
                    { setValueAs: numericSetValueAs },
                  )}
                />
                <input
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  disabled={rateDisabled}
                  className={`${sizeBlockInputCls} ${rateDisabled ? 'opacity-40 pointer-events-none' : ''}`}
                  {...register(
                    `orders.${orderIdx}.sheetsPerPallet.${arrayPos}.value`,
                    { setValueAs: numericSetValueAs },
                  )}
                />
                <input
                  type="number"
                  min="0"
                  step="1"
                  inputMode="numeric"
                  disabled={totalDisabled}
                  className={`${sizeBlockInputCls} ${totalDisabled ? 'opacity-40 pointer-events-none' : ''}`}
                  {...register(
                    `orders.${orderIdx}.producedPallets.${arrayPos}.value`,
                    { setValueAs: numericSetValueAs },
                  )}
                />
              </>
            )}
            <button
              type="button"
              onClick={() => removeAll(rowIdx)}
              disabled={rows.length <= 1 || arrayPos === null}
              className={`${sizeBlockBtnBase} border-neutral-300 text-ink-soft hover:border-danger hover:text-danger`}
              aria-label={t('orders.removeSize')}
              title={t('orders.removeSize')}
            >
              −
            </button>
            <button
              type="button"
              onClick={appendAll}
              className={`${sizeBlockBtnBase} border-brand-300 font-bold text-brand-700 hover:border-brand-600 hover:bg-brand-50`}
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

function SizeAdvancedBlockProfili({
  orderIdx,
  sizeIdx,
  totalSizes,
  countDisabled,
  totalDisabled,
  countLabel,
  totalLabel,
  t,
}: {
  orderIdx: number;
  sizeIdx: number;
  totalSizes: number;
  countDisabled: boolean;
  totalDisabled: boolean;
  countLabel: string;
  totalLabel: string;
  t: TFunction;
}) {
  'use no memo';
  const { register, control } = useFormContext<FormValues>();
  const counts = useFieldArray({
    control,
    name: `orders.${orderIdx}.producedProfiles`,
  });
  const totals = useFieldArray({
    control,
    name: `orders.${orderIdx}.producedPackages`,
  });

  const watchedCounts = useWatch({
    control,
    name: `orders.${orderIdx}.producedProfiles`,
  });
  const positions = arrayPositionsForSize(watchedCounts, sizeIdx);
  const rows: (number | null)[] = positions.length > 0 ? positions : [null];

  const appendAll = () => {
    counts.append({ value: undefined, sizeIndex: sizeIdx });
    totals.append({ value: undefined, sizeIndex: sizeIdx });
  };

  // Seed an empty entry for this size so its inputs are directly typeable —
  // every size behaves like the first, without needing a manual "+" first.
  const seededRef = useRef(false);
  useEffect(() => {
    if (!seededRef.current && positions.length === 0) {
      seededRef.current = true;
      appendAll();
    }
    // once, on mount of this size block
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const removeAll = (rowIdx: number) => {
    const arrayPos = rows[rowIdx];
    if (arrayPos === null || arrayPos === undefined) return;
    counts.remove(arrayPos);
    totals.remove(arrayPos);
  };

  const cols = 'grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto]';
  return (
    <div>
      <SizeBlockHeader
        sizeIdx={sizeIdx}
        totalSizes={totalSizes}
        cols={cols}
        labels={[
          { label: countLabel, disabled: countDisabled },
          { label: totalLabel, disabled: totalDisabled },
          { label: '' },
          { label: '' },
        ]}
      />
      <div className="mt-0.5 space-y-1.5">
        {rows.map((arrayPos, rowIdx) => (
          <div
            key={`${sizeIdx}-${rowIdx}-${arrayPos ?? 'new'}`}
            className={`grid ${cols} items-center gap-1.5 sm:gap-2`}
          >
            {arrayPos === null ? (
              <>
                <input
                  type="number"
                  disabled
                  className={`${sizeBlockInputCls} opacity-40`}
                  placeholder="—"
                />
                <input
                  type="number"
                  disabled
                  className={`${sizeBlockInputCls} opacity-40`}
                  placeholder="—"
                />
              </>
            ) : (
              <>
                <input
                  type="number"
                  min="0"
                  step="1"
                  inputMode="numeric"
                  disabled={countDisabled}
                  className={`${sizeBlockInputCls} ${countDisabled ? 'opacity-40 pointer-events-none' : ''}`}
                  {...register(
                    `orders.${orderIdx}.producedProfiles.${arrayPos}.value`,
                    { setValueAs: numericSetValueAs },
                  )}
                />
                <input
                  type="number"
                  min="0"
                  step="1"
                  inputMode="numeric"
                  disabled={totalDisabled}
                  className={`${sizeBlockInputCls} ${totalDisabled ? 'opacity-40 pointer-events-none' : ''}`}
                  {...register(
                    `orders.${orderIdx}.producedPackages.${arrayPos}.value`,
                    { setValueAs: numericSetValueAs },
                  )}
                />
              </>
            )}
            <button
              type="button"
              onClick={() => removeAll(rowIdx)}
              disabled={rows.length <= 1 || arrayPos === null}
              className={`${sizeBlockBtnBase} border-neutral-300 text-ink-soft hover:border-danger hover:text-danger`}
              aria-label={t('orders.removeSize')}
              title={t('orders.removeSize')}
            >
              −
            </button>
            <button
              type="button"
              onClick={appendAll}
              className={`${sizeBlockBtnBase} border-brand-300 font-bold text-brand-700 hover:border-brand-600 hover:bg-brand-50`}
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
      className="h-8 w-full min-w-0 rounded-md border border-neutral-300 bg-white px-2 text-xs text-ink shadow-sm transition focus:border-brand-600 focus:ring-2 focus:ring-brand-200 focus:outline-none sm:h-9 sm:px-2.5 sm:text-sm"
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
  afterSizes,
  onCompleteSize,
  activeSizeIdx,
}: {
  orderIdx: number;
  mode: CalculatorMode;
  t: TFunction;
  /** Rendered between the size rows and the photo-scanner block (used for the
   *  advanced section, so its order is sizes → advanced → scanner). */
  afterSizes?: ReactNode;
  /** Mark a single size fully produced (bound to this order's id). Renders a
   *  per-size "✓" button after the +/− controls (multi-size orders only). */
  onCompleteSize?: (sizeIdx: number) => void;
  /** Active order (saved view): the size in production — other sizes collapse
   *  to a summary (click to expand). Null → all sizes shown. */
  activeSizeIdx?: number | null;
}) {
  'use no memo';
  // Sizes the user manually expanded from their collapsed summary.
  const [expandedSizes, setExpandedSizes] = useState<Set<string>>(
    () => new Set(),
  );
  const {
    register,
    formState: { errors },
    control,
  } = useFormContext<FormValues>();

  const {
    fields: sizeFields,
    insert: insertSize,
    remove: removeSize,
    replace: replaceSize,
    move: moveSize,
  } = useFieldArray({
    control,
    name: `orders.${orderIdx}.sizes`,
  });

  // Reorder the sizes within this order: drag (press-hold handle, mobile) or
  // ↑/↓ buttons (desktop), both via useFieldArray.move.
  const sizeSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const handleSizeDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = sizeFields.findIndex((f) => f.id === active.id);
    const to = sizeFields.findIndex((f) => f.id === over.id);
    if (from !== -1 && to !== -1) moveSize(from, to);
  };

  const watchedSizes = useWatch({ control, name: `orders.${orderIdx}.sizes` });

  // Photo scanner + "open in Piramide" collapse behind a toggle (like Calcolo
  // avanzato) so they don't take space until needed.
  const [scanOpen, setScanOpen] = useState(false);

  // Fill sizes from a scanned photo: keep any already-filled rows, then append
  // the scanned {length, qty} pairs as {length, sheets}.
  const onScanRows = (rows: OcrRow[]) => {
    const kept = (watchedSizes ?? []).filter(
      (s) => Number(s?.sheets) > 0 || Number(s?.length) > 0,
    );
    const scanned = rows.map((r) => ({
      sheets: r.qty,
      length: r.length,
      profilesPerPackage: undefined,
    }));
    replaceSize([...kept, ...scanned] as never);
  };

  // "Open in Piramide": hand this order's sizes to the /piramide page. Only for
  // sheets orders (Piramide packs lastre), when the company has Piramide
  // enabled and at least one size has both a length and a quantity.
  const navigate = useNavigate();
  const { company, settings } = useCatalog();
  const orderName = useWatch({
    control,
    name: `orders.${orderIdx}.productName`,
  }) as string | undefined;
  const piramideRows = (watchedSizes ?? [])
    .map((s) => ({ length: Number(s?.length), qty: Number(s?.sheets) }))
    .filter((r) => r.length > 0 && r.qty > 0);
  const canOpenPiramide =
    mode === 'sheets' && settings.showPiramide && piramideRows.length > 0;
  const openInPiramide = () => {
    stashPiramideImport({
      label: orderName?.trim() || undefined,
      rows: piramideRows,
    });
    navigate(
      company
        ? `/piramide?company=${encodeURIComponent(company.slug)}`
        : '/piramide',
    );
  };

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

      <DndContext
        sensors={sizeSensors}
        collisionDetection={closestCenter}
        onDragEnd={handleSizeDragEnd}
      >
        <SortableContext
          items={sizeFields.map((f) => f.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2">
            {sizeFields.map((sizeField, sIdx) => {
              const sizeErr = orderErr?.sizes?.[sIdx];
              const showPerPackage = isProfiles && sizeFields.length > 1;
              // Per-size "✓" completa button adds one more auto column (multi-
              // size only). Class strings are literal so Tailwind emits them.
              const showSizeComplete = !!onCompleteSize && sizeFields.length > 1;
              const canReorder = sizeFields.length > 1;
              const gridCols = showPerPackage
                ? showSizeComplete
                  ? 'grid-cols-[1fr_1fr_auto_auto_auto] sm:grid-cols-[1fr_1fr_1fr_auto_auto_auto]'
                  : 'grid-cols-[1fr_1fr_auto_auto] sm:grid-cols-[1fr_1fr_1fr_auto_auto]'
                : showSizeComplete
                  ? 'grid-cols-[1fr_1fr_auto_auto_auto]'
                  : 'grid-cols-[1fr_1fr_auto_auto]';
              // Collapse non-active sizes (saved view) to a summary line.
              const sizeCollapsed =
                activeSizeIdx != null &&
                sIdx !== activeSizeIdx &&
                !expandedSizes.has(sizeField.id);
              const zSheets = Number(watchedSizes?.[sIdx]?.sheets) || 0;
              const zLen = Number(watchedSizes?.[sIdx]?.length) || 0;
              return (
                <SortableItem key={sizeField.id} id={sizeField.id}>
                  {({ setNodeRef, style, handleProps }) =>
                    sizeCollapsed ? (
                      <div
                        ref={setNodeRef}
                        style={style}
                        id={`size-${orderIdx}-${sIdx}`}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedSizes((s) =>
                              new Set(s).add(sizeField.id),
                            )
                          }
                          title={t('orders.expandOrder')}
                          className="flex w-full items-center gap-2 rounded-md border border-neutral-200 bg-white px-3 py-2 text-left"
                        >
                          <span className="shrink-0 rounded bg-brand-100 px-1.5 py-0.5 text-[10px] font-bold text-brand-700">
                            #{sIdx + 1}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-sm text-ink">
                            {zSheets} × {zLen} mm
                          </span>
                          <span aria-hidden className="shrink-0 text-ink-soft">
                            ▸
                          </span>
                        </button>
                      </div>
                    ) : (
                    <div
                      ref={setNodeRef}
                      style={style}
                      id={`size-${orderIdx}-${sIdx}`}
                      className="flex items-end gap-2"
                    >
                      {canReorder && (
                        <div className="flex shrink-0 items-end gap-1 pb-5">
                          <button
                            type="button"
                            {...handleProps}
                            aria-label={t('orders.reorder')}
                            title={t('orders.reorder')}
                            className="flex h-8 w-4 cursor-grab touch-none items-center justify-center text-neutral-400 transition hover:text-ink-soft active:cursor-grabbing sm:hidden"
                          >
                            ⠿
                          </button>
                          <div className="hidden flex-col gap-0.5 sm:flex">
                            <button
                              type="button"
                              onClick={() => moveSize(sIdx, sIdx - 1)}
                              disabled={sIdx === 0}
                              aria-label={t('orders.moveUp')}
                              title={t('orders.moveUp')}
                              className="flex h-[17px] w-6 items-center justify-center rounded border border-neutral-300 bg-white text-[10px] text-ink-soft transition hover:border-brand-400 hover:text-brand-600 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              onClick={() => moveSize(sIdx, sIdx + 1)}
                              disabled={sIdx === sizeFields.length - 1}
                              aria-label={t('orders.moveDown')}
                              title={t('orders.moveDown')}
                              className="flex h-[17px] w-6 items-center justify-center rounded border border-neutral-300 bg-white text-[10px] text-ink-soft transition hover:border-brand-400 hover:text-brand-600 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              ↓
                            </button>
                          </div>
                        </div>
                      )}
                      <div
                        className={`grid ${gridCols} min-w-0 flex-1 items-end gap-2 pb-5 sm:gap-3`}
                      >
                        <div className="min-w-0">
                <label className={labelBase}>{sheetsLabel}</label>
                <input
                  id={sIdx === 0 ? `qty-${orderIdx}` : undefined}
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  className={`${sizeInputBase} mt-1`}
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
                  className={`${sizeInputBase} mt-1`}
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
                <div
                  className={`min-w-0 sm:col-span-1 ${
                    showSizeComplete ? 'col-span-5' : 'col-span-4'
                  }`}
                >
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
                    className={`${sizeInputBase} mt-1`}
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
                className="flex h-8 w-8 items-center justify-center rounded-md border border-neutral-300 bg-white text-base font-medium text-ink-soft shadow-sm transition hover:border-danger hover:text-danger disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-neutral-300 disabled:hover:text-ink-soft sm:h-9 sm:w-9"
                aria-label={t('orders.removeSize')}
                title={t('orders.removeSize')}
              >
                −
              </button>

              <button
                type="button"
                onClick={() => insertSize(sIdx + 1, makeEmptySize())}
                className="flex h-8 w-8 items-center justify-center rounded-md border border-brand-300 bg-white text-base font-bold text-brand-700 shadow-sm transition hover:border-brand-600 hover:bg-brand-50 sm:h-9 sm:w-9"
                aria-label={t('orders.addSize')}
                title={t('orders.addSize')}
              >
                +
              </button>

              {showSizeComplete && (
                <button
                  type="button"
                  onClick={() => onCompleteSize?.(sIdx)}
                  className="flex h-8 w-8 items-center justify-center rounded-md border border-success/40 bg-success/10 text-base font-bold text-success shadow-sm transition hover:bg-success/20 sm:h-9 sm:w-9"
                  aria-label={t('orders.completeSize')}
                  title={t('orders.completeSize')}
                >
                  ✓
                </button>
              )}
                      </div>
                    </div>
                  )}
                </SortableItem>
              );
            })}
          </div>
        </SortableContext>
      </DndContext>

      {afterSizes}

      <div className="mt-3 border-t border-neutral-200 pt-3">
        <button
          type="button"
          onClick={() => setScanOpen((v) => !v)}
          aria-expanded={scanOpen}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 transition hover:text-brand-800 sm:text-sm"
        >
          {scanOpen ? '▾' : '▸'} {t('orders.scan.label')}
        </button>
        {scanOpen && (
          <div className="mt-2">
            <SheetScanner
              onRows={onScanRows}
              t={t}
              extraAction={
                canOpenPiramide ? (
                  <button
                    type="button"
                    onClick={openInPiramide}
                    className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-ink-soft shadow-sm transition hover:border-brand-500 hover:text-brand-600"
                  >
                    <span aria-hidden>📐</span>
                    <span>{t('orders.openInPiramide')}</span>
                  </button>
                ) : undefined
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default OrdersList;
