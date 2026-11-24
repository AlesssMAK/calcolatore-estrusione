import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';

/**
 * ▶ on a paused calc while the schedule has the line off or still warming up
 * (it would start only at `at`): is the line producing already — start now,
 * no warm-up — or does it start at the next shift? Closing it starts nothing.
 */
export default function StartChoiceModal({
  at,
  onChoose,
}: {
  /** When production would start on the schedule. */
  at: Date;
  /** true = start now, false = from the next shift, null = closed. */
  onChoose: (startNow: boolean | null) => void;
}) {
  const { t } = useTranslation();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onChoose(null);
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onChoose]);

  const sameDay = at.toDateString() === new Date().toDateString();
  const when = format(at, sameDay ? 'HH:mm' : 'dd.MM.yyyy HH:mm');

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t('startChoice.title')}
      onClick={() => onChoose(null)}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-md rounded-xl border border-neutral-200 bg-white shadow-xl"
      >
        <div className="flex items-start justify-between gap-2 px-4 pt-4 pb-3 sm:px-5">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-ink">
              {t('startChoice.title')}
            </h2>
            <p className="mt-2 text-sm text-ink-soft">
              {t('startChoice.text', { when })}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onChoose(null)}
            aria-label={t('startChoice.close')}
            className="-mt-1 -mr-1 shrink-0 rounded p-1 text-xl leading-none text-ink-soft hover:text-ink"
          >
            ×
          </button>
        </div>
        <div className="flex flex-col-reverse gap-2 border-t border-neutral-100 px-4 py-3 sm:flex-row sm:justify-end sm:px-5">
          <button
            type="button"
            onClick={() => onChoose(false)}
            className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-ink-soft shadow-sm transition hover:border-neutral-400 hover:text-ink"
          >
            {t('startChoice.later')}
          </button>
          <button
            type="button"
            onClick={() => onChoose(true)}
            className="rounded-md border border-brand-600 bg-brand-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
          >
            ▶ {t('startChoice.now')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
