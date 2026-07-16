import { useFormContext, useWatch, Controller } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import DatePicker, { registerLocale } from 'react-datepicker';
import { it as itLocale } from 'date-fns/locale/it';
import { es as esLocale } from 'date-fns/locale/es';
import { enUS as enLocale } from 'date-fns/locale/en-US';
import type { FormValues } from '../formSchema';
import type { CalculatorMode, WeekendDay } from '../types';
import FieldError from './FieldError';
import { saveWeekendPref } from '../utils/defaults';
import { useEffect, useState } from 'react';

const WORKDAY_START_HOUR = 6;

// Half-hour slots for the weekend time dropdowns (values in hours).
const fmtHour = (h: number) => {
  const hh = Math.floor(h);
  const mm = h - hh >= 0.5 ? '30' : '00';
  return `${String(hh).padStart(2, '0')}:${mm}`;
};
const START_SLOTS: number[] = [];
for (let h = 0; h < 24; h += 0.5) START_SLOTS.push(h);
const END_SLOTS: number[] = [];
for (let h = 0.5; h <= 24; h += 0.5) END_SLOTS.push(h);
const selectCls =
  'rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm text-ink shadow-sm transition focus:border-brand-600 focus:ring-2 focus:ring-brand-200 focus:outline-none';

registerLocale('it', itLocale);
registerLocale('es', esLocale);
registerLocale('en', enLocale);

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false,
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const listener = (e: MediaQueryListEvent) => setMatches(e.matches);
    mq.addEventListener('change', listener);
    return () => mq.removeEventListener('change', listener);
  }, [query]);
  return matches;
}

const inputBase =
  'w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-ink shadow-sm transition focus:border-brand-600 focus:ring-2 focus:ring-brand-200 focus:outline-none';
const labelBase =
  'block text-xs font-medium tracking-wide text-ink-soft uppercase';
const chipActive =
  'rounded-md border border-brand-600 bg-brand-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition';
const chipIdle =
  'rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-ink-soft shadow-sm transition hover:border-brand-400 hover:text-ink';

function ToggleButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: string;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      title={label}
      className={
        active
          ? 'flex flex-1 items-center justify-center gap-1.5 rounded-md border border-brand-600 bg-brand-600 px-2 py-2 text-base font-semibold text-white shadow-sm transition md:px-3 md:text-sm'
          : 'flex flex-1 items-center justify-center gap-1.5 rounded-md border border-neutral-300 bg-white px-2 py-2 text-base font-medium text-ink-soft shadow-sm transition hover:border-brand-400 hover:text-ink md:px-3 md:text-sm'
      }
    >
      <span aria-hidden>{icon}</span>
      <span className="hidden whitespace-nowrap md:inline">{label}</span>
    </button>
  );
}

// One weekend day: enable chip + 24h checkbox + a from/to pair of 30-min
// dropdowns (disabled when 24h is on).
function WeekendDayRow({
  dayKey,
  label,
  cfg,
}: {
  dayKey: 'sat' | 'sun';
  label: string;
  cfg: WeekendDay | undefined;
}) {
  'use no memo';
  const { register, setValue } = useFormContext<FormValues>();
  const { t } = useTranslation();
  const base = `settings.weekend.${dayKey}` as const;
  const enabled = !!cfg?.enabled;
  const full24 = !!cfg?.full24;
  const dim = full24 ? 'opacity-40' : '';

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        aria-pressed={enabled}
        onClick={() =>
          setValue(`${base}.enabled`, !enabled, { shouldValidate: true })
        }
        className={`${enabled ? chipActive : chipIdle} w-24 shrink-0`}
      >
        {label}
      </button>
      {enabled && (
        <>
          <label className="inline-flex items-center gap-1.5 text-sm text-ink-soft">
            <input
              type="checkbox"
              checked={full24}
              onChange={(e) =>
                setValue(`${base}.full24`, e.target.checked, {
                  shouldValidate: true,
                })
              }
              className="h-4 w-4 rounded border-neutral-300 text-brand-600 focus:ring-brand-500"
            />
            {t('settings.weekend.full24')}
          </label>
          <select
            aria-label={t('settings.weekend.from')}
            disabled={full24}
            className={`${selectCls} ${dim}`}
            {...register(`${base}.start`, { valueAsNumber: true })}
          >
            {START_SLOTS.map((h) => (
              <option key={h} value={h}>
                {fmtHour(h)}
              </option>
            ))}
          </select>
          <span className={`text-ink-soft ${dim}`}>–</span>
          <select
            aria-label={t('settings.weekend.to')}
            disabled={full24}
            className={`${selectCls} ${dim}`}
            {...register(`${base}.end`, { valueAsNumber: true })}
          >
            {END_SLOTS.map((h) => (
              <option key={h} value={h}>
                {fmtHour(h)}
              </option>
            ))}
          </select>
        </>
      )}
    </div>
  );
}

interface GlobalSettingsPanelProps {
  mode: CalculatorMode;
}

function GlobalSettingsPanel({ mode }: GlobalSettingsPanelProps) {
  'use no memo';
  const { t, i18n } = useTranslation();
  const [now] = useState(() => Date.now());
  const {
    register,
    setValue,
    formState: { errors },
    control,
  } = useFormContext<FormValues>();

  const startMode = useWatch({ control, name: 'settings.startMode' });
  const gapMode = useWatch({ control, name: 'settings.gapMode' });
  const startAt = useWatch({ control, name: 'settings.startAt' });
  const productName = useWatch({ control, name: 'settings.productName' });
  const weekend = useWatch({ control, name: 'settings.weekend' });
  const [showProductName, setShowProductName] = useState(false);
  const productNameHasValue =
    typeof productName === 'string' && productName.length > 0;
  const productNameOpen = showProductName || productNameHasValue;

  const isStartAtInPast =
    startMode === 'manual' &&
    typeof startAt === 'string' &&
    startAt.length > 0 &&
    new Date(startAt).getTime() < now;

  const toggleManualStart = () => {
    if (startMode === 'now') {
      setValue('settings.startMode', 'manual', { shouldValidate: true });
      if (!startAt) {
        setValue('settings.startAt', new Date().toISOString(), {
          shouldValidate: true,
        });
      }
    } else {
      setValue('settings.startMode', 'now', { shouldValidate: true });
      setValue('settings.startAt', '', { shouldValidate: true });
    }
  };

  const toggleGaps = () => {
    setValue(
      'settings.gapMode',
      gapMode === 'continuous' ? 'withGaps' : 'continuous',
      { shouldValidate: true }
    );
  };

  const toggleProductName = () => {
    if (productNameOpen) {
      setShowProductName(false);
      setValue('settings.productName', '', { shouldValidate: true });
    } else {
      setShowProductName(true);
    }
  };

  const toggleWeekend = () => {
    setValue('settings.weekend.enabled', !weekend?.enabled, {
      shouldValidate: true,
    });
  };

  // Persist the weekend shift (machine setting) so it survives reloads/resets.
  useEffect(() => {
    if (weekend) saveWeekendPref(weekend);
  }, [weekend]);

  const dayCfg = (dow: number): WeekendDay | undefined =>
    dow === 6 ? weekend?.sat : dow === 0 ? weekend?.sun : undefined;

  // Is a given date pickable as a start? Weekends are blocked unless their
  // shift is enabled.
  const isDatePickable = (date: Date): boolean => {
    const dow = date.getDay();
    if (dow !== 6 && dow !== 0) return true;
    return !!(weekend?.enabled && dayCfg(dow)?.enabled);
  };

  // Within a pickable weekend day, restrict times to that day's window (or all
  // day when 24h); weekdays keep the future-only rule.
  const isTimePickable = (time: Date): boolean => {
    if (time.getTime() < Date.now()) return false;
    const dow = time.getDay();
    if (dow !== 6 && dow !== 0) return true;
    const d = dayCfg(dow);
    if (!weekend?.enabled || !d?.enabled) return false;
    const h = time.getHours() + time.getMinutes() / 60;
    // Saturday keeps its weekday tail (00:00–06:00, always working).
    if (dow === 6 && h < WORKDAY_START_HOUR) return true;
    if (d.full24) return true;
    return h >= d.start && h < d.end;
  };

  const lang = (i18n.resolvedLanguage ?? 'it') as 'it' | 'en' | 'es';
  const isMobile = useMediaQuery('(max-width: 480px)');
  const minDate = new Date();
  const [calendarOpen, setCalendarOpen] = useState(false);

  useEffect(() => {
    if (!calendarOpen || !isMobile) return;
    const scrollY = window.scrollY;
    const body = document.body;
    const prev = {
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
      overflow: body.style.overflow,
    };
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.width = '100%';
    body.style.overflow = 'hidden';
    return () => {
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.width = prev.width;
      body.style.overflow = prev.overflow;
      window.scrollTo(0, scrollY);
    };
  }, [calendarOpen, isMobile]);

  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-3 shadow-sm sm:p-5">
      <h2 className="mb-3 text-base font-semibold text-ink sm:mb-4 sm:text-lg">
        {t('settings.title')}
      </h2>

      <div className="flex flex-nowrap gap-2 md:flex-wrap md:gap-3">
        <ToggleButton
          active={startMode === 'manual'}
          onClick={toggleManualStart}
          icon="🗓"
          label={t('settings.toggle.manualStart')}
        />
        <ToggleButton
          active={gapMode === 'withGaps'}
          onClick={toggleGaps}
          icon="⏸"
          label={t('settings.toggle.gaps')}
        />
        <ToggleButton
          active={productNameOpen}
          onClick={toggleProductName}
          icon="✏"
          label={t('settings.toggle.productName')}
        />
        <ToggleButton
          active={!!weekend?.enabled}
          onClick={toggleWeekend}
          icon="📅"
          label={t('settings.toggle.weekend')}
        />
      </div>

      {weekend?.enabled && (
        <div className="mt-3 rounded-md border border-brand-200 bg-brand-50/50 p-3 sm:mt-4">
          <div className="space-y-2">
            <WeekendDayRow
              dayKey="sat"
              label={t('settings.weekend.sat')}
              cfg={weekend.sat}
            />
            <WeekendDayRow
              dayKey="sun"
              label={t('settings.weekend.sun')}
              cfg={weekend.sun}
            />
          </div>
          <p className="mt-2 text-xs text-ink-soft">
            {t('settings.weekend.hint')}
          </p>
        </div>
      )}

      {productNameOpen && (
        <div className="mt-3 pb-5 sm:mt-4">
          <label className={labelBase} htmlFor="productName">
            {t('settings.productName')}
          </label>
          <input
            id="productName"
            type="text"
            autoFocus={showProductName && !productNameHasValue}
            placeholder={t(`settings.productNamePlaceholder.${mode}`)}
            className={`${inputBase} mt-1 sm:max-w-md`}
            {...register('settings.productName')}
          />
        </div>
      )}

      {startMode === 'manual' && (
        <div className="mt-3 pb-5 sm:mt-4">
          <label className={labelBase} htmlFor="startAt">
            {t('settings.startAt')}
          </label>
          <Controller
            control={control}
            name="settings.startAt"
            render={({ field }) => (
              <DatePicker
                id="startAt"
                selected={field.value ? new Date(field.value) : null}
                onChange={(d: Date | null) =>
                  field.onChange(d ? d.toISOString() : '')
                }
                showTimeSelect
                timeIntervals={15}
                dateFormat="dd/MM/yyyy HH:mm"
                timeFormat="HH:mm"
                locale={lang}
                placeholderText={t('settings.startAt')}
                minDate={minDate}
                filterDate={isDatePickable}
                filterTime={isTimePickable}
                withPortal={isMobile}
                onCalendarOpen={() => setCalendarOpen(true)}
                onCalendarClose={() => setCalendarOpen(false)}
                className={`${inputBase} mt-1`}
                wrapperClassName="block w-full sm:max-w-xs"
                popperPlacement="bottom-start"
                calendarClassName="rdp-mobile-stack"
              />
            )}
          />
          <FieldError
            message={
              errors.settings?.startAt?.message
                ? t(`validation.${errors.settings.startAt.message}`)
                : undefined
            }
          />
          {isStartAtInPast && (
            <p className="mt-1 text-xs font-medium text-amber-700">
              ⚠ {t('settings.startAtPastWarning')}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

export default GlobalSettingsPanel;
