import { useFormContext, useWatch, Controller } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import DatePicker, { registerLocale } from 'react-datepicker';
import { it as itLocale } from 'date-fns/locale/it';
import { es as esLocale } from 'date-fns/locale/es';
import { enUS as enLocale } from 'date-fns/locale/en-US';
import type { FormValues } from '../formSchema';
import FieldError from './FieldError';
import { numericSetValueAs } from '../utils/numeric';
import { useEffect, useState } from 'react';

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

function GlobalSettingsPanel() {
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
  const speedMode = useWatch({ control, name: 'settings.speedMode' });
  const gapMode = useWatch({ control, name: 'settings.gapMode' });
  const startAt = useWatch({ control, name: 'settings.startAt' });

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

  const togglePerOrderSpeed = () => {
    setValue(
      'settings.speedMode',
      speedMode === 'global' ? 'perOrder' : 'global',
      { shouldValidate: true }
    );
  };

  const toggleGaps = () => {
    setValue(
      'settings.gapMode',
      gapMode === 'continuous' ? 'withGaps' : 'continuous',
      { shouldValidate: true }
    );
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

      {speedMode === 'global' && (
        <div className="mb-3 sm:mb-4">
          <label className={labelBase} htmlFor="globalSpeed">
            {t('settings.globalSpeed')}
          </label>
          <input
            id="globalSpeed"
            type="number"
            step="0.1"
            min="0"
            inputMode="decimal"
            className={`${inputBase} mt-1 sm:max-w-xs`}
            {...register('settings.globalSpeed', {
              setValueAs: numericSetValueAs,
            })}
          />
          <FieldError
            message={
              errors.settings?.globalSpeed?.message
                ? t(`validation.${errors.settings.globalSpeed.message}`)
                : undefined
            }
          />
        </div>
      )}

      <div className="flex gap-2 md:flex-wrap md:gap-3">
        <ToggleButton
          active={speedMode === 'perOrder'}
          onClick={togglePerOrderSpeed}
          icon="⚡"
          label={t('settings.toggle.perOrderSpeed')}
        />
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
      </div>

      {startMode === 'manual' && (
        <div className="mt-3 sm:mt-4">
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
                filterTime={time => time.getTime() >= Date.now()}
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
