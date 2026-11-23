import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminRegisterPage from './AdminRegisterPage';

const h = vi.hoisted(() => ({
  auth: { user: null as { email: string } | null, loading: false },
  registerCompany: vi.fn(),
}));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => h.auth }));
vi.mock('../lib/signup', async importOriginal => ({
  ...(await importOriginal<typeof import('../lib/signup')>()),
  registerCompany: h.registerCompany,
}));
// The check: a button standing for "I'm not a bot" (each mount a new token).
vi.mock('../components/admin/Turnstile', () => {
  let n = 0;
  return {
    default: ({ onToken }: { onToken: (t: string) => void }) => (
      <button type="button" onClick={() => onToken(`tok-${++n}`)}>
        Non sono un robot
      </button>
    ),
  };
});

beforeEach(() => {
  h.auth.user = null;
  h.registerCompany.mockReset();
});

const setup = () =>
  render(
    <MemoryRouter initialEntries={['/admin/registrati']}>
      <AdminRegisterPage />
    </MemoryRouter>
  );

async function fill(
  user: ReturnType<typeof userEvent.setup>,
  again = 'segreta-123'
) {
  await user.type(screen.getByLabelText('Nome azienda'), 'Plastica Rossi');
  await user.type(screen.getByLabelText('Email'), 'mario@rossi.it');
  await user.type(
    screen.getByLabelText('Telefono (facoltativo)'),
    '0331 123456'
  );
  await user.type(screen.getByLabelText('Password'), 'segreta-123');
  await user.type(screen.getByLabelText('Ripeti la password'), again);
}

describe('AdminRegisterPage — a company signs itself up', () => {
  it('checks the form and the anti-bot step before sending', async () => {
    const user = userEvent.setup();
    setup();
    await fill(user, 'diversa-123');
    await user.click(screen.getByRole('button', { name: 'Registrati' }));
    expect(screen.getByRole('alert')).toHaveTextContent('non coincidono');

    await user.clear(screen.getByLabelText('Ripeti la password'));
    await user.type(screen.getByLabelText('Ripeti la password'), 'segreta-123');
    await user.click(screen.getByRole('button', { name: 'Registrati' }));
    expect(screen.getByRole('alert')).toHaveTextContent('verifica anti-bot');
    expect(h.registerCompany).not.toHaveBeenCalled();
  });

  it('sent: says to look for the confirmation email', async () => {
    const user = userEvent.setup();
    h.registerCompany.mockResolvedValue({ data: { ok: true } });
    setup();
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Non sono un robot' }));
    await user.click(screen.getByRole('button', { name: 'Registrati' }));
    expect(h.registerCompany).toHaveBeenCalledWith({
      name: 'Plastica Rossi',
      email: 'mario@rossi.it',
      phone: '0331 123456',
      password: 'segreta-123',
      again: 'segreta-123',
      captcha: 'tok-1',
    });
    expect(await screen.findByRole('status')).toHaveTextContent(
      'mario@rossi.it'
    );
    expect(
      screen.getByRole('link', { name: "Vai all'accesso" })
    ).toHaveAttribute('href', '/admin/login');
  });

  it('refused: the reason, and the anti-bot step again (a token works once)', async () => {
    const user = userEvent.setup();
    h.registerCompany.mockResolvedValue({ error: 'Troppe registrazioni' });
    setup();
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Non sono un robot' }));
    await user.click(screen.getByRole('button', { name: 'Registrati' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Troppe registrazioni'
    );

    await user.click(screen.getByRole('button', { name: 'Registrati' }));
    expect(screen.getByRole('alert')).toHaveTextContent('verifica anti-bot');
    expect(h.registerCompany).toHaveBeenCalledTimes(1);
  });

  it('signed in already: to the panel', () => {
    h.auth.user = { email: 'a@b.it' };
    render(
      <MemoryRouter initialEntries={['/admin/registrati']}>
        <AdminRegisterPage />
      </MemoryRouter>
    );
    expect(screen.queryByLabelText('Nome azienda')).not.toBeInTheDocument();
  });
});
