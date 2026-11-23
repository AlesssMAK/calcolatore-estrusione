// Password rules and the sign-in service's errors, in the admin's words.

export const PASSWORD_MIN = 8;

/** What's wrong with a new password typed twice, or null. */
export function passwordProblem(
  password: string,
  again: string
): string | null {
  if (password.length < PASSWORD_MIN)
    return `La password deve avere almeno ${PASSWORD_MIN} caratteri`;
  if (password !== again) return 'Le due password non coincidono';
  return null;
}

type AuthErrorLike = {
  code?: string;
  status?: number;
  name?: string;
  message?: string;
};

const BY_CODE: Record<string, string> = {
  invalid_credentials: 'Email o password non corretti',
  email_not_confirmed:
    'Email non ancora confermata: apri il link che ti abbiamo mandato',
  same_password: 'La nuova password deve essere diversa da quella attuale',
  weak_password:
    'Password troppo debole: allungala o aggiungi numeri e simboli',
  over_email_send_rate_limit:
    'Troppe email inviate: riprova tra qualche minuto',
  over_request_rate_limit: 'Troppi tentativi: riprova tra qualche minuto',
  reauthentication_needed: 'Per sicurezza esci, accedi di nuovo e riprova',
  session_not_found: 'Sessione scaduta: richiedi un nuovo link',
  session_expired: 'Sessione scaduta: richiedi un nuovo link',
  otp_expired: 'Il link è scaduto o è già stato usato',
  email_address_invalid: 'Indirizzo email non valido',
  validation_failed: 'Controlla i dati inseriti',
};

/** A sign-in service error as a message for the admin. */
export function authErrorText(err: AuthErrorLike | null | undefined): string {
  if (!err) return 'Errore sconosciuto';
  if (err.code && BY_CODE[err.code]) return BY_CODE[err.code];
  if (err.status === 429) return BY_CODE.over_request_rate_limit;
  // No answer from the server (offline, blocked).
  if (err.name === 'AuthRetryableFetchError' || err.status === 0)
    return 'Nessuna connessione: riprova';
  return err.message || 'Errore sconosciuto';
}
