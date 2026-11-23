// A company signing itself up (/admin/registrati), confirming its email
// (/admin/conferma#t=…) and the super-admin's approval — all through the
// Edge Function «company-signup» (supabase/functions/company-signup).

import { invokeFn, type FnResult } from './edgeFn';
import { passwordProblem } from './password';

export const REGISTER_PATH = '/admin/registrati';
export const CONFIRM_PATH = '/admin/conferma';

const FN = 'company-signup';

/** The anti-bot check's public key (Vercel env VITE_TURNSTILE_SITE_KEY). In
 *  development Cloudflare's test key, which always passes; a build without one
 *  has no sign-up (the login page shows no «Registrati»). */
export const TURNSTILE_SITE_KEY: string =
  import.meta.env.VITE_TURNSTILE_SITE_KEY ||
  (import.meta.env.DEV ? '1x00000000000000000000AA' : '');

export const COMPANY_NAME_MAX = 80;
const EMAIL_RE = /^[^\s@,;()<>"]+@[^\s@,;()<>"]+\.[^\s@,;()<>"]{2,}$/;
const PHONE_RE = /^\+?[0-9 ()./-]{6,20}$/;

export type SignupDraft = {
  name: string;
  email: string;
  phone: string;
  password: string;
  again: string;
};

/** What's wrong with the sign-up form, or null (the server checks it again). */
export function signupProblem(d: SignupDraft): string | null {
  const name = d.name.replace(/\s+/g, ' ').trim();
  if (name.length < 2) return 'Scrivi il nome dell’azienda';
  if (name.length > COMPANY_NAME_MAX)
    return `Il nome dell’azienda può avere al massimo ${COMPANY_NAME_MAX} caratteri`;
  if (!EMAIL_RE.test(d.email.trim())) return 'Indirizzo email non valido';
  const phone = d.phone.trim();
  if (phone && !PHONE_RE.test(phone)) return 'Numero di telefono non valido';
  return passwordProblem(d.password, d.again);
}

export function registerCompany(
  d: Omit<SignupDraft, 'again'> & { captcha: string }
): Promise<FnResult<{ ok: true }>> {
  return invokeFn(FN, {
    action: 'register',
    name: d.name.replace(/\s+/g, ' ').trim(),
    email: d.email.trim(),
    phone: d.phone.trim(),
    password: d.password,
    captcha: d.captcha,
  });
}

export type ConfirmAnswer = {
  ok: true;
  /** The company's name. */
  name: string;
  /** The link was opened before. */
  already?: boolean;
  /** Approved already. */
  active?: boolean;
};

export function confirmSignup(token: string): Promise<FnResult<ConfirmAnswer>> {
  return invokeFn(FN, { action: 'confirm', token });
}

export function reviewCompany(
  companyId: string,
  action: 'approve' | 'reject'
): Promise<FnResult<{ ok: true }>> {
  return invokeFn(FN, { action, company_id: companyId });
}

/** The confirmation link's token (`#t=…`), or null. In the hash, so it never
 *  reaches a server's logs or another site's Referer. */
export function readConfirmToken(hash: string): string | null {
  const t = new URLSearchParams(hash.replace(/^#/, '')).get('t');
  return t && /^[A-Za-z0-9_-]{30,100}$/.test(t) ? t : null;
}
