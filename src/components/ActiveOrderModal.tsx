import { useEffect, useState, type ReactNode } from 'react';
import type { TFunction } from 'i18next';
import MarqueeText from './MarqueeText';
import OrderNumberTag from './OrderNumberTag';
import PauseNowNote from './PauseNowNote';
import ProducedEditor from './ProducedEditor';
import type { RunningPause } from '../utils/pauseAt';
import { formatDuration } from '../utils/format';

export interface ActiveModalInfo {
  /** Number of the order in production (the form's "#N"). */
  orderNo: number;
  /** Its own typed number, when it has one. */
  orderNumber?: string;
  /** Its product name, when it has one. */
  productName?: string;
  /** The active size, e.g. "6000 mm". */
  sizeLabel: string;
  /** Produced count at the active size (blinks in the modal). */
  produced: number;
  /** Total count at the active size ("produced / total"). */
  total: number;
  /** When the active size ends (multi-size orders only). */
  sizeEnd?: { date: string; time: string };
  /** The order's other sizes still to come, in the order they run, with when
   *  each ends (short date-time). */
  otherSizes: { label: string; end: string }[];
  /** The order's production time still to go, as the results show it. */
  orderMinutes: number;
  /** When the whole order ends. */
  orderEnd: { date: string; time: string };
  /** A pause between blocks running now — then the order above is the one
   *  that starts after it. */
  pause?: RunningPause;
}

interface Props {
  info: ActiveModalInfo;
  /** Close the modal (Esc / backdrop / ✕). */
  onClose: () => void;
  /** Jump to the active size in the form (tap on the modal body). */
  onGoToForm: () => void;
  /** Set the produced count of the active size and recompute. Absent → the
   *  count is shown read-only (total-meters orders, view-only company calcs). */
  onSaveProduced?: (produced: number) => void;
  t: TFunction;
}

/** Shown once when a saved calc is opened: what size of which order is being
 *  produced now, how much is done and when it finishes. Tapping the body jumps
 *  to that size in the form; Esc / backdrop / ✕ close it. */
function ActiveOrderModal({
  info,
  onClose,
  onGoToForm,
  onSaveProduced,
  t,
}: Props) {
  // The produced count turns into an input + "Salva" once tapped.
  const [editing, setEditing] = useState(false);
  const [now] = useState(() => new Date());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    // Lock background scroll while the modal is open.
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t('activeModal.title')}
      onClick={onClose}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation();
          onGoToForm();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onGoToForm();
          }
        }}
        className="relative w-full max-w-sm cursor-pointer rounded-xl border border-neutral-200 bg-white p-5 text-left shadow-xl transition hover:border-brand-300"
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          aria-label={t('actions.close')}
          className="absolute top-2 right-2 rounded p-1.5 text-ink-soft transition hover:bg-neutral-100 hover:text-ink"
        >
          ✕
        </button>

        {info.pause ? (
          // In a pause: which and until when, then the order that follows it.
          <div className="mb-3 space-y-2 pr-6">
            <h2 className="text-base font-semibold text-ink">
              {t('activeModal.paused')}
            </h2>
            <PauseNowNote pause={info.pause} now={now} />
            <p className="text-xs tracking-wide text-ink-soft uppercase">
              {t('activeModal.afterPause')}
            </p>
          </div>
        ) : (
          <div className="mb-3 flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-emerald-500"
              aria-hidden
            />
            <h2 className="text-base font-semibold text-ink">
              {t('activeModal.title')}
            </h2>
          </div>
        )}

        <dl className="space-y-2 text-sm">
          <Row
            label={t('orders.orderNumber')}
            value={
              // "#N" badge as in the form, then its own number (if any).
              <span className="flex min-w-0 items-center justify-end gap-2">
                <span className="shrink-0 rounded-md bg-brand-600 px-2 py-0.5 text-xs font-semibold text-white">
                  #{info.orderNo}
                </span>
                <OrderNumberTag value={info.orderNumber} />
              </span>
            }
          />
          {info.productName && (
            // A name longer than the row scrolls, as everywhere else.
            <Row
              label={t('orders.productName')}
              value={<MarqueeText text={info.productName} />}
            />
          )}
          <Row label={t('activeModal.size')} value={info.sizeLabel} />
          {editing && onSaveProduced ? (
            <ProducedEditor
              produced={info.produced}
              total={info.total}
              onSave={(n) => {
                // Recomputed in place — the modal stays and shows the result.
                setEditing(false);
                onSaveProduced(n);
              }}
              onCancel={() => setEditing(false)}
            />
          ) : (
            <Row
              label={t('results.produced')}
              value={
                <>
                  {onSaveProduced ? (
                    // Looks like the plain count; a tap opens the editor.
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditing(true);
                      }}
                      title={t('activeModal.edit')}
                      aria-label={t('activeModal.edit')}
                      className="num-blink rounded px-1 underline decoration-dotted underline-offset-4 transition hover:bg-neutral-100"
                    >
                      {info.produced}
                    </button>
                  ) : (
                    <span className="num-blink">{info.produced}</span>
                  )}{' '}
                  / {info.total}
                </>
              }
            />
          )}
          {info.sizeEnd && (
            <Row
              label={t('activeModal.sizeEnd')}
              value={<DateTime value={info.sizeEnd} />}
              nowrap
            />
          )}
          {info.otherSizes.length > 0 && (
            // The sizes still to come, smaller: when each of them ends.
            <ul className="space-y-0.5 border-l-2 border-neutral-200 pl-2 text-xs text-ink-soft">
              {info.otherSizes.map((s, i) => (
                <li key={i} className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate">{s.label}</span>
                  <span className="shrink-0 tabular-nums">{s.end}</span>
                </li>
              ))}
            </ul>
          )}
          <Row
            label={t('results.col.productionTime')}
            value={formatDuration(info.orderMinutes, {
              day: t('units.day'),
              hour: t('units.hour'),
              minute: t('units.minute'),
            })}
            nowrap
          />
          <Row
            label={t('activeModal.orderEnd')}
            value={<DateTime value={info.orderEnd} />}
            accent
            nowrap
          />
        </dl>

        <p className="mt-4 text-center text-xs font-medium text-brand-700">
          {t('activeModal.tapToGo')}
        </p>
      </div>
    </div>
  );
}

// A date + time, always on one line.
function DateTime({ value }: { value: { date: string; time: string } }) {
  return (
    <>
      {value.date} <span className="ml-0.5">{value.time}</span>
    </>
  );
}

function Row({
  label,
  value,
  accent,
  nowrap,
}: {
  label: string;
  value: ReactNode;
  accent?: boolean;
  /** The value stays whole on one line (a date, a time): the label wraps
   *  instead. Otherwise the value is cut short (a long product name). */
  nowrap?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt
        className={`text-xs tracking-wide text-ink-soft uppercase ${
          nowrap ? 'min-w-0' : 'shrink-0'
        }`}
      >
        {label}
      </dt>
      {/* 12px on a 320px screen, 14px from 375px: a date and its time fit. */}
      <dd
        className={`text-right text-[clamp(12px,3.75vw,14px)] font-semibold ${
          nowrap ? 'shrink-0 whitespace-nowrap' : 'min-w-0 truncate'
        } ${accent ? 'text-brand-700' : 'text-ink'}`}
      >
        {value}
      </dd>
    </div>
  );
}

export default ActiveOrderModal;
