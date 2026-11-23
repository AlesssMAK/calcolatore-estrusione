import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { confirmSignup, readConfirmToken, REGISTER_PATH } from '../lib/signup';
import AuthCard from '../components/admin/AuthCard';
import { authPrimaryCls } from '../components/admin/adminStyles';

type Phase =
  | { kind: 'checking' }
  | { kind: 'ok'; name: string; active: boolean }
  | { kind: 'expired' }
  | { kind: 'invalid' }
  | { kind: 'failed'; message: string };

/**
 * Where the sign-up email's link lands (/admin/conferma#t=…): confirms the
 * address; the company then waits for the super-admin's approval.
 */
function AdminConfirmPage() {
  'use no memo';
  const [token] = useState(() => readConfirmToken(window.location.hash));
  const [phase, setPhase] = useState<Phase>(() =>
    token ? { kind: 'checking' } : { kind: 'invalid' }
  );

  useEffect(() => {
    // The token out of the address bar (history, a copied address).
    if (window.location.hash)
      window.history.replaceState(
        window.history.state,
        '',
        window.location.pathname + window.location.search
      );
    if (!token) return;
    let live = true;
    void confirmSignup(token).then(({ data, error, code }) => {
      if (!live) return;
      if (data?.ok)
        setPhase({ kind: 'ok', name: data.name, active: Boolean(data.active) });
      else if (code === 'expired') setPhase({ kind: 'expired' });
      else if (code === 'invalid') setPhase({ kind: 'invalid' });
      else setPhase({ kind: 'failed', message: error ?? 'Errore sconosciuto' });
    });
    return () => {
      live = false;
    };
  }, [token]);

  if (phase.kind === 'checking')
    return (
      <AuthCard>
        <p role="status" className="text-sm text-ink-soft">
          Conferma dell'email…
        </p>
      </AuthCard>
    );

  if (phase.kind === 'ok')
    return (
      <AuthCard>
        <h1 className="text-xl font-semibold text-ink sm:text-2xl">
          ✓ Email confermata
        </h1>
        {phase.active ? (
          <p className="mt-2 text-sm text-ink">
            <strong>{phase.name}</strong> è già attiva: accedi con la tua email
            e la password scelta.
          </p>
        ) : (
          <>
            <p className="mt-2 text-sm text-ink">
              La richiesta per <strong>{phase.name}</strong> è in attesa di
              approvazione.
            </p>
            <p className="mt-1 text-sm text-ink-soft">
              Ti scriviamo appena l'azienda è attiva: da quel momento accedi con
              la tua email e la password scelta.
            </p>
          </>
        )}
        <Link to="/admin/login" className={`mt-6 ${authPrimaryCls}`}>
          Vai all'accesso
        </Link>
      </AuthCard>
    );

  if (phase.kind === 'failed')
    return (
      <AuthCard>
        <h1 className="text-xl font-semibold text-ink sm:text-2xl">
          Conferma non riuscita
        </h1>
        <p role="alert" className="mt-2 text-sm text-danger">
          ⚠ {phase.message}
        </p>
        <p className="mt-1 text-sm text-ink-soft">
          Riapri il link dell'email tra qualche minuto.
        </p>
      </AuthCard>
    );

  return (
    <AuthCard>
      <h1 className="text-xl font-semibold text-ink sm:text-2xl">
        {phase.kind === 'expired' ? 'Link scaduto' : 'Link non valido'}
      </h1>
      <p className="mt-2 text-sm text-ink">
        {phase.kind === 'expired'
          ? 'Il link valeva 48 ore e non è più attivo.'
          : 'Questo link non è valido, oppure la richiesta è stata rimossa.'}
      </p>
      <p className="mt-1 text-sm text-ink-soft">Registra di nuovo l'azienda.</p>
      <Link to={REGISTER_PATH} className={`mt-6 ${authPrimaryCls}`}>
        Registrati
      </Link>
    </AuthCard>
  );
}

export default AdminConfirmPage;
