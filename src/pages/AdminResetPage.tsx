import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { urlAuth } from '../lib/supabase';
import { recoveryPending } from '../lib/authUrl';
import { PASSWORD_MIN, passwordProblem } from '../lib/password';
import PasswordInput from '../components/admin/PasswordInput';
import AuthCard from '../components/admin/AuthCard';
import {
  adminLabelCls,
  authInputCls,
  authPrimaryCls,
} from '../components/admin/adminStyles';

/**
 * Where a password-reset email's link lands (/admin/reset): the link signs in
 * for it, here the new password is chosen. A link that doesn't work (expired,
 * used already) or a visit without one: a way to ask for a new link.
 */
function AdminResetPage() {
  'use no memo';
  const { user, loading, updatePassword } = useAuth();
  const navigate = useNavigate();
  const [linkError] = useState(() => urlAuth.error);
  const [pending] = useState(() => urlAuth.recovery || recoveryPending());
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (done)
    return (
      <AuthCard>
        <h1 className="text-xl font-semibold text-ink sm:text-2xl">
          ✓ Password aggiornata
        </h1>
        <p className="mt-2 text-sm text-ink-soft">
          Da ora accedi con la nuova password.
        </p>
        <button
          type="button"
          onClick={() => navigate('/admin', { replace: true })}
          className={`mt-6 ${authPrimaryCls}`}
        >
          Vai al pannello admin
        </button>
      </AuthCard>
    );

  if (!linkError && loading)
    return (
      <AuthCard>
        <p role="status" className="text-sm text-ink-soft">
          Verifica del link…
        </p>
      </AuthCard>
    );

  // Signed in without a reset link: the panel has «Cambia password».
  if (!linkError && user && !pending) return <Navigate to="/admin" replace />;

  if (linkError || !user)
    return (
      <AuthCard>
        <h1 className="text-xl font-semibold text-ink sm:text-2xl">
          Link non valido
        </h1>
        <p className="mt-2 text-sm text-ink">
          {linkError?.code === 'otp_expired'
            ? 'Il link è scaduto o è già stato usato.'
            : 'Questo link non permette di reimpostare la password.'}
        </p>
        <p className="mt-1 text-sm text-ink-soft">
          Il link dell'email vale una volta sola e per poco tempo: richiedine
          uno nuovo.
        </p>
        <Link to="/admin/login?forgot=1" className={`mt-6 ${authPrimaryCls}`}>
          Richiedi un nuovo link
        </Link>
      </AuthCard>
    );

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const problem = passwordProblem(password, again);
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError(null);
    const { ok, error: err } = await updatePassword(password);
    setSaving(false);
    if (ok) setDone(true);
    else setError(err ?? 'Salvataggio non riuscito');
  };

  return (
    <AuthCard>
      <h1 className="text-xl font-semibold text-ink sm:text-2xl">
        Nuova password
      </h1>
      <p className="mt-1 text-sm text-ink-soft">
        Per <strong className="break-all text-ink">{user.email}</strong>. Almeno{' '}
        {PASSWORD_MIN} caratteri.
      </p>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <div>
          <label htmlFor="new-password" className={adminLabelCls}>
            Nuova password
          </label>
          <div className="mt-1">
            <PasswordInput
              id="new-password"
              label="Nuova password"
              autoComplete="new-password"
              value={password}
              onChange={setPassword}
              className={authInputCls}
            />
          </div>
        </div>
        <div>
          <label htmlFor="new-password-again" className={adminLabelCls}>
            Ripeti la password
          </label>
          <div className="mt-1">
            <PasswordInput
              id="new-password-again"
              label="Ripeti la password"
              autoComplete="new-password"
              value={again}
              onChange={setAgain}
              className={authInputCls}
            />
          </div>
        </div>
        {error && (
          <p
            role="alert"
            className="rounded-md bg-red-50 px-3 py-2 text-sm text-danger"
          >
            ⚠ {error}
          </p>
        )}
        <button type="submit" disabled={saving} className={authPrimaryCls}>
          {saving ? 'Salvataggio…' : 'Salva la password'}
        </button>
      </form>
    </AuthCard>
  );
}

export default AdminResetPage;
