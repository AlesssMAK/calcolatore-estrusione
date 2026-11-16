import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCatalog } from '../contexts/CatalogContext';
import { pauseColorHex, reasonSnapshot } from '../lib/pauseReasons';
import type { CalcHold, PauseReasonSnapshot } from '../types';
import BareButton from './BareButton';
import DateTimePicker from './DateTimePicker';
import { CloseIcon, HaltIcon } from './ActionIcons';

/**
 * "Ferma fino a…": the line stops now — what's made is kept — and the rest
 * waits until the moment picked, whatever the schedule says (a stop of days).
 * Why (the company's Causali di Fermo, or none) and until when. Opened again
 * on a running stop: its reason and moment, to change.
 */
function HaltModal({
  hold,
  onApply,
  onClose,
}: {
  /** The stop running now (to change), or none (a new one). */
  hold?: CalcHold;
  onApply: (until: Date, reason?: PauseReasonSnapshot) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { settings } = useCatalog();
  const reasons = settings.pauseReasons;
  const [reason, setReason] = useState<PauseReasonSnapshot | undefined>(hold?.reason);
  const [until, setUntil] = useState<Date | null>(hold ? new Date(hold.until) : null);
  const [tried, setTried] = useState(false);
  // A moment to come (from when the window opened; checked again on apply).
  const [openedAt] = useState(() => Date.now());
  const invalid = !until || until.getTime() <= openedAt;

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

  const apply = () => {
    setTried(true);
    if (invalid || until!.getTime() <= Date.now()) return;
    onApply(until!, reason);
    onClose();
  };
  const chip = (key: string, label: string, color: string | undefined, on: boolean, pick: () => void) => (
    <button
      key={key}
      type="button"
      role="radio"
      aria-checked={on}
      onClick={pick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition sm:text-sm ${
        on
          ? 'border-brand-500 bg-brand-50 font-semibold text-brand-700'
          : 'border-neutral-300 bg-white text-ink hover:border-brand-400'
      }`}
    >
      <span
        aria-hidden
        className={`h-2 w-2 shrink-0 rounded-full ${color ? '' : 'border border-neutral-400'}`}
        style={color ? { backgroundColor: pauseColorHex(color) } : undefined}
      />
      {label}
    </button>
  );
  const err = tried && invalid ? t(until ? 'halt.future' : 'validation.pickResume') : undefined;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t('halt.title')}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative flex max-h-[90vh] w-full max-w-md flex-col rounded-xl border border-neutral-200 bg-white shadow-xl"
      >
        <div className="border-b border-neutral-100 px-4 pt-4 pb-3 sm:px-5">
          <BareButton
            onClick={onClose}
            title={t('actions.close')}
            iconCls="text-ink-soft group-hover/ib:text-ink group-focus-visible/ib:text-ink"
            className="absolute top-2 right-2"
          >
            <CloseIcon className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
          </BareButton>
          <h2 className="flex items-center gap-2 pr-8 text-base font-semibold text-ink">
            <HaltIcon className="h-4.5 w-4.5 shrink-0 text-amber-600" />
            {t(hold ? 'halt.editTitle' : 'halt.title')}
          </h2>
          <p className="mt-1 text-xs text-ink-soft">{t('halt.hint')}</p>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
          <div>
            <p className="mb-1.5 text-xs font-medium text-ink-soft">{t('orders.pauseReason')}</p>
            <div role="radiogroup" aria-label={t('orders.pauseReason')} className="flex flex-wrap gap-1.5">
              {chip('free', t('orders.pauseFree'), undefined, !reason, () => setReason(undefined))}
              {reason && !reasons.some((r) => r.id === reason.id) &&
                chip('saved', reason.name, reason.color, true, () => undefined)}
              {reasons.map((r) =>
                chip(r.id, r.name, r.color, reason?.id === r.id, () => setReason(reasonSnapshot(r))),
              )}
            </div>
          </div>
          <div data-error={err}>
            <label htmlFor="halt-until" className="mb-1.5 block text-xs font-medium text-ink-soft">
              {t('halt.until')}
            </label>
            <DateTimePicker
              id="halt-until"
              selected={until}
              onChange={setUntil}
              timeIntervals={30}
              minDate={new Date()}
              placeholder={t('orders.pauseUntilPick')}
              invalid={!!err}
              wrapperClassName="block w-full"
            />
            {err && <p className="mt-1 text-xs text-danger">{err}</p>}
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-neutral-100 px-4 py-3 sm:px-5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-ink-soft shadow-sm transition hover:border-brand-500 hover:text-brand-600"
          >
            {t('halt.cancel')}
          </button>
          <button
            type="button"
            onClick={apply}
            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
          >
            {t(hold ? 'halt.save' : 'halt.apply')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default HaltModal;
