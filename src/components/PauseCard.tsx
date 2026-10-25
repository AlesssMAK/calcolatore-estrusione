import { useEffect, useRef, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { FormValues } from '../formSchema';
import { useCatalog } from '../contexts/CatalogContext';
import { fmtPause, pauseColorHex } from '../lib/pauseReasons';
import { numericSetValueAs } from '../utils/numeric';
import FieldError from './FieldError';
import { inputBase } from './formStyles';

// Pause slots (minutes): 30-min steps up to 12 h.
const PAUSE_SLOTS: number[] = [];
for (let m = 30; m <= 720; m += 30) PAUSE_SLOTS.push(m);

/**
 * The pause after an order, as its own small card between two orders (it closes
 * a block): the company's "Causale di Fermo" (colour + standard duration, still
 * editable) or a plain pause, and its minutes.
 */
function PauseCard({ idx, isLast }: { idx: number; isLast: boolean }) {
  'use no memo';
  const { t } = useTranslation();
  const {
    control,
    setValue,
    formState: { errors },
  } = useFormContext<FormValues>();
  const { settings } = useCatalog();
  const reasons = settings.pauseReasons;
  const reason = useWatch({ control, name: `orders.${idx}.gapReason` });
  const minutes = Number(useWatch({ control, name: `orders.${idx}.gapAfterMin` })) || 0;
  const hex = pauseColorHex(reason?.color ?? 'grey');
  const opts = { shouldDirty: true, shouldValidate: true };

  // A reason no longer in the company list (edited / deleted, or another
  // company's calc) still shows by its saved name.
  const known = !!reason?.id && reasons.some((r) => r.id === reason.id);
  const pick = (value: string) => {
    if (!value) {
      setValue(`orders.${idx}.gapReason`, undefined, opts);
      return;
    }
    const r = reasons.find((x) => x.id === value);
    if (!r) return;
    setValue(
      `orders.${idx}.gapReason`,
      { id: r.id, name: r.name, color: r.color, defaultMin: r.durationMin },
      opts,
    );
    if (r.durationMin != null) setValue(`orders.${idx}.gapAfterMin`, r.durationMin, opts);
  };
  const standard = reason?.defaultMin ?? null;
  const err = errors.orders?.[idx]?.gapAfterMin?.message;

  return (
    <div
      className="rounded-lg border px-3 py-2 sm:px-4"
      style={{ backgroundColor: `${hex}14`, borderColor: `${hex}66` }}
    >
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: hex }}
        />
        {reasons.length > 0 || reason ? (
          <select
            aria-label={t('orders.pauseReason')}
            title={t('orders.pauseReason')}
            value={reason ? (known ? reason.id : 'saved') : ''}
            onChange={(e) => pick(e.target.value)}
            className={`${inputBase} min-w-0 flex-1 px-2 font-medium`}
          >
            <option value="">{t('orders.pauseFree')}</option>
            {reason && !known && <option value="saved">{reason.name}</option>}
            {reasons.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
                {r.durationMin != null ? ` · ${fmtPause(r.durationMin)}` : ''}
              </option>
            ))}
          </select>
        ) : (
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
            ⏸ {t('orders.togglePause')}
          </span>
        )}
        <button
          type="button"
          onClick={() => setValue(`orders.${idx}.gapEnabled`, false, opts)}
          aria-label={t('orders.pauseRemove')}
          title={t('orders.pauseRemove')}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-ink-soft transition hover:bg-white hover:text-danger sm:h-9 sm:w-9"
        >
          ✕
        </button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <div className="w-32 sm:w-36">
          <PauseField idx={idx} t={t} />
        </div>
        <span className="text-xs text-ink-soft">
          min{minutes >= 60 ? ` · ${fmtPause(minutes)}` : ''}
        </span>
        {standard != null && minutes !== standard && (
          <button
            type="button"
            onClick={() => setValue(`orders.${idx}.gapAfterMin`, standard, opts)}
            className="text-xs font-medium text-brand-700 transition hover:text-brand-800"
          >
            ↺ {t('orders.pauseStandard', { d: fmtPause(standard) })}
          </button>
        )}
      </div>
      {isLast && <p className="mt-1 text-[11px] text-ink-soft">{t('orders.pauseNoNext')}</p>}
      <FieldError message={err ? t(`validation.${err}`) : undefined} />
    </div>
  );
}

// Minutes: free numeric input + a ▾ list of 30-min slots to pick.
function PauseField({ idx, t }: { idx: number; t: TFunction }) {
  'use no memo';
  const { register, setValue, control } = useFormContext<FormValues>();
  const value = useWatch({ control, name: `orders.${idx}.gapAfterMin` });
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const pick = (m: number) => {
    setValue(`orders.${idx}.gapAfterMin`, m, {
      shouldValidate: true,
      shouldDirty: true,
    });
    setOpen(false);
  };

  return (
    <div ref={wrapperRef} className="relative flex gap-1.5">
      <input
        type="number"
        min="0"
        step="1"
        inputMode="numeric"
        aria-label={t('orders.gapAfter')}
        className={inputBase}
        {...register(`orders.${idx}.gapAfterMin`, {
          setValueAs: numericSetValueAs,
        })}
      />
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={t('orders.pauseSlots')}
        aria-label={t('orders.pauseSlots')}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-neutral-300 bg-white text-xs text-ink-soft shadow-sm transition hover:border-brand-400 hover:text-ink sm:h-9 sm:w-9"
      >
        ▾
      </button>
      {open && (
        <ul
          role="listbox"
          className="absolute top-full left-0 z-30 mt-1 max-h-60 w-44 overflow-y-auto rounded-md border border-neutral-200 bg-white py-1 shadow-lg"
        >
          {PAUSE_SLOTS.map((m) => (
            <li key={m}>
              <button
                type="button"
                role="option"
                aria-selected={Number(value) === m}
                onClick={() => pick(m)}
                className={`flex w-full items-center justify-between px-3 py-2 text-left text-xs transition hover:bg-brand-50 hover:text-brand-700 sm:text-sm ${
                  Number(value) === m
                    ? 'bg-brand-50 font-semibold text-brand-700'
                    : 'text-ink'
                }`}
              >
                <span>{fmtPause(m)}</span>
                {m >= 60 && (
                  <span className="text-[10px] text-ink-soft sm:text-xs">
                    {m} min
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default PauseCard;
