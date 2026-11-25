import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_COMPANY_SETTINGS, patchCompanySettings, type CompanySettings } from '../../lib/catalog';
import GlobalSettingsModal from './GlobalSettingsModal';

vi.mock('../../lib/catalog', async (importActual) => ({
  ...(await importActual<typeof import('../../lib/catalog')>()),
  patchCompanySettings: vi.fn(),
}));
const patch = vi.mocked(patchCompanySettings);

const initial: CompanySettings = {
  ...DEFAULT_COMPANY_SETTINGS,
  pauseReasons: [{ id: 'p1', name: 'Pulizia', color: 'blue', durationMin: null }],
};

function setup() {
  const onClose = vi.fn();
  const onSaved = vi.fn();
  render(
    <GlobalSettingsModal companyId="c1" initial={initial} onClose={onClose} onSaved={onSaved} />,
  );
  return { onClose, onSaved };
}

/** The reason editor opened over the settings. */
const editor = () => screen.getByRole('heading', { name: /Causale$/ }).closest('form')!;

describe('GlobalSettingsModal — Causali di Fermo', () => {
  beforeEach(() => {
    patch.mockReset();
    patch.mockImplementation(async (_id, p) => ({
      settings: { ...initial, ...(p as Partial<CompanySettings>) },
      error: null,
    }));
  });

  it('adds a reason to the draft and saves it with «Salva»', async () => {
    const { onClose, onSaved } = setup();
    expect(screen.getByText('Causali di Fermo (1)')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Nuova Causale' }));
    const form = editor();
    fireEvent.change(within(form).getByPlaceholderText('es. Cambio stampo'), {
      target: { value: 'Cambio stampo' },
    });
    fireEvent.change(within(form).getByLabelText('ore'), { target: { value: '1' } });
    fireEvent.change(within(form).getByLabelText('min'), { target: { value: '30' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Aggiungi' }));

    // In the list, not saved yet.
    expect(screen.queryByRole('heading', { name: /Causale$/ })).toBeNull();
    expect(screen.getByText('Cambio stampo')).toBeInTheDocument();
    expect(screen.getByText('1 h 30 min')).toBeInTheDocument();
    expect(patch).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Salva' }));
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
    const saved = patch.mock.calls[0][1] as CompanySettings;
    expect(saved.pauseReasons.map((r) => [r.name, r.durationMin])).toEqual([
      ['Pulizia', null],
      ['Cambio stampo', 90],
    ]);
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ pauseReasons: saved.pauseReasons }));
  });

  it('Esc in the reason editor closes only the editor', () => {
    const { onClose } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Modifica' }));
    expect(editor()).toBeInTheDocument();

    fireEvent.keyDown(within(editor()).getByPlaceholderText('es. Cambio stampo'), {
      key: 'Escape',
    });
    expect(screen.queryByRole('heading', { name: /Causale$/ })).toBeNull();
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('«Annulla» drops a deleted reason without saving', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { onClose } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Elimina' }));
    expect(screen.getByText('Nessuna causale.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Annulla' }));
    expect(onClose).toHaveBeenCalled();
    expect(patch).not.toHaveBeenCalled();
    confirm.mockRestore();
  });
});

describe('GlobalSettingsModal — Marcatura QR', () => {
  beforeEach(() => {
    patch.mockReset();
    patch.mockImplementation(async (_id, p) => ({
      settings: { ...initial, ...(p as Partial<CompanySettings>) },
      error: null,
    }));
  });

  it('turns the page on and adds a standard marking, saved with «Salva»', async () => {
    const { onClose } = setup();
    fireEvent.click(screen.getByLabelText(/Mostra «Marcatura QR»/));
    fireEvent.click(screen.getByRole('button', { name: 'Nuova Marcatura' }));
    const form = screen.getByRole('heading', { name: 'Nuova Marcatura' }).closest('form')!;
    fireEvent.change(within(form).getByPlaceholderText('es. Stabilit Suisse 1UV'), {
      target: { value: 'Suisse 1UV' },
    });
    const text = within(form).getByPlaceholderText(/nr\. Del LOTTO/);
    fireEvent.change(text, {
      target: { value: 'nr. Del LOTTO - CE - nr. DOP 25900260518 - Stabilit Suisse 1UV' },
    });
    expect(within(form).getByText(/Contiene il posto del numero ordine/)).toBeInTheDocument();
    fireEvent.click(within(form).getByRole('button', { name: 'Aggiungi' }));
    expect(screen.getByText('Marcature Standard (1)')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Salva' }));
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
    const saved = patch.mock.calls[0][1] as CompanySettings;
    expect(saved.showMarcatura).toBe(true);
    expect(saved.markings).toEqual([
      {
        id: expect.any(String),
        name: 'Suisse 1UV',
        text: 'nr. Del LOTTO - CE - nr. DOP 25900260518 - Stabilit Suisse 1UV',
      },
    ]);
  });

  it('a marking needs a text and a name of its own', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Nuova Marcatura' }));
    const form = screen.getByRole('heading', { name: 'Nuova Marcatura' }).closest('form')!;
    fireEvent.change(within(form).getByPlaceholderText('es. Stabilit Suisse 1UV'), {
      target: { value: 'A' },
    });
    fireEvent.submit(form);
    expect(within(form).getByText(/Inserisci il testo/)).toBeInTheDocument();
  });
});
