import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AdminConfirmPage from './AdminConfirmPage';

const h = vi.hoisted(() => ({ confirmSignup: vi.fn() }));
vi.mock('../lib/signup', async importOriginal => ({
  ...(await importOriginal<typeof import('../lib/signup')>()),
  confirmSignup: h.confirmSignup,
}));

const TOKEN = 'k'.repeat(43);

const open = (hash: string) => {
  window.history.replaceState(null, '', `/admin/conferma${hash}`);
  render(
    <MemoryRouter initialEntries={['/admin/conferma']}>
      <AdminConfirmPage />
    </MemoryRouter>
  );
};

beforeEach(() => h.confirmSignup.mockReset());
afterEach(() => window.history.replaceState(null, '', '/'));

describe('AdminConfirmPage — the confirmation email’s link', () => {
  it('confirmed: waiting for approval; the token leaves the address bar', async () => {
    h.confirmSignup.mockResolvedValue({
      data: { ok: true, name: 'Plastica Rossi' },
    });
    open(`#t=${TOKEN}`);
    expect(screen.getByRole('status')).toHaveTextContent('Conferma');
    expect(await screen.findByText('✓ Email confermata')).toBeInTheDocument();
    expect(screen.getByText('Plastica Rossi')).toBeInTheDocument();
    expect(screen.getByText(/in attesa di/)).toBeInTheDocument();
    expect(h.confirmSignup).toHaveBeenCalledWith(TOKEN);
    expect(window.location.hash).toBe('');
  });

  it('opened again after the approval: sign in', async () => {
    h.confirmSignup.mockResolvedValue({
      data: { ok: true, name: 'Plastica Rossi', already: true, active: true },
    });
    open(`#t=${TOKEN}`);
    expect(await screen.findByText(/è già attiva/)).toBeInTheDocument();
  });

  it('expired: register again', async () => {
    h.confirmSignup.mockResolvedValue({
      error: 'Link scaduto',
      code: 'expired',
    });
    open(`#t=${TOKEN}`);
    expect(await screen.findByText('Link scaduto')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Registrati' })).toHaveAttribute(
      'href',
      '/admin/registrati'
    );
  });

  it('no token: not valid, nothing asked of the server', () => {
    open('');
    expect(screen.getByText('Link non valido')).toBeInTheDocument();
    expect(h.confirmSignup).not.toHaveBeenCalled();
  });

  it('the server failing: its reason', async () => {
    h.confirmSignup.mockResolvedValue({
      error: 'Nessuna connessione: riprova',
    });
    open(`#t=${TOKEN}`);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Nessuna connessione'
    );
  });
});
