import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AdminResetPage from './AdminResetPage';
import { setRecoveryPending } from '../lib/authUrl';

const h = vi.hoisted(() => ({
  urlAuth: { recovery: false } as {
    recovery: boolean;
    error?: { code: string; description: string };
  },
  auth: {
    user: null as { email: string } | null,
    loading: false,
    updatePassword: vi.fn(),
  },
}));
vi.mock('../lib/supabase', () => ({ urlAuth: h.urlAuth, supabase: null }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => h.auth }));

function setup() {
  render(
    <MemoryRouter initialEntries={['/admin/reset']}>
      <Routes>
        <Route path="/admin/reset" element={<AdminResetPage />} />
        <Route path="/admin" element={<p>pannello</p>} />
        <Route path="/admin/login" element={<p>accesso</p>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  h.urlAuth.recovery = false;
  delete h.urlAuth.error;
  h.auth.user = null;
  h.auth.loading = false;
  h.auth.updatePassword.mockReset();
});
afterEach(() => sessionStorage.clear());

describe('AdminResetPage — where the reset email link lands', () => {
  it('the link worked: a new password, typed twice, then on to the panel', async () => {
    const user = userEvent.setup();
    h.urlAuth.recovery = true;
    h.auth.user = { email: 'admin@example.com' };
    h.auth.updatePassword.mockResolvedValue({ ok: true });
    setup();
    expect(screen.getByText('admin@example.com')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Nuova password'), 'nuova-pass-1');
    await user.type(screen.getByLabelText('Ripeti la password'), 'nuova-pass-2');
    await user.click(screen.getByRole('button', { name: 'Salva la password' }));
    expect(screen.getByRole('alert')).toHaveTextContent('non coincidono');
    expect(h.auth.updatePassword).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText('Ripeti la password'));
    await user.type(screen.getByLabelText('Ripeti la password'), 'nuova-pass-1');
    await user.click(screen.getByRole('button', { name: 'Salva la password' }));
    // no current password asked: the link proved the email
    expect(h.auth.updatePassword).toHaveBeenCalledWith('nuova-pass-1');
    expect(screen.getByText('✓ Password aggiornata')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Vai al pannello admin' }));
    expect(screen.getByText('pannello')).toBeInTheDocument();
  });

  it('a reload of the page (the tokens gone from the address): still the form', () => {
    setRecoveryPending(true);
    h.auth.user = { email: 'admin@example.com' };
    setup();
    expect(screen.getByLabelText('Nuova password')).toBeInTheDocument();
  });

  it('an expired link: a way to ask for a new one', async () => {
    const user = userEvent.setup();
    h.urlAuth.error = { code: 'otp_expired', description: 'expired' };
    setup();
    expect(screen.getByText('Il link è scaduto o è già stato usato.')).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Richiedi un nuovo link' }));
    expect(screen.getByText('accesso')).toBeInTheDocument();
  });

  it('no link and not signed in: invalid; signed in without a link: the panel', () => {
    setup();
    expect(screen.getByText('Link non valido')).toBeInTheDocument();
  });

  it('signed in, no link: to the panel (its «Cambia password»)', () => {
    h.auth.user = { email: 'admin@example.com' };
    setup();
    expect(screen.getByText('pannello')).toBeInTheDocument();
  });
});
