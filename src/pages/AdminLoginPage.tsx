import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

function AdminLoginPage() {
  'use no memo';
  const { signIn, user, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Already authenticated → jump straight to admin dashboard.
  if (!loading && user) return <Navigate to="/admin" replace />;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const { ok, error: err } = await signIn(email, password);
    setSubmitting(false);
    if (ok) navigate('/admin', { replace: true });
    else setError(err ?? 'Errore di accesso');
  };

  return (
    <div className="min-h-full bg-surface-alt">
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-8">
        <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-8">
          <h1 className="text-xl font-semibold text-ink sm:text-2xl">
            Admin · Accesso
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            Inserisci le credenziali per gestire il listino prodotti.
          </p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div>
              <label
                htmlFor="email"
                className="block text-xs font-medium uppercase tracking-wide text-ink-soft"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-ink shadow-sm focus:border-brand-600 focus:ring-2 focus:ring-brand-200 focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-xs font-medium uppercase tracking-wide text-ink-soft"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm text-ink shadow-sm focus:border-brand-600 focus:ring-2 focus:ring-brand-200 focus:outline-none"
              />
            </div>

            {error && (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-danger">
                ⚠ {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-md bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? 'Accesso in corso…' : 'Accedi'}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-ink-soft">
            <a href="/" className="hover:text-brand-700">
              ← Torna al calcolatore
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

export default AdminLoginPage;
