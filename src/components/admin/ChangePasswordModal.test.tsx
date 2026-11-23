import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ChangePasswordModal from './ChangePasswordModal';

const h = vi.hoisted(() => ({
  auth: { updatePassword: vi.fn(), sendPasswordReset: vi.fn() },
}));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => h.auth }));

beforeEach(() => {
  h.auth.updatePassword.mockReset();
  h.auth.sendPasswordReset.mockReset();
});

const fill = async (
  user: ReturnType<typeof userEvent.setup>,
  current: string,
  next: string,
  again: string
) => {
  await user.type(screen.getByLabelText('Password attuale'), current);
  await user.type(screen.getByLabelText('Nuova password'), next);
  await user.type(screen.getByLabelText('Ripeti la nuova password'), again);
  await user.click(screen.getByRole('button', { name: 'Salva' }));
};

describe('ChangePasswordModal — «Cambia password» in the panel', () => {
  it('checks the current one with the new; done → closes with «Chiudi»', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    h.auth.updatePassword.mockResolvedValue({ ok: true });
    render(<ChangePasswordModal email="admin@example.com" onClose={onClose} />);
    await fill(user, 'vecchia-pass', 'nuova-pass-1', 'nuova-pass-1');
    expect(h.auth.updatePassword).toHaveBeenCalledWith('nuova-pass-1', 'vecchia-pass');
    await user.click(screen.getByRole('button', { name: 'Chiudi' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('too short: said before asking the server; a server error shown', async () => {
    const user = userEvent.setup();
    render(<ChangePasswordModal email="admin@example.com" onClose={() => {}} />);
    await fill(user, 'vecchia-pass', 'corta', 'corta');
    expect(screen.getByRole('alert')).toHaveTextContent('almeno 8');
    expect(h.auth.updatePassword).not.toHaveBeenCalled();

    h.auth.updatePassword.mockResolvedValue({
      ok: false,
      error: 'La password attuale non è corretta',
    });
    await user.clear(screen.getByLabelText('Nuova password'));
    await user.clear(screen.getByLabelText('Ripeti la nuova password'));
    await user.type(screen.getByLabelText('Nuova password'), 'nuova-pass-1');
    await user.type(screen.getByLabelText('Ripeti la nuova password'), 'nuova-pass-1');
    await user.click(screen.getByRole('button', { name: 'Salva' }));
    expect(screen.getByRole('alert')).toHaveTextContent('attuale non è corretta');
  });

  it('the current one forgotten: a reset link to the own email', async () => {
    const user = userEvent.setup();
    h.auth.sendPasswordReset.mockResolvedValue({ ok: true });
    render(<ChangePasswordModal email="admin@example.com" onClose={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Ricevi un link via email' }));
    expect(h.auth.sendPasswordReset).toHaveBeenCalledWith('admin@example.com');
    expect(screen.getByRole('status')).toHaveTextContent('Link inviato');
  });

  it('the eye shows what was typed, and hides it again', async () => {
    const user = userEvent.setup();
    render(<ChangePasswordModal email="admin@example.com" onClose={() => {}} />);
    const field = screen.getByLabelText<HTMLInputElement>('Nuova password');
    expect(field.type).toBe('password');
    const eyes = screen.getAllByRole('button', { name: 'Mostra password' });
    await user.click(eyes[1]);
    expect(field.type).toBe('text');
    await user.click(screen.getByRole('button', { name: 'Nascondi password' }));
    expect(field.type).toBe('password');
  });
});
