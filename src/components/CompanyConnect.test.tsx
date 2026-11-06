import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchCompanyBySlug } from '../lib/catalog';
import CompanyConnect from './CompanyConnect';

vi.mock('../lib/catalog', async (importActual) => ({
  ...(await importActual<typeof import('../lib/catalog')>()),
  fetchCompanyBySlug: vi.fn(),
}));
const lookup = vi.mocked(fetchCompanyBySlug);

const KEY = 'calc.installedCompany';
const reload = vi.fn();

/** Open the window. No i18n instance here: labels are their keys. */
function open() {
  render(<CompanyConnect className="" />);
  fireEvent.click(screen.getByRole('button', { name: /company\.connect$/ }));
  return screen.getByRole('textbox');
}
const confirm = () => screen.getByRole('button', { name: 'company.connectConfirm' });
function send(field: HTMLElement, text: string) {
  fireEvent.change(field, { target: { value: text } });
  fireEvent.click(confirm());
}

describe('Collega Azienda', () => {
  beforeEach(() => {
    localStorage.clear();
    reload.mockReset();
    lookup.mockReset();
    vi.stubGlobal('location', { ...window.location, reload });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps the company of a link and reloads on it', async () => {
    lookup.mockResolvedValue({ id: 'c1', slug: 'akra-plast', name: 'Akraplast' });
    send(open(), 'https://extrusion-calculator.com/?company=akra-plast');
    await waitFor(() => expect(reload).toHaveBeenCalledOnce());
    expect(lookup).toHaveBeenCalledWith('akra-plast');
    expect(localStorage.getItem(KEY)).toBe('akra-plast');
  });

  it('takes the code too', async () => {
    lookup.mockResolvedValue({ id: 'c1', slug: 'akra-plast', name: 'Akraplast' });
    send(open(), ' Akra-plast ');
    await waitFor(() => expect(reload).toHaveBeenCalledOnce());
    expect(lookup).toHaveBeenCalledWith('akra-plast');
  });

  it('an unknown company is not kept, and what was typed stays', async () => {
    lookup.mockResolvedValue(null);
    const field = open();
    send(field, 'nope');
    expect(await screen.findByRole('alert')).toHaveTextContent('company.connectFailed');
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(reload).not.toHaveBeenCalled();
    expect(field).toHaveValue('nope');
    expect(field).toBeEnabled();
  });

  it('what is no link or code is not even looked up', () => {
    send(open(), 'https://extrusion-calculator.com/');
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(lookup).not.toHaveBeenCalled();
  });

  it('typing again clears the message', () => {
    const field = open();
    send(field, 'a b');
    fireEvent.change(field, { target: { value: 'a' } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('nothing typed: nothing to confirm', () => {
    open();
    expect(confirm()).toBeDisabled();
  });

  it('closes without keeping anything', () => {
    const field = open();
    fireEvent.change(field, { target: { value: 'akra-plast' } });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});
