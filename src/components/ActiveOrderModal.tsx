import { useEffect } from 'react';
import type { TFunction } from 'i18next';

export interface ActiveModalInfo {
  /** Product name or "#N" of the order currently in production. */
  orderLabel: string;
  /** The active size, e.g. "6000 mm". */
  sizeLabel: string;
  /** Produced / total at the active size, e.g. "40 / 120 pz". */
  producedLabel: string;
  /** Expected finish of the active order (formatted date-time). */
  etaLabel: string;
}

interface Props {
  info: ActiveModalInfo;
  /** Close the modal (Esc / backdrop / ✕). */
  onClose: () => void;
  /** Jump to the active size in the form (tap on the modal body). */
  onGoToForm: () => void;
  t: TFunction;
}

/** Shown once when a saved calc is opened: what size of which order is being
 *  produced now, how much is done and when it finishes. Tapping the body jumps
 *  to that size in the form; Esc / backdrop / ✕ close it. */
function ActiveOrderModal({ info, onClose, onGoToForm, t }: Props) {
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
          <Row label={t('results.produced')} value={info.producedLabel} />
          <Row label={t('activeModal.eta')} value={info.etaLabel} accent />
        </dl>

        <p className="mt-4 text-center text-xs font-medium text-brand-700">
          {t('activeModal.tapToGo')}
        </p>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
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
