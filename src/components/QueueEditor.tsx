import { useEffect, useMemo, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import SortableItem from './SortableItem';
import type { FormValues } from '../formSchema';
import type { CalculatorMode } from '../types';
import { liveSchedule } from '../utils/liveSchedule';
import {
  naturalSequence,
  resolveSequence,
  stepDone,
  stepInfo,
  type SeqStep,
} from '../utils/queue';

interface Props {
  mode: CalculatorMode;
  onClose: () => void;
  /** Save the arranged sequence (the form decides whether it's still custom). */
  onApply: (seq: SeqStep[]) => void;
}

const stepKey = (s: SeqStep) => `${s.orderIdx}:${s.sizeIdx ?? '*'}`;

/**
 * "Ordine coda": every size of every order in its real production order,
 * re-arrangeable (drag the ⠿ handle, or ↑/↓). Sizes of different orders may
 * follow each other; in the form and results they stay under their order.
 */
function QueueEditor({ mode, onClose, onApply }: Props) {
  'use no memo';
  const { t } = useTranslation();
  const { getValues } = useFormContext<FormValues>();
  // Snapshot of the form when opened — the editor works on it until Applica.
  const [values] = useState(() => getValues());
  const orders = values.orders ?? [];
  const live = useMemo(() => liveSchedule(values, mode), [values, mode]);
  const [seq, setSeq] = useState<SeqStep[]>(() =>
    resolveSequence(values.settings?.queue, orders),
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = seq.findIndex((s) => stepKey(s) === active.id);
    const to = seq.findIndex((s) => stepKey(s) === over.id);
    if (from !== -1 && to !== -1) setSeq((cur) => arrayMove(cur, from, to));
  };
  const shift = (i: number, dir: -1 | 1) =>
    setSeq((cur) => {
      const j = i + dir;
      return j < 0 || j >= cur.length ? cur : arrayMove(cur, i, j);
    });

  const arrowCls =
    'flex h-8 w-8 items-center justify-center rounded-md border border-neutral-300 bg-white text-sm text-ink-soft shadow-sm transition hover:border-brand-500 hover:text-brand-600 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-neutral-300 disabled:hover:text-ink-soft';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t('queue.title')}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative flex max-h-[90vh] w-full max-w-lg flex-col rounded-xl border border-neutral-200 bg-white shadow-xl"
      >
        <div className="border-b border-neutral-100 px-4 pt-4 pb-3 sm:px-5">
          <button
            type="button"
            onClick={onClose}
            aria-label={t('actions.close')}
            className="absolute top-2 right-2 rounded p-1.5 text-ink-soft transition hover:bg-neutral-100 hover:text-ink"
          >
            ✕
          </button>
          <h2 className="pr-8 text-base font-semibold text-ink">
            🔀 {t('queue.title')}
          </h2>
          <p className="mt-1 text-xs text-ink-soft">{t('queue.hint')}</p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-4">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onDragEnd}
          >
            <SortableContext
              items={seq.map(stepKey)}
              strategy={verticalListSortingStrategy}
            >
              <ol className="space-y-1.5">
                {seq.map((s, i) => {
                  const info = stepInfo(orders, s);
                  const done = !!live && stepDone(live, s);
                  return (
                    <SortableItem key={stepKey(s)} id={stepKey(s)}>
                      {({ setNodeRef, style, handleProps }) => (
                        <li
                          ref={setNodeRef}
                          style={style}
                          className={`flex items-center gap-2 rounded-md border px-2 py-1.5 ${
                            done
                              ? 'border-neutral-200 bg-neutral-50 opacity-60'
                              : 'border-neutral-200 bg-white'
                          }`}
                        >
                          <button
                            type="button"
                            {...handleProps}
                            aria-label={t('orders.reorder')}
                            title={t('orders.reorder')}
                            className="flex h-8 w-5 shrink-0 cursor-grab touch-none items-center justify-center text-neutral-400 transition hover:text-ink-soft active:cursor-grabbing"
                          >
                            ⠿
                          </button>
                          <span className="w-6 shrink-0 text-right text-xs font-semibold text-ink-soft">
                            {i + 1}.
                          </span>
                          <span className="shrink-0 rounded bg-brand-100 px-1.5 py-0.5 text-[10px] font-bold text-brand-700">
                            #{info.orderNo}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-ink">
                              {info.size}
                            </span>
                            {info.name && (
                              <span className="block truncate text-[11px] text-ink-soft">
                                {info.name}
                              </span>
                            )}
                          </span>
                          {done && (
                            <span
                              className="shrink-0 text-xs font-semibold text-success"
                              title={t('queue.done')}
                            >
                              ✓
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => shift(i, -1)}
                            disabled={i === 0}
                            aria-label={t('queue.moveUp')}
                            title={t('queue.moveUp')}
                            className={arrowCls}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            onClick={() => shift(i, 1)}
                            disabled={i === seq.length - 1}
                            aria-label={t('queue.moveDown')}
                            title={t('queue.moveDown')}
                            className={arrowCls}
                          >
                            ↓
                          </button>
                        </li>
                      )}
                    </SortableItem>
                  );
                })}
              </ol>
            </SortableContext>
          </DndContext>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-neutral-100 px-4 py-3 sm:px-5">
          <button
            type="button"
            onClick={() => setSeq(naturalSequence(orders))}
            className="mr-auto rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-ink-soft shadow-sm transition hover:border-brand-500 hover:text-brand-600"
          >
            ↺ {t('queue.natural')}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-ink-soft shadow-sm transition hover:border-neutral-400 hover:text-ink"
          >
            {t('queue.cancel')}
          </button>
          <button
            type="button"
            onClick={() => {
              onApply(seq);
              onClose();
            }}
            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
          >
            {t('queue.apply')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default QueueEditor;
