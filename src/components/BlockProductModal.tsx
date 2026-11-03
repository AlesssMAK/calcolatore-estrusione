import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import type { BlockParams } from './MoveToBlockModal';

/**
 * The first order of a block gets another product: the whole block with it
 * (product, speed, cavity), or only this order — which then leaves the block
 * (into a block already making that product, or one of its own where it is).
 */
export default function BlockProductModal({
  block,
  order,
  from,
  to,
  members,
  params,
  join,
  onAll,
  onOne,
  onClose,
}: {
  /** Number of its block (1-based). */
  block: number;
  /** "#3" */
  order: string;
  from: string;
  to: string;
  /** "#3–#6" */
  members: string;
  params: BlockParams;
  /** Number of the block it would go into (same product) on «only this»;
   *  null → a block of its own. */
  join: number | null;
  onAll: () => void;
  onOne: () => void;
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
  if (params.speedMPerMin !== undefined) {
    rows.push([t('orders.speed'), String(params.speedMPerMin)]);
  }
  if (params.cavity !== undefined) rows.push([t('orders.cavity'), String(params.cavity)]);

  const btn =
    'rounded-md border px-3 py-2 text-sm shadow-sm transition';
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t('orders.renameTitle', { n: block })}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl border border-neutral-200 bg-white shadow-xl"
      >
        <div className="px-4 pt-4 pb-3 sm:px-5">
          <h2 className="text-base font-semibold text-ink">
            {t('orders.renameTitle', { n: block })}
          </h2>
          <p className="mt-1 text-sm font-medium break-words text-ink">
            {order} {from.trim()} <span aria-hidden>→</span> {to.trim()}
          </p>
          <p className="mt-2 text-xs text-ink-soft">
            {t(rows.length > 0 ? 'orders.renameAllParams' : 'orders.renameAll', {
              list: members,
            })}
          </p>
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
          <p className="mt-2 text-xs text-ink-soft">
            {join !== null
              ? t('orders.renameOneJoin', { order, n: join })
              : t('orders.renameOneStay', { order })}
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-neutral-100 px-4 py-3 sm:px-5">
          <button
            type="button"
            onClick={onClose}
            className={`${btn} border-neutral-300 bg-white font-medium text-ink-soft hover:border-neutral-400 hover:text-ink`}
          >
            {t('orders.moveCancel')}
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              onOne();
            }}
            className={`${btn} border-brand-300 bg-brand-50 font-medium text-brand-700 hover:border-brand-500 hover:bg-brand-100`}
          >
            {t('orders.renameOneConfirm')}
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              onAll();
            }}
            className={`${btn} border-brand-600 bg-brand-600 font-semibold text-white hover:bg-brand-700`}
          >
            {t('orders.renameAllConfirm')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
