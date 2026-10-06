import { useEffect, useMemo, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { FormValues } from '../formSchema';
import type { CalculatorMode } from '../types';
import { liveSchedule } from '../utils/liveSchedule';
import {
  resolveSequence,
  stepInfo,
  stepRemaining,
  type SeqStep,
} from '../utils/queue';

interface Props {
  mode: CalculatorMode;
  /** The step being stopped (the active size). */
  stopped: SeqStep;
  onClose: () => void;
  /** The size really in production now — it runs first, the stopped one
   *  resumes right after it. */
  onPick: (target: SeqStep) => void;
}

/** ⏹ "Ferma produzione": "what's in production now?" — the sizes still to make
 *  (in their current order). Picking one makes it the active size. */
function StopPicker({ mode, stopped, onClose, onPick }: Props) {
  'use no memo';
  const { t } = useTranslation();
  const { getValues } = useFormContext<FormValues>();
  const [values] = useState(() => getValues());
  const orders = values.orders ?? [];
  const live = useMemo(() => liveSchedule(values, mode), [values, mode]);
  const steps = resolveSequence(values.settings?.queue, orders).filter(
    (s) =>
      !(s.orderIdx === stopped.orderIdx && s.sizeIdx === stopped.sizeIdx) &&
      (!live || stepRemaining(live, s) >= 0.5),
  );
  const stoppedInfo = stepInfo(orders, stopped);

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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t('stop.title')}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative flex max-h-[90vh] w-full max-w-md flex-col rounded-xl border border-neutral-200 bg-white shadow-xl"
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
            ⏹ {t('stop.title')}
          </h2>
          <p className="mt-1 text-xs text-ink-soft">
            {t('stop.hint', {
              size: `${stoppedInfo.size} (#${stoppedInfo.orderNo})`,
            })}
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-4">
          {steps.length === 0 ? (
            <p className="px-1 py-2 text-sm text-ink-soft">{t('stop.empty')}</p>
          ) : (
            <ul className="space-y-1.5">
              {steps.map((s) => {
                const info = stepInfo(orders, s);
                return (
                  <li key={`${s.orderIdx}:${s.sizeIdx ?? '*'}`}>
                    <button
                      type="button"
                      onClick={() => {
                        onPick(s);
                        onClose();
                      }}
                      className="flex w-full items-center gap-2 rounded-md border border-neutral-200 bg-white px-3 py-2 text-left transition hover:border-brand-400 hover:bg-brand-50"
                    >
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
                      <span aria-hidden className="shrink-0 text-brand-600">
                        ▶
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex justify-end border-t border-neutral-100 px-4 py-3 sm:px-5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-ink-soft shadow-sm transition hover:border-neutral-400 hover:text-ink"
          >
            {t('queue.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default StopPicker;
