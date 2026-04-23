import { useFormContext, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { FormValues } from '../formSchema';
import FieldError from './FieldError';
import { useState } from 'react';

const sectionHeader =
  'text-sm font-semibold tracking-wide text-ink-soft uppercase';
const inputBase =
  'w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-ink shadow-sm transition focus:border-brand-600 focus:ring-2 focus:ring-brand-200 focus:outline-none';

function RadioGroup({
  name,
  options,
  legend,
}: {
  name: 'settings.startMode' | 'settings.speedMode' | 'settings.gapMode';
  legend: string;
  options: { value: string; label: string }[];
}) {
  const { register } = useFormContext<FormValues>();

  return (
    <fieldset>
      <legend className={sectionHeader}>{legend}</legend>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {options.map(opt => (
          <label
            key={opt.value}
            className="flex cursor-pointer items-center gap-2 rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm shadow-sm hover:border-brand-300 has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50"
          >
            <input
              type="radio"
              value={opt.value}
              {...register(name)}
              className="accent-brand-600"
            />
            <span>{opt.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function GlobalSettingsPanel() {
  const { t } = useTranslation();
  const [now] = useState(() => Date.now());
  const {
    register,
    formState: { errors },
    control,
  } = useFormContext<FormValues>();

  const startMode = useWatch({ control, name: 'settings.startMode' });
  const speedMode = useWatch({ control, name: 'settings.speedMode' });
  const startAt = useWatch({ control, name: 'settings.startAt' });

  const isStartAtInPast =
    startMode === 'manual' &&
    typeof startAt === 'string' &&
    startAt.length > 0 &&
    new Date(startAt).getTime() < now;

  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold text-ink">
        {t('settings.title')}
      </h2>

      <div className="space-y-5">
        <RadioGroup
          name="settings.startMode"
          legend={t('settings.startMode.label')}
          options={[
            { value: 'now', label: t('settings.startMode.now') },
            { value: 'manual', label: t('settings.startMode.manual') },
          ]}
        />

        {startMode === 'manual' && (
          <div>
            <label className={sectionHeader} htmlFor="startAt">
              {t('settings.startAt')}
            </label>
            <input
              id="startAt"
              type="datetime-local"
              className={`${inputBase} mt-2`}
              {...register('settings.startAt')}
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

        <RadioGroup
          name="settings.speedMode"
          legend={t('settings.speedMode.label')}
          options={[
            { value: 'global', label: t('settings.speedMode.global') },
            { value: 'perOrder', label: t('settings.speedMode.perOrder') },
          ]}
        />

        {speedMode === 'global' && (
          <div>
            <label className={sectionHeader} htmlFor="globalSpeed">
              {t('settings.globalSpeed')}
            </label>
            <input
              id="globalSpeed"
              type="number"
              step="0.1"
              min="0"
              inputMode="decimal"
              className={`${inputBase} mt-2 max-w-xs`}
              {...register('settings.globalSpeed', {
                setValueAs: v =>
                  v === '' || v === null || v === undefined
                    ? undefined
                    : Number(v),
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

        <RadioGroup
          name="settings.gapMode"
          legend={t('settings.gapMode.label')}
          options={[
            { value: 'continuous', label: t('settings.gapMode.continuous') },
            { value: 'withGaps', label: t('settings.gapMode.withGaps') },
          ]}
        />
      </div>
    </section>
  );
}

export default GlobalSettingsPanel;
