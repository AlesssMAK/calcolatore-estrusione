import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useCatalog } from '../contexts/CatalogContext';
import { usePauseSetter } from '../hooks/usePauseSetter';
import { fmtPause, pauseColorHex, type PauseReason } from '../lib/pauseReasons';
import { inputBase } from './formStyles';

/** The two orders on either side of a product change (form numbers + names). */
export interface ProductChangeSides {
  /** Index of the order before the change — the pause goes after it. */
  idx: number;
  from: string;
  to: string;
}

function Sides({ idx, from, to }: ProductChangeSides) {
  return (
    <span className="min-w-0">
      #{idx + 1} {from.trim()} <span aria-hidden>→</span> #{idx + 2} {to.trim()}
    </span>
  );
}

/**
 * "Cambio Prodotto": a different product was just picked next to another one —
 * every product change stops the line, so pick the kind of stop. «Più Tardi»
 * leaves it to the strip between the two orders.
 */
export function ProductChangeModal({
  change,
  onClose,
}: {
  change: ProductChangeSides;
  onClose: () => void;
}) {
  'use no memo';
  const { t } = useTranslation();
  const { settings } = useCatalog();
  const setPause = usePauseSetter();

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

  const pick = (reason: PauseReason | null) => {
    onClose();
    setPause(change.idx, reason);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t('orders.productChangeTitle')}
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
            {t('orders.productChangeTitle')}
          </h2>
          <p className="mt-1 text-sm font-medium break-words text-ink">
            <Sides {...change} />
          </p>
          <p className="mt-1 text-xs text-ink-soft">{t('orders.productChangeText')}</p>
        </div>

        <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 py-3 sm:px-4">
          {settings.pauseReasons.map((r) => {
            const hex = pauseColorHex(r.color);
            return (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => pick(r)}
                  className="flex w-full items-center gap-2 rounded-md border px-3 py-2.5 text-left text-sm text-ink transition hover:brightness-95"
                  style={{ backgroundColor: `${hex}14`, borderColor: `${hex}66` }}
                >
                  <span
                    aria-hidden
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: hex }}
                  />
                  <span className="min-w-0 flex-1 truncate font-medium">⏸ {r.name}</span>
                  {r.durationMin != null && (
                    <span className="shrink-0 text-xs text-ink-soft">
                      {fmtPause(r.durationMin)}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              onClick={() => pick(null)}
              className="flex w-full items-center gap-2 rounded-md border border-neutral-300 bg-white px-3 py-2.5 text-left text-sm text-ink-soft transition hover:border-brand-400 hover:text-ink"
            >
              <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full border border-neutral-400" />
              <span className="min-w-0 flex-1 truncate">{t('orders.pauseFree')}</span>
            </button>
          </li>
        </ul>

        <div className="flex justify-end border-t border-neutral-100 px-4 py-3 sm:px-5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-ink-soft shadow-sm transition hover:border-neutral-400 hover:text-ink"
          >
            {t('orders.productChangeLater')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Between two orders of different products with no pause yet: a reminder
 *  with the reasons to pick from (hidden in the read-only view). */
export function ProductChangeStrip(change: ProductChangeSides) {
  'use no memo';
  const { t } = useTranslation();
  const { settings } = useCatalog();
  const setPause = usePauseSetter();
  const reasons = settings.pauseReasons;

  return (
    <div className="edit-only no-print flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 sm:text-sm">
      <span className="min-w-0 flex-1 basis-48">
        <span className="font-semibold">⚠ {t('orders.productChangeStrip')}</span>
        <span className="block truncate text-[11px] text-amber-800 sm:text-xs">
          <Sides {...change} />
        </span>
      </span>
      <select
        aria-label={t('orders.productChangePick')}
        value=""
        onChange={(e) => {
          const v = e.target.value;
          if (!v) return;
          setPause(change.idx, v === 'free' ? null : (reasons.find((r) => r.id === v) ?? null));
        }}
        // Phones: its own full-width line under the text; sm+: beside it.
        className={`${inputBase} px-2 font-medium sm:w-56 sm:flex-none`}
      >
        <option value="">{t('orders.productChangePick')}</option>
        {reasons.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
            {r.durationMin != null ? ` · ${fmtPause(r.durationMin)}` : ''}
          </option>
        ))}
        <option value="free">{t('orders.pauseFree')}</option>
      </select>
    </div>
  );
}
