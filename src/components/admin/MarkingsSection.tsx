import { useState, type FormEvent } from 'react';
import {
  hasOrderSpot,
  MAX_MARKING_NAME,
  MAX_MARKING_TEXT,
  type Marking,
} from '../../lib/markings';
import { genId } from '../../utils/defaults';
import { AdminModal, Field, ModalActions, RowActions } from './adminUi';
import { adminInputCls, adminLabelCls } from './adminStyles';

type Draft = { id?: string; name: string; text: string };

/** "Marcature Standard" section of the global settings: the markings offered
 *  on the Marcatura QR page (name + the marker's text, with the order number's
 *  spot). Edits only the settings draft — they reach
 *  company_settings.markings with the modal's «Salva». */
function MarkingsSection({
  markings,
  onChange,
}: {
  markings: Marking[];
  onChange: (markings: Marking[]) => void;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const open = (d: Draft) => {
    setFormError(null);
    setDraft(d);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    const name = draft.name.trim();
    const text = draft.text.trim();
    if (!name) return setFormError('Inserisci un nome.');
    if (!text) return setFormError('Inserisci il testo della marcatura.');
    if (
      markings.some(
        m => m.id !== draft.id && m.name.toLowerCase() === name.toLowerCase()
      )
    ) {
      return setFormError('Esiste già una marcatura con questo nome.');
    }
    const marking: Marking = { id: draft.id ?? genId(), name, text };
    onChange(
      markings.some(m => m.id === marking.id)
        ? markings.map(m => (m.id === marking.id ? marking : m))
        : [...markings, marking]
    );
    setDraft(null);
  };

  const onDelete = (m: Marking) => {
    if (!window.confirm(`Eliminare la marcatura "${m.name}"?`)) return;
    onChange(markings.filter(x => x.id !== m.id));
  };

  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <h4 className={adminLabelCls}>
          Marcature Standard ({markings.length})
        </h4>
        <button
          type="button"
          onClick={() => open({ name: '', text: '' })}
          className="inline-flex items-center gap-1 rounded-md border border-brand-600 bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-700"
        >
          <span aria-hidden className="text-sm leading-none">
            +
          </span>
          Nuova Marcatura
        </button>
      </div>

      {markings.length === 0 ? (
        <p className="mt-2 rounded-md border border-dashed border-neutral-300 p-4 text-center text-sm text-ink-soft">
          Nessuna marcatura.
        </p>
      ) : (
        <ul className="mt-2 space-y-2">
          {markings.map(m => (
            <li
              key={m.id}
              className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-white p-2.5 shadow-sm"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">
                  {m.name}
                </p>
                <p className="mt-0.5 truncate text-xs text-ink-soft">
                  {m.text}
                </p>
              </div>
              <RowActions
                onEdit={() => open({ id: m.id, name: m.name, text: m.text })}
                onDelete={() => onDelete(m)}
              />
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs text-ink-soft">
        Testi del marcatore proposti nella pagina «Marcatura QR»: si sceglie, si
        scrive il numero ordine e il QR va nel foglio ordine.
      </p>

      {draft && (
        <AdminModal onClose={() => setDraft(null)}>
          <form onSubmit={onSubmit}>
            <h3 className="text-base font-semibold text-ink sm:text-lg">
              {draft.id ? 'Modifica Marcatura' : 'Nuova Marcatura'}
            </h3>

            <div className="mt-4 space-y-4">
              <Field label="Nome">
                <input
                  type="text"
                  required
                  autoFocus
                  maxLength={MAX_MARKING_NAME}
                  placeholder="es. Stabilit Suisse 1UV"
                  value={draft.name}
                  onChange={e => setDraft({ ...draft, name: e.target.value })}
                  className={adminInputCls}
                />
              </Field>

              <Field
                label="Testo"
                hint={
                  hasOrderSpot(draft.text)
                    ? '✓ Contiene il posto del numero ordine.'
                    : 'Al posto del numero ordine scrivi «nr. Del LOTTO» o {ordine}.'
                }
              >
                <textarea
                  required
                  rows={3}
                  maxLength={MAX_MARKING_TEXT}
                  placeholder="es. nr. Del LOTTO - CE - nr. DOP …"
                  value={draft.text}
                  onChange={e => setDraft({ ...draft, text: e.target.value })}
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  className={`${adminInputCls.replace('h-9 ', '')} resize-none py-2`}
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
              busy={false}
              primary={draft.id ? 'Applica' : 'Aggiungi'}
            />
          </form>
        </AdminModal>
      )}
    </section>
  );
}

export default MarkingsSection;
