import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  COMPANY_NAME_MAX,
  registerCompany,
  signupProblem,
  TURNSTILE_SITE_KEY,
  type SignupDraft,
} from '../lib/signup';
import { PASSWORD_MIN } from '../lib/password';
import PasswordInput from '../components/admin/PasswordInput';
import AuthCard from '../components/admin/AuthCard';
import Turnstile from '../components/admin/Turnstile';
import {
  adminLabelCls,
  authInputCls,
  authLinkCls,
  authPrimaryCls,
} from '../components/admin/adminStyles';

const empty: SignupDraft = {
  name: '',
  email: '',
  phone: '',
  password: '',
  again: '',
};

/**
 * A company signs itself up (/admin/registrati): its own new company, waiting
 * for the super-admin's approval. An email confirms the address first.
 */
function AdminRegisterPage() {
  'use no memo';
  const { user, loading } = useAuth();
  const [draft, setDraft] = useState<SignupDraft>(empty);
  const [captcha, setCaptcha] = useState<string | null>(null);
  /** Remounts the check after a sending (its token works once). */
  const [attempt, setAttempt] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  if (!loading && user) return <Navigate to="/admin" replace />;

  if (!TURNSTILE_SITE_KEY)
    return (
      <AuthCard>
        <h1 className="text-xl font-semibold text-ink sm:text-2xl">
          Registrazione
        </h1>
        <p className="mt-2 text-sm text-ink">
          La registrazione non è disponibile al momento.
        </p>
        <Link to="/admin/login" className={`mt-6 ${authPrimaryCls}`}>
          Vai all'accesso
        </Link>
      </AuthCard>
    );

  if (sentTo)
    return (
      <AuthCard>
        <h1 className="text-xl font-semibold text-ink sm:text-2xl">
          Controlla la tua email
        </h1>
        <div
          role="status"
          className="mt-4 rounded-md bg-success/10 px-3 py-3 text-sm text-ink"
        >
          <p className="font-semibold text-success">✓ Richiesta inviata</p>
          <p className="mt-1">
            Abbiamo mandato a <strong className="break-all">{sentTo}</strong> un
            link per confermare l'indirizzo: aprilo entro 48 ore.
          </p>
          <p className="mt-1">
            Poi verifichiamo la richiesta e ti scriviamo quando l'azienda è
            attiva.
          </p>
        </div>
        <p className="mt-3 text-sm text-ink-soft">
          Non arriva? Controlla la posta indesiderata. Se questa email ha già un
          account, il link non arriva: accedi o usa «Password dimenticata».
        </p>
        <Link to="/admin/login" className={`mt-6 ${authPrimaryCls}`}>
          Vai all'accesso
        </Link>
      </AuthCard>
    );

  const set = (k: keyof SignupDraft) => (v: string) =>
    setDraft(d => ({ ...d, [k]: v }));

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const problem = signupProblem(draft);
    if (problem) {
      setError(problem);
      return;
    }
    if (!captcha) {
      setError('Completa la verifica anti-bot qui sopra');
      return;
    }
    setSubmitting(true);
    setError(null);
    const { error: err } = await registerCompany({ ...draft, captcha });
    setSubmitting(false);
    if (err) {
      setError(err);
      setCaptcha(null);
      setAttempt(a => a + 1);
      return;
    }
    setSentTo(draft.email.trim());
  };

  return (
    <AuthCard>
      <h1 className="text-xl font-semibold text-ink sm:text-2xl">
        Registra la tua azienda
      </h1>
      <p className="mt-1 text-sm text-ink-soft">
        Crea l'account admin della tua azienda: listino prodotti, impostazioni e
        il calcolatore con il vostro link.
      </p>

      <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
        <Row id="reg-name" label="Nome azienda">
          <input
            id="reg-name"
            type="text"
            autoComplete="organization"
            required
            maxLength={COMPANY_NAME_MAX}
            value={draft.name}
            onChange={e => set('name')(e.target.value)}
            className={authInputCls}
          />
        </Row>
        <Row id="reg-email" label="Email">
          <input
            id="reg-email"
            type="email"
            autoComplete="email"
            autoCapitalize="none"
            required
            value={draft.email}
            onChange={e => set('email')(e.target.value)}
            className={authInputCls}
          />
        </Row>
        <Row
          id="reg-phone"
          label="Telefono (facoltativo)"
          hint="Per contattarti, se serve, prima di attivare l'azienda."
        >
          <input
            id="reg-phone"
            type="tel"
            autoComplete="tel"
            value={draft.phone}
            onChange={e => set('phone')(e.target.value)}
            className={authInputCls}
          />
        </Row>
        <Row
          id="reg-password"
          label="Password"
          hint={`Almeno ${PASSWORD_MIN} caratteri.`}
        >
          <PasswordInput
            id="reg-password"
            label="Password"
            autoComplete="new-password"
            value={draft.password}
            onChange={set('password')}
            className={authInputCls}
          />
        </Row>
        <Row id="reg-again" label="Ripeti la password">
          <PasswordInput
            id="reg-again"
            label="Ripeti la password"
            autoComplete="new-password"
            value={draft.again}
            onChange={set('again')}
            className={authInputCls}
          />
        </Row>

        <Turnstile key={attempt} onToken={setCaptcha} />

        {error && (
          <p
            role="alert"
            className="rounded-md bg-red-50 px-3 py-2 text-sm text-danger"
          >
            ⚠ {error}
          </p>
        )}

        <button type="submit" disabled={submitting} className={authPrimaryCls}>
          {submitting ? 'Invio in corso…' : 'Registrati'}
        </button>
        <p className="text-xs text-ink-soft">
          Email e telefono servono solo per l'accesso e per verificare la
          richiesta.
        </p>
      </form>

      <p className="mt-4 text-center text-sm text-ink-soft">
        Hai già un account?{' '}
        <Link to="/admin/login" className={authLinkCls}>
          Accedi
        </Link>
      </p>
    </AuthCard>
  );
}

function Row({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className={adminLabelCls}>
        {label}
      </label>
      <div className="mt-1">{children}</div>
      {hint && <p className="mt-1 text-xs text-ink-soft">{hint}</p>}
    </div>
  );
}

export default AdminRegisterPage;
