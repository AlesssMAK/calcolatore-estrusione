import { afterEach, describe, expect, it } from 'vitest';
import { readUrlAuth, recoveryPending, setRecoveryPending } from './authUrl';

const SITE = 'https://extrusion-calculator.com';

describe('readUrlAuth — the email link the page was opened from', () => {
  it('a password-reset link that worked', () => {
    expect(
      readUrlAuth(
        `${SITE}/admin/reset#access_token=abc&expires_in=3600&refresh_token=r&token_type=bearer&type=recovery`
      )
    ).toEqual({ recovery: true });
  });

  it('an expired / used link (in the hash or the query)', () => {
    const want = {
      recovery: false,
      error: {
        code: 'otp_expired',
        description: 'Email link is invalid or has expired',
      },
    };
    expect(
      readUrlAuth(
        `${SITE}/admin/reset#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`
      )
    ).toEqual(want);
    expect(
      readUrlAuth(
        `${SITE}/admin/reset?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`
      )
    ).toEqual(want);
  });

  it('a plain address: nothing', () => {
    expect(readUrlAuth(`${SITE}/?company=acme`)).toEqual({ recovery: false });
    // a sign-in link of another kind isn't a reset
    expect(
      readUrlAuth(`${SITE}/#access_token=abc&type=signup`).recovery
    ).toBe(false);
  });
});

describe('recoveryPending — the reset link opened in this tab', () => {
  afterEach(() => sessionStorage.clear());
  it('kept until the new password is set', () => {
    expect(recoveryPending()).toBe(false);
    setRecoveryPending(true);
    expect(recoveryPending()).toBe(true);
    setRecoveryPending(false);
    expect(recoveryPending()).toBe(false);
  });
});
