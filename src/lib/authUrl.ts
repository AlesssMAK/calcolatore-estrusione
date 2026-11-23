// What the address bar says about the email link the page was opened from (a
// password-reset link: `#access_token=…&type=recovery`, or an expired one:
// `#error_code=otp_expired&error_description=…`). Read once at start, before
// the Supabase client clears the tokens from the URL (lib/supabase).

export type UrlAuth = {
  /** Opened from a password-reset link that worked (signed in for it). */
  recovery: boolean;
  /** The link didn't work (expired, used already…). */
  error?: { code: string; description: string };
};

export function readUrlAuth(href: string): UrlAuth {
  const url = new URL(href);
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
  const get = (k: string) => hash.get(k) ?? url.searchParams.get(k);
  const code = get('error_code') ?? get('error');
  const description = get('error_description');
  return {
    recovery: hash.get('type') === 'recovery' && hash.has('access_token'),
    ...(code || description
      ? { error: { code: code ?? 'unknown', description: description ?? '' } }
      : {}),
  };
}

const RECOVERY_KEY = 'calc.pwRecovery';

/** A reset link was opened in this tab and its new password isn't set yet —
 *  kept for the tab's life, so a reload of the reset page still shows the
 *  form (the link's tokens are gone from the URL by then). */
export function recoveryPending(): boolean {
  try {
    return sessionStorage.getItem(RECOVERY_KEY) === '1';
  } catch {
    return false;
  }
}

export function setRecoveryPending(on: boolean): void {
  try {
    if (on) sessionStorage.setItem(RECOVERY_KEY, '1');
    else sessionStorage.removeItem(RECOVERY_KEY);
  } catch {
    /* storage blocked: the form shows only on the link's own load */
  }
}
