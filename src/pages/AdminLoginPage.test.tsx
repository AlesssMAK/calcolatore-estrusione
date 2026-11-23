import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminLoginPage from './AdminLoginPage';

const h = vi.hoisted(() => ({
  auth: {
    user: null,
    loading: false,
    signIn: vi.fn(),
    sendPasswordReset: vi.fn(),
  },
}));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => h.auth }));
vi.mock('../contexts/CatalogContext', () => ({
  useCatalog: () => ({ company: null }),
}));

beforeEach(() => h.auth.sendPasswordReset.mockReset());

const setup = (path = '/admin/login') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AdminLoginPage />
    </MemoryRouter>
  );

describe('AdminLoginPage — «Password dimenticata?»', () => {
  it('asks for a reset link by email; the answer says nothing about the account', async () => {
    const user = userEvent.setup();
    h.auth.sendPasswordReset.mockResolvedValue({ ok: true });
    setup();
    await user.type(screen.getByLabelText('Email'), 'admin@example.com');
    await user.click(screen.getByRole('button', { name: 'Password dimenticata?' }));
    // the email typed for the login stays
    expect(screen.getByLabelText<HTMLInputElement>('Email').value).toBe('admin@example.com');
    await user.click(screen.getByRole('button', { name: 'Invia il link' }));
    expect(h.auth.sendPasswordReset).toHaveBeenCalledWith('admin@example.com');
    expect(screen.getByRole('status')).toHaveTextContent('Se admin@example.com ha un account');
    await user.click(screen.getByRole('button', { name: "← Torna all'accesso" }));
    expect(screen.getByRole('button', { name: 'Accedi' })).toBeInTheDocument();
  });

  it('too many requests: the error shown', async () => {
    const user = userEvent.setup();
    h.auth.sendPasswordReset.mockResolvedValue({
      ok: false,
      error: 'Troppe email inviate: riprova tra qualche minuto',
    });
    setup('/admin/login?forgot=1');
    await user.type(screen.getByLabelText('Email'), 'admin@example.com');
    await user.click(screen.getByRole('button', { name: 'Invia il link' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Troppe email');
  });
});
