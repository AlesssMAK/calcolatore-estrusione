import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import {
  useFieldArray,
  useFormContext,
  useWatch,
  type FieldErrors,
  type UseFormGetValues,
  type UseFormSetValue,
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
  type CollisionDetection,
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
import { genId, makeEmptyOrder, makeEmptySize } from '../utils/defaults';
import {
  SIZE_ENTRY_GROUPS,
  insertMap,
  moveMap,
  remapSizeGroup,
  removeMap,
  type SizeEntryField,
} from '../utils/sizeEntries';
import {
  blockIndexes,
  isGapEnabled,
  moveBlock,
  moveInBlock,
  NO_PAUSE,
  samePause,
  type Rearrangement,
} from '../utils/blocks';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { StopIcon } from './ActionIcons';
import FieldError from './FieldError';
import MarqueeText from './MarqueeText';
import SheetScanner from './SheetScanner';
import { numericSetValueAs } from '../utils/numeric';
import { useCatalog } from '../contexts/CatalogContext';
import { stashPiramideImport } from '../lib/piramideImport';
import { inputBase, labelBase } from './formStyles';
import PauseCard from './PauseCard';
import {
  ProductChangeModal,
  ProductChangeStrip,
  type ProductChangeSides,
} from './ProductChange';
import {
  isProductChange,
  productChangesWithoutPause,
  sameProduct,
} from '../utils/productChange';
import { CollapsibleSchema } from './piramide/PiramideSchemaView';
import type { OcrRow } from '../lib/ocr';
import { useTrackedResult } from '../contexts/trackedResult';
import { rowForOrder, sizeTiming } from '../utils/formTiming';
import {
  effectiveValue,
  followersToReset,
  type InheritedKey,
} from '../utils/inherit';
import { formatDateParts, formatDuration, formatShortDateTime } from '../utils/format';

// Size-row inputs sit next to the +/−/✓ action buttons. Fixed height so they
// line up with the buttons — 36px on sm+ (= button height), a smaller 32px on
// mobile (with the buttons also shrunk) so the buttons take less room and the
// number fields get more width. Height controls the size, so no vertical pad.
const sizeInputBase =
  'h-8 w-full min-w-0 rounded-md border border-neutral-300 bg-white px-2 text-xs text-ink shadow-sm transition focus:border-brand-600 focus:ring-2 focus:ring-brand-200 focus:outline-none sm:h-9 sm:px-3 sm:text-sm';

type OrderError = NonNullable<FieldErrors<FormValues>['orders']>[number];

interface Props {
  mode: CalculatorMode;
  /** When set (tracking a saved/shared calc), renders per-order and per-size
   *  "✓ Completa" buttons that mark that order / size fully produced. */
  onComplete?: (orderId: string, sizeIdx?: number) => void;
  /** ⏭ per size: produce it next, out of the queue (custom production order). */
  onPrioritize?: (orderIdx: number, sizeIdx: number) => void;
  /** ⏹ in the active size's Calcolo Avanzato: stop it, pick what really runs. */
  onStopActive?: () => void;
  /** The order+size in production (saved calc). When set, orders other than the
   *  active one collapse to a summary card (click to expand). Null → no collapse. */
  activeLoc?: { orderIdx: number; sizeIdx: number } | null;
  /** Id of the saved calc being edited, if any — passed to Piramide so its
   *  result can round-trip back into the same order. */
  editingId?: string;
  /** "Annulla Piramide" on an order whose sizes came back from Piramide. */
  onRevertPiramide?: (orderIdx: number) => void;
}

function OrdersList({
  mode,
  onComplete,
  onPrioritize,
  onStopActive,
  activeLoc,
  editingId,
  onRevertPiramide,
}: Props) {
  'use no memo';
  // Orders the user manually expanded from their collapsed summary.
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(
    () => new Set(),
  );
  // The active order moved → fold the manually-expanded ones again.
  const activeOrderIdx = activeLoc?.orderIdx ?? null;
  const [prevActiveOrderIdx, setPrevActiveOrderIdx] = useState(activeOrderIdx);
  if (prevActiveOrderIdx !== activeOrderIdx) {
    setPrevActiveOrderIdx(activeOrderIdx);
    setExpandedOrders(new Set());
  }
  const { t } = useTranslation();
  const {
    formState: { errors },
    control,
    setValue,
    getValues,
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

  const gapMode = useWatch({ control, name: 'settings.gapMode' });
  const watchedOrders = useWatch({ control, name: 'orders' });

  // Blocks: the orders between two pauses (see utils/blocks). A block's id is
  // its first order's field key, so it stays stable while it moves.
  const blockOf = blockIndexes(
    fields.map((_, i) => watchedOrders?.[i] ?? {}),
    gapMode,
  );
  const blocks: number[][] = [];
  blockOf.forEach((b, i) => (blocks[b] ??= []).push(i));
  const multiBlock = blocks.length > 1;
  const blockKey = (list: number[]) => `block:${fields[list[0]].id}`;
  // Different products next to each other with no pause (always inside a
  // block): a reminder strip between them.
  const changeAt = new Set(
    productChangesWithoutPause(
      fields.map((_, i) => watchedOrders?.[i] ?? {}),
      gapMode,
    ),
  );
  const sidesAt = (i: number): ProductChangeSides => ({
    idx: i,
    from: watchedOrders?.[i]?.productName ?? '',
    to: watchedOrders?.[i + 1]?.productName ?? '',
  });

  // The pause between two different products can't be removed (every product
  // change stops the line) — its card says so instead.
  const [pauseKept, setPauseKept] = useState<number | null>(null);
  const removePause = (i: number) => {
    if (isProductChange(watchedOrders ?? [], i)) {
      setPauseKept(i);
      return;
    }
    setPauseKept(null);
    setValue(`orders.${i}.gapEnabled`, false, {
      shouldValidate: true,
      shouldDirty: true,
    });
  };
  const blockOfField = new Map(fields.map((f, i) => [f.id, blockOf[i]]));

  // A dragged block lands among blocks only; a dragged order among the orders
  // of its own block only (they never move alone into another block).
  const sameGroup = (activeId: unknown, id: unknown) => {
    const a = String(activeId);
    const b = String(id);
    return a.startsWith('block:')
      ? b.startsWith('block:')
      : !b.startsWith('block:') && blockOfField.get(b) === blockOfField.get(a);
  };
  const collision: CollisionDetection = (args) =>
    closestCenter({
      ...args,
      droppableContainers: args.droppableContainers.filter((c) =>
        sameGroup(args.active.id, c.id),
      ),
    });

  // Reorder: drag a press-hold handle (mobile / mouse) or the keyboard (focus
  // the handle, Space, arrows, Space). The arrows only step through the same
  // group too — otherwise they'd land on the enclosing block.
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: (event, args) => {
        const all = args.context.droppableContainers;
        const activeId = args.context.active?.id;
        const scoped = {
          getEnabled: () => all.getEnabled().filter((c) => sameGroup(activeId, c.id)),
          get: (id: Parameters<typeof all.get>[0]) => all.get(id),
        } as unknown as typeof all;
        return sortableKeyboardCoordinates(event, {
          ...args,
          context: { ...args.context, droppableContainers: scoped },
        });
      },
    }),
  );

  // Apply a re-arrangement with field-array moves (keeps each order's field
  // key → its expanded / registered state), then re-seat the pauses on the
  // blocks' new last orders.
  const applyArrangement = (r: Rearrangement, before: FormValues['orders']) => {
    const cur = before.map((_, i) => i);
    r.order.forEach((oldIdx, i) => {
      const pos = cur.indexOf(oldIdx);
      if (pos !== i) {
        move(pos, i);
        cur.splice(i, 0, ...cur.splice(pos, 1));
      }
    });
    const opts = { shouldDirty: true, shouldValidate: true };
    r.pauses.forEach((pause, i) => {
      if (samePause(before[r.order[i]], pause, gapMode)) return;
      const next = pause ?? NO_PAUSE;
      setValue(`orders.${i}.gapEnabled`, next.gapEnabled, opts);
      setValue(`orders.${i}.gapAfterMin`, next.gapAfterMin, opts);
      setValue(`orders.${i}.gapReason`, next.gapReason, opts);
    });
  };

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const a = String(active.id);
    const o = String(over.id);
    const before = getValues('orders');
    const keys = blocks.map(blockKey);
    const r = a.startsWith('block:')
      ? moveBlock(before, keys.indexOf(a), keys.indexOf(o), gapMode)
      : moveInBlock(
          before,
          fields.findIndex((f) => f.id === a),
          fields.findIndex((f) => f.id === o),
          gapMode,
        );
    if (r) applyArrangement(r, before);
  };

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
      // Not RHF's own focus: it lands on the order's first field — the
      // (inherited) product name — and pops its suggestion list open.
      { shouldFocus: false },
    );
  };

  // Focus the new order's quantity once it's on screen. A just-added order must
  // render expanded, not collapsed to a summary (the default for non-active
  // orders once a saved calc is open) — then its quantity field only exists
  // from the next render, so this waits for it.
  useEffect(() => {
    const idx = pendingFocusIdx.current;
    if (idx === null) return;
    const qty = document.getElementById(`qty-${idx}`);
    if (qty) {
      pendingFocusIdx.current = null;
      qty.focus();
      return;
    }
    const id = fields[idx]?.id;
    if (id && !expandedOrders.has(id)) {
      setExpandedOrders((s) => new Set(s).add(id));
    } else {
      pendingFocusIdx.current = null; // expanded, yet no field — give up
    }
  }, [fields, expandedOrders]);

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

  const renderOrder = (
    field: (typeof fields)[number],
    idx: number,
    canDrag: boolean,
  ) => {
    const rowErr = errors.orders?.[idx];
    const wo = watchedOrders?.[idx];
    // Pause after this order only. Always editable — on the last
    // order it's simply ignored by the scheduler (nothing follows).
    const gapOn = isGapEnabled(wo, { gapMode });
    const oName = wo?.productName?.trim();
    const oSizes = wo?.sizes ?? [];
    // Compact list of the order's sizes ("qty × length mm"), so a
    // collapsed order shows what's inside it at a glance.
    const sizesSummary = wo?.useTotalLength
      ? `${Number(wo?.totalLengthM) || 0} m`
      : oSizes
          .map(
            (z) =>
              `${Number(z?.sheets) || 0} × ${Number(z?.length) || 0} mm`,
          )
          .join(' · ');
    // Key params on the collapsed card too, so an edit (e.g. speed) is
    // visible without expanding — live from the watched form values.
    const oSpeed = Number(wo?.speedMPerMin) || 0;
    const oCavity = Number(wo?.cavity) || 0;
    const paramsSummary = [
      oSpeed > 0 ? `⚡ ${oSpeed} m/min` : null,
      oCavity > 1 ? `× ${oCavity}` : null,
    ]
      .filter(Boolean)
      .join(' · ');
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
                // Viewing control — kept in the read-only view.
                data-view
                title={t('orders.expandOrder')}
                className="flex w-full flex-col items-start gap-1 text-left"
              >
                <span className="flex w-full items-center gap-2">
                  <span className="shrink-0 rounded-md bg-brand-600 px-2 py-0.5 text-xs font-semibold text-white">
                    #{idx + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                    {oName || t('orders.order', { n: idx + 1 })}
                  </span>
                  <span
                    aria-hidden
                    className="shrink-0 text-ink-soft"
                  >
                    ▸
                  </span>
                </span>
                <span className="text-xs text-ink-soft">
                  {sizesSummary}
                </span>
                {paramsSummary && (
                  <span className="text-xs text-ink-soft">
                    {paramsSummary}
                  </span>
                )}
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
                {canDrag && (
                  <button
                    type="button"
                    {...handleProps}
                    aria-label={t('orders.reorder')}
                    title={t('orders.reorder')}
                    className="flex h-7 w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded text-base text-neutral-400 transition hover:text-ink-soft active:cursor-grabbing"
                  >
                    ⠿
                  </button>
                )}
                <OrderNameField idx={idx} mode={mode} t={t} />
              </div>
              <div className="flex items-center gap-2">
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
          onClick={() =>
            gapOn
              ? removePause(idx)
              : setValue(`orders.${idx}.gapEnabled`, true, {
                  shouldValidate: true,
                  shouldDirty: true,
                })
          }
          aria-pressed={gapOn}
          title={t('orders.togglePause')}
          className={
            gapOn
              ? 'rounded-md border border-brand-600 bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white shadow-sm transition sm:px-3 sm:py-1.5 sm:text-sm'
              : 'rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-xs font-medium text-ink-soft transition hover:border-brand-400 hover:text-ink sm:px-3 sm:py-1.5 sm:text-sm'
          }
        >
          ⏸{' '}
          <span className="hidden sm:inline">
            {t('orders.togglePause')}
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
              onPrioritizeSize={
                // ⏭ only within the block in production: another block is
                // past a pause and can't jump ahead of it.
                onPrioritize &&
                (!activeLoc || blockOf[idx] === blockOf[activeLoc.orderIdx])
                  ? (sizeIdx) => onPrioritize(idx, sizeIdx)
                  : undefined
              }
              onStopActive={
                activeLoc && idx === activeLoc.orderIdx
                  ? onStopActive
                  : undefined
              }
              activeSizeIdx={
                activeLoc && idx === activeLoc.orderIdx
                  ? activeLoc.sizeIdx
                  : null
              }
              editingId={editingId}
              onRevertPiramide={
                onRevertPiramide
                  ? () => onRevertPiramide(idx)
                  : undefined
              }
            />
          </div>
        )}
      </SortableItem>
    );
  };

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
            // 32px square on mobile (icon only), 36px tall on sm+ — same as the
            // "+" button next to it.
            className={`flex h-8 min-w-8 items-center justify-center rounded-md border text-xs font-medium shadow-sm transition sm:h-9 sm:px-2.5 sm:text-sm ${
              productNameOpen
                ? 'border-brand-600 bg-brand-600 text-white'
                : 'border-neutral-300 bg-white text-ink-soft hover:border-brand-400 hover:text-ink'
            }`}
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
            className="flex h-8 min-w-8 items-center justify-center rounded-md border border-brand-600 bg-brand-600 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-700 sm:h-9 sm:px-3 sm:text-sm"
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
        collisionDetection={collision}
        onDragEnd={handleDragEnd}
      >
        {/* Blocks (orders between two pauses) are sortable as a whole; their
            orders only within the block. The pause cards sit between blocks
            and stay there (they belong to the boundary). */}
        <SortableContext
          items={multiBlock ? blocks.map(blockKey) : []}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-3">
            {blocks.map((list, b) => {
              const closer = list[list.length - 1];
              const pauseOn = isGapEnabled(watchedOrders?.[closer], { gapMode });
              const inner = (
                <SortableContext
                  items={list.map((i) => fields[i].id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-3">
                    {list.map((i) => (
                      <Fragment key={fields[i].id}>
                        {renderOrder(fields[i], i, list.length > 1)}
                        {changeAt.has(i) && <ProductChangeStrip {...sidesAt(i)} />}
                      </Fragment>
                    ))}
                  </div>
                </SortableContext>
              );
              return (
                <Fragment key={blockKey(list)}>
                  {multiBlock ? (
                    <SortableItem id={blockKey(list)}>
                      {({ setNodeRef, style, handleProps, isDragging }) => (
                        <div
                          ref={setNodeRef}
                          style={style}
                          className={`space-y-2 rounded-xl border border-dashed border-neutral-300 p-2 sm:space-y-3 sm:p-3 ${
                            isDragging ? 'bg-white shadow-lg' : ''
                          }`}
                        >
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              {...handleProps}
                              aria-label={t('orders.moveBlock')}
                              title={t('orders.moveBlock')}
                              className="flex h-7 w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded text-base text-neutral-400 transition hover:text-ink-soft active:cursor-grabbing"
                            >
                              ⠿
                            </button>
                            <span className="text-xs font-semibold tracking-wide text-ink-soft uppercase">
                              {t('orders.block', { n: b + 1 })}
                            </span>
                            <span className="text-xs text-ink-soft">
                              · {t('orders.blockOrders', { count: list.length })}
                            </span>
                          </div>
                          {inner}
                        </div>
                      )}
                    </SortableItem>
                  ) : (
                    inner
                  )}
                  {pauseOn && (
                    <PauseCard
                      idx={closer}
                      isLast={closer === fields.length - 1}
                      onRemove={() => removePause(closer)}
                      kept={pauseKept === closer ? sidesAt(closer) : null}
                      clearKept={setPauseKept}
                    />
                  )}
                </Fragment>
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
  mode: CalculatorMode;
  t: TFunction;
  /** Mark a single size fully produced (bound to this order's id). */
  onCompleteSize?: (sizeIdx: number) => void;
  /** ⏭ produce this size next, out of the queue (bound to this order). */
  onPrioritizeSize?: (sizeIdx: number) => void;
  /** ⏹ stop the size in production (set only on the active order). */
  onStopActive?: () => void;
  /** For the active order (saved view): the size in production — the others
   *  collapse to a summary and only this one's advanced block is shown. */
  activeSizeIdx?: number | null;
  /** Saved-calc id (for Piramide round-trip back into this order). */
  editingId?: string;
  /** "Annulla Piramide": back to the sizes from before Piramide. */
  onRevertPiramide?: () => void;
}

function OrderFields({
  idx,
  rowErr,
  mode,
  t,
  onCompleteSize,
  onPrioritizeSize,
  onStopActive,
  activeSizeIdx,
  editingId,
  onRevertPiramide,
}: FieldsProps) {
  'use no memo';
  const { register, control } = useFormContext<FormValues>();
  // Piramide layout schema carried on this order (from a round-trip / import).
  const piramideSchema = useWatch({
    control,
    name: `orders.${idx}.piramideSchema`,
  });
  // Sizes from before Piramide replaced them → "Annulla Piramide" is offered.
  const piramideOriginal = useWatch({
    control,
    name: `orders.${idx}.piramideOriginal`,
  });
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
  // A changed speed / cavity carries down to the orders that follow it.
  const speedChain = useInheritChain(idx, 'speedMPerMin');
  const cavityChain = useInheritChain(idx, 'cavity');
  // What an empty speed / cavity inherits — shown greyed in the field.
  const { i18n } = useTranslation();
  const allOrders = useWatch({ control, name: 'orders' });
  const inheritedHint = (key: InheritedKey) => {
    const v = idx > 0 ? effectiveValue(allOrders ?? [], idx - 1, key) : undefined;
    return v === undefined ? undefined : v.toLocaleString(i18n.resolvedLanguage);
  };
  const speedReg = register(`orders.${idx}.speedMPerMin`, {
    setValueAs: numericSetValueAs,
  });

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
              {...speedReg}
              {...chainHandlers(speedChain)}
              onBlur={(e) => {
                void speedReg.onBlur(e);
                speedChain.commit();
              }}
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
            chain={speedChain}
            placeholder={inheritedHint('speedMPerMin')}
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

        {showInlinePerPackage && (
          // Collapsed to a 📦 button on every order. Per-pacco is per order —
          // it never inherits from the previous order, so no "(eredita)" hint.
          <CollapsibleInheritField
            fieldPath={`orders.${idx}.sizes.0.profilesPerPackage`}
            icon="📦"
            label={t('orders.profilesPerPackage')}
            inputProps={{ min: '1', step: '1', inputMode: 'numeric' }}
            errorMessage={
              rowErr?.sizes?.[0]?.profilesPerPackage?.message
                ? t(
                    `validation.${rowErr.sizes[0].profilesPerPackage.message}`,
                  )
                : undefined
            }
          />
        )}

        {isProfiles && (
          <CollapsibleInheritField
            fieldPath={`orders.${idx}.cavity`}
            icon="🔢"
            label={t('orders.cavity')}
            // Like the speed: from the 2nd order on it inherits when empty.
            inheritLabel={isFirst ? undefined : t('orders.optionalInherit')}
            inputProps={{ min: '1', step: '1', inputMode: 'numeric' }}
            chain={cavityChain}
            placeholder={inheritedHint('cavity')}
            errorMessage={
              rowErr?.cavity?.message
                ? t(`validation.${rowErr.cavity.message}`)
                : undefined
            }
          />
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
          <AdvancedSection
            idx={idx}
            mode={mode}
            t={t}
            activeSizeIdx={activeSizeIdx}
            onPrioritizeSize={onPrioritizeSize}
            onStop={onStopActive}
          />
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
          activeSizeIdx={activeSizeIdx}
          editingId={editingId}
          afterSizes={(visibleSizeIdxs) => (
            <AdvancedSection
              idx={idx}
              mode={mode}
              t={t}
              visibleSizeIdxs={visibleSizeIdxs}
              activeSizeIdx={activeSizeIdx}
              onCompleteSize={onCompleteSize}
              onPrioritizeSize={onPrioritizeSize}
              onStop={onStopActive}
            />
          )}
        />
      )}
      <CollapsibleSchema
        schema={piramideSchema}
        action={
          piramideOriginal && onRevertPiramide ? (
            <button
              type="button"
              onClick={onRevertPiramide}
              aria-label={t('orders.revertPiramide')}
              title={t('orders.revertPiramideHint')}
              className="rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-xs font-medium text-ink-soft transition hover:border-brand-500 hover:text-brand-600 sm:px-3 sm:py-1.5 sm:text-sm"
            >
              ↺{' '}
              <span className="hidden sm:inline">
                {t('orders.revertPiramide')}
              </span>
            </button>
          ) : undefined
        }
      />
      <OrderEndNote idx={idx} t={t} />
    </div>
  );
}

// Collapsible field for optional, inheritance-backed numbers (speed,
// profilesPerPackage, cavity). Shows a square icon button when value is empty;
// clicking it expands an input. On blur, if still empty, collapses back.
// Speed uses it only for idx > 0 (the first order's speed is required) so that
// creating a new order doesn't auto-focus it — mobile users were getting
// trapped editing speed on each new order. Per-pacco / cavity use it on every
// order, and per-pacco also in multi-size rows (`compact`).
// A changed speed / cavity carries down the queue: the orders after `idx` that
// repeated its old value (`previous`) go back to inheriting — so they follow —
// up to the first order with a different value of its own.
function carryDown(
  getValues: UseFormGetValues<FormValues>,
  setValue: UseFormSetValue<FormValues>,
  idx: number,
  key: InheritedKey,
  previous: number | undefined,
) {
  if (previous === undefined) return;
  const orders = getValues('orders') ?? [];
  if (effectiveValue(orders, idx, key) === previous) return;
  for (const j of followersToReset(orders, idx, key, previous)) {
    setValue(`orders.${j}.${key}`, undefined, { shouldDirty: true });
  }
}

// carryDown for an input: the value at the start of the edit (focus) against
// the one when it's done (blur / Enter) — not per keystroke, as typing "1.8"
// passes through "1", which must not catch an order that really runs at 1.
function useInheritChain(idx: number, key: InheritedKey): InheritChain {
  const { getValues, setValue } = useFormContext<FormValues>();
  const startRef = useRef<number | undefined>(undefined);
  return {
    begin: () => {
      startRef.current = effectiveValue(getValues('orders') ?? [], idx, key);
    },
    commit: () => {
      carryDown(getValues, setValue, idx, key, startRef.current);
      startRef.current = undefined;
    },
  };
}

interface InheritChain {
  begin: () => void;
  commit: () => void;
}

// Wires an inherited-value input to its chain: focus starts the edit, blur
// ends it, Enter (which submits the form) ends it first and starts anew.
const chainHandlers = (chain: InheritChain | undefined) =>
  chain
    ? {
        onFocus: chain.begin,
        onKeyDown: (e: ReactKeyboardEvent<HTMLInputElement>) => {
          if (e.key === 'Enter') {
            chain.commit();
            chain.begin();
          }
        },
      }
    : {};

function CollapsibleInheritField({
  fieldPath,
  icon,
  label,
  inheritLabel,
  inputProps,
  errorMessage,
  placeholder,
  compact,
  expandedClassName = 'min-w-0 flex-1 basis-0 sm:min-w-[140px]',
  chain,
}: {
  fieldPath:
    | `orders.${number}.speedMPerMin`
    | `orders.${number}.sizes.${number}.profilesPerPackage`
    | `orders.${number}.cavity`;
  icon: string;
  label: string;
  /** Optional hint shown in parentheses after the label and as the
   *  collapsed-button tooltip. Omit to render just the bare label (e.g. a
   *  value that doesn't inherit, like per pacco or the first order's cavità). */
  inheritLabel?: string;
  inputProps: {
    min: string;
    step: string;
    inputMode: 'decimal' | 'numeric';
  };
  errorMessage?: string;
  /** Greyed value shown in the empty input — the one it would inherit, so it
   *  can be seen and overridden. */
  placeholder?: string;
  /** Size-row variant: the row's button/input sizes (h-8 phone / h-9 sm+). */
  compact?: boolean;
  /** Wrapper classes of the expanded field (grid/flex placement). */
  expandedClassName?: string;
  /** An inherited value (speed / cavity): a change carries down the queue. */
  chain?: InheritChain;
}) {
  'use no memo';
  const { register, control } = useFormContext<FormValues>();
  const value = useWatch({ control, name: fieldPath });
  const hasValue = value !== undefined && value !== null;
  const [open, setOpen] = useState(false);
  const showInput = open || hasValue;

  const titleText = inheritLabel
    ? `${label} (${inheritLabel}${placeholder ? `: ${placeholder}` : ''})`
    : label;

  if (!showInput) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={titleText}
        aria-label={titleText}
        className={`flex shrink-0 items-center justify-center self-end rounded-md border border-neutral-300 bg-white text-ink-soft shadow-sm transition hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700 ${
          compact ? 'h-8 w-8 sm:h-9 sm:w-9' : 'h-9 w-9'
        }`}
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
    <div className={expandedClassName}>
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
        placeholder={placeholder}
        className={`${compact ? sizeInputBase : inputBase} mt-1`}
        {...reg}
        {...chainHandlers(chain)}
        onBlur={(e) => {
          // RHF blur first (validation, dirty/touched flags), then collapse
          // only if the input was actually left empty. Reading the DOM value
          // directly avoids stale useWatch state and intermediate values
          // (typing "1." briefly parses to 1 — we shouldn't collapse on that).
          reg.onBlur(e);
          chain?.commit();
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
  visibleSizeIdxs,
  activeSizeIdx,
  onCompleteSize,
  onPrioritizeSize,
  onStop,
}: {
  idx: number;
  mode: CalculatorMode;
  t: TFunction;
  /** When set (active order in a saved view), only these sizes' blocks are
   *  shown — the active size plus any the user manually expanded. Null → all. */
  visibleSizeIdxs?: Set<number> | null;
  /** The size in production on this (active) order — gets the ⏹ button. */
  activeSizeIdx?: number | null;
  /** ✓ mark one size fully produced (multi-size orders). */
  onCompleteSize?: (sizeIdx: number) => void;
  /** ⏭ produce this size next, out of the queue. */
  onPrioritizeSize?: (sizeIdx: number) => void;
  /** ⏹ "Ferma produzione" — set on the order holding the size in production
   *  (saved view): stop it and pick what's really running now. */
  onStop?: () => void;
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

  // Per-size actions (✓ / ⏭ / ⏹) in each size block's header. ✓ only for
  // multi-size orders (single-size: "Completa Ordine" in the order header), ⏹
  // only on the size in production. Undefined when there's nothing to show.
  const sizeActions = (sIdx: number, totalSizes: number): ReactNode => {
    const complete =
      onCompleteSize && totalSizes > 1 ? () => onCompleteSize(sIdx) : undefined;
    const prioritize = onPrioritizeSize
      ? () => onPrioritizeSize(sIdx)
      : undefined;
    const stop = onStop && sIdx === activeSizeIdx ? onStop : undefined;
    if (!complete && !prioritize && !stop) return undefined;
    return (
      <SizeActions
        onComplete={complete}
        onPrioritize={prioritize}
        onStop={stop}
        t={t}
      />
    );
  };
  // Total-meters orders are a single production step (no size blocks).
  const orderActions = useTotalLength ? sizeActions(0, 1) : undefined;

  // Lastre per bancale per size: own (first filled entry of the size), else
  // the previous size's of this order (never across orders) — shown greyed in
  // an empty rate field so the inherited value can be seen and overridden.
  const ratePerSize: (number | undefined)[] = [];
  (watchedSizes ?? []).forEach((_, i) => {
    const own = (watchedPerPallet ?? []).find(
      (e, p) => (e?.sizeIndex ?? p) === i && (e?.value ?? 0) > 0,
    )?.value;
    ratePerSize[i] = own ?? ratePerSize[i - 1];
  });

  return (
    <div className="pt-2">
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        aria-expanded={expanded}
        data-view
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 transition hover:text-brand-800 sm:text-sm"
      >
        {expanded ? '▾' : '▸'} {t('orders.advancedToggle')}
      </button>

      {expanded && (
        <div
          className={`mt-2 rounded-md border bg-brand-50/40 p-2 sm:p-3 ${
            useTotalLength ? '' : 'space-y-3'
          } ${
            // Auto-filled "produced so far" (saved calc in production) →
            // the amber frame pulses to catch the eye.
            hadProducedAtMount ? 'amber-blink border-amber-300' : 'border-brand-100'
          }`}
        >
          {(hadProducedAtMount || (useTotalLength && orderActions)) && (
            <div className="mb-2 flex items-start justify-between gap-2">
              <p className="text-[11px] font-medium text-amber-700">
                {hadProducedAtMount && <>↳ {t('orders.advanced.autoFilledNote')}</>}
              </p>
              {/* Total-meters orders have no size blocks → actions up here. */}
              {useTotalLength && orderActions}
            </div>
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
              visibleSizeIdxs && !visibleSizeIdxs.has(sIdx) ? null : isProfiles ? (
                <SizeAdvancedBlockProfili
                  // Keyed by the size's stable uid so a block (and its seeded row)
                  // follows its size through insert / remove / reorder.
                  key={watchedSizes?.[sIdx]?.uid ?? sIdx}
                  orderIdx={idx}
                  sizeIdx={sIdx}
                  totalSizes={watchedSizes?.length ?? 1}
                  actions={sizeActions(sIdx, watchedSizes?.length ?? 1)}
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
                  // Keyed by the size's stable uid so a block (and its seeded row)
                  // follows its size through insert / remove / reorder.
                  key={watchedSizes?.[sIdx]?.uid ?? sIdx}
                  orderIdx={idx}
                  sizeIdx={sIdx}
                  totalSizes={watchedSizes?.length ?? 1}
                  actions={sizeActions(sIdx, watchedSizes?.length ?? 1)}
                  inheritedRate={ratePerSize[sIdx]}
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
  const { control, setValue, getValues } = useFormContext<FormValues>();
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
  // "Cambio Prodotto": the product change just picked, asking for its stop.
  const [change, setChange] = useState<ProductChangeSides | null>(null);
  // Changing the product: the field opens empty, the current one (inherited
  // or not) shown as a grey hint — left untouched, the order keeps it; what's
  // typed replaces it. null = not editing. Mirrored in a ref: a pick from the
  // list ends the editing and blurs the input in the same event, before a
  // re-render.
  const [draft, setDraftState] = useState<string | null>(null);
  const draftRef = useRef<string | null>(null);
  const setDraft = (d: string | null) => {
    draftRef.current = d;
    setDraftState(d);
  };
  const inputRef = useRef<HTMLInputElement>(null);

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

  // Phone: the dropdown is fixed to the viewport at full width, so track the
  // input's bottom edge while it's open (scroll / resize / keyboard).
  const isPhone = useMediaQuery('(max-width: 639px)');
  const [dropTop, setDropTop] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (!dropdownOpen || !isPhone) return;
    const place = () => {
      const r = wrapperRef.current?.getBoundingClientRect();
      if (r) setDropTop(r.bottom + 4);
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [dropdownOpen, isPhone]);

  // Filter visible suggestions by what's typed (nothing yet → all of them).
  const query = (draft ?? '').toLowerCase().trim();
  const suggestions = useMemo(
    () =>
      query === ''
        ? filtered
        : filtered.filter((p) => p.name.toLowerCase().includes(query)),
    [filtered, query],
  );

  const pickProduct = (p: (typeof filtered)[number]) => {
    // The speed / cavity it changes carry down to the orders that follow.
    const before = getValues('orders') ?? [];
    const changed = !sameProduct(before[idx]?.productName, p.name);
    const prevSpeed = effectiveValue(before, idx, 'speedMPerMin');
    const prevCavity = effectiveValue(before, idx, 'cavity');
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
    carryDown(getValues, setValue, idx, 'speedMPerMin', prevSpeed);
    carryDown(getValues, setValue, idx, 'cavity', prevCavity);
    setDropdownOpen(false);
    // Every product change stops the line: next to a different product with
    // no pause between (the order before, else the one after) → ask which stop.
    if (changed) {
      const orders = getValues('orders') ?? [];
      const open = productChangesWithoutPause(orders, getValues('settings.gapMode'));
      const at = open.includes(idx - 1) ? idx - 1 : open.includes(idx) ? idx : null;
      if (at !== null) {
        setChange({
          idx: at,
          from: orders[at].productName ?? '',
          to: orders[at + 1].productName ?? '',
        });
      }
    }
  };

  // Done typing (blur / Enter / closing the full-screen list): nothing typed →
  // the product stays; a catalog product's name → that product, with its
  // parameters; anything else → just the new name.
  const commitDraft = () => {
    const typed = draftRef.current?.trim();
    setDraft(null);
    if (!typed) return;
    const p = filtered.find((x) => sameProduct(x.name, typed));
    if (p) pickProduct(p);
    else {
      setValue(`orders.${idx}.productName`, typed, {
        shouldValidate: true,
        shouldDirty: true,
      });
    }
  };
  const pickFromList = (p: (typeof filtered)[number]) => {
    setDraft(null);
    pickProduct(p);
    inputRef.current?.blur();
  };

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        title={t('orders.productName')}
        // The "#N" badge stays in the read-only view (the name input itself
        // can't be edited there).
        data-view
        className="flex h-7 shrink-0 items-center justify-center rounded-md bg-brand-600 px-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-brand-700 sm:h-8 sm:text-sm"
      >
        #{idx + 1}
      </button>
      {showInput && (
        <div ref={wrapperRef} className="relative min-w-0 flex-1">
          <input
            ref={inputRef}
            type="text"
            name={`orders.${idx}.productName`}
            autoComplete="off"
            autoFocus={open && !hasValue}
            value={draft ?? (typeof value === 'string' ? value : '')}
            placeholder={hasValue ? value : t('orders.productName')}
            className="w-full min-w-0 rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs text-ink shadow-sm transition focus:border-brand-600 focus:ring-2 focus:ring-brand-200 focus:outline-none sm:px-3 sm:py-1.5 sm:text-sm"
            onFocus={() => {
              setDraft('');
              if (filtered.length > 0) setDropdownOpen(true);
            }}
            onChange={(e) => {
              setDraft(e.target.value);
              if (filtered.length > 0) setDropdownOpen(true);
            }}
            onBlur={() => {
              // Moving on to the full-screen list isn't done typing.
              if (!fullScreen) commitDraft();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setDraft(null);
                setDropdownOpen(false);
              }
              if (e.key === 'Enter') commitDraft();
            }}
          />
          {dropdownOpen && suggestions.length > 0 && (
            <div
              // Keep the focus (and what's typed) in the input while a
              // suggestion / the full-screen button is pressed.
              onMouseDown={(e) => e.preventDefault()}
              // Phone: span the whole screen width (fixed, pinned under the
              // input) so long product names fit; sm+: as wide as the input.
              style={isPhone && dropTop !== null ? { top: dropTop } : undefined}
              // z-50 on phone: above the pinned floating action bar (z-40).
              className={`overflow-hidden border border-neutral-200 bg-white shadow-lg ${
                isPhone
                  ? 'fixed inset-x-0 z-50 rounded-none border-x-0'
                  : 'absolute top-full right-0 left-0 z-30 mt-1 rounded-md'
              }`}
            >
              <ul
                role="listbox"
                className="max-h-60 overflow-y-auto py-1"
              >
                {suggestions.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => pickFromList(p)}
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
                onClick={() => {
                  setDraft(draftRef.current ?? '');
                  setFullScreen(true);
                }}
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
                onClick={() => {
                  setFullScreen(false);
                  setDropdownOpen(false);
                  commitDraft();
                }}
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
                value={draft ?? ''}
                placeholder={hasValue ? value : t('orders.productName')}
                onChange={(e) => setDraft(e.target.value)}
                className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-ink shadow-sm focus:border-brand-600 focus:ring-2 focus:ring-brand-200 focus:outline-none"
              />
            </div>
            <ul className="flex-1 overflow-y-auto">
              {suggestions.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => {
                      pickFromList(p);
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

      {change && <ProductChangeModal change={change} onClose={() => setChange(null)} />}
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
  actions,
}: {
  sizeIdx: number;
  totalSizes: number;
  cols: string;
  labels: { label: string; disabled?: boolean }[];
  /** Per-size action buttons (✓ / ⏭ / ⏹), right of the "#N" badge. */
  actions?: ReactNode;
}) {
  return (
    <>
      {(totalSizes > 1 || actions) && (
        <div className="mb-1 flex items-center justify-between gap-2">
          {totalSizes > 1 ? (
            <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-brand-100 px-1.5 text-xs font-bold text-brand-700">
              #{sizeIdx + 1}
            </span>
          ) : (
            <span />
          )}
          {actions}
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

// Tracked calc (Salvati / Produzione): when this size will be finished — small,
// blinking — plus the time one sheet / profile takes. Nothing for a fresh calc,
// a finished size or one changed since the last "Calcola".
function SizeEndNote({
  orderIdx,
  sizeIdx,
  mode,
  t,
}: {
  orderIdx: number;
  sizeIdx: number;
  mode: CalculatorMode;
  t: TFunction;
}) {
  'use no memo';
  const { i18n } = useTranslation();
  const result = useTrackedResult();
  const { control } = useFormContext<FormValues>();
  const orderId = useWatch({ control, name: `orders.${orderIdx}.id` });
  const size = useWatch({ control, name: `orders.${orderIdx}.sizes.${sizeIdx}` });
  const timing = sizeTiming(rowForOrder(result, orderId), size, sizeIdx);
  if (!timing) return null;
  const units = {
    day: t('units.day'),
    hour: t('units.hour'),
    minute: t('units.minute'),
  };
  return (
    <p className="mt-1.5 text-[11px] text-ink-soft">
      {t('orders.sizeEnds')}{' '}
      <span className="num-blink">
        {formatShortDateTime(timing.end, i18n.resolvedLanguage ?? 'it')}
      </span>
      {timing.perItemMin !== undefined && (
        <>
          {' · '}
          {t(mode === 'profiles' ? 'orders.perItemProfiles' : 'orders.perItem', {
            time: formatDuration(timing.perItemMin, units),
          })}
        </>
      )}
    </p>
  );
}

// Tracked calc: when the whole order will be finished, at the end of its card.
function OrderEndNote({ idx, t }: { idx: number; t: TFunction }) {
  'use no memo';
  const { i18n } = useTranslation();
  const result = useTrackedResult();
  const { control } = useFormContext<FormValues>();
  const orderId = useWatch({ control, name: `orders.${idx}.id` });
  const row = rowForOrder(result, orderId);
  if (!row || row.remainingMinutes < 0.5) return null;
  const end = formatDateParts(row.end, i18n.resolvedLanguage ?? 'it');
  return (
    <p className="mt-2 flex flex-wrap items-baseline justify-between gap-x-2 border-t border-neutral-200 pt-2 text-xs">
      <span className="tracking-wide text-ink-soft uppercase">
        {t('orders.orderEnds')}
      </span>
      <span className="num-blink flex flex-wrap justify-end gap-x-1.5">
        <span className="whitespace-nowrap">{end.date}</span>
        <span className="whitespace-nowrap">{end.time}</span>
      </span>
    </p>
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
  actions,
  inheritedRate,
}: {
  orderIdx: number;
  sizeIdx: number;
  totalSizes: number;
  /** The lastre-per-bancale in force for this size (its own, else inherited
   *  from the previous size of the order) — shown greyed in empty rate fields. */
  inheritedRate?: number;
  countDisabled: boolean;
  rateDisabled: boolean;
  totalDisabled: boolean;
  countLabel: string;
  rateLabel: string;
  totalLabel: string;
  t: TFunction;
  /** Per-size action buttons shown in the block header. */
  actions?: ReactNode;
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

  // Seeding only — never steal the focus (RHF focuses an appended row).
  const appendAll = () => {
    const opts = { shouldFocus: false };
    sheets.append({ value: undefined, sizeIndex: sizeIdx }, opts);
    rates.append({ value: undefined, sizeIndex: sizeIdx }, opts);
    totals.append({ value: undefined, sizeIndex: sizeIdx }, opts);
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
        actions={actions}
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
                  // Produced count blinks (empty field has no text → still).
                  className={`${sizeBlockInputCls} num-blink ${countDisabled ? 'opacity-40 pointer-events-none' : ''}`}
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
                  placeholder={
                    inheritedRate ? String(inheritedRate) : undefined
                  }
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
      <SizeEndNote orderIdx={orderIdx} sizeIdx={sizeIdx} mode="sheets" t={t} />
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
  actions,
}: {
  orderIdx: number;
  sizeIdx: number;
  totalSizes: number;
  countDisabled: boolean;
  totalDisabled: boolean;
  countLabel: string;
  totalLabel: string;
  t: TFunction;
  /** Per-size action buttons shown in the block header. */
  actions?: ReactNode;
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

  // Seeding only — never steal the focus (RHF focuses an appended row).
  const appendAll = () => {
    const opts = { shouldFocus: false };
    counts.append({ value: undefined, sizeIndex: sizeIdx }, opts);
    totals.append({ value: undefined, sizeIndex: sizeIdx }, opts);
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
        actions={actions}
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
                  className={`${sizeBlockInputCls} num-blink ${countDisabled ? 'opacity-40 pointer-events-none' : ''}`}
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
      <SizeEndNote orderIdx={orderIdx} sizeIdx={sizeIdx} mode="profiles" t={t} />
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
      // The produced count (count field) blinks like everywhere else.
      className={`h-8 w-full min-w-0 rounded-md border border-neutral-300 bg-white px-2 text-xs text-ink shadow-sm transition focus:border-brand-600 focus:ring-2 focus:ring-brand-200 focus:outline-none sm:h-9 sm:px-2.5 sm:text-sm ${
        fieldName === 'producedSheets' || fieldName === 'producedProfiles'
          ? 'num-blink'
          : ''
      }`}
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

// Per-size actions in its Calcolo Avanzato block — square icon buttons of one
// size: ✓ completa misura, ⏭ senza coda, ⏹ ferma produzione (active size).
function SizeActions({
  onComplete,
  onPrioritize,
  onStop,
  t,
}: {
  onComplete?: () => void;
  onPrioritize?: () => void;
  onStop?: () => void;
  t: TFunction;
}) {
  if (!onComplete && !onPrioritize && !onStop) return null;
  return (
    <div className="flex shrink-0 items-center gap-2">
      {onComplete && (
        <button
          type="button"
          onClick={onComplete}
          className="flex h-8 w-8 items-center justify-center rounded-md border border-success/40 bg-success/10 text-base font-bold text-success shadow-sm transition hover:bg-success/20 sm:h-9 sm:w-9"
          aria-label={t('orders.completeSize')}
          title={t('orders.completeSize')}
        >
          ✓
        </button>
      )}
      {onPrioritize && (
        <PrioritizeButton onClick={onPrioritize} label={t('orders.prioritize')} />
      )}
      {onStop && (
        <button
          type="button"
          onClick={onStop}
          className="flex h-8 w-8 items-center justify-center rounded-md border border-danger/40 bg-danger/10 text-danger shadow-sm transition hover:bg-danger/20 sm:h-9 sm:w-9"
          aria-label={t('orders.stopActive')}
          title={t('orders.stopActive')}
        >
          <StopIcon className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

// ⏭ "Senza coda" — produce this size next (custom production queue).
function PrioritizeButton({
  onClick,
  label,
}: {
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-amber-300 bg-amber-50 text-base shadow-sm transition hover:border-amber-500 hover:bg-amber-100 sm:h-9 sm:w-9"
    >
      ⏭
    </button>
  );
}

function SizesFieldArray({
  orderIdx,
  mode,
  t,
  afterSizes,
  activeSizeIdx,
  editingId,
}: {
  orderIdx: number;
  mode: CalculatorMode;
  t: TFunction;
  /** Rendered between the size rows and the photo-scanner block (used for the
   *  advanced section, so its order is sizes → advanced → scanner). Receives the
   *  set of visible size indices (active + manually-expanded) so the advanced
   *  blocks stay in sync with which size rows are open. Null → all visible. */
  afterSizes?: (visibleSizeIdxs: Set<number> | null) => ReactNode;
  /** Active order (saved view): the size in production — other sizes collapse
   *  to a summary (click to expand). Null → all sizes shown. */
  activeSizeIdx?: number | null;
  /** Saved-calc id (for the Piramide round-trip back into this order). */
  editingId?: string;
}) {
  'use no memo';
  // Sizes the user manually expanded from their collapsed summary.
  const [expandedSizes, setExpandedSizes] = useState<Set<string>>(
    () => new Set(),
  );
  // The active size moved (a size was completed) → drop manual expansions so
  // the finished size folds and only the new active one stays open.
  const [prevActiveSizeIdx, setPrevActiveSizeIdx] = useState(activeSizeIdx);
  if (prevActiveSizeIdx !== activeSizeIdx) {
    setPrevActiveSizeIdx(activeSizeIdx);
    setExpandedSizes(new Set());
  }
  // Index of a size just inserted via "+", to auto-expand once it mounts.
  const pendingSizeExpand = useRef<number | null>(null);
  const {
    register,
    formState: { errors },
    control,
    getValues,
    setValue,
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

  // Calcolo Avanzato rows point at a size by its index (sizeIndex). Insert /
  // remove / reorder must carry them along — otherwise a size inserted in the
  // middle showed the next size's produced data (and that size lost it). Sizes
  // also get a stable uid, which keys their Calcolo Avanzato blocks.
  const remapSizeEntries = (map: (sizeIdx: number) => number | null) => {
    for (const group of SIZE_ENTRY_GROUPS) {
      const arrays = group.map((name) =>
        getValues(`orders.${orderIdx}.${name}` as `orders.${number}.${SizeEntryField}`),
      );
      if (arrays.every((a) => !a?.length)) continue;
      const next = remapSizeGroup(arrays, map);
      group.forEach((name, i) =>
        setValue(
          `orders.${orderIdx}.${name}` as `orders.${number}.${SizeEntryField}`,
          next[i],
          { shouldDirty: true },
        ),
      );
    }
  };
  const ensureSizeUids = () =>
    getValues(`orders.${orderIdx}.sizes`)?.forEach((s, i) => {
      if (!s?.uid) setValue(`orders.${orderIdx}.sizes.${i}.uid`, genId());
    });
  const insertSizeAt = (at: number) => {
    ensureSizeUids();
    remapSizeEntries(insertMap(at));
    // Render the just-inserted size expanded, not collapsed to a summary (the
    // default for non-active sizes in a saved calc).
    pendingSizeExpand.current = at;
    insertSize(at, makeEmptySize());
  };
  const removeSizeAt = (at: number) => {
    ensureSizeUids();
    remapSizeEntries(removeMap(at));
    removeSize(at);
  };
  const moveSizeTo = (from: number, to: number) => {
    ensureSizeUids();
    remapSizeEntries(moveMap(from, to));
    moveSize(from, to);
  };

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
    if (from !== -1 && to !== -1) moveSizeTo(from, to);
  };

  const watchedSizes = useWatch({ control, name: `orders.${orderIdx}.sizes` });
  // Produced arrays — used to tell which sizes are done (to float them to top).
  const watchedProducedSheets = useWatch({
    control,
    name: `orders.${orderIdx}.producedSheets`,
  });
  const watchedProduced = useWatch({
    control,
    name: `orders.${orderIdx}.producedProfiles`,
  });

  // After a "+" insert, expand the new size (so it opens ready to edit).
  useEffect(() => {
    const idx = pendingSizeExpand.current;
    if (idx === null) return;
    pendingSizeExpand.current = null;
    const id = sizeFields[idx]?.id;
    if (id) setExpandedSizes((s) => new Set(s).add(id));
  }, [sizeFields.length]);

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
    // Carry the origin (saved calc + this order's id) so Piramide can send its
    // re-ordered result back into the same order. Only when editing a saved calc.
    const orderId = getValues(`orders.${orderIdx}.id`);
    stashPiramideImport({
      label: orderName?.trim() || undefined,
      rows: piramideRows,
      origin: editingId && orderId ? { calcId: editingId, orderId } : undefined,
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

  // Which sizes' advanced blocks to show: the active one plus any the user
  // manually expanded from their collapsed summary — so opening a size row also
  // reveals its "Calcolo Avanzato". Null (no active size) → show all.
  const visibleSizeIdxs =
    activeSizeIdx == null
      ? null
      : new Set<number>([
          activeSizeIdx,
          ...sizeFields.flatMap((f, i) => (expandedSizes.has(f.id) ? [i] : [])),
        ]);

  // Profili per pacco per size: its own value, else the previous size's of this
  // order (never across orders) — what an empty size inherits; shown greyed in
  // its field so it can be seen and overridden.
  const effPerPacco: (number | undefined)[] = [];
  (watchedSizes ?? []).forEach((s, i) => {
    const own = Number(s?.profilesPerPackage);
    effPerPacco[i] = own > 0 ? own : effPerPacco[i - 1];
  });

  // A size is "done" once its produced total reaches its quantity. Marking a
  // size complete (✓) fills it, so it becomes done → we float done sizes to the
  // top of the list (display-only: the underlying array & sizeIndex-tagged
  // produced data stay put, so nothing misaligns).
  const isSizeDone = (i: number): boolean => {
    const total = Number(watchedSizes?.[i]?.sheets) || 0;
    if (total <= 0) return false;
    const arr = (isProfiles ? watchedProduced : watchedProducedSheets) ?? [];
    const produced = arr
      .filter((e) => (e?.sizeIndex ?? 0) === i)
      .reduce((s, e) => s + (e?.value ?? 0), 0);
    return produced >= total;
  };
  const idxs = sizeFields.map((_, i) => i);
  const displayOrder = [
    ...idxs.filter((i) => isSizeDone(i)),
    ...idxs.filter((i) => !isSizeDone(i)),
  ];

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
          items={displayOrder.map((i) => sizeFields[i].id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2">
            {displayOrder.map((sIdx) => {
              const sizeField = sizeFields[sIdx];
              const sizeErr = orderErr?.sizes?.[sIdx];
              const showPerPackage = isProfiles && sizeFields.length > 1;
              const canReorder = sizeFields.length > 1;
              // Per-size actions (✓ / ⏭ / ⏹) live in the size's Calcolo
              // Avanzato block — the row keeps just − / +. Profiles: the
              // per-pacco field is a 📦 button in a fixed narrow column (rows
              // stay aligned); expanded, it drops to its own line below the row
              // (order-last), and − / + keep their columns (col-start-4).
              const gridCols = showPerPackage
                ? 'grid-cols-[1fr_1fr_2rem_auto_auto] sm:grid-cols-[1fr_1fr_2.25rem_auto_auto]'
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
                          data-view
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
                      // The size in production blinks (saved view), framed
                      // without shifting the inputs (-mx-2 + px-2).
                      className={`flex items-end gap-2 ${
                        sIdx === activeSizeIdx
                          ? 'active-blink -mx-2 rounded-md border px-2 pt-2'
                          : ''
                      }`}
                    >
                      {canReorder && (
                        <div className="flex shrink-0 items-end pb-5">
                          <button
                            type="button"
                            {...handleProps}
                            aria-label={t('orders.reorder')}
                            title={t('orders.reorder')}
                            className="flex h-8 w-5 cursor-grab touch-none items-center justify-center text-neutral-400 transition hover:text-ink-soft active:cursor-grabbing sm:h-9"
                          >
                            ⠿
                          </button>
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
                <CollapsibleInheritField
                  fieldPath={`orders.${orderIdx}.sizes.${sIdx}.profilesPerPackage`}
                  icon="📦"
                  label={t('orders.profilesPerPackage')}
                  inheritLabel={
                    sIdx > 0 ? t('orders.optionalInherit') : undefined
                  }
                  placeholder={
                    sIdx > 0 && effPerPacco[sIdx - 1]
                      ? String(effPerPacco[sIdx - 1])
                      : undefined
                  }
                  compact
                  expandedClassName="order-last col-span-5 min-w-0 sm:max-w-xs"
                  inputProps={{ min: '1', step: '1', inputMode: 'numeric' }}
                  errorMessage={
                    sizeErr?.profilesPerPackage?.message
                      ? t(`validation.${sizeErr.profilesPerPackage.message}`)
                      : undefined
                  }
                />
              )}

              <button
                type="button"
                onClick={() => removeSizeAt(sIdx)}
                disabled={sizeFields.length <= 1}
                className={`flex h-8 w-8 items-center justify-center rounded-md border border-neutral-300 bg-white text-base font-medium text-ink-soft shadow-sm transition hover:border-danger hover:text-danger disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-neutral-300 disabled:hover:text-ink-soft sm:h-9 sm:w-9 ${
                  showPerPackage ? 'col-start-4' : ''
                }`}
                aria-label={t('orders.removeSize')}
                title={t('orders.removeSize')}
              >
                −
              </button>

              <button
                type="button"
                onClick={() => insertSizeAt(sIdx + 1)}
                className="flex h-8 w-8 items-center justify-center rounded-md border border-brand-300 bg-white text-base font-bold text-brand-700 shadow-sm transition hover:border-brand-600 hover:bg-brand-50 sm:h-9 sm:w-9"
                aria-label={t('orders.addSize')}
                title={t('orders.addSize')}
              >
                +
              </button>
                      </div>
                    </div>
                  )}
                </SortableItem>
              );
            })}
          </div>
        </SortableContext>
      </DndContext>

      {afterSizes?.(visibleSizeIdxs)}

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
