import { useState } from 'react';
import {
  saveCompanySettings,
  WEEKDAY_KEYS,
  type CalcModes,
  type CompanySettings,
  type WeekdayKey,
  type WeekSchedule,
} from '../../lib/catalog';
import type { WeekendDay } from '../../types';
import DayHoursRow from '../DayHoursRow';

const DAY_LABELS: Record<WeekdayKey, string> = {
  mon: 'Lunedì',
  tue: 'Martedì',
  wed: 'Mercoledì',
  thu: 'Giovedì',
  fri: 'Venerdì',
  sat: 'Sabato',
  sun: 'Domenica',
};
const HOUR_LABELS = { full24: '24 h', from: 'Dalle', to: 'Alle' };

const workDay = (enabled: boolean, full24: boolean): WeekendDay => ({
  enabled,
  full24,
  start: 6,
  end: 22,
});

// Seed that mirrors the app default (Mon–Fri 24h, weekend off) so turning
// custom hours on starts from the current behaviour.
function seedSchedule(): WeekSchedule {
  return {
    mon: workDay(true, true),
    tue: workDay(true, true),
    wed: workDay(true, true),
    thu: workDay(true, true),
    fri: workDay(true, true),
    sat: workDay(false, false),
    sun: workDay(false, false),
  };
}

const MODE_OPTIONS: { value: CalcModes; label: string }[] = [
  { value: 'both', label: 'Entrambi' },
  { value: 'sheets', label: 'Solo Lastre' },
  { value: 'profiles', label: 'Solo Profili' },
];

export default function GlobalSettingsModal({
  companyId,
  subtitle,
  initial,
  onClose,
  onSaved,
}: {
  companyId: string;
  subtitle?: string;
  initial: CompanySettings;
  onClose: () => void;
  onSaved: (s: CompanySettings) => void;
}) {
  const [draft, setDraft] = useState<CompanySettings>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setDay = (key: WeekdayKey, value: WeekendDay) => {
    if (!draft.schedule) return;
    setDraft({ ...draft, schedule: { ...draft.schedule, [key]: value } });
  };

  const onSave = async () => {
    setSaving(true);
    setError(null);
    const { error: err } = await saveCompanySettings(companyId, draft);
    setSaving(false);
    if (err) {
      setError(err);
      return;
    }
    onSaved(draft);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:items-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="my-auto w-full max-w-lg rounded-xl bg-white p-5 shadow-xl sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-ink sm:text-lg">
              Impostazioni globali
            </h3>
            {subtitle && (
              <p className="truncate text-xs text-ink-soft">{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Chiudi"
            className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm text-ink-soft hover:border-brand-500"
          >
            ✕
          </button>
        </div>

        {/* Visibilità calcolatore */}
        <section className="mt-4">
          <h4 className="text-xs font-medium uppercase tracking-wide text-ink-soft">
            Mostra nel calcolatore
          </h4>
          <div className="mt-2 flex flex-wrap gap-2">
            {MODE_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                aria-pressed={draft.modes === o.value}
                onClick={() => setDraft({ ...draft, modes: o.value })}
                className={
                  draft.modes === o.value
                    ? 'rounded-md border border-brand-600 bg-brand-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm'
                    : 'rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-ink-soft shadow-sm hover:border-brand-400 hover:text-ink'
                }
              >
                {o.label}
              </button>
            ))}
          </div>
          <label className="mt-3 inline-flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={draft.showPiramide}
              onChange={(e) =>
                setDraft({ ...draft, showPiramide: e.target.checked })
              }
              className="h-4 w-4 rounded border-neutral-300 text-brand-600 focus:ring-brand-500"
            />
            Mostra «Piramide» (distribuzione fogli)
          </label>
        </section>

        {/* Orari di lavoro */}
        <section className="mt-5">
          <label className="inline-flex items-center gap-2 text-sm font-medium text-ink">
            <input
              type="checkbox"
              checked={draft.schedule !== null}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  schedule: e.target.checked ? seedSchedule() : null,
                })
              }
              className="h-4 w-4 rounded border-neutral-300 text-brand-600 focus:ring-brand-500"
            />
            Orari di lavoro personalizzati (7 giorni)
          </label>
          {draft.schedule === null ? (
            <p className="mt-1 text-xs text-ink-soft">
              Predefinito: Lun–Ven 24 h, weekend fermo.
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {WEEKDAY_KEYS.map((k) => (
                <DayHoursRow
                  key={k}
                  label={DAY_LABELS[k]}
                  value={draft.schedule![k]}
                  onChange={(v) => setDay(k, v)}
                  labels={HOUR_LABELS}
                />
              ))}
            </div>
          )}
        </section>

        {/* Buffer linea */}
        <section className="mt-5">
          <h4 className="text-xs font-medium uppercase tracking-wide text-ink-soft">
            Buffer linea (ore)
          </h4>
          <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2">
            {(
              [
                ['Riscaldamento', 'warmupMinutes'],
                ['Arresto', 'shutdownMinutes'],
              ] as const
            ).map(([label, key]) => (
              <div key={key} className="flex items-center gap-2">
                <label className="text-sm text-ink-soft">{label}</label>
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  inputMode="decimal"
                  className="h-8 w-20 rounded-md border border-neutral-300 bg-white px-2 text-sm text-ink shadow-sm focus:border-brand-600 focus:outline-none"
                  value={draft[key] / 60}
                  onChange={(e) => {
                    const h = parseFloat(e.target.value);
                    setDraft({
                      ...draft,
                      [key]: Number.isFinite(h) ? Math.round(h * 60) : 0,
                    });
                  }}
                />
                <span className="text-xs text-ink-soft">ore</span>
              </div>
            ))}
          </div>
          <p className="mt-1 text-xs text-ink-soft">
            Riscaldamento a inizio blocco, arresto prima della fine di ogni
            blocco. Ignorati se la linea è continua (nessuna pausa).
          </p>
        </section>

        {error && (
          <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-danger">
            ⚠ {error}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-ink hover:border-brand-500"
          >
            Annulla
          </button>
          <button
            type="button"
            onClick={() => void onSave()}
            disabled={saving}
            className="rounded-md bg-brand-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? 'Salvando…' : 'Salva'}
          </button>
        </div>
      </div>
    </div>
  );
}
