import { useEffect, useState, type ReactNode } from 'react';
import type { TFunction } from 'i18next';

export interface ActiveModalInfo {
  /** Product name or "#N" of the order currently in production. */
  orderLabel: string;
  /** The active size, e.g. "6000 mm". */
  sizeLabel: string;
  /** Produced count at the active size (blinks in the modal). */
  produced: number;
  /** Total count at the active size ("produced / total"). */
  total: number;
  /** Expected finish of the active order (formatted date-time). */
  etaLabel: string;
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
          <Row label={t('orders.productName')} value={info.orderLabel} />
          <Row label={t('activeModal.size')} value={info.sizeLabel} />
          <Row
            label={t('results.produced')}
            value={
              onSaveProduced ? (
                <ProducedEditor
                  produced={info.produced}
                  total={info.total}
                  onSave={onSaveProduced}
                  t={t}
                />
              ) : (
                <>
                  <span className="num-blink">{info.produced}</span> /{' '}
                  {info.total}
                </>
              )
            }
          />
          <Row label={t('activeModal.eta')} value={info.etaLabel} accent />
        </dl>

        <p className="mt-4 text-center text-xs font-medium text-brand-700">
          {t('activeModal.tapToGo')}
        </p>
      </div>
    </div>
  );
}

// Editable produced count ("30 / 60"): type the real amount, "Salva" (or
// Enter) sets it on the active size and recomputes. Its clicks / keys don't
// reach the card (which jumps to the form on tap / Enter).
function ProducedEditor({
  produced,
  total,
  onSave,
  t,
}: {
  produced: number;
  total: number;
  onSave: (produced: number) => void;
  t: TFunction;
}) {
  const [text, setText] = useState(String(produced));
  const n = Number(text);
  const valid = text.trim() !== '' && Number.isFinite(n) && n >= 0;
  const save = () => {
    if (!valid) return;
    onSave(Math.min(Math.round(n), total > 0 ? total : Math.round(n)));
  };
  return (
    <span
      className="inline-flex items-center gap-1.5"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
          e.preventDefault();
          save();
        }
      }}
    >
      <input
        type="number"
        min="0"
        max={total > 0 ? total : undefined}
        step="1"
        inputMode="numeric"
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-label={t('results.produced')}
        className="h-8 w-20 rounded-md border border-neutral-300 bg-white px-2 text-right text-sm font-semibold text-brand-700 shadow-sm focus:border-brand-600 focus:ring-2 focus:ring-brand-200 focus:outline-none"
      />
      <span className="text-ink">/ {total}</span>
      <button
        type="button"
        onClick={save}
        disabled={!valid || Number(text) === produced}
        className="rounded-md bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-neutral-300"
      >
        {t('activeModal.save')}
      </button>
    </span>
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
