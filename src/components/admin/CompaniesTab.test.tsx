import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CompaniesTab from './CompaniesTab';

const HOUR = 3600e3;
const h = vi.hoisted(() => ({
  tables: {} as Record<string, unknown[]>,
  reviewCompany: vi.fn(),
}));
// A query on a table answers with its rows, whatever the filters.
vi.mock('../../lib/supabase', () => {
  const query = (rows: unknown[]) => {
    const q: Record<string, unknown> = {};
    for (const m of ['select', 'order', 'eq']) q[m] = () => q;
    q.then = (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) =>
      Promise.resolve({ data: rows, error: null }).then(ok, ko);
    return q;
  };
  return { supabase: { from: (t: string) => query(h.tables[t] ?? []) } };
});
vi.mock('../../lib/signup', () => ({ reviewCompany: h.reviewCompany }));

beforeEach(() => {
  const now = Date.now();
  h.tables = {
    companies: [
      { id: 'c1', slug: 'akraplast', name: 'Akraplast', status: 'active' },
      { id: 'c2', slug: 'rossi', name: 'Plastica Rossi', status: 'pending' },
      { id: 'c3', slug: 'bianchi', name: 'Bianchi', status: 'pending' },
    ],
    admins: [
      { user_id: 'u1', company_id: 'c1' },
      { user_id: 'u2', company_id: 'c2' },
    ],
    products: [{ company_id: 'c1' }],
    company_signups: [
      {
        company_id: 'c2',
        email: 'mario@rossi.it',
        phone: '0331 123456',
        requested_at: new Date(now - HOUR).toISOString(),
        email_confirmed_at: new Date(now).toISOString(),
        token_expires_at: new Date(now + 47 * HOUR).toISOString(),
      },
      {
        company_id: 'c3',
        email: 'info@bianchi.it',
        phone: null,
        requested_at: new Date(now - 2 * HOUR).toISOString(),
        email_confirmed_at: null,
        token_expires_at: new Date(now + 46 * HOUR).toISOString(),
      },
    ],
  };
  h.reviewCompany.mockReset().mockResolvedValue({ data: { ok: true } });
});
afterEach(() => vi.restoreAllMocks());

const card = (name: string) =>
  screen.getByText(name).closest('li') as HTMLElement;

describe('CompaniesTab — sign-ups waiting for approval', () => {
  it('apart from the active companies, newest first, with who to reach', async () => {
    const onPendingCount = vi.fn();
    render(<CompaniesTab onPendingCount={onPendingCount} />);
    expect(
      await screen.findByText('In attesa di approvazione (2)')
    ).toBeInTheDocument();
    expect(onPendingCount).toHaveBeenCalledWith(2);
    expect(screen.getByText('Aziende (1)')).toBeInTheDocument();

    const names = screen
      .getAllByRole('listitem')
      .slice(0, 2)
      .map(li => li.querySelector('p')?.textContent);
    expect(names).toEqual(['Plastica Rossi', 'Bianchi']);

    const rossi = within(card('Plastica Rossi'));
    expect(rossi.getByText('✓ Email confermata')).toBeInTheDocument();
    expect(rossi.getByRole('link', { name: 'mario@rossi.it' })).toHaveAttribute(
      'href',
      'mailto:mario@rossi.it'
    );
    expect(rossi.getByRole('link', { name: '0331 123456' })).toHaveAttribute(
      'href',
      'tel:0331123456'
    );
  });

  it('approve: only once the email is confirmed', async () => {
    const user = userEvent.setup();
    render(<CompaniesTab />);
    await screen.findByText('In attesa di approvazione (2)');
    const bianchi = within(card('Bianchi'));
    expect(bianchi.getByText('Email non confermata')).toBeInTheDocument();
    expect(bianchi.getByRole('button', { name: /Approva/ })).toBeDisabled();

    await user.click(
      within(card('Plastica Rossi')).getByRole('button', { name: /Approva/ })
    );
    expect(h.reviewCompany).toHaveBeenCalledWith('c2', 'approve');
  });

  it('reject: asks first', async () => {
    const user = userEvent.setup();
    const ask = vi
      .spyOn(window, 'confirm')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    render(<CompaniesTab />);
    await screen.findByText('In attesa di approvazione (2)');
    const reject = within(card('Bianchi')).getByRole('button', {
      name: 'Rifiuta',
    });
    await user.click(reject);
    expect(h.reviewCompany).not.toHaveBeenCalled();
    await user.click(reject);
    expect(ask).toHaveBeenLastCalledWith(expect.stringContaining('«Bianchi»'));
    expect(h.reviewCompany).toHaveBeenCalledWith('c3', 'reject');
  });

  it('the server refusing: its reason', async () => {
    const user = userEvent.setup();
    h.reviewCompany.mockResolvedValue({
      error: 'Questa azienda non è in attesa di approvazione',
    });
    render(<CompaniesTab />);
    await screen.findByText('In attesa di approvazione (2)');
    await user.click(
      within(card('Plastica Rossi')).getByRole('button', { name: /Approva/ })
    );
    expect(await screen.findByText(/non è in attesa/)).toBeInTheDocument();
  });
});
