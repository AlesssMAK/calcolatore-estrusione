import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { TFunction } from 'i18next';
import { CalcIcon } from './ActionIcons';
import PauseNowNote from './PauseNowNote';
import type { RunningPause } from '../utils/pauseAt';

export interface ActiveModalInfo {
  /** Number of the order in production (the form's "#N"). */
  orderNo: number;
  /** Its product name, when it has one. */
  productName?: string;
  /** The active size, e.g. "6000 mm". */
  sizeLabel: string;
  /** Produced count at the active size (blinks in the modal). */
  produced: number;
  /** Total count at the active size ("produced / total"). */
  total: number;
  /** When the active size ends (multi-size orders only) — date and time apart,
   *  so the time can drop to its own line on a narrow screen. */
  sizeEnd?: { date: string; time: string };
  /** The order's other sizes still to come, in the order they run, with when
   *  each ends (short date-time). */
  otherSizes: { label: string; end: string }[];
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
            label={t('orders.productName')}
            value={
              // "#N" badge as in the form, then the name (if any).
              <span className="flex min-w-0 items-center justify-end gap-2">
                <span className="shrink-0 rounded-md bg-brand-600 px-2 py-0.5 text-xs font-semibold text-white">
                  #{info.orderNo}
                </span>
                {info.productName && (
                  <span className="min-w-0 truncate">{info.productName}</span>
                )}
              </span>
            }
          />
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
              t={t}
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
            label={t('activeModal.orderEnd')}
            value={<DateTime value={info.orderEnd} />}
            accent
          />
        </dl>

        <p className="mt-4 text-center text-xs font-medium text-brand-700">
          {t('activeModal.tapToGo')}
        </p>
      </div>
    </div>
  );
}

// A date + time whose time drops under the date when both don't fit.
function DateTime({ value }: { value: { date: string; time: string } }) {
  return (
    <span className="flex flex-wrap justify-end gap-x-1.5">
      <span className="whitespace-nowrap">{value.date}</span>
      <span className="whitespace-nowrap">{value.time}</span>
    </span>
  );
}

// Editing the produced count (opened by tapping it): its own full-width line
// under the label — input, "/ total", the Calcola icon — so it fits a 320px
// screen. Calcola (or Enter) sets it on the active size and recomputes at once;
// Esc cancels. Its clicks / keys don't reach the card (which jumps to the form
// on tap / Enter) nor the modal's Esc-to-close.
function ProducedEditor({
  produced,
  total,
  onSave,
  onCancel,
  t,
}: {
  produced: number;
  total: number;
  onSave: (produced: number) => void;
  onCancel: () => void;
  t: TFunction;
}) {
  const [text, setText] = useState(String(produced));
  // Focus + select the count right away — without scrolling the page behind
  // the modal (autoFocus would).
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
    inputRef.current?.select();
  }, []);
  const n = Number(text);
  const valid = text.trim() !== '' && Number.isFinite(n) && n >= 0;
  const save = () => {
    if (!valid) return;
    onSave(Math.min(Math.round(n), total > 0 ? total : Math.round(n)));
  };
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
          e.preventDefault();
          save();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          onCancel();
        }
      }}
    >
      <dt className="text-xs tracking-wide text-ink-soft uppercase">
        {t('results.produced')}
      </dt>
      <dd className="mt-1 flex items-center gap-2">
        <input
          type="number"
          min="0"
          max={total > 0 ? total : undefined}
          step="1"
          inputMode="numeric"
          value={text}
          onChange={(e) => setText(e.target.value)}
          ref={inputRef}
          aria-label={t('results.produced')}
          className="h-9 min-w-0 flex-1 rounded-md border border-neutral-300 bg-white px-2 text-right text-sm font-semibold text-brand-700 shadow-sm focus:border-brand-600 focus:ring-2 focus:ring-brand-200 focus:outline-none"
        />
        <span className="shrink-0 font-semibold text-ink">/ {total}</span>
        <button
          type="button"
          onClick={save}
          disabled={!valid || Number(text) === produced}
          aria-label={t('activeModal.calculate')}
          title={t('activeModal.calculate')}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand-600 text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-neutral-300"
        >
          <CalcIcon />
        </button>
      </dd>
    </div>
  );
}

function Row({
  label,
  value,
  accent,
}: {
  label: string;
  value: ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-xs tracking-wide text-ink-soft uppercase">
        {label}
      </dt>
      <dd
        className={`min-w-0 truncate text-right font-semibold ${
          accent ? 'text-brand-700' : 'text-ink'
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

export default ActiveOrderModal;
