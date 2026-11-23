import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useCatalog } from '../contexts/CatalogContext';
import PasswordInput from '../components/admin/PasswordInput';
import AuthCard from '../components/admin/AuthCard';
import {
  adminLabelCls,
  authInputCls,
  authLinkCls,
  authPrimaryCls,
} from '../components/admin/adminStyles';

function AdminLoginPage() {
  'use no memo';
  const { signIn, sendPasswordReset, user, loading } = useAuth();
  const { company } = useCatalog();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const backHref = company
    ? `/?company=${encodeURIComponent(company.slug)}`
    : '/';
  // ?forgot=1: straight to "Password dimenticata" (a reset link that no
  // longer works sends here for a new one).
  const [mode, setMode] = useState<'login' | 'forgot'>(
    params.get('forgot') ? 'forgot' : 'login'
  );
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The address a reset link was asked for. */
  const [sentTo, setSentTo] = useState<string | null>(null);

  // Already authenticated → jump straight to admin dashboard.
  if (!loading && user) return <Navigate to="/admin" replace />;

  const switchTo = (next: 'login' | 'forgot') => {
    setMode(next);
    setError(null);
    setSentTo(null);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const { ok, error: err } = await signIn(email, password);
    setSubmitting(false);
    if (ok) navigate('/admin', { replace: true });
    else setError(err ?? 'Errore di accesso');
  };

  const onForgot = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const { ok, error: err } = await sendPasswordReset(email);
    setSubmitting(false);
    if (ok) setSentTo(email.trim());
    else setError(err ?? 'Invio non riuscito');
  };

  const emailField = (
    <div>
      <label htmlFor="email" className={adminLabelCls}>
        Email
      </label>
      <input
        id="email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={e => setEmail(e.target.value)}
        className={`mt-1 ${authInputCls}`}
      />
    </div>
  );
  const errorNote = error && (
    <p
      role="alert"
      className="rounded-md bg-red-50 px-3 py-2 text-sm text-danger"
    >
      ⚠ {error}
    </p>
  );

  return (
    // Back to the calculator it was opened from (the logo hold), with its company.
    <AuthCard backHref={backHref}>
      {mode === 'login' ? (
        <>
          <h1 className="text-xl font-semibold text-ink sm:text-2xl">
            Admin · Accesso
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            Inserisci le credenziali per gestire il listino prodotti.
          </p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            {emailField}
            <div>
              <div className="flex items-baseline justify-between gap-2">
                <label htmlFor="password" className={adminLabelCls}>
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => switchTo('forgot')}
                  className={authLinkCls}
                >
                  Password dimenticata?
                </button>
              </div>
              <div className="mt-1">
                <PasswordInput
                  id="password"
                  label="Password"
                  autoComplete="current-password"
                  value={password}
                  onChange={setPassword}
                  className={authInputCls}
                />
              </div>
            </div>

            {errorNote}

            <button
              type="submit"
              disabled={submitting}
              className={authPrimaryCls}
            >
              {submitting ? 'Accesso in corso…' : 'Accedi'}
            </button>
          </form>
        </>
      ) : (
        <>
          <h1 className="text-xl font-semibold text-ink sm:text-2xl">
            Password dimenticata
          </h1>
          {sentTo ? (
            <div
              role="status"
              className="mt-4 rounded-md bg-success/10 px-3 py-3 text-sm text-ink"
            >
              <p className="font-semibold text-success">✓ Richiesta inviata</p>
              <p className="mt-1">
                Se <strong className="break-all">{sentTo}</strong> ha un
                account, tra poco riceverà un'email con il link per scegliere
                una nuova password.
              </p>
              <p className="mt-1 text-ink-soft">
                Non la trovi? Controlla anche la posta indesiderata.
              </p>
            </div>
          ) : (
            <>
              <p className="mt-1 text-sm text-ink-soft">
                Scrivi la tua email: ti mandiamo un link per sceglierne una
                nuova.
              </p>
              <form onSubmit={onForgot} className="mt-6 space-y-4">
                {emailField}
                {errorNote}
                <button
                  type="submit"
                  disabled={submitting}
                  className={authPrimaryCls}
                >
                  {submitting ? 'Invio in corso…' : 'Invia il link'}
                </button>
              </form>
            </>
          )}
          <p className="mt-4 text-center">
            <button
              type="button"
              onClick={() => switchTo('login')}
              className={authLinkCls}
            >
              ← Torna all'accesso
            </button>
          </p>
        </>
      )}
    </AuthCard>
  );
}

export default AdminLoginPage;
