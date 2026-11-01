import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

/** What an order takes over from the block it moves into. */
export interface BlockParams {
  productName?: string;
  speedMPerMin?: number;
  cavity?: number;
}

/**
 * Moving an order into another block: it takes that block's parameters
 * (product, speed, cavity) — confirm first, since it changes the order (and a
 * block left empty disappears with its pause).
 */
export default function MoveToBlockModal({
  order,
  block,
  params,
  emptied,
  onConfirm,
  onClose,
}: {
  /** "#3 COMPACT 333/45" */
  order: string;
  /** Number of the block it moves into (1-based). */
  block: number;
  params: BlockParams;
  /** The block it leaves, when that one is left empty (its number, and
   *  whether a pause closed it). */
  emptied: { n: number; withPause: boolean } | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();

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

  const rows: [string, string][] = [];
  if (params.productName?.trim()) rows.push([t('orders.productName'), params.productName.trim()]);
  if (params.speedMPerMin !== undefined) {
    rows.push([t('orders.speed'), String(params.speedMPerMin)]);
  }
  if (params.cavity !== undefined) rows.push([t('orders.cavity'), String(params.cavity)]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t('orders.moveTitle', { n: block })}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl border border-neutral-200 bg-white shadow-xl"
      >
        <div className="px-4 pt-4 pb-3 sm:px-5">
          <h2 className="text-base font-semibold text-ink">
            {t('orders.moveTitle', { n: block })}
          </h2>
          <p className="mt-1 text-sm font-medium break-words text-ink">{order}</p>
          <p className="mt-2 text-xs text-ink-soft">{t('orders.moveText')}</p>
          {rows.length > 0 && (
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-md bg-surface-alt px-3 py-2 text-sm">
              {rows.map(([label, value]) => (
                <div key={label} className="contents">
                  <dt className="text-ink-soft">{label}</dt>
                  <dd className="min-w-0 font-medium break-words text-ink">{value}</dd>
                </div>
              ))}
            </dl>
          )}
          {emptied !== null && (
            <p className="mt-2 rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
              ⚠{' '}
              {t(emptied.withPause ? 'orders.moveEmpties' : 'orders.moveEmptiesNoPause', {
                n: emptied.n,
              })}
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-neutral-100 px-4 py-3 sm:px-5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-ink-soft shadow-sm transition hover:border-neutral-400 hover:text-ink"
          >
            {t('orders.moveCancel')}
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              onConfirm();
            }}
            className="rounded-md border border-brand-600 bg-brand-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
          >
            {t('orders.moveConfirm')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
