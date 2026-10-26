import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { FormValues } from '../formSchema';
import { useCatalog } from '../contexts/CatalogContext';
import {
  fmtPause,
  pauseColorHex,
  reasonSnapshot,
  type PauseReason,
} from '../lib/pauseReasons';
import type { PauseReasonSnapshot } from '../types';
import { numericSetValueAs } from '../utils/numeric';
import FieldError from './FieldError';
import { inputBase } from './formStyles';
import MarqueeText from './MarqueeText';
import { PauseKeptNote, type ProductChangeSides } from './ProductChange';

// Pause slots (minutes): 30-min steps up to 12 h.
const PAUSE_SLOTS: number[] = [];
for (let m = 30; m <= 720; m += 30) PAUSE_SLOTS.push(m);

/** How long the "can't remove" note stays. */
const KEPT_NOTE_MS = 6000;

/**
 * The pause after an order, as its own small card between two orders (it closes
 * a block): the company's "Causale di Fermo" (colour + standard duration, still
 * editable) or a plain pause, and its minutes. The minutes show for a plain
 * pause / a reason with a free duration; a fixed one keeps them folded (▸).
 */
function PauseCard({
  idx,
  isLast,
  onRemove,
  kept,
  clearKept,
}: {
  idx: number;
  isLast: boolean;
  /** ✕ — refused (→ `kept`) between two different products. */
  onRemove: () => void;
  /** Set when a removal was just refused: the products around it. */
  kept: ProductChangeSides | null;
  clearKept: Dispatch<SetStateAction<number | null>>;
}) {
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
  const [expanded, setExpanded] = useState(false);

  // The "can't remove" note goes away by itself.
  useEffect(() => {
    if (!kept) return;
    const timer = setTimeout(() => clearKept((k) => (k === idx ? null : k)), KEPT_NOTE_MS);
    return () => clearTimeout(timer);
  }, [kept, idx, clearKept]);

  const pick = (r: PauseReason | null) => {
    setValue(`orders.${idx}.gapReason`, r ? reasonSnapshot(r) : undefined, opts);
    if (r?.durationMin != null) setValue(`orders.${idx}.gapAfterMin`, r.durationMin, opts);
    setExpanded(false);
  };
  const standard = reason?.defaultMin ?? null;
  const err = errors.orders?.[idx]?.gapAfterMin?.message;
  // A fixed duration is already set — its minutes fold away (▸ to change them).
  const foldable = standard != null;
  const showTime = !foldable || expanded || !!err;

  return (
    <div
      className="rounded-lg border py-2 pr-1 pl-2 sm:pl-3"
      style={{ backgroundColor: `${hex}14`, borderColor: `${hex}66` }}
    >
      <div className="flex items-center gap-0.5">
        {reasons.length > 0 || reason ? (
          <ReasonPicker
            reasons={reasons}
            reason={reason}
            minutes={minutes}
            onPick={pick}
            t={t}
          />
        ) : (
          <span className="flex min-w-0 flex-1 items-center gap-2 text-sm font-semibold text-ink">
            <MarqueeText text={`⏸ ${t('orders.togglePause')}`} />
            {minutes > 0 && (
              <span className="shrink-0 text-xs font-normal text-ink-soft">
                {fmtPause(minutes)}
              </span>
            )}
          </span>
        )}
        <button
          type="button"
          onClick={onRemove}
          aria-label={t('orders.pauseRemove')}
          title={t('orders.pauseRemove')}
          className="ml-0.5 flex h-7 w-6 shrink-0 items-center justify-center rounded text-xs text-ink-soft transition hover:bg-white hover:text-danger"
        >
          ✕
        </button>
        {foldable && (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            aria-expanded={showTime}
            aria-label={t('orders.pauseSlots')}
            title={t('orders.pauseSlots')}
            // Viewing control — kept in the read-only view.
            data-view
            className="flex h-7 w-6 shrink-0 items-center justify-center rounded text-xs text-ink-soft transition hover:bg-white hover:text-ink"
          >
            {showTime ? '▾' : '▸'}
          </button>
        )}
      </div>

      {showTime && (
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
      )}
      {isLast && <p className="mt-1 text-[11px] text-ink-soft">{t('orders.pauseNoNext')}</p>}
      {kept && <PauseKeptNote {...kept} />}
      <FieldError message={err ? t(`validation.${err}`) : undefined} />
    </div>
  );
}

/**
 * The reason, picked from the company list (or a plain pause): its name scrolls
 * when it doesn't fit, the pause's minutes stay put on the right.
 */
function ReasonPicker({
  reasons,
  reason,
  minutes,
  onPick,
  t,
}: {
  reasons: PauseReason[];
  reason: PauseReasonSnapshot | undefined;
  minutes: number;
  onPick: (r: PauseReason | null) => void;
  t: TFunction;
}) {
  'use no memo';
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

  // A reason no longer in the company list (edited / deleted, or another
  // company's calc) still shows by its saved name.
  const known = !!reason?.id && reasons.some((r) => r.id === reason.id);
  const label = reason?.name ?? t('orders.pauseFree');
  const choose = (r: PauseReason | null) => {
    onPick(r);
    setOpen(false);
  };
  const option = (
    key: string,
    name: string,
    durationMin: number | null | undefined,
    color: string | undefined,
    selected: boolean,
    onClick?: () => void,
  ) => (
    <li key={key}>
      <button
        type="button"
        role="option"
        aria-selected={selected}
        onClick={onClick ?? (() => setOpen(false))}
        className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition hover:bg-brand-50 hover:text-brand-700 sm:text-sm ${
          selected ? 'bg-brand-50 font-semibold text-brand-700' : 'text-ink'
        }`}
      >
        <span
          aria-hidden
          className={`h-2 w-2 shrink-0 rounded-full ${color ? '' : 'border border-neutral-400'}`}
          style={color ? { backgroundColor: pauseColorHex(color) } : undefined}
        />
        <span className="min-w-0 flex-1 break-words">{name}</span>
        {durationMin != null && (
          <span className="shrink-0 text-[10px] font-normal text-ink-soft sm:text-xs">
            {fmtPause(durationMin)}
          </span>
        )}
      </button>
    </li>
  );

  return (
    <div ref={wrapperRef} className="relative min-w-0 flex-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('orders.pauseReason')}
        title={label}
        // Shown in the read-only view too, but inert there (.ro-inert).
        data-view
        className={`${inputBase} ro-inert flex items-center gap-2 px-2 text-left font-medium`}
      >
        <MarqueeText text={label} />
        {minutes > 0 && (
          <span className="shrink-0 text-xs font-normal text-ink-soft">{fmtPause(minutes)}</span>
        )}
        <span aria-hidden className="shrink-0 text-[10px] text-ink-soft">
          ▾
        </span>
      </button>
      {open && (
        <ul
          role="listbox"
          aria-label={t('orders.pauseReason')}
          className="absolute top-full right-0 left-0 z-30 mt-1 max-h-60 overflow-y-auto rounded-md border border-neutral-200 bg-white py-1 shadow-lg"
        >
          {option('free', t('orders.pauseFree'), null, undefined, !reason, () => choose(null))}
          {reason &&
            !known &&
            option('saved', reason.name, reason.defaultMin, reason.color, true)}
          {reasons.map((r) =>
            option(r.id, r.name, r.durationMin, r.color, reason?.id === r.id, () => choose(r)),
          )}
        </ul>
      )}
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
