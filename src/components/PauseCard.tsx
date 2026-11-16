import {
  useContext,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { get, useFormContext, useWatch } from 'react-hook-form';
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
import { bareNeutral, inputBase } from './formStyles';
import BareButton from './BareButton';
import { CloseIcon } from './ActionIcons';
import TapToEdit from './TapToEdit';
import EditNum from './EditNum';
import { TextModeContext } from '../contexts/textMode';
import MarqueeText from './MarqueeText';
import { useMenuPlacement } from '../hooks/useMenuPlacement';
import { PauseKeptNote, type ProductChangeSides } from './ProductChange';
import { useTrackedResult } from '../contexts/trackedResult';
import { rowForOrder } from '../utils/formTiming';
import { formatDuration, formatSpan } from '../utils/format';
import { errorAttrs } from '../utils/errorBubble';
import { format } from 'date-fns';
import DateTimePicker from './DateTimePicker';

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
 * Or "until" a moment (⏱ / 📅): a stop of days, resuming when picked on the
 * calendar — none when the queue gets there only after it (said so).
 * With `sizeIdx`: the same, as the stop after that size of the order.
 */
function PauseCard({
  idx,
  sizeIdx,
  isLast = false,
  onRemove,
  kept = null,
  clearKept,
}: {
  idx: number;
  /** The stop after this size of the order (its fields on the size). */
  sizeIdx?: number;
  isLast?: boolean;
  /** ✕ — refused (→ `kept`) between two different products. */
  onRemove: () => void;
  /** Set when a removal was just refused: the products around it. */
  kept?: ProductChangeSides | null;
  clearKept?: Dispatch<SetStateAction<number | null>>;
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
  // Its fields: on the order, or on the size (same names). Typed as the
  // order's — the size's are the same fields.
  const P = <K extends 'gapReason' | 'gapAfterMin' | 'gapUntil'>(k: K) =>
    (sizeIdx === undefined
      ? `orders.${idx}.${k}`
      : `orders.${idx}.sizes.${sizeIdx}.${k}`) as `orders.${number}.${K}`;
  const reason = useWatch({ control, name: P('gapReason') });
  const minutes = Number(useWatch({ control, name: P('gapAfterMin') })) || 0;
  const until = useWatch({ control, name: P('gapUntil') });
  // Until a moment ('' → not picked yet), or minutes.
  const untilMode = until !== undefined;
  const untilDate = until ? new Date(until) : null;
  const untilValid = !!untilDate && !Number.isNaN(untilDate.getTime());
  const hex = pauseColorHex(reason?.color ?? 'grey');
  const opts = { shouldDirty: true, shouldValidate: true };
  const [expanded, setExpanded] = useState(false);
  // A tracked calc: as the order cards — text and bare icons, a field on a
  // tap.
  const textMode = useContext(TextModeContext);

  // The "can't remove" note goes away by itself.
  useEffect(() => {
    if (!kept) return;
    const timer = setTimeout(() => clearKept?.((k) => (k === idx ? null : k)), KEPT_NOTE_MS);
    return () => clearTimeout(timer);
  }, [kept, idx, clearKept]);

  const pick = (r: PauseReason | null) => {
    setValue(P('gapReason'), r ? reasonSnapshot(r) : undefined, opts);
    if (r?.durationMin != null) setValue(P('gapAfterMin'), r.durationMin, opts);
    setExpanded(false);
  };
  const standard = reason?.defaultMin ?? null;
  const err = (get(errors, P('gapAfterMin')) as { message?: string } | undefined)?.message;
  const untilErr = (get(errors, P('gapUntil')) as { message?: string } | undefined)?.message;
  // A fixed duration is already set — its minutes fold away (▸ to change them).
  // A moment always shows (it's what the pause is).
  const foldable = standard != null && !untilMode;
  const showTime = untilMode || !foldable || expanded || !!err;
  // ⏱ minutes ↔ 📅 until a moment (the minutes stay for coming back, and so
  // does the moment while the card is open).
  const lastUntil = useRef('');
  const setUntilMode = (on: boolean) => {
    if (on === untilMode) return;
    if (!on) lastUntil.current = until ?? '';
    setValue(P('gapUntil'), on ? lastUntil.current : undefined, {
      shouldDirty: true,
      shouldValidate: !on || !!lastUntil.current,
    });
  };
  // Tracked calc (Salvati / Produzione): when the pause runs, from the last
  // "Calcola" — not once its minutes have been changed since.
  const result = useTrackedResult();
  const orderId = useWatch({ control, name: `orders.${idx}.id` });
  const row = rowForOrder(result, orderId);
  // What it was computed from, and its times (the order's / the size's).
  const src = sizeIdx === undefined ? row?.order : row?.order.sizes?.[sizeIdx];
  const times = sizeIdx === undefined ? row : row?.sizeDetails?.[sizeIdx];
  // (as it was computed: same minutes / same moment)
  const same =
    !!src &&
    !!times &&
    (untilMode
      ? src.gapUntil === until
      : src.gapUntil === undefined && (times.gapAfterMin ?? 0) === minutes);
  const units = { day: t('units.day'), hour: t('units.hour'), minute: t('units.minute') };
  const span =
    same && times?.gapStart && times.gapEnd
      ? `${formatSpan(times.gapStart, times.gapEnd)}${
          untilMode ? ` · ${formatDuration(times.gapAfterMin ?? 0, units)}` : ''
        }`
      : null;
  // The queue gets there only after the moment: no pause.
  const passed = same && untilMode && !!times?.gapPassed;
  // Beside the reason: the minutes, or until when.
  const badge = untilMode
    ? untilValid
      ? `→ ${format(untilDate!, 'dd.MM HH:mm')}`
      : ''
    : minutes > 0
      ? fmtPause(minutes)
      : '';

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
            badge={badge}
            onPick={pick}
            textMode={textMode}
            t={t}
          />
        ) : (
          <span className="flex min-w-0 flex-1 items-center gap-2 text-sm font-semibold text-ink">
            <MarqueeText
              text={`⏸ ${t(sizeIdx === undefined ? 'orders.togglePause' : 'orders.sizePause')}`}
            />
            {badge && (
              <span className="shrink-0 text-xs font-normal text-ink-soft">{badge}</span>
            )}
          </span>
        )}
        {textMode ? (
          <BareButton
            title={t('orders.pauseRemove')}
            onClick={onRemove}
            iconCls="text-ink-soft group-hover/ib:text-danger group-focus-visible/ib:text-danger"
            className="ml-0.5"
          >
            <CloseIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </BareButton>
        ) : (
        <button
          type="button"
          onClick={onRemove}
          aria-label={t('orders.pauseRemove')}
          title={t('orders.pauseRemove')}
          className="ml-0.5 flex h-7 w-6 shrink-0 items-center justify-center rounded text-xs text-ink-soft transition hover:bg-white hover:text-danger"
        >
          ✕
        </button>
        )}
        {foldable && textMode && (
          <BareButton
            title={t('orders.pauseSlots')}
            pressed={showTime}
            onClick={() => setExpanded((e) => !e)}
            iconCls={`${bareNeutral} text-xs`}
          >
            {showTime ? '▾' : '▸'}
          </BareButton>
        )}
        {foldable && !textMode && (
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
        <div
          className={`${textMode ? 'mt-1' : 'mt-2'} flex flex-wrap items-center gap-x-3 gap-y-1`}
        >
          <div
            role="radiogroup"
            aria-label={t('orders.pauseKind')}
            // Shown in the read-only view too, but inert there (.ro-inert).
            data-view
            className="ro-inert inline-flex shrink-0 rounded-md bg-black/5 p-0.5"
          >
            {([false, true] as const).map((on) => (
              <button
                key={String(on)}
                type="button"
                role="radio"
                aria-checked={untilMode === on}
                onClick={() => setUntilMode(on)}
                className={`rounded px-2 py-0.5 text-[11px] transition sm:text-xs ${
                  untilMode === on
                    ? 'bg-white font-semibold text-ink shadow-sm'
                    : 'text-ink-soft hover:text-ink'
                }`}
              >
                {on ? `📅 ${t('orders.pauseUntil')}` : `⏱ ${t('orders.pauseDuration')}`}
              </button>
            ))}
          </div>
          {untilMode ? (
            <div
              className={textMode ? 'min-w-0' : 'w-full sm:w-56'}
              {...(untilErr ? { 'data-error': t(`validation.${untilErr}`) } : {})}
            >
              <DateTimePicker
                id={sizeIdx === undefined ? `pause-until-${idx}` : `pause-until-${idx}-${sizeIdx}`}
                selected={untilValid ? untilDate : null}
                onChange={(d) =>
                  setValue(P('gapUntil'), d ? d.toISOString() : '', opts)
                }
                timeIntervals={30}
                placeholder={t('orders.pauseUntilPick')}
                invalid={!!untilErr}
                // A tracked calc: the moment as text, the calendar on a tap.
                dateFormat={textMode ? 'EEE dd.MM.yyyy · HH:mm' : undefined}
                className={
                  textMode
                    ? `h-7 w-full cursor-pointer rounded-md bg-transparent px-0.5 text-sm font-medium text-ink placeholder:font-normal placeholder:text-danger focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 sm:h-8 ${
                        untilErr ? 'ring-2 ring-danger/60' : ''
                      }`
                    : undefined
                }
                wrapperClassName="block w-full"
              />
            </div>
          ) : (
          <>
          {/* A tracked calc: "60 min · 1 h", the field on a tap. */}
          <TapToEdit
            names={[P('gapAfterMin')]}
            title={t('orders.gapAfter')}
            render={([v], fmt) => (
              <>
                <EditNum name={P('gapAfterMin')}>{fmt(v)}</EditNum>
                <span className="text-ink-soft">
                  min{minutes >= 60 ? ` · ${fmtPause(minutes)}` : ''}
                </span>
              </>
            )}
          >
          <div className="w-32 sm:w-36">
            <PauseField
              name={P('gapAfterMin')}
              t={t}
              error={err ? t(`validation.${err}`) : undefined}
            />
          </div>
          <span className="text-xs text-ink-soft">
            min{minutes >= 60 ? ` · ${fmtPause(minutes)}` : ''}
          </span>
          </TapToEdit>
          {standard != null && minutes !== standard && (
            <button
              type="button"
              onClick={() => setValue(P('gapAfterMin'), standard, opts)}
              className="text-xs font-medium text-brand-700 transition hover:text-brand-800"
            >
              ↺ {t('orders.pauseStandard', { d: fmtPause(standard) })}
            </button>
          )}
          </>
          )}
        </div>
      )}
      {passed && (
        <p className="mt-1 rounded bg-amber-100 px-2 py-1 text-[11px] font-medium text-amber-800 sm:text-xs">
          ⚠ {t('orders.pausePassed')}
        </p>
      )}
      {span && (
        // (centred on a phone)
        <p className="mt-1 text-center text-[11px] text-ink-soft tabular-nums sm:text-left">
          {span}
        </p>
      )}
      {isLast && <p className="mt-1 text-[11px] text-ink-soft">{t('orders.pauseNoNext')}</p>}
      {kept && <PauseKeptNote {...kept} />}
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
  badge,
  onPick,
  textMode,
  t,
}: {
  reasons: PauseReason[];
  reason: PauseReasonSnapshot | undefined;
  /** Beside its name: the pause's minutes, or until when. */
  badge: string;
  onPick: (r: PauseReason | null) => void;
  /** A tracked calc: the reason as text (no frame), its list on a tap. */
  textMode: boolean;
  t: TFunction;
}) {
  'use no memo';
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  // Its list stays on screen: below, or above when there's no room.
  const place = useMenuPlacement(wrapperRef, open, 240);

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
        onClick={() => {
          if (!open) place.measure();
          setOpen((o) => !o);
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('orders.pauseReason')}
        title={label}
        // Shown in the read-only view too, but inert there (.ro-inert).
        data-view
        className={
          textMode
            ? 'group/rp ro-inert flex h-7 w-full min-w-0 items-center gap-2 rounded-md px-0.5 text-left text-sm font-medium text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 sm:h-8'
            : `${inputBase} ro-inert flex items-center gap-2 px-2 text-left font-medium`
        }
      >
        <MarqueeText text={label} />
        {badge && <span className="shrink-0 text-xs font-normal text-ink-soft">{badge}</span>}
        <span
          aria-hidden
          className="shrink-0 text-[10px] text-ink-soft transition group-hover/rp:text-brand-700"
        >
          ▾
        </span>
      </button>
      {open && (
        <ul
          role="listbox"
          aria-label={t('orders.pauseReason')}
          style={{ maxHeight: place.maxHeight }}
          className={`absolute right-0 left-0 z-30 ${place.up ? 'bottom-full mb-1' : 'top-full mt-1'} overflow-y-auto rounded-md border border-neutral-200 bg-white py-1 shadow-lg`}
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
function PauseField({
  name,
  t,
  error,
}: {
  /** The minutes' field (the order's / a size's). */
  name: `orders.${number}.gapAfterMin`;
  t: TFunction;
  /** Its error: the field framed red, the message in its bubble. */
  error?: string;
}) {
  'use no memo';
  const { register, setValue, control } = useFormContext<FormValues>();
  const value = useWatch({ control, name: name });
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  // Its list stays on screen: below, or above when there's no room.
  const place = useMenuPlacement(wrapperRef, open, 240);

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
    setValue(name, m, {
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
        {...errorAttrs(error)}
        {...register(name, {
          setValueAs: numericSetValueAs,
        })}
      />
      <button
        type="button"
        onClick={() => {
          if (!open) place.measure();
          setOpen((o) => !o);
        }}
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
          style={{ maxHeight: place.maxHeight }}
          className={`absolute left-0 z-30 ${place.up ? 'bottom-full mb-1' : 'top-full mt-1'} w-44 overflow-y-auto rounded-md border border-neutral-200 bg-white py-1 shadow-lg`}
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
