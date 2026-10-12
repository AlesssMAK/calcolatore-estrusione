import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { TFunction } from 'i18next';

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
  /** Expected finish of the active order — date and time apart, so the time
   *  can drop to its own line on a narrow screen. */
  eta: { date: string; time: string };
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

        <div className="mb-3 flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-emerald-500"
            aria-hidden
          />
          <h2 className="text-base font-semibold text-ink">
            {t('activeModal.title')}
          </h2>
        </div>

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
              onSave={onSaveProduced}
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
          <Row
            label={t('activeModal.eta')}
            value={
              // The time drops under the date when both don't fit.
              <span className="flex flex-wrap justify-end gap-x-1.5">
                <span className="whitespace-nowrap">{info.eta.date}</span>
                <span className="whitespace-nowrap">{info.eta.time}</span>
              </span>
            }
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

// Editing the produced count (opened by tapping it): its own full-width line
// under the label — input, "/ total", "Salva" — so it fits a 320px screen.
// "Salva" (or Enter) sets it on the active size and recomputes; Esc cancels.
// Its clicks / keys don't reach the card (which jumps to the form on tap /
// Enter) nor the modal's Esc-to-close.
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
          className="h-9 shrink-0 rounded-md bg-brand-600 px-3 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-neutral-300"
        >
          {t('activeModal.save')}
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
