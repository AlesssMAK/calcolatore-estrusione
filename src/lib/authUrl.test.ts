import { afterEach, describe, expect, it } from 'vitest';
import {
  authLandingPath,
  readUrlAuth,
  recoveryPending,
  setRecoveryPending,
} from './authUrl';

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

describe('authLandingPath — a reset link landing elsewhere', () => {
  const TOKENS =
    '#access_token=abc&expires_in=3600&refresh_token=r&token_type=bearer&type=recovery';
  it('the site root (Site URL fallback) → the reset page, tokens kept', () => {
    expect(authLandingPath(`${SITE}/${TOKENS}`)).toBe(`/admin/reset${TOKENS}`);
    expect(authLandingPath(`${SITE}/?company=acme${TOKENS}`)).toBe(
      `/admin/reset?company=acme${TOKENS}`
    );
  });

  it('a link that failed there too (to say so)', () => {
    expect(
      authLandingPath(`${SITE}/#error=access_denied&error_code=otp_expired`)
    ).toBe('/admin/reset#error=access_denied&error_code=otp_expired');
  });

  it('already on the reset page, or no link: stays', () => {
    expect(authLandingPath(`${SITE}/admin/reset${TOKENS}`)).toBeNull();
    expect(authLandingPath(`${SITE}/produzione?company=acme`)).toBeNull();
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
