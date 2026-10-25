import { useState, type FormEvent } from 'react';
import { patchCompanySettings, type CompanySettings } from '../../lib/catalog';
import {
  fmtPause,
  MAX_PAUSE_REASON_MIN,
  PAUSE_COLORS,
  pauseColorHex,
  type PauseColor,
  type PauseReason,
} from '../../lib/pauseReasons';
import { genId } from '../../utils/defaults';
import { CheckIcon } from '../ActionIcons';
import { toolBtnCls } from '../toolButton';
import { AdminModal, Field, ModalActions, RowActions } from './adminUi';
import { adminInputCls } from './adminStyles';

type Draft = {
  id?: string;
  name: string;
  color: PauseColor;
  fixed: boolean;
  hours: string;
  minutes: string;
};

const segOn =
  'rounded-md border border-brand-600 bg-brand-600 px-3 py-2 text-sm font-medium text-white shadow-sm';
const segOff =
  'rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-ink-soft shadow-sm transition hover:border-brand-400 hover:text-ink';

/** How a pause looks in the calculator (form + results): a slim card tinted
 *  with the reason's colour. */
export function PausePreview({
  name,
  color,
  minutes,
}: {
  name: string;
  color: string;
  minutes: number | null;
}) {
  const hex = pauseColorHex(color);
  return (
    <div
      className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm text-ink"
      style={{ backgroundColor: `${hex}14`, borderColor: `${hex}66` }}
    >
      <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: hex }} />
      <span className="min-w-0 flex-1 truncate font-medium">⏸ {name || '—'}</span>
      <span className="shrink-0 text-xs text-ink-soft">
        {minutes ? fmtPause(minutes) : 'Libera'}
      </span>
    </div>
  );
}

/** Admin tab: the company's "Causali di Fermo" (name, colour, fixed or free
 *  duration), stored in company_settings.pauseReasons. */
function PauseReasonsTab({
  companyId,
  reasons,
  onSaved,
}: {
  companyId: string;
  reasons: PauseReason[];
  onSaved: (s: CompanySettings) => void;
}) {
  'use no memo';
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Save against the freshly read list, so nothing saved elsewhere is lost.
  const save = async (update: (list: PauseReason[]) => PauseReason[]) => {
    setBusy(true);
    setError(null);
    const { settings, error: err } = await patchCompanySettings(companyId, (cur) => ({
      pauseReasons: update(cur.pauseReasons),
    }));
    setBusy(false);
    if (err || !settings) {
      setError(err ?? 'Errore');
      return false;
    }
    onSaved(settings);
    return true;
  };

  const openNew = () => {
    const used = new Set(reasons.map((r) => r.color));
    const color = PAUSE_COLORS.find((c) => !used.has(c.key))?.key ?? 'grey';
    setFormError(null);
    setDraft({ name: '', color, fixed: true, hours: '', minutes: '' });
  };

  const openEdit = (r: PauseReason) => {
    setFormError(null);
    setDraft({
      id: r.id,
      name: r.name,
      color: r.color,
      fixed: r.durationMin != null,
      hours: r.durationMin != null ? String(Math.floor(r.durationMin / 60)) : '',
      minutes: r.durationMin != null ? String(r.durationMin % 60) : '',
    });
  };

  const draftMinutes = (d: Draft): number | null => {
    if (!d.fixed) return null;
    const h = parseInt(d.hours, 10) || 0;
    const m = parseInt(d.minutes, 10) || 0;
    return h * 60 + m;
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    const name = draft.name.trim();
    const durationMin = draftMinutes(draft);
    if (!name) return setFormError('Inserisci un nome.');
    if (
      reasons.some((r) => r.id !== draft.id && r.name.toLowerCase() === name.toLowerCase())
    ) {
      return setFormError('Esiste già una causale con questo nome.');
    }
    if (durationMin != null && (durationMin <= 0 || durationMin > MAX_PAUSE_REASON_MIN)) {
      return setFormError('La durata deve essere tra 1 min e 24 h.');
    }
    setFormError(null);
    const reason: PauseReason = { id: draft.id ?? genId(), name, color: draft.color, durationMin };
    const ok = await save((list) =>
      list.some((r) => r.id === reason.id)
        ? list.map((r) => (r.id === reason.id ? reason : r))
        : [...list, reason],
    );
    if (ok) setDraft(null);
  };

  const onDelete = async (r: PauseReason) => {
    if (
      !window.confirm(
        `Eliminare la causale "${r.name}"? I calcoli già salvati mantengono nome e colore.`,
      )
    )
      return;
    await save((list) => list.filter((x) => x.id !== r.id));
  };

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-ink sm:text-lg">
          Causali di Fermo ({reasons.length})
        </h2>
        <button
          type="button"
          onClick={openNew}
          aria-label="Nuova Causale"
          title="Nuova Causale"
          className={toolBtnCls(true)}
        >
          <span aria-hidden className="text-base leading-none">+</span>
          <span className="hidden sm:inline">Nuova Causale</span>
        </button>
      </div>
      <p className="mb-3 text-xs text-ink-soft sm:mb-4">
        Pause tra gli ordini (cambio stampo, pulizia…). Nel calcolatore si
        scelgono nella «Pausa Dopo»: la durata fissa viene proposta e resta
        modificabile.
      </p>

      {error && (
        <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-danger">⚠ {error}</p>
      )}

      {reasons.length === 0 ? (
        <p className="rounded-md border border-dashed border-neutral-300 bg-white p-6 text-center text-sm text-ink-soft">
          Nessuna causale. Tocca «+» per aggiungerne una.
        </p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {reasons.map((r) => {
            const hex = pauseColorHex(r.color);
            return (
              <li
                key={r.id}
                className="flex items-center gap-3 rounded-lg border border-l-4 border-neutral-200 bg-white p-3 shadow-sm"
                style={{ borderLeftColor: hex }}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{r.name}</p>
                  <p className="mt-0.5 text-xs text-ink-soft">
                    {r.durationMin != null ? fmtPause(r.durationMin) : 'Durata libera'}
                  </p>
                </div>
                <RowActions
                  onEdit={() => openEdit(r)}
                  onDelete={() => void onDelete(r)}
                  disabled={busy}
                />
              </li>
            );
          })}
        </ul>
      )}

      {draft && (
        <AdminModal onClose={() => setDraft(null)}>
          <form onSubmit={onSubmit}>
            <h3 className="text-base font-semibold text-ink sm:text-lg">
              {draft.id ? 'Modifica Causale' : 'Nuova Causale'}
            </h3>

            <div className="mt-4 space-y-4">
              <Field label="Nome">
                <input
                  type="text"
                  required
                  autoFocus
                  maxLength={40}
                  placeholder="es. Cambio stampo"
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  className={adminInputCls}
                />
              </Field>

              <Field label="Colore">
                <div className="grid grid-cols-6 gap-2">
                  {PAUSE_COLORS.map((c) => {
                    const on = draft.color === c.key;
                    return (
                      <button
                        key={c.key}
                        type="button"
                        onClick={() => setDraft({ ...draft, color: c.key })}
                        aria-label={c.label}
                        aria-pressed={on}
                        title={c.label}
                        className={`mx-auto flex h-9 w-9 items-center justify-center rounded-full text-white shadow-sm transition ${
                          on ? 'ring-2 ring-ink ring-offset-2' : 'hover:scale-110'
                        }`}
                        style={{ backgroundColor: c.hex }}
                      >
                        {on && <CheckIcon className="h-4 w-4" />}
                      </button>
                    );
                  })}
                </div>
              </Field>

              <Field
                label="Durata"
                hint={
                  draft.fixed
                    ? 'Proposta in automatico, modificabile nel singolo calcolo.'
                    : 'Nel calcolatore si sceglie dalla lista (30 min … 12 h).'
                }
              >
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    aria-pressed={draft.fixed}
                    onClick={() => setDraft({ ...draft, fixed: true })}
                    className={draft.fixed ? segOn : segOff}
                  >
                    Fissa
                  </button>
                  <button
                    type="button"
                    aria-pressed={!draft.fixed}
                    onClick={() => setDraft({ ...draft, fixed: false })}
                    className={!draft.fixed ? segOn : segOff}
                  >
                    Libera
                  </button>
                </div>
                {draft.fixed && (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {(
                      [
                        ['hours', 'ore', 24],
                        ['minutes', 'min', 59],
                      ] as const
                    ).map(([key, unit, max]) => (
                      <label key={key} className="flex items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          max={max}
                          step={1}
                          inputMode="numeric"
                          placeholder="0"
                          aria-label={unit}
                          value={draft[key]}
                          onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                          className={`${adminInputCls} text-right`}
                        />
                        <span className="w-7 shrink-0 text-sm text-ink-soft">{unit}</span>
                      </label>
                    ))}
                  </div>
                )}
              </Field>

              <Field label="Anteprima">
                <PausePreview
                  name={draft.name.trim()}
                  color={draft.color}
                  minutes={draftMinutes(draft) || null}
                />
              </Field>
            </div>

            {formError && (
              <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-danger">
                ⚠ {formError}
              </p>
            )}

            <ModalActions
              onCancel={() => setDraft(null)}
              busy={busy}
              primary={busy ? 'Salvando…' : draft.id ? 'Salva' : 'Crea'}
            />
          </form>
        </AdminModal>
      )}
    </div>
  );
}

export default PauseReasonsTab;
