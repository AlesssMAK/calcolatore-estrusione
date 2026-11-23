import { useState, type FormEvent } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { PASSWORD_MIN, passwordProblem } from '../../lib/password';
import { AdminModal, Field, ModalActions } from './adminUi';
import { authLinkCls } from './adminStyles';
import PasswordInput from './PasswordInput';

/** The signed-in admin's «Cambia password»: the current one first (an
 *  unattended open panel can't be taken over); not remembered → a reset link
 *  by email. */
export default function ChangePasswordModal({
  email,
  onClose,
}: {
  email: string;
  onClose: () => void;
}) {
  'use no memo';
  const { updatePassword, sendPasswordReset } = useAuth();
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [linkSent, setLinkSent] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const problem = passwordProblem(password, again);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    const { ok, error: err } = await updatePassword(password, current);
    setBusy(false);
    if (ok) setDone(true);
    else setError(err ?? 'Salvataggio non riuscito');
  };

  const sendLink = async () => {
    setBusy(true);
    setError(null);
    const { ok, error: err } = await sendPasswordReset(email);
    setBusy(false);
    if (ok) setLinkSent(true);
    else setError(err ?? 'Invio non riuscito');
  };

  if (done)
    return (
      <AdminModal onClose={onClose}>
        <h2 className="text-lg font-semibold text-ink">✓ Password aggiornata</h2>
        <p className="mt-2 text-sm text-ink-soft">
          Da ora accedi con la nuova password.
        </p>
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 sm:w-auto"
          >
            Chiudi
          </button>
        </div>
      </AdminModal>
    );

  return (
    <AdminModal onClose={onClose}>
      <form onSubmit={onSubmit}>
        <h2 className="text-lg font-semibold text-ink">Cambia password</h2>
        <p className="mt-1 text-xs break-all text-ink-soft">{email}</p>
        <div className="mt-4 space-y-3">
          <Field label="Password attuale">
            <PasswordInput
              id="current-password"
              label="Password attuale"
              autoComplete="current-password"
              value={current}
              onChange={setCurrent}
            />
          </Field>
          <Field label="Nuova password" hint={`Almeno ${PASSWORD_MIN} caratteri.`}>
            <PasswordInput
              id="new-password"
              label="Nuova password"
              autoComplete="new-password"
              value={password}
              onChange={setPassword}
            />
          </Field>
          <Field label="Ripeti la nuova password">
            <PasswordInput
              id="new-password-again"
              label="Ripeti la nuova password"
              autoComplete="new-password"
              value={again}
              onChange={setAgain}
            />
          </Field>
        </div>
        <p className="mt-3 text-xs text-ink-soft">
          {linkSent ? (
            <span role="status" className="text-success">
              ✓ Link inviato a <strong className="break-all">{email}</strong>:
              aprilo per scegliere una nuova password.
            </span>
          ) : (
            <>
              Non ricordi quella attuale?{' '}
              <button
                type="button"
                onClick={() => void sendLink()}
                disabled={busy}
                className={authLinkCls}
              >
                Ricevi un link via email
              </button>
            </>
          )}
        </p>
        {error && (
          <p
            role="alert"
            className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-danger"
          >
            ⚠ {error}
          </p>
        )}
        <ModalActions
          onCancel={onClose}
          busy={busy}
          primary={busy ? 'Salvataggio…' : 'Salva'}
        />
      </form>
    </AdminModal>
  );
}
