import { useEffect, useState, type ReactNode } from 'react';
import {
  patchCompanySettings,
  WEEKDAY_KEYS,
  type CalcModes,
  type CompanySettings,
  type WeekdayKey,
  type WeekSchedule,
} from '../../lib/catalog';
import type { WeekendDay } from '../../types';
import DayHoursRow from '../DayHoursRow';
import { ModalActions } from './adminUi';
import { adminLabelCls } from './adminStyles';

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const setDay = (key: WeekdayKey, value: WeekendDay) => {
    if (!draft.schedule) return;
    setDraft({ ...draft, schedule: { ...draft.schedule, [key]: value } });
  };

  const onSave = async () => {
    setSaving(true);
    setError(null);
    // The pause reasons have their own tab — keep whatever is saved there.
    const { settings, error: err } = await patchCompanySettings(companyId, (cur) => ({
      ...draft,
      pauseReasons: cur.pauseReasons,
    }));
    setSaving(false);
    if (err || !settings) {
      setError(err ?? 'Errore');
      return;
    }
    onSaved(settings);
    onClose();
  };

  // A label on the left, the number (+ unit) on the right — one row per setting.
  const numRow = (
    key: string,
    label: string,
    input: ReactNode,
    unit?: string,
  ) => (
    <div key={key} className="flex items-center justify-between gap-3">
      <label className="min-w-0 text-sm text-ink-soft">{label}</label>
      <div className="flex shrink-0 items-center gap-1.5">
        {input}
        <span className="w-6 text-xs text-ink-soft">{unit}</span>
      </div>
    </div>
  );

  return (
    // Phones: full screen with a fixed header and footer; sm+: a centred card.
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/50 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Impostazioni Globali"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full flex-col overflow-hidden bg-white shadow-xl sm:h-auto sm:max-h-[90vh] sm:max-w-lg sm:rounded-xl"
      >
        <header className="flex items-start justify-between gap-2 border-b border-neutral-200 px-4 py-3">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-ink">Impostazioni Globali</h3>
            {subtitle && <p className="truncate text-xs text-ink-soft">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Chiudi"
            className="rounded p-1.5 text-ink-soft transition hover:bg-neutral-100 hover:text-ink"
          >
            ✕
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
          {/* Visibilità calcolatore */}
          <section>
            <h4 className={adminLabelCls}>Mostra nel calcolatore</h4>
            <div className="mt-2 grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
              {MODE_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  aria-pressed={draft.modes === o.value}
                  onClick={() => setDraft({ ...draft, modes: o.value })}
                  className={
                    draft.modes === o.value
                      ? 'rounded-md border border-brand-600 bg-brand-600 px-2 py-1.5 text-sm font-medium text-white shadow-sm sm:px-3'
                      : 'rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm font-medium text-ink-soft shadow-sm hover:border-brand-400 hover:text-ink sm:px-3'
                  }
                >
                  {o.label}
                </button>
              ))}
            </div>
            <label className="mt-3 flex items-start gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={draft.showPiramide}
                onChange={(e) => setDraft({ ...draft, showPiramide: e.target.checked })}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-neutral-300 text-brand-600 focus:ring-brand-500"
              />
              Mostra «Piramide» (distribuzione fogli)
            </label>
          </section>

          {/* Orari di lavoro */}
          <section>
            <label className="flex items-start gap-2 text-sm font-medium text-ink">
              <input
                type="checkbox"
                checked={draft.schedule !== null}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    schedule: e.target.checked ? seedSchedule() : null,
                  })
                }
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-neutral-300 text-brand-600 focus:ring-brand-500"
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
          <section>
            <h4 className={adminLabelCls}>Buffer linea</h4>
            <div className="mt-2 space-y-2">
              {(
                [
                  ['Riscaldamento', 'warmupMinutes'],
                  ['Arresto', 'shutdownMinutes'],
                ] as const
              ).map(([label, key]) =>
                numRow(
                  key,
                  label,
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    inputMode="decimal"
                    aria-label={label}
                    className={numInputCls}
                    value={draft[key] / 60}
                    onChange={(e) => {
                      const h = parseFloat(e.target.value);
                      setDraft({
                        ...draft,
                        [key]: Number.isFinite(h) ? Math.round(h * 60) : 0,
                      });
                    }}
                  />,
                  'ore',
                ),
              )}
            </div>
            <p className="mt-2 text-xs text-ink-soft">
              Riscaldamento a inizio blocco, arresto prima della fine di ogni
              blocco. Ignorati se la linea è continua (nessuna pausa).
            </p>
          </section>

          {/* Cronologia salvataggi */}
          <section>
            <h4 className={adminLabelCls}>Risultati salvati</h4>
            <div className="mt-2 space-y-2">
              {(
                [
                  ['Max risultati', 'maxSavedResults', 1, 100, undefined],
                  ['Giorni di conservazione', 'savedRetentionDays', 1, 365, 'gg'],
                  ['Max condivisi azienda', 'maxCompanyShared', 0, 100, undefined],
                ] as const
              ).map(([label, key, lo, hi, unit]) =>
                numRow(
                  key,
                  label,
                  <input
                    type="number"
                    min={lo}
                    max={hi}
                    step={1}
                    inputMode="numeric"
                    aria-label={label}
                    className={numInputCls}
                    value={draft[key]}
                    onChange={(e) => {
                      const n = parseInt(e.target.value, 10);
                      setDraft({
                        ...draft,
                        [key]: Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo,
                      });
                    }}
                  />,
                  unit,
                ),
              )}
            </div>
            <p className="mt-2 text-xs text-ink-soft">
              Numero massimo di calcoli tenuti nella cronologia «Salvati» e per
              quanti giorni conservarli.
            </p>
          </section>

          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-danger">⚠ {error}</p>
          )}
        </div>

        <footer className="border-t border-neutral-200 px-4 py-3">
          <ModalActions
            className=""
            onCancel={onClose}
            onConfirm={() => void onSave()}
            busy={saving}
            primary={saving ? 'Salvando…' : 'Salva'}
          />
        </footer>
      </div>
    </div>
  );
}

const numInputCls =
  'h-9 w-20 rounded-md border border-neutral-300 bg-white px-2 text-right text-sm text-ink shadow-sm transition focus:border-brand-600 focus:ring-2 focus:ring-brand-200 focus:outline-none';
