import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { DEFAULT_COMPANY_SETTINGS } from '../lib/catalog';
import { makeQrPng } from '../lib/markings';
import i18n from '../i18n';
import en from '../locales/en.json';
import MarcaturaPage from './MarcaturaPage';

// The page's labels (in English: the language is set below).
const L = en.marking;

const SHEET = 'nr. Del LOTTO - CE - nr. DOP 25900260518 - Stabilit Suisse 1UV';
const PNG = `data:image/png;base64,${btoa('PNG')}`;

vi.mock('../lib/markings', async importActual => ({
  ...(await importActual<typeof import('../lib/markings')>()),
  makeQrPng: vi.fn(),
}));
const qr = vi.mocked(makeQrPng);

vi.mock('../contexts/CatalogContext', async () => {
  const { DEFAULT_COMPANY_SETTINGS: base } = await import('../lib/catalog');
  return {
    useCatalog: () => ({
      company: { id: 'c1', slug: 'akra', name: 'Akra' },
      products: [],
      loading: false,
      error: null,
      settings: {
        ...base,
        showMarcatura: true,
        markings: [{ id: 's1', name: 'Suisse 1UV', text: SHEET }],
      },
    }),
  };
});

function setup() {
  render(
    <MemoryRouter>
      <MarcaturaPage />
    </MemoryRouter>
  );
}
const textArea = () => screen.getByRole('textbox', { name: L.text });
const content = () => screen.getByTestId('marking-content');

describe('Marcatura QR', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('en');
  });
  beforeEach(() => {
    localStorage.clear();
    qr.mockReset();
    qr.mockResolvedValue(PNG);
    // Not in jsdom (the scrolling names, the buttons' row).
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      }
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('a standard marking: only the order number left, then the QR', async () => {
    expect(DEFAULT_COMPANY_SETTINGS.showMarcatura).toBe(false);
    setup();
    fireEvent.click(screen.getByRole('button', { name: /Suisse 1UV/ }));
    expect(textArea()).toHaveValue(SHEET);
    // In the same tap (an iPhone's keyboard comes up only then).
    expect(screen.getByRole('textbox', { name: L.order })).toHaveFocus();
    expect(screen.getByText(L.needOrder)).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: L.qr })).toBeNull();

    fireEvent.change(screen.getByRole('textbox', { name: L.order }), {
      target: { value: '2611' },
    });
    const filled = '2611 - CE - nr. DOP 25900260518 - Stabilit Suisse 1UV';
    expect(content()).toHaveTextContent(filled);
    expect(await screen.findByRole('img', { name: L.qr })).toHaveAttribute(
      'src',
      PNG
    );
    expect(qr).toHaveBeenLastCalledWith(filled);
  });

  it('a pasted text without a spot makes its QR at once', async () => {
    setup();
    expect(screen.getByText(L.needText)).toBeInTheDocument();
    fireEvent.change(textArea(), { target: { value: '  CE - 1UV ' } });
    expect(screen.queryByRole('textbox', { name: L.order })).toBeNull();
    await screen.findByRole('img', { name: L.qr });
    expect(qr).toHaveBeenLastCalledWith('CE - 1UV');
  });

  it('«+ N° Ordine» puts the spot where the cursor is', () => {
    setup();
    const area = textArea() as HTMLTextAreaElement;
    fireEvent.change(area, { target: { value: 'Lotto  CE' } });
    area.setSelectionRange(6, 6);
    fireEvent.click(
      screen.getByRole('button', { name: new RegExp(L.insertOrder) })
    );
    expect(area).toHaveValue('Lotto {ordine} CE');
    expect(screen.getByRole('textbox', { name: L.order })).toBeInTheDocument();
  });

  it('«Salva nelle Mie» keeps it on the device; it can be deleted', () => {
    setup();
    fireEvent.change(textArea(), { target: { value: SHEET } });
    fireEvent.click(screen.getByRole('button', { name: L.save }));
    fireEvent.change(screen.getByRole('textbox', { name: L.saveName }), {
      target: { value: 'Mia' },
    });
    fireEvent.click(screen.getByRole('button', { name: L.saveConfirm }));
    expect(JSON.parse(localStorage.getItem('calc.markings')!)).toEqual([
      expect.objectContaining({ name: 'Mia', text: SHEET }),
    ]);
    const item = screen.getByRole('button', { name: /^Mia/ }).closest('li')!;
    expect(screen.getByRole('status')).toHaveTextContent(L.saved);

    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(within(item).getByRole('button', { name: L.delete }));
    expect(localStorage.getItem('calc.markings')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Mia/ })).toBeNull();
  });

  it('the same name again asks before replacing', () => {
    localStorage.setItem(
      'calc.markings',
      JSON.stringify([{ id: 'm1', name: 'Mia', text: 'old' }])
    );
    setup();
    fireEvent.change(textArea(), { target: { value: 'new' } });
    fireEvent.click(screen.getByRole('button', { name: L.save }));
    fireEvent.change(screen.getByRole('textbox', { name: L.saveName }), {
      target: { value: 'mia' },
    });
    const ask = vi.spyOn(window, 'confirm').mockReturnValue(false);
    fireEvent.click(screen.getByRole('button', { name: L.saveConfirm }));
    expect(ask).toHaveBeenCalledOnce();
    expect(JSON.parse(localStorage.getItem('calc.markings')!)[0].text).toBe(
      'old'
    );

    ask.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: L.saveConfirm }));
    expect(JSON.parse(localStorage.getItem('calc.markings')!)).toEqual([
      { id: 'm1', name: 'mia', text: 'new' },
    ]);
  });

  it('«Copia QR» puts the PNG on the clipboard (for Excel)', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { write } });
    vi.stubGlobal(
      'ClipboardItem',
      class {
        items: Record<string, Blob>;
        constructor(items: Record<string, Blob>) {
          this.items = items;
        }
      }
    );
    setup();
    fireEvent.change(textArea(), { target: { value: 'CE' } });
    await screen.findByRole('img', { name: L.qr });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: L.copy }));
    });
    const [[items]] = write.mock.calls as [[{ items: Record<string, Blob> }[]]];
    expect(items[0].items['image/png'].type).toBe('image/png');
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(L.copied)
    );
  });

  it('no clipboard: says to download instead', async () => {
    vi.stubGlobal('ClipboardItem', undefined);
    setup();
    fireEvent.change(textArea(), { target: { value: 'CE' } });
    await screen.findByRole('img', { name: L.qr });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: L.copy }));
    });
    expect(screen.getByRole('status')).toHaveTextContent(L.copyFailed);
  });
});
